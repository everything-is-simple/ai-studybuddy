import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';
import { config, type ProviderConfig } from '../../config/env';
import { aiLogger } from '../../utils/ai-logger';
import { OpenAiProvider } from './openai-provider';
import type { AiProvider } from './provider';

export class AiProviderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class AllProvidersFailedError extends AiProviderError {
  readonly failures: Array<{ provider: string; error: string }>;
  constructor(failures: Array<{ provider: string; error: string }>) {
    super(
      'AI_ALL_PROVIDERS_FAILED',
      `所有 AI Provider 均调用失败：${failures.map((f) => `${f.provider}(${f.error})`).join('、')}`
    );
    this.failures = failures;
  }
}

export interface AiProviderRouterOptions {
  providers?: AiProvider[];
  fetch?: typeof fetch;
}

function buildProvidersFromConfig(fetchImpl?: typeof fetch): AiProvider[] {
  const providers: AiProvider[] = [];

  if (config.aiProviders.length > 0) {
    const sorted = [...config.aiProviders].sort((a, b) => a.priority - b.priority);
    for (const p of sorted) {
      providers.push(
        new OpenAiProvider({
          name: p.name,
          baseURL: p.baseUrl,
          apiKey: p.apiKey,
          defaultModel: p.model,
          timeoutMs: config.aiTimeoutMs,
          fetch: fetchImpl,
        })
      );
    }
  } else if (config.aiApiKey) {
    providers.push(
      new OpenAiProvider({
        name: 'legacy',
        baseURL: config.aiBaseUrl,
        apiKey: config.aiApiKey,
        defaultModel: config.aiModel,
        timeoutMs: config.aiTimeoutMs,
        fetch: fetchImpl,
      })
    );
  }

  return providers;
}

export class AiProviderRouter implements AiProvider {
  readonly name = 'router';
  private providers: AiProvider[];

  constructor(options?: AiProviderRouterOptions) {
    this.providers = options?.providers ?? buildProvidersFromConfig(options?.fetch);
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    if (this.providers.length === 0) {
      throw new AiProviderError(
        'AI_NOT_CONFIGURED',
        'AI Provider 未配置，请在 .env.local 中设置 AI_PROVIDERS 或 AI_API_KEY'
      );
    }

    const failures: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      try {
        const result = await provider.generate(request);
        const response: AiResponse = {
          ...result,
          fallbackUsed: failures.length > 0,
        };
        aiLogger.recordSuccess({
          taskType: request.taskType,
          result: response,
          attemptedProviders: failures,
        });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        failures.push({ provider: provider.name, error: error.message });
        aiLogger.recordFailure({
          taskType: request.taskType,
          provider: provider.name,
          error,
        });
      }
    }

    throw new AllProvidersFailedError(failures);
  }
}
