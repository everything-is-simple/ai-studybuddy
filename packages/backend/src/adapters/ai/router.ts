import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';
import { config } from '../../config/env';
import { aiLogger, type AiLogger } from '../../utils/ai-logger';
import { OpenAiProvider } from './openai-provider';
import type { AiProvider } from './provider';

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 10 * 60 * 1000;
const COOLDOWN_ERROR = 'AI_PROVIDER_COOLDOWN';

interface ProviderHealthState {
  consecutiveFailures: number;
  cooldownUntil: number | null;
}

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
export class AllProvidersCoolingDownError extends AiProviderError {
  readonly retryAt: string;
  readonly providers: string[];

  constructor(providers: string[], retryAt: string) {
    super(
      'AI_ALL_PROVIDERS_COOLING_DOWN',
      `所有 AI Provider 均在冷却中：${providers.join('、')}；最早恢复时间：${retryAt}`
    );
    this.providers = providers;
    this.retryAt = retryAt;
  }
}

export interface AiProviderRouterOptions {
  providers?: AiProvider[];
  fetch?: typeof fetch;
  now?: () => number;
  logger?: AiLogger;
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
  private readonly health = new Map<AiProvider, ProviderHealthState>();
  private readonly now: () => number;
  private readonly logger: AiLogger;

  constructor(options?: AiProviderRouterOptions) {
    this.providers = options?.providers ?? buildProvidersFromConfig(options?.fetch);
    this.now = options?.now ?? Date.now;
    this.logger = options?.logger ?? aiLogger;
  }

  private getHealth(provider: AiProvider): ProviderHealthState {
    const existing = this.health.get(provider);
    if (existing) return existing;

    const created: ProviderHealthState = {
      consecutiveFailures: 0,
      cooldownUntil: null,
    };
    this.health.set(provider, created);
    return created;
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    if (this.providers.length === 0) {
      throw new AiProviderError(
        'AI_NOT_CONFIGURED',
        'AI Provider 未配置，请在 .env.local 中设置 AI_PROVIDERS 或 AI_API_KEY'
      );
    }

    const failures: Array<{ provider: string; error: string }> = [];
    const coolingProviders: Array<{ provider: string; cooldownUntil: number }> = [];
    let actualAttempts = 0;

    for (const provider of this.providers) {
      const state = this.getHealth(provider);
      const currentTime = this.now();

      if (state.cooldownUntil !== null && currentTime < state.cooldownUntil) {
        failures.push({ provider: provider.name, error: COOLDOWN_ERROR });
        coolingProviders.push({ provider: provider.name, cooldownUntil: state.cooldownUntil });
        continue;
      }

      if (state.cooldownUntil !== null) {
        state.cooldownUntil = null;
        this.logger.recordCircuitClosed({
          provider: provider.name,
          cooldownEndedAt: new Date(currentTime).toISOString(),
        });
      }

      actualAttempts += 1;
      try {
        const result = await provider.generate(request);
        state.consecutiveFailures = 0;
        state.cooldownUntil = null;
        const response: AiResponse = {
          ...result,
          fallbackUsed: failures.length > 0,
        };
        this.logger.recordSuccess({
          taskType: request.taskType,
          result: response,
          attemptedProviders: failures,
        });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        state.consecutiveFailures += 1;
        failures.push({ provider: provider.name, error: error.message });
        this.logger.recordFailure({
          taskType: request.taskType,
          provider: provider.name,
          error,
        });

        if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
          const cooldownStartedAt = this.now();
          const cooldownEndsAt = cooldownStartedAt + COOLDOWN_MS;
          state.cooldownUntil = cooldownEndsAt;
          this.logger.recordCircuitOpened({
            provider: provider.name,
            cooldownStartedAt: new Date(cooldownStartedAt).toISOString(),
            cooldownEndsAt: new Date(cooldownEndsAt).toISOString(),
          });
        }
      }
    }

    if (actualAttempts === 0 && coolingProviders.length === this.providers.length) {
      const retryAt = new Date(
        Math.min(...coolingProviders.map(({ cooldownUntil }) => cooldownUntil))
      ).toISOString();
      throw new AllProvidersCoolingDownError(
        coolingProviders.map(({ provider }) => provider),
        retryAt
      );
    }

    throw new AllProvidersFailedError(failures);
  }
}
