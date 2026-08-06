import { AiProviderRouter } from '../adapters/ai/router';
import { OpenAiProvider } from '../adapters/ai/openai-provider';
import { getConfigDir, getAppDataRoot } from '../db/paths';
import { createSiblingRuntimeLogBoundary } from '../utils/runtime-log-boundary';
import { setAiLogBoundary } from '../utils/ai-logger';
import {
  getAiRouter,
  getCurrentFeishuConfig,
  getCurrentSmtpConfig,
  setAiRouter,
  setFeishuConfig,
  setSmtpConfig,
} from './config-registry';
import { ConfigurationService } from './configuration-service';
import type { ChannelConfigMap } from './configuration-types';
import { ConnectionTester } from './connection-tester';
import { DpapiProtector } from './dpapi-protector';
import { config } from './env';
import { SecureStore, type ConfigChannel } from './secure-store';

export function applyRuntimeSnapshot<C extends ConfigChannel>(
  channel: C,
  snapshot: Readonly<ChannelConfigMap[C]>
): void {
  if (channel === 'ai') {
    const ai = snapshot as unknown as ChannelConfigMap['ai'];
    const providers = [...ai.providers]
      .sort((left, right) => left.priority - right.priority)
      .map(
        (provider) =>
          new OpenAiProvider({
            name: provider.name,
            baseURL: provider.baseUrl,
            apiKey: provider.apiKey,
            defaultModel: provider.model,
            timeoutMs: config.aiTimeoutMs,
          })
      );
    setAiRouter(new AiProviderRouter({ providers }));
    return;
  }
  if (channel === 'smtp') {
    setSmtpConfig(snapshot as unknown as ChannelConfigMap['smtp']);
    return;
  }
  setFeishuConfig(snapshot as unknown as ChannelConfigMap['feishu']);
}

export async function initializeRuntimeConfiguration(): Promise<ConfigurationService> {
  // T05-1：启动时接线 AI 日志到 runtime-log-boundary 的 ai JSONL 文件（脱敏落盘）。
  try {
    const boundary = createSiblingRuntimeLogBoundary(getAppDataRoot());
    setAiLogBoundary(boundary);
  } catch {
    // 日志边界不可用时保持 console 降级，不阻塞启动（字段仍脱敏）。
    setAiLogBoundary(null);
  }
  const configDir = getConfigDir();
  const service = new ConfigurationService({
    store: new SecureStore({ protector: new DpapiProtector(), configDir }),
    tester: new ConnectionTester(),
    configDir,
    runtimeAvailability: (channel) => {
      if (channel === 'ai') return getAiRouter() !== null;
      if (channel === 'smtp') return getCurrentSmtpConfig() !== null;
      return getCurrentFeishuConfig() !== null;
    },
  });
  service.onConfigActivated((channel, snapshot) => applyRuntimeSnapshot(channel, snapshot));
  await service.initialize();

  for (const channel of ['ai', 'smtp', 'feishu'] as const) {
    const active = service.getActiveSnapshot(channel);
    if (active) {
      applyRuntimeSnapshot(channel, active);
      continue;
    }
    const fallback = getEnvironmentFallback(channel);
    if (fallback && service.registerEnvironmentFallback(channel, fallback)) {
      applyRuntimeSnapshot(channel, fallback);
    }
  }
  return service;
}

function getEnvironmentFallback<C extends ConfigChannel>(channel: C): ChannelConfigMap[C] | null {
  if (channel === 'ai') {
    const providers =
      config.aiProviders.length > 0
        ? config.aiProviders
        : config.aiApiKey
          ? [
              {
                name: 'legacy',
                baseUrl: config.aiBaseUrl,
                apiKey: config.aiApiKey,
                model: config.aiModel,
                priority: 1,
              },
            ]
          : [];
    return (providers.length > 0 ? { providers } : null) as ChannelConfigMap[C] | null;
  }
  if (channel === 'smtp') {
    return (
      config.smtpHost && config.smtpUser && config.smtpAuthCode && config.smtpTo
        ? {
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure,
            user: config.smtpUser,
            authCode: config.smtpAuthCode,
            to: config.smtpTo,
          }
        : null
    ) as ChannelConfigMap[C] | null;
  }
  return (config.feishuWebhookUrl ? { webhookUrl: config.feishuWebhookUrl } : null) as ChannelConfigMap[C] | null;
}
