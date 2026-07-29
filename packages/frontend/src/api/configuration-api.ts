import { request } from './api-client';

export type ConfigState = 'unconfigured' | 'verified_pass' | 'environment_fallback';
export interface SafeConfigurationDetail { label: string; value: string; }
export interface ChannelStatus {
  status: ConfigState; lastVerified: string | null; summary: string | null;
  details: SafeConfigurationDetail[]; errorCode: string | null;
}
export interface ConfigurationStatus {
  ai: ChannelStatus; smtp: ChannelStatus; feishu: ChannelStatus;
  runtime: { dataDir: boolean; aiAvailable: boolean; smtpAvailable: boolean; feishuAvailable: boolean; uptime: number; nodeVersion: string };
}

export type ProviderPresetGroup = 'international' | 'mainland' | 'relay';
export type ProviderPresetProtocol = 'openai-compatible' | 'anthropic-native';
export type ProviderPresetAvailability = 'available' | 'coming-soon';

export interface AiProviderPreset {
  id: string;
  displayName: string;
  group: ProviderPresetGroup;
  protocol: ProviderPresetProtocol;
  availability: ProviderPresetAvailability;
  baseUrl: string;
  defaultModel: string;
  modelSuggestions: string[];
  description: string;
  /** 中转站为 true：地址由用户填写，可填多个备用地址。官方 Provider 为 false。 */
  requiresBaseUrl?: boolean;
  maxBaseUrls?: number;
}

export interface ConfigurationPresets {
  ai: AiProviderPreset[];
  smtp: { host: string; port: number; secure: boolean; userHint: string; authCodeHint: string; recipientHint: string };
  feishu: { webhookHint: string; securityHint: string };
  customProviderHint: string;
}

export interface OfficialAiCandidate {
  kind: 'official';
  presetId: string;
  /** 只有中转站需要：测试通过的那个地址。官方 Provider 不传。 */
  baseUrl?: string;
  apiKey: string;
  model: string;
  priority: number;
}

export interface CustomAiCandidate {
  kind: 'custom';
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  priority: number;
}

export const getConfigurationStatus = () => request<ConfigurationStatus>('/config/status');
export const getConfigurationPresets = () => request<ConfigurationPresets>('/config/presets');
export const testAndActivate = (channel: 'ai' | 'smtp' | 'feishu', candidate: unknown) =>
  request<{ activated: boolean; test: { pass: boolean; errorCode?: string; sanitizedMessage?: string } }>(`/config/${channel}/test-and-activate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(candidate),
  });
export const retestConfiguration = (channel: 'ai' | 'smtp' | 'feishu') =>
  request<{ activated: boolean; test: { pass: boolean; errorCode?: string; sanitizedMessage?: string } }>(`/config/${channel}/retest`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });

export interface ProviderTestAttempt {
  baseUrl: string;
  pass: boolean;
  errorCode?: string;
}

/**
 * 测试单个 AI Provider 并获取支持的模型列表。
 * 中转站传 baseUrls（多个候选地址，逐个尝试），返回 resolvedBaseUrl 表示哪个地址通了。
 */
export const testSingleProvider = (provider: {
  name: string;
  baseUrls: string[];
  apiKey: string;
  model?: string;
}) =>
  request<{
    latencyMs: number;
    supportedModels: string[];
    resolvedBaseUrl?: string;
    attempts?: ProviderTestAttempt[];
  }>('/config/ai/test-provider', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(provider),
  });
