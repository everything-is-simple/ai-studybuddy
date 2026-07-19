import { request } from './api-client';

export type ConfigState = 'unconfigured' | 'verified_pass';
export interface ChannelStatus { status: ConfigState; lastVerified: string | null; summary: string | null; errorCode: string | null; }
export interface ConfigurationStatus {
  ai: ChannelStatus; smtp: ChannelStatus; feishu: ChannelStatus;
  runtime: { dataDir: boolean; aiAvailable: boolean; smtpAvailable: boolean; feishuAvailable: boolean; uptime: number; nodeVersion: string };
}

export type ProviderPresetGroup = 'international' | 'mainland' | 'alternative';
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
