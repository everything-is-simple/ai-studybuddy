import { request } from './api-client';

export type ConfigState = 'unconfigured' | 'verified_pass';
export interface ChannelStatus { status: ConfigState; lastVerified: string | null; summary: string | null; errorCode: string | null; }
export interface ConfigurationStatus {
  ai: ChannelStatus; smtp: ChannelStatus; feishu: ChannelStatus;
  runtime: { dataDir: boolean; aiAvailable: boolean; smtpAvailable: boolean; feishuAvailable: boolean; uptime: number; nodeVersion: string };
}
export interface ProviderForm { name: string; baseUrl: string; apiKey: string; model: string; priority: number; }

export const getConfigurationStatus = () => request<ConfigurationStatus>('/config/status');
export const testAndActivate = (channel: 'ai' | 'smtp' | 'feishu', candidate: unknown) =>
  request<{ activated: boolean; test: { pass: boolean; errorCode?: string; sanitizedMessage?: string } }>(`/config/${channel}/test-and-activate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(candidate),
  });
export const retestConfiguration = (channel: 'ai' | 'smtp' | 'feishu') =>
  request<{ activated: boolean; test: { pass: boolean; errorCode?: string; sanitizedMessage?: string } }>(`/config/${channel}/retest`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
