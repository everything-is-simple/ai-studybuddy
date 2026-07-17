import type { ProviderConfig } from './env';

export interface AiChannelConfig {
  providers: ProviderConfig[];
}

export interface SmtpChannelConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  authCode: string;
  to: string;
}

export interface FeishuChannelConfig {
  webhookUrl: string;
}

export interface ChannelConfigMap {
  ai: AiChannelConfig;
  smtp: SmtpChannelConfig;
  feishu: FeishuChannelConfig;
}

export type ChannelConfig = ChannelConfigMap[keyof ChannelConfigMap];

export interface ConnectionTestResult {
  pass: boolean;
  errorCode?: string;
  sanitizedMessage?: string;
}

export interface AiProviderTestResult extends ConnectionTestResult {
  name: string;
  latencyMs?: number;
  model?: string;
}

export interface AiConnectionTestResult extends ConnectionTestResult {
  providers: AiProviderTestResult[];
}
