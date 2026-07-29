import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ConfigChannel, SecureStore } from './secure-store';
import { SecureStoreError } from './secure-store';
import { SecretProtectionError } from './secret-protector';
import type {
  AiConnectionTestResult,
  ChannelConfig,
  ChannelConfigMap,
  ConnectionTestResult,
} from './configuration-types';

export type PersistedChannelStatus =
  | 'unconfigured'
  | 'verified_pass'
  | 'environment_fallback';

export interface SafeConfigurationDetail {
  label: string;
  value: string;
}

export interface ChannelStatus {
  status: PersistedChannelStatus;
  lastVerified: string | null;
  summary: string | null;
  details: SafeConfigurationDetail[];
  errorCode: string | null;
}

export interface ConfigurationStatus {
  ai: ChannelStatus;
  smtp: ChannelStatus;
  feishu: ChannelStatus;
  runtime: {
    dataDir: boolean;
    aiAvailable: boolean;
    smtpAvailable: boolean;
    feishuAvailable: boolean;
    uptime: number;
    nodeVersion: string;
  };
}

export interface TestAndActivateResult {
  activated: boolean;
  test: ConnectionTestResult | AiConnectionTestResult;
}

interface ConnectionTesterLike {
  testAi(candidate: ChannelConfigMap['ai']): Promise<AiConnectionTestResult>;
  testSmtp(
    candidate: ChannelConfigMap['smtp'],
    sendTestEmail: boolean
  ): Promise<ConnectionTestResult>;
  testFeishu(candidate: ChannelConfigMap['feishu']): Promise<ConnectionTestResult>;
}

type ActivatedListener = (
  channel: ConfigChannel,
  snapshot: Readonly<ChannelConfigMap[ConfigChannel]>
) => void;

const CHANNELS: ConfigChannel[] = ['ai', 'smtp', 'feishu'];

export class ConfigurationService {
  private readonly store: SecureStore;
  private readonly tester: ConnectionTesterLike;
  private readonly configDir: string;
  private readonly now: () => string;
  private readonly runtimeAvailability?: (channel: ConfigChannel) => boolean;
  private readonly snapshots: Partial<Record<ConfigChannel, ChannelConfig>> = {};
  private readonly statuses = new Map<ConfigChannel, ChannelStatus>();
  private readonly listeners = new Set<ActivatedListener>();
  private readonly channelLocks = new Map<ConfigChannel, Promise<void>>();

  constructor(options: {
    store: SecureStore;
    tester: ConnectionTesterLike;
    configDir: string;
    now?: () => string;
    runtimeAvailability?: (channel: ConfigChannel) => boolean;
  }) {
    this.store = options.store;
    this.tester = options.tester;
    this.configDir = options.configDir;
    this.now = options.now ?? (() => new Date().toISOString());
    this.runtimeAvailability = options.runtimeAvailability;
    for (const channel of CHANNELS) this.setUnconfigured(channel, null);
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.configDir, { recursive: true });
    await this.store.cleanupTemporaryFiles();
    const metadata = await this.readStateMetadata();
    for (const channel of CHANNELS) {
      try {
        const result = await this.store.read<ChannelConfigMap[typeof channel]>(channel);
        this.setSnapshot(channel, result.data);
        this.statuses.set(channel, {
          status: 'verified_pass',
          lastVerified: metadata[channel]?.lastVerifiedAt ?? null,
          summary: summarize(channel, result.data),
          details: summarizeDetails(channel, result.data),
          errorCode: result.recoveredFromPrev ? 'CONFIG_RECOVERED_FROM_PREV' : null,
        });
      } catch (error) {
        const errorCode =
          (error instanceof SecureStoreError && error.code === 'CONFIG_CORRUPT_DEGRADED') ||
          (error instanceof SecretProtectionError && error.code === 'CONFIG_DPAPI_UNAVAILABLE')
            ? error.code
            : null;
        this.setUnconfigured(channel, errorCode);
      }
    }
  }

  getChannelStatus(channel: ConfigChannel): ChannelStatus {
    const status = this.statuses.get(channel)!;
    return { ...status, details: status.details.map((detail) => ({ ...detail })) };
  }

  getAllStatus(): ConfigurationStatus {
    let dataDir = true;
    try {
      fs.accessSync(this.configDir, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      dataDir = false;
    }
    return {
      ai: this.getChannelStatus('ai'),
      smtp: this.getChannelStatus('smtp'),
      feishu: this.getChannelStatus('feishu'),
      runtime: {
        dataDir,
        aiAvailable: this.isRuntimeAvailable('ai'),
        smtpAvailable: this.isRuntimeAvailable('smtp'),
        feishuAvailable: this.isRuntimeAvailable('feishu'),
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
      },
    };
  }

  private isRuntimeAvailable(channel: ConfigChannel): boolean {
    return this.runtimeAvailability?.(channel) ?? this.snapshots[channel] !== undefined;
  }

  getActiveSnapshot<C extends ConfigChannel>(
    channel: C
  ): Readonly<ChannelConfigMap[C]> | null {
    return (this.snapshots[channel] as Readonly<ChannelConfigMap[C]> | undefined) ?? null;
  }

  onConfigActivated(listener: ActivatedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  registerEnvironmentFallback<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C]
  ): boolean {
    if (this.getActiveSnapshot(channel)) return false;
    this.setSnapshot(channel, candidate);
    this.statuses.set(channel, {
      status: 'environment_fallback',
      lastVerified: null,
      summary: summarize(channel, candidate),
      details: summarizeDetails(channel, candidate),
      errorCode: null,
    });
    return true;
  }

  async testAndActivate<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C],
    options: { sendTestEmail?: boolean } = {}
  ): Promise<TestAndActivateResult> {
    return this.withChannelLock(channel, () =>
      this.doTestAndActivate(channel, candidate, options)
    );
  }

  async retest(
    channel: ConfigChannel,
    options: { sendTestEmail?: boolean } = {}
  ): Promise<TestAndActivateResult | null> {
    return this.withChannelLock(channel, async () => {
      const snapshot = this.getActiveSnapshot(channel);
      if (!snapshot) return null;
      const result = await this.runTest(channel, snapshot as never, options);
      if (result.pass) {
        const current = this.statuses.get(channel)!;
        this.statuses.set(channel, {
          ...current,
          lastVerified: this.now(),
          errorCode: null,
        });
      }
      return { activated: false, test: result };
    });
  }

  /**
   * 测试单个 AI Provider 并获取模型列表。中转站可传多个候选地址。
   */
  async testSingleProvider(provider: {
    name: string;
    baseUrl?: string;
    baseUrls?: string[];
    apiKey: string;
    model: string;
  }): Promise<{
    pass: boolean;
    errorCode?: string;
    sanitizedMessage?: string;
    latencyMs?: number;
    supportedModels?: string[];
    resolvedBaseUrl?: string;
    attempts?: Array<{ baseUrl: string; pass: boolean; errorCode?: string }>;
  }> {
    // 检查 tester 是否支持 testSingleProvider
    if (typeof (this.tester as any).testSingleProvider !== 'function') {
      return {
        pass: false,
        errorCode: 'NOT_IMPLEMENTED',
        sanitizedMessage: 'ConnectionTester 未实现 testSingleProvider 方法',
      };
    }

    try {
      return await (this.tester as any).testSingleProvider(provider);
    } catch (error) {
      return {
        pass: false,
        errorCode: 'PROVIDER_TEST_ERROR',
        sanitizedMessage: '测试 Provider 时发生错误',
      };
    }
  }

  private async withChannelLock<T>(channel: ConfigChannel, operation: () => Promise<T>): Promise<T> {
    const previous = this.channelLocks.get(channel) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.channelLocks.set(channel, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.channelLocks.get(channel) === current) this.channelLocks.delete(channel);
    }
  }

  private async doTestAndActivate<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C],
    options: { sendTestEmail?: boolean }
  ): Promise<TestAndActivateResult> {
    const immutableCandidate = deepFreeze(structuredClone(candidate)) as ChannelConfigMap[C];
    const result = await this.runTest(channel, immutableCandidate, options);
    if (!result.pass) return { activated: false, test: result };

    await this.store.write(channel, immutableCandidate);
    this.setSnapshot(channel, immutableCandidate);
    const lastVerified = this.now();
    this.statuses.set(channel, {
      status: 'verified_pass',
      lastVerified,
      summary: summarize(channel, immutableCandidate),
      details: summarizeDetails(channel, immutableCandidate),
      errorCode: null,
    });
    await this.writeStateMetadata().catch(() => undefined);
    const snapshot = this.getActiveSnapshot(channel)!;
    for (const listener of this.listeners) {
      try {
        listener(channel, snapshot);
      } catch {
        // Configuration activation must not be rolled back by an observer.
      }
    }
    return { activated: true, test: result };
  }

  private runTest<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C],
    options: { sendTestEmail?: boolean }
  ): Promise<ConnectionTestResult | AiConnectionTestResult> {
    if (channel === 'ai') {
      return this.tester.testAi(candidate as unknown as ChannelConfigMap['ai']);
    }
    if (channel === 'smtp') {
      return this.tester.testSmtp(
        candidate as unknown as ChannelConfigMap['smtp'],
        options.sendTestEmail === true
      );
    }
    return this.tester.testFeishu(candidate as unknown as ChannelConfigMap['feishu']);
  }

  private setSnapshot<C extends ConfigChannel>(channel: C, value: ChannelConfigMap[C]): void {
    this.snapshots[channel] = deepFreeze(structuredClone(value)) as unknown as ChannelConfig;
  }

  private setUnconfigured(channel: ConfigChannel, errorCode: string | null): void {
    delete this.snapshots[channel];
    this.statuses.set(channel, {
      status: 'unconfigured',
      lastVerified: null,
      summary: null,
      details: [],
      errorCode,
    });
  }

  private async readStateMetadata(): Promise<Partial<Record<ConfigChannel, { lastVerifiedAt: string }>>> {
    try {
      return JSON.parse(await fs.promises.readFile(path.join(this.configDir, 'state.json'), 'utf8'));
    } catch {
      return {};
    }
  }

  private async writeStateMetadata(): Promise<void> {
    await fs.promises.mkdir(this.configDir, { recursive: true });
    const state = Object.fromEntries(
      CHANNELS.flatMap((channel) => {
        const status = this.statuses.get(channel)!;
        return status.status === 'verified_pass' && status.lastVerified
          ? [[channel, { status: status.status, lastVerifiedAt: status.lastVerified }]]
          : [];
      })
    );
    const target = path.join(this.configDir, 'state.json');
    const temporary = path.join(this.configDir, `state.${crypto.randomUUID()}.tmp`);
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(state), 'utf8');
      await fs.promises.rm(target, { force: true });
      await fs.promises.rename(temporary, target);
    } finally {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

function summarize<C extends ConfigChannel>(channel: C, value: ChannelConfigMap[C]): string {
  if (channel === 'ai') {
    const providers = (value as ChannelConfigMap['ai']).providers;
    return `${providers.length} 个 Provider：${providers.map((provider) => provider.model).join('、')}`;
  }
  return channel === 'smtp' ? 'QQ SMTP 已激活' : '飞书 Webhook 已激活';
}

function summarizeDetails<C extends ConfigChannel>(
  channel: C,
  value: ChannelConfigMap[C]
): SafeConfigurationDetail[] {
  if (channel === 'ai') {
    return (value as ChannelConfigMap['ai']).providers
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((provider) => ({
        label: provider.name,
        value: `${provider.model} · 优先级 ${provider.priority}`,
      }));
  }
  if (channel === 'smtp') {
    const smtp = value as ChannelConfigMap['smtp'];
    return [
      { label: '账号', value: maskEmail(smtp.user) },
      { label: '收件邮箱', value: maskEmail(smtp.to) },
      { label: 'SMTP 授权码', value: '•••••••• 已保存，不可回显' },
    ];
  }
  return [{ label: '飞书 Webhook', value: '•••••••• 已保存，不可回显' }];
}

function maskEmail(value: string): string {
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return '•••••••• 已保存';
  const local = value.slice(0, atIndex);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(4, local.length - visible.length))}${value.slice(atIndex)}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
