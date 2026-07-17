import { AiProviderRouter } from '../adapters/ai/router';
import { OpenAiProvider } from '../adapters/ai/openai-provider';
import { getConfigDir } from '../db/paths';
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
    if (active) applyRuntimeSnapshot(channel, active);
    else applyEnvironmentFallback(channel);
  }
  return service;
}

function applyEnvironmentFallback(channel: ConfigChannel): void {
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
    if (providers.length > 0) applyRuntimeSnapshot('ai', { providers });
    return;
  }
  if (channel === 'smtp') {
    if (config.smtpHost && config.smtpUser && config.smtpAuthCode && config.smtpTo) {
      applyRuntimeSnapshot('smtp', {
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        user: config.smtpUser,
        authCode: config.smtpAuthCode,
        to: config.smtpTo,
      });
    }
    return;
  }
  if (config.feishuWebhookUrl) {
    applyRuntimeSnapshot('feishu', { webhookUrl: config.feishuWebhookUrl });
  }
}
