import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../db/paths';
import { SecretProtectionError, type SecretProtector } from './secret-protector';

export type ConfigChannel = 'ai' | 'smtp' | 'feishu';

export interface SecureStoreReadResult<T> {
  data: T;
  recoveredFromPrev: boolean;
}

export class SecureStoreError extends Error {
  constructor(
    readonly code: 'CONFIG_NOT_FOUND' | 'CONFIG_CORRUPT_DEGRADED' | 'CONFIG_WRITE_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'SecureStoreError';
  }
}

export class SecureStore {
  private readonly configDir: string;
  private readonly protector: SecretProtector;
  private readonly onAtomicWriteStep?: (step: 'active-moved-to-prev') => void;

  constructor(options: {
    protector: SecretProtector;
    configDir?: string;
    onAtomicWriteStep?: (step: 'active-moved-to-prev') => void;
  }) {
    this.protector = options.protector;
    this.configDir = options.configDir ?? getConfigDir();
    this.onAtomicWriteStep = options.onAtomicWriteStep;
  }

  exists(channel: ConfigChannel): boolean {
    return fs.existsSync(this.filePath(channel, 'active.enc'));
  }

  async write(channel: ConfigChannel, data: unknown): Promise<void> {
    fs.mkdirSync(this.configDir, { recursive: true });
    const activePath = this.filePath(channel, 'active.enc');
    const prevPath = this.filePath(channel, 'prev.enc');
    const temporaryPath = this.filePath(channel, `${crypto.randomUUID()}.tmp`);

    try {
      const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
      await fs.promises.writeFile(temporaryPath, this.protector.encrypt(plaintext), { flag: 'wx' });
      if (fs.existsSync(activePath)) {
        await fs.promises.rm(prevPath, { force: true });
        await fs.promises.rename(activePath, prevPath);
        this.onAtomicWriteStep?.('active-moved-to-prev');
      }
      await fs.promises.rename(temporaryPath, activePath);
    } catch {
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new SecureStoreError('CONFIG_WRITE_FAILED', '配置写入失败');
    }
  }

  async cleanupTemporaryFiles(): Promise<void> {
    if (!fs.existsSync(this.configDir)) return;
    const temporaryPattern = /^(?:ai|smtp|feishu)\.[^.]+\.tmp$/;
    const entries = await fs.promises.readdir(this.configDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && temporaryPattern.test(entry.name))
        .map((entry) => fs.promises.rm(path.join(this.configDir, entry.name), { force: true }))
    );
  }

  async read<T>(channel: ConfigChannel): Promise<SecureStoreReadResult<T>> {
    const activePath = this.filePath(channel, 'active.enc');
    const prevPath = this.filePath(channel, 'prev.enc');

    if (fs.existsSync(activePath)) {
      try {
        return { data: await this.readFile<T>(activePath), recoveredFromPrev: false };
      } catch (error) {
        if (isDpapiUnavailable(error)) throw error;
        // Continue to the verified previous snapshot.
      }
    }

    if (!fs.existsSync(prevPath)) {
      if (!fs.existsSync(activePath)) {
        throw new SecureStoreError('CONFIG_NOT_FOUND', '未找到已激活配置');
      }
      throw new SecureStoreError('CONFIG_CORRUPT_DEGRADED', '已激活配置损坏');
    }

    try {
      const data = await this.readFile<T>(prevPath);
      await this.restorePrevious(channel, prevPath, activePath);
      return { data, recoveredFromPrev: true };
    } catch (error) {
      if (isDpapiUnavailable(error)) throw error;
      throw new SecureStoreError('CONFIG_CORRUPT_DEGRADED', '已激活配置及备份均损坏');
    }
  }

  private async readFile<T>(filePath: string): Promise<T> {
    const ciphertext = await fs.promises.readFile(filePath);
    return JSON.parse(this.protector.decrypt(ciphertext).toString('utf8')) as T;
  }

  private async restorePrevious(
    channel: ConfigChannel,
    prevPath: string,
    activePath: string
  ): Promise<void> {
    const temporaryPath = this.filePath(channel, `${crypto.randomUUID()}.tmp`);
    try {
      await fs.promises.copyFile(prevPath, temporaryPath);
      await fs.promises.rm(activePath, { force: true });
      await fs.promises.rename(temporaryPath, activePath);
    } finally {
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private filePath(channel: ConfigChannel, suffix: string): string {
    return path.join(this.configDir, `${channel}.${suffix}`);
  }
}

function isDpapiUnavailable(error: unknown): boolean {
  return (
    error instanceof SecretProtectionError && error.code === 'CONFIG_DPAPI_UNAVAILABLE'
  );
}
