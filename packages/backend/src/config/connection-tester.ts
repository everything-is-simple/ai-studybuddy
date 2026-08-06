import nodemailer from 'nodemailer';
import { fetch as undiciFetch } from 'undici';
import { OpenAiProvider } from '../adapters/ai/openai-provider';
import type { AiProvider } from '../adapters/ai/provider';
import type { ProviderConfig } from './env';
import type {
  AiChannelConfig,
  AiConnectionTestResult,
  AiProviderTestResult,
  ConnectionTestResult,
  FeishuChannelConfig,
  SmtpChannelConfig,
} from './configuration-types';

interface SmtpTransport {
  verify(): Promise<unknown>;
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export interface ConnectionTesterOptions {
  aiProviderTimeoutMs?: number;
  createAiProvider?: (config: ProviderConfig) => AiProvider;
  createSmtpTransport?: (config: SmtpChannelConfig) => SmtpTransport;
  fetch?: typeof fetch;
}

class ConnectionTimeoutError extends Error {}

export class ConnectionTester {
  private readonly aiProviderTimeoutMs: number;
  private readonly createAiProvider: (config: ProviderConfig) => AiProvider;
  private readonly createSmtpTransport: (config: SmtpChannelConfig) => SmtpTransport;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConnectionTesterOptions = {}) {
    this.aiProviderTimeoutMs = options.aiProviderTimeoutMs ?? 15_000;
    this.createAiProvider =
      options.createAiProvider ??
      ((provider) =>
        new OpenAiProvider({
          name: provider.name,
          baseURL: provider.baseUrl,
          apiKey: provider.apiKey,
          defaultModel: provider.model,
          timeoutMs: this.aiProviderTimeoutMs,
        }));
    this.createSmtpTransport =
      options.createSmtpTransport ??
      ((smtp) =>
        nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: { user: smtp.user, pass: smtp.authCode },
        }));
    this.fetchImpl = options.fetch ?? (undiciFetch as unknown as typeof fetch);
  }

  async testAi(candidate: AiChannelConfig): Promise<AiConnectionTestResult> {
    if (candidate.providers.length === 0) {
      return {
        pass: false,
        errorCode: 'AI_NO_PROVIDERS',
        sanitizedMessage: '至少需要一个 AI Provider',
        providers: [],
      };
    }
    const providers = await Promise.all(candidate.providers.map((provider) => this.testOneAiProvider(provider)));
    // 至少一个 Provider 测试通过就算成功，失败的会被自动跳过
    const hasAtLeastOnePass = providers.some((provider) => provider.pass);
    return { pass: hasAtLeastOnePass, providers };
  }

  async testSmtp(candidate: SmtpChannelConfig, sendTestEmail: boolean): Promise<ConnectionTestResult> {
    try {
      const transport = this.createSmtpTransport(candidate);
      await transport.verify();
      if (sendTestEmail) {
        await transport.sendMail({
          from: candidate.user,
          to: candidate.to,
          subject: 'AI StudyBuddy 配置测试',
          text: 'AI StudyBuddy 配置测试成功。',
        });
      }
      return { pass: true };
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'EAUTH') {
        return fixedFailure('SMTP_AUTH_FAILED', 'SMTP 身份验证失败');
      }
      if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
        return fixedFailure('SMTP_CONNECTION_REFUSED', 'SMTP 连接被拒绝');
      }
      if (code === 'ETIMEDOUT') {
        return fixedFailure('SMTP_CONNECTION_TIMEOUT', 'SMTP 连接超时');
      }
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return fixedFailure('SMTP_DNS_FAILED', 'SMTP 服务器地址无法解析');
      }
      if (code === 'ESOCKET' || code?.startsWith('ERR_TLS_')) {
        return fixedFailure('SMTP_TLS_FAILED', 'SMTP TLS 安全连接失败');
      }
      return fixedFailure('SMTP_UNKNOWN', 'SMTP 连接测试失败');
    }
  }

  async testFeishu(candidate: FeishuChannelConfig): Promise<ConnectionTestResult> {
    try {
      const response = await this.fetchImpl(candidate.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'interactive',
          card: {
            header: { title: { tag: 'plain_text', content: '配置测试' } },
            elements: [{ tag: 'div', text: { tag: 'plain_text', content: 'AI StudyBuddy 配置连接正常。' } }],
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { code?: number } | null;
      if (!response.ok || payload?.code !== 0) {
        return fixedFailure('FEISHU_WEBHOOK_REJECTED', '飞书 Webhook 拒绝了测试请求');
      }
      return { pass: true };
    } catch {
      return fixedFailure('FEISHU_CONNECTION_FAILED', '飞书 Webhook 连接失败');
    }
  }

  /**
   * 单独测试一个 Provider 并获取其支持的模型列表。
   *
   * 官方 Provider 只有一个地址。中转站可以给多个候选地址：按顺序试，第一个通的就是
   * 结果，返回 resolvedBaseUrl 告诉调用方到底哪个地址通了。全部不通时返回最后一次
   * 的失败原因（若某个地址是认证失败，优先报认证失败，因为那通常是 Key 的问题）。
   */
  async testSingleProvider(
    provider: Omit<ProviderConfig, 'baseUrl' | 'priority'> & {
      baseUrl?: string;
      baseUrls?: string[];
    }
  ): Promise<{
    pass: boolean;
    errorCode?: string;
    sanitizedMessage?: string;
    latencyMs?: number;
    supportedModels?: string[];
    resolvedBaseUrl?: string;
    attempts?: Array<{ baseUrl: string; pass: boolean; errorCode?: string }>;
  }> {
    const candidates = expandBaseUrlCandidates(provider.baseUrls?.length ? provider.baseUrls : [provider.baseUrl]);

    if (candidates.length === 0) {
      return fixedFailure('AI_BASE_URL_REQUIRED', '请填写至少一个 API 请求地址');
    }

    const attempts: Array<{ baseUrl: string; pass: boolean; errorCode?: string }> = [];
    let lastFailure = fixedFailure('AI_UNKNOWN', 'AI Provider 连接测试失败');
    let authFailure: ConnectionTestResult | null = null;

    for (const baseUrl of candidates) {
      const startedAt = Date.now();
      const probe: ProviderConfig = {
        name: provider.name,
        baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        priority: 1,
      };
      try {
        // 用户若已手动填了模型名，跳过 /models 探测直接用它试跑（中转站不一定实现 /models）。
        // 没填时先探测模型列表，挑第一个来试跑。
        const presetModel = provider.model.trim();
        let model: string;
        let listing: { reachable: boolean; status?: number; models: string[] } = { reachable: true, models: [] };

        if (presetModel) {
          model = presetModel;
        } else {
          listing = await this.fetchModelList(probe);
          model = listing.models[0] ?? '';
          if (!model) {
            lastFailure = !listing.reachable
              ? fixedFailure('AI_BASE_URL_UNREACHABLE', '该 API 请求地址连不上，请检查地址是否正确')
              : listing.status === 401 || listing.status === 403
                ? fixedFailure('AI_AUTH_FAILED', 'AI Provider 身份验证失败')
                : fixedFailure(
                    'AI_NO_MODEL_AVAILABLE',
                    '地址可以连通但 /models 接口没返回模型，请手动填写模型名后重试'
                  );
            if (lastFailure.errorCode === 'AI_AUTH_FAILED') authFailure = lastFailure;
            attempts.push({ baseUrl, pass: false, errorCode: lastFailure.errorCode });
            continue;
          }
        }

        await withTimeout(
          this.createAiProvider({ ...probe, model }).generate({
            taskType: 'error_analysis',
            inputText: '只回复 OK',
          }),
          this.aiProviderTimeoutMs
        );
        attempts.push({ baseUrl, pass: true });
        return {
          pass: true,
          latencyMs: Date.now() - startedAt,
          // 手动指定模型时不探测模型列表，supportedModels 就是用户填的那个。
          supportedModels: listing.models.length > 0 ? listing.models : [model],
          resolvedBaseUrl: baseUrl,
          attempts,
        };
      } catch (error) {
        lastFailure = classifyAiError(error);
        attempts.push({ baseUrl, pass: false, errorCode: lastFailure.errorCode });
        if (lastFailure.errorCode === 'AI_AUTH_FAILED') authFailure = lastFailure;
      }
    }

    return { ...(authFailure ?? lastFailure), attempts };
  }

  /**
   * 调用 /v1/models 获取模型列表。
   *
   * 区分三种情况，因为它们对用户意味着完全不同的排查方向：
   * - reachable + 有模型：地址和 Key 都对
   * - reachable + 空列表或 HTTP 错误：地址通了，但 Key 或权限有问题
   * - unreachable：地址本身错了（DNS、端口、协议），跟 Key 无关
   */
  private async fetchModelList(
    provider: ProviderConfig
  ): Promise<{ reachable: boolean; status?: number; models: string[] }> {
    let response: Response;
    try {
      const url = `${provider.baseUrl.replace(/\/$/, '')}/models`;
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // 不记日志：URL 和 Key 都是敏感值，日志里不留。
      return { reachable: false, models: [] };
    }

    if (!response.ok) return { reachable: true, status: response.status, models: [] };

    try {
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      return {
        reachable: true,
        status: response.status,
        models: (data.data ?? []).map((entry) => entry.id).filter(Boolean),
      };
    } catch {
      return { reachable: true, status: response.status, models: [] };
    }
  }

  private async testOneAiProvider(provider: ProviderConfig): Promise<AiProviderTestResult> {
    const startedAt = Date.now();
    try {
      const result = await withTimeout(
        this.createAiProvider(provider).generate({
          taskType: 'error_analysis',
          inputText: '只回复 OK',
        }),
        this.aiProviderTimeoutMs
      );
      return {
        name: provider.name,
        pass: true,
        latencyMs: Date.now() - startedAt,
        model: result.model ?? provider.model,
      };
    } catch (error) {
      return { name: provider.name, ...classifyAiError(error) };
    }
  }
}

/**
 * 把用户填的地址展开成候选列表。
 *
 * 很多中转站（new-api / one-api 等）只在 /v1 下暴露 OpenAI 兼容接口：根路径返回的是
 * 站点首页 HTML。SDK 会把 /chat/completions 直接拼在 baseURL 后面，若 baseURL 少了
 * /v1，请求就打到首页上，拿回 HTML，最终报成 AI_UNKNOWN。这里为每个地址补一个 /v1
 * 变体：原样地址先试（官方 Provider 如 DeepSeek 根路径就能用，不受影响），不通再试
 * /v1 变体。已带 /v1（或 /v2 等版本段）的地址不再重复追加。去重后保持原有顺序。
 */
function expandBaseUrlCandidates(rawUrls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (url: string): void => {
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  };
  for (const raw of rawUrls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (trimmed.length === 0) continue;
    push(trimmed);
    // 已经带版本段（/v1、/v2…）的地址不再补 /v1。
    if (!/\/v\d+$/i.test(trimmed)) {
      push(`${trimmed}/v1`);
    }
  }
  return result;
}

function classifyAiError(error: unknown): ConnectionTestResult {
  if (error instanceof ConnectionTimeoutError) {
    return fixedFailure('AI_CONNECTION_TIMEOUT', 'AI Provider 连接超时');
  }
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) {
    return fixedFailure('AI_AUTH_FAILED', 'AI Provider 身份验证失败');
  }
  if (status === 429) {
    return fixedFailure('AI_QUOTA_OR_RATE_LIMITED', 'AI Provider 额度、配额或速率受限');
  }
  return fixedFailure('AI_UNKNOWN', 'AI Provider 连接测试失败');
}

function fixedFailure(errorCode: string, sanitizedMessage: string): ConnectionTestResult {
  return { pass: false, errorCode, sanitizedMessage };
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return String(error.code);
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new ConnectionTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
