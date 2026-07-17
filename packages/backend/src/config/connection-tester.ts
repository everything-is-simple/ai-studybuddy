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
    const providers = await Promise.all(
      candidate.providers.map((provider) => this.testOneAiProvider(provider))
    );
    return { pass: providers.every((provider) => provider.pass), providers };
  }

  async testSmtp(
    candidate: SmtpChannelConfig,
    sendTestEmail: boolean
  ): Promise<ConnectionTestResult> {
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
      if (code === 'ECONNREFUSED') {
        return fixedFailure('SMTP_CONNECTION_REFUSED', 'SMTP 连接被拒绝');
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
      if (error instanceof ConnectionTimeoutError) {
        return {
          name: provider.name,
          ...fixedFailure('AI_CONNECTION_TIMEOUT', 'AI Provider 连接超时'),
        };
      }
      const status = getErrorStatus(error);
      if (status === 401 || status === 403) {
        return { name: provider.name, ...fixedFailure('AI_AUTH_FAILED', 'AI Provider 身份验证失败') };
      }
      return { name: provider.name, ...fixedFailure('AI_UNKNOWN', 'AI Provider 连接测试失败') };
    }
  }
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
