import type { AiProvider } from '../adapters/ai/provider';
import type { FeishuChannelConfig, SmtpChannelConfig } from './configuration-types';

let currentAiRouter: AiProvider | null = null;
let currentSmtpConfig: Readonly<SmtpChannelConfig> | null = null;
let currentFeishuConfig: Readonly<FeishuChannelConfig> | null = null;

export function setAiRouter(router: AiProvider | null): void {
  currentAiRouter = router;
}

export function getAiRouter(): AiProvider | null {
  return currentAiRouter;
}

export function setSmtpConfig(config: SmtpChannelConfig | null): void {
  currentSmtpConfig = config ? Object.freeze(structuredClone(config)) : null;
}

export function getCurrentSmtpConfig(): Readonly<SmtpChannelConfig> | null {
  return currentSmtpConfig;
}

export function setFeishuConfig(config: FeishuChannelConfig | null): void {
  currentFeishuConfig = config ? Object.freeze(structuredClone(config)) : null;
}

export function getCurrentFeishuConfig(): Readonly<FeishuChannelConfig> | null {
  return currentFeishuConfig;
}

export function clearConfigRegistry(): void {
  currentAiRouter = null;
  currentSmtpConfig = null;
  currentFeishuConfig = null;
}
