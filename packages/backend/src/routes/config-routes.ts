import { Router, type RequestHandler } from 'express';
import type { ConfigurationStatus, TestAndActivateResult } from '../config/configuration-service';
import type { ChannelConfigMap } from '../config/configuration-types';
import type { ConfigChannel } from '../config/secure-store';

interface ConfigurationServicePort {
  getAllStatus(): ConfigurationStatus;
  getActiveSnapshot(channel: ConfigChannel): Readonly<ChannelConfigMap[ConfigChannel]> | null;
  testAndActivate<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C],
    options?: { sendTestEmail?: boolean }
  ): Promise<TestAndActivateResult>;
  retest(
    channel: ConfigChannel,
    options?: { sendTestEmail?: boolean }
  ): Promise<TestAndActivateResult | null>;
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
  const providers = body.providers.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ValidationError('CONFIG_FIELD_INVALID');
    }
    const value = raw as Record<string, unknown>;
    const priority = value.priority;
    if (!Number.isInteger(priority) || (priority as number) < 1 || (priority as number) > 100) {
      throw new ValidationError('CONFIG_PRIORITY_INVALID');
    }
    return {
      index,
      name: cleanString(value.name, 50),
      baseUrl: validateProviderUrl(cleanString(value.baseUrl, 200)),
      apiKey: cleanString(value.apiKey, 200, false),
      model: cleanString(value.model, 100),
      priority: priority as number,
    };
  });
  providers.sort((left, right) => left.priority - right.priority || left.index - right.index);
  return { providers: providers.map(({ index: _index, ...provider }) => provider) };
}

function validateSmtp(body: Record<string, unknown>): ChannelConfigMap['smtp'] {
  const port = body.port;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65_535) {
    throw new ValidationError('CONFIG_SMTP_PORT_INVALID');
  }
  if (typeof body.secure !== 'boolean') throw new ValidationError('CONFIG_FIELD_INVALID');
  const to = cleanString(body.to, 200);
  if (!to.includes('@')) throw new ValidationError('CONFIG_EMAIL_INVALID');
  return {
    host: cleanString(body.host, 253),
    port: port as number,
    secure: body.secure,
    user: cleanString(body.user, 200),
    authCode: cleanString(body.authCode, 200, false),
    to,
  };
}

function validateFeishu(body: Record<string, unknown>): ChannelConfigMap['feishu'] {
  const webhookUrl = cleanString(body.webhookUrl, 500);
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
  } catch {
    throw new ValidationError('CONFIG_URL_INVALID');
  }
  return { webhookUrl };
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
