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

export type PersistedChannelStatus = 'unconfigured' | 'verified_pass';

export interface ChannelStatus {
  status: PersistedChannelStatus;
  lastVerified: string | null;
  summary: string | null;
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
  private readonly snapshots: Partial<Record<ConfigChannel, ChannelConfig>> = {};
  private readonly statuses = new Map<ConfigChannel, ChannelStatus>();
  private readonly listeners = new Set<ActivatedListener>();
  private readonly channelLocks = new Map<ConfigChannel, Promise<void>>();

  constructor(options: {
    store: SecureStore;
    tester: ConnectionTesterLike;
    configDir: string;
    now?: () => string;
  }) {
    this.store = options.store;
    this.tester = options.tester;
    this.configDir = options.configDir;
    this.now = options.now ?? (() => new Date().toISOString());
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
    return { ...this.statuses.get(channel)! };
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
        aiAvailable: this.snapshots.ai !== undefined,
        smtpAvailable: this.snapshots.smtp !== undefined,
        feishuAvailable: this.snapshots.feishu !== undefined,
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
      },
    };
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

  async testAndActivate<C extends ConfigChannel>(
    channel: C,
    candidate: ChannelConfigMap[C],
    options: { sendTestEmail?: boolean } = {}
  ): Promise<TestAndActivateResult> {
    const previous = this.channelLocks.get(channel) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.channelLocks.set(channel, current);
    await previous;
    try {
      return await this.doTestAndActivate(channel, candidate, options);
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

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
