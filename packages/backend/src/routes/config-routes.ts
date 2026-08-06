import { Router, type RequestHandler } from 'express';
import type { ConfigurationStatus, TestAndActivateResult } from '../config/configuration-service';
import type { ChannelConfigMap } from '../config/configuration-types';
import { findProviderPreset, getConfigurationPresets } from '../config/provider-presets';
import type { ConfigChannel } from '../config/secure-store';

interface ConfigurationServicePort {
  getAllStatus(): ConfigurationStatus;
  getActiveSnapshot(channel: ConfigChannel): Readonly<ChannelConfigMap[ConfigChannel]> | null;
  testAndActivate<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C],
    options?: { sendTestEmail?: boolean }
  ): Promise<TestAndActivateResult>;
  retest(channel: ConfigChannel, options?: { sendTestEmail?: boolean }): Promise<TestAndActivateResult | null>;
  testSingleProvider?(provider: {
    name: string;
    baseUrl?: string;
    baseUrls?: string[];
    apiKey: string;
    model: string;
  }): Promise<{
    pass: boolean;
    errorCode?: string;
    sanitizedMessage?: string;
    latencyMs?: number;
    supportedModels?: string[];
    resolvedBaseUrl?: string;
    attempts?: Array<{ baseUrl: string; pass: boolean; errorCode?: string }>;
  }>;
}

class ValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function createConfigRouter(service: ConfigurationServicePort): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    res.json({ success: true, data: service.getAllStatus() });
  });
  router.get('/presets', (_req, res) => {
    res.json({ success: true, data: getConfigurationPresets() });
  });

  const jsonOnly: RequestHandler = (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({
        success: false,
        error: { code: 'CONFIG_UNSUPPORTED_CONTENT_TYPE', message: '配置请求只接受 JSON' },
      });
      return;
    }
    next();
  };

  // 新增：测试单个 Provider 并获取模型列表（必须放在 /:channel 路由之前）
  router.post('/ai/test-provider', jsonOnly, async (req, res) => {
    try {
      if (!service.testSingleProvider) {
        res.status(501).json({
          success: false,
          error: { code: 'NOT_IMPLEMENTED', message: '该功能尚未实现' },
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const provider = {
        name: cleanString(body.name, 100),
        // 中转站会传 baseUrls（多个候选地址）；官方 Provider 传单个 baseUrl。
        baseUrls: validateBaseUrlList(body.baseUrls, body.baseUrl),
        apiKey: cleanString(body.apiKey, 500),
        // 中转站首次测试时还不知道模型，允许留空由后端探测。
        model: body.model === undefined || body.model === '' ? '' : cleanString(body.model, 200),
      };

      const result = await service.testSingleProvider(provider);

      if (!result.pass) {
        res.status(422).json({
          success: false,
          error: {
            code: result.errorCode ?? 'PROVIDER_TEST_FAILED',
            message: result.sanitizedMessage ?? 'Provider 测试失败',
            details: { attempts: result.attempts ?? [] },
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          latencyMs: result.latencyMs,
          supportedModels: result.supportedModels || [],
          resolvedBaseUrl: result.resolvedBaseUrl,
          attempts: result.attempts ?? [],
        },
      });
    } catch (error) {
      sendValidationError(res, error);
    }
  });

  router.post('/:channel/test-and-activate', jsonOnly, async (req, res) => {
    try {
      const channel = parseChannel(req.params.channel);
      const candidate = validateCandidate(channel, req.body);
      const result = await service.testAndActivate(channel, candidate as never, {
        sendTestEmail: readSendTestEmail(req.body),
      });
      if (!result.activated) {
        res.status(422).json({
          success: false,
          error: {
            code: result.test.errorCode ?? 'CONFIG_CONNECTION_TEST_FAILED',
            message: result.test.sanitizedMessage ?? '连接测试失败',
            details: result.test,
          },
        });
        return;
      }
      res.json({ success: true, data: result });
    } catch (error) {
      sendValidationError(res, error);
    }
  });

  router.post('/:channel/retest', jsonOnly, async (req, res) => {
    try {
      const channel = parseChannel(req.params.channel);
      const result = await service.retest(channel, { sendTestEmail: readSendTestEmail(req.body) });
      if (!result) {
        res.status(404).json({
          success: false,
          error: { code: 'CONFIG_NOT_FOUND', message: '未找到已激活配置' },
        });
        return;
      }
      if (!result.test.pass) {
        res.status(422).json({
          success: false,
          error: {
            code: result.test.errorCode ?? 'CONFIG_CONNECTION_TEST_FAILED',
            message: result.test.sanitizedMessage ?? '连接测试失败',
            details: result.test,
          },
        });
        return;
      }
      res.json({ success: true, data: result });
    } catch (error) {
      sendValidationError(res, error);
    }
  });
  return router;
}

function parseChannel(value: string): ConfigChannel {
  if (value !== 'ai' && value !== 'smtp' && value !== 'feishu') {
    throw new ValidationError('CONFIG_CHANNEL_INVALID');
  }
  return value;
}

function validateCandidate<C extends ConfigChannel>(channel: C, body: unknown): ChannelConfigMap[C] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('CONFIG_BODY_INVALID');
  }
  if (channel === 'ai') return validateAi(body as Record<string, unknown>) as ChannelConfigMap[C];
  if (channel === 'smtp') return validateSmtp(body as Record<string, unknown>) as ChannelConfigMap[C];
  return validateFeishu(body as Record<string, unknown>) as ChannelConfigMap[C];
}

function validateAi(body: Record<string, unknown>): ChannelConfigMap['ai'] {
  if (!Array.isArray(body.providers) || body.providers.length < 1 || body.providers.length > 10) {
    throw new ValidationError('CONFIG_PROVIDER_COUNT_INVALID');
  }
  const providers = body.providers.map((raw, index) => ({ index, ...validateAiProvider(raw) }));
  providers.sort((left, right) => left.priority - right.priority || left.index - right.index);
  return { providers: providers.map(({ index: _index, ...provider }) => provider) };
}

function validateAiProvider(raw: unknown): ChannelConfigMap['ai']['providers'][number] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('CONFIG_FIELD_INVALID');
  }
  const value = raw as Record<string, unknown>;
  if (value.kind === undefined) return validateCustomAiProvider(value, false);
  if (value.kind === 'official') return validateOfficialAiProvider(value);
  if (value.kind === 'custom') return validateCustomAiProvider(value, true);
  throw new ValidationError('CONFIG_FIELD_INVALID');
}

function validateOfficialAiProvider(value: Record<string, unknown>): ChannelConfigMap['ai']['providers'][number] {
  // presetId 要先解析出来，因为允许哪些字段取决于是官方 Provider 还是中转站。
  const presetId = cleanString(value.presetId, 50);
  const preset = findProviderPreset(presetId);
  if (!preset) throw new ValidationError('CONFIG_PRESET_INVALID');
  if (preset.availability !== 'available' || preset.protocol !== 'openai-compatible') {
    throw new ValidationError('CONFIG_PRESET_UNAVAILABLE');
  }

  // 官方 Provider 的地址由预设固定，客户端传 baseUrl 一律拒绝（不是忽略），
  // 避免把请求改指到别处。只有中转站可以带地址，且必须是测试通过的那一个。
  assertOnlyFields(
    value,
    preset.requiresBaseUrl
      ? ['kind', 'presetId', 'baseUrl', 'apiKey', 'model', 'priority']
      : ['kind', 'presetId', 'apiKey', 'model', 'priority']
  );
  const baseUrl = preset.requiresBaseUrl ? validateProviderUrl(cleanString(value.baseUrl, 500)) : preset.baseUrl;

  // 官方 Provider 的模型必须在白名单内；中转站的模型是测试时从对方 /models 拿到的，
  // 无法预先枚举，只做基本字符串校验。
  const model = cleanString(value.model, 100);
  if (!preset.requiresBaseUrl && !preset.modelSuggestions.includes(model)) {
    throw new ValidationError('CONFIG_MODEL_INVALID');
  }

  return {
    name: preset.displayName,
    baseUrl,
    apiKey: cleanString(value.apiKey, 200, false),
    model,
    priority: validatePriority(value.priority),
  };
}

function validateCustomAiProvider(
  value: Record<string, unknown>,
  hasKind: boolean
): ChannelConfigMap['ai']['providers'][number] {
  if (hasKind) assertOnlyFields(value, ['kind', 'name', 'baseUrl', 'apiKey', 'model', 'priority']);
  return {
    name: cleanString(value.name, 50),
    baseUrl: validateProviderUrl(cleanString(value.baseUrl, 200)),
    apiKey: cleanString(value.apiKey, 200, false),
    model: cleanString(value.model, 100),
    priority: validatePriority(value.priority),
  };
}

function assertOnlyFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new ValidationError('CONFIG_FIELD_INVALID');
}

function validatePriority(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new ValidationError('CONFIG_PRIORITY_INVALID');
  }
  return value as number;
}

function validateSmtp(body: Record<string, unknown>): ChannelConfigMap['smtp'] {
  const host = cleanString(body.host, 100);
  const port = body.port;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
    throw new ValidationError('CONFIG_SMTP_PORT_INVALID');
  }
  if (typeof body.secure !== 'boolean') throw new ValidationError('CONFIG_FIELD_INVALID');
  return {
    host,
    port: port as number,
    secure: body.secure,
    user: cleanString(body.user, 200),
    authCode: cleanString(body.authCode, 200, false),
    to: cleanString(body.to, 200),
  };
}

function validateFeishu(body: Record<string, unknown>): ChannelConfigMap['feishu'] {
  const webhookUrl = validateProviderUrl(cleanString(body.webhookUrl, 500));
  if (!webhookUrl.startsWith('https://')) throw new ValidationError('CONFIG_URL_INVALID');
  return { webhookUrl };
}

function validateBaseUrlList(rawList: unknown, rawSingle: unknown): string[] {
  const values = Array.isArray(rawList) ? rawList : rawSingle === undefined ? [] : [rawSingle];
  if (values.length === 0) throw new ValidationError('CONFIG_BASE_URL_REQUIRED');
  if (values.length > 4) throw new ValidationError('CONFIG_BASE_URL_COUNT_INVALID');
  const urls = values
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => validateProviderUrl(cleanString(value, 500)));
  if (urls.length === 0) throw new ValidationError('CONFIG_BASE_URL_REQUIRED');
  return [...new Set(urls)];
}

function validateProviderUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) throw new Error();
    if (parsed.protocol === 'https:') return value;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]')
    ) {
      return value;
    }
  } catch {
    // Use the fixed validation error below.
  }
  throw new ValidationError('CONFIG_URL_INVALID');
}

function cleanString(value: unknown, maxLength: number, trim = true): string {
  if (typeof value !== 'string') throw new ValidationError('CONFIG_FIELD_INVALID');
  if (value.length > maxLength) throw new ValidationError('CONFIG_FIELD_TOO_LONG');
  const cleaned = value.replace(/[\x00-\x1f]/g, '');
  const normalized = trim ? cleaned.trim() : cleaned;
  if (!normalized.trim()) throw new ValidationError('CONFIG_FIELD_INVALID');
  return normalized;
}

function readSendTestEmail(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return (body as Record<string, unknown>).sendTestEmail === true;
}

function sendValidationError(res: Parameters<RequestHandler>[1], error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: { code: error.code, message: '配置字段无效' },
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: { code: 'CONFIG_REQUEST_FAILED', message: '配置请求处理失败' },
  });
}
