import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOG_FILES = {
  ai: ['runtime', 'ai-events.jsonl'],
  maintenance: ['errors', 'maintenance.jsonl'],
  operations: ['operations', 'operations.jsonl'],
} as const;

const LOG_ENTRY_FIELDS: Record<keyof typeof LOG_FILES, readonly string[]> = {
  ai: [
    'event',
    'level',
    'taskType',
    'provider',
    'model',
    'tokenUsed',
    'latencyMs',
    'fallbackUsed',
    'attemptedProviderCount',
    'attemptedProviders',
    'cooldownStartedAt',
    'cooldownEndsAt',
    'cooldownEndedAt',
    'errorCode',
    'timestamp',
  ],
  maintenance: ['event', 'level', 'errorCode', 'cleanupErrorCount', 'cleanupErrorCode', 'timestamp'],
  operations: ['event', 'level', 'status', 'errorCode', 'timestamp'],
};

type LogFileName = keyof typeof LOG_FILES;
type SafeLogValue = string | number | boolean | null;
export type SafeLogEntry = Readonly<Record<string, SafeLogValue>>;

export class RuntimeLogBoundaryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RuntimeLogBoundaryError';
    this.stack = this.message;
  }
}

function fail(code: string): never {
  throw new RuntimeLogBoundaryError(code);
}

function isSameOrDescendant(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizeAbsolute(input: string | undefined, invalidCode: string): string {
  if (!input || input.trim() === '' || !path.isAbsolute(input)) fail(invalidCode);
  const normalized = path.resolve(input);
  if (normalized === path.parse(normalized).root) fail('LOG_TARGET_PROTECTED_ROOT');
  return normalized;
}

function assertExistingDirectoryIsNotLink(directory: string): void {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(directory);
  } catch {
    fail('LOG_ROOT_UNAVAILABLE');
  }
  if (stats.isSymbolicLink()) fail('LOG_TARGET_REPARSE_POINT');
  if (!stats.isDirectory()) fail('LOG_ROOT_INVALID');
}

function assertRegularFileIsNotLink(filePath: string): void {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink()) fail('LOG_TARGET_REPARSE_POINT');
  if (!stats.isFile()) fail('LOG_TARGET_OUTSIDE_ALLOWLIST');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRotationStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
}

function assertAllowedEntry(logFile: LogFileName, entry: SafeLogEntry): void {
  const allowed = new Set(LOG_ENTRY_FIELDS[logFile]);
  for (const [key, value] of Object.entries(entry)) {
    if (!allowed.has(key) || (!['string', 'number', 'boolean'].includes(typeof value) && value !== null)) {
      fail('LOG_ENTRY_FIELDS_INVALID');
    }
    if (typeof value === 'string' && value.length > 128) fail('LOG_ENTRY_FIELDS_INVALID');
  }
  for (const required of ['event', 'level', 'timestamp']) {
    if (!(required in entry)) fail('LOG_ENTRY_FIELDS_INVALID');
  }
  for (const codeKey of ['errorCode', 'cleanupErrorCode']) {
    const value = entry[codeKey];
    if (value !== undefined && value !== null && (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(value))) {
      fail('LOG_ENTRY_FIELDS_INVALID');
    }
  }
}
export function toSafeLogErrorCode(error: unknown, fallback = 'UNKNOWN_ERROR'): string {
  const candidate =
    error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  const code = typeof candidate === 'string' ? candidate : fallback;
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : fallback;
}

/**
 * 仅管理显式受控、仓库外且与受保护根不相交的日志根。
 * 调用者必须传入已有日志根；该类不会猜测、创建或清理任意上级目录。
 */
export function createSiblingRuntimeLogBoundary(appDataRoot: string): RuntimeLogBoundary {
  const protectedDataRoot = normalizeAbsolute(appDataRoot, 'LOG_TARGET_PROTECTED_ROOT');
  const logRoot = path.resolve(protectedDataRoot, '..', 'logs');
  if (
    logRoot === path.parse(logRoot).root ||
    isSameOrDescendant(logRoot, protectedDataRoot) ||
    isSameOrDescendant(protectedDataRoot, logRoot)
  ) {
    fail('LOG_TARGET_PROTECTED_ROOT');
  }
  if (!fs.existsSync(logRoot)) {
    try {
      fs.mkdirSync(logRoot, { recursive: true });
    } catch {
      fail('LOG_ROOT_UNAVAILABLE');
    }
  }
  return new RuntimeLogBoundary({
    logRoot,
    protectedRoots: [protectedDataRoot, process.cwd()],
  });
}
export class RuntimeLogBoundary {
  private readonly logRoot: string;
  private readonly maxFileBytes: number;

  constructor(options: {
    logRoot: string;
    protectedRoots: readonly string[];
    /** 单文件字节上限（T05-3）：append 前检查，超限先轮转再追加。默认 5 MiB。 */
    maxFileBytes?: number;
  }) {
    this.logRoot = normalizeAbsolute(options.logRoot, 'LOG_ROOT_INVALID');
    assertExistingDirectoryIsNotLink(this.logRoot);

    if (options.maxFileBytes !== undefined) {
      if (!Number.isInteger(options.maxFileBytes) || options.maxFileBytes < 1024 || options.maxFileBytes > 1073741824) {
        fail('LOG_MAX_FILE_BYTES_INVALID');
      }
      this.maxFileBytes = options.maxFileBytes;
    } else {
      this.maxFileBytes = 5 * 1024 * 1024;
    }

    const userHome = normalizeAbsolute(os.homedir(), 'LOG_TARGET_PROTECTED_ROOT');
    if (this.logRoot === userHome) fail('LOG_TARGET_PROTECTED_ROOT');

    const protectedRoots = options.protectedRoots
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '')
      .map((candidate) => normalizeAbsolute(candidate, 'LOG_TARGET_PROTECTED_ROOT'));

    if (
      protectedRoots.some(
        (protectedRoot) =>
          isSameOrDescendant(this.logRoot, protectedRoot) || isSameOrDescendant(protectedRoot, this.logRoot)
      )
    ) {
      fail('LOG_TARGET_PROTECTED_ROOT');
    }
  }

  append(logFile: LogFileName, entry: SafeLogEntry): void {
    assertAllowedEntry(logFile, entry);
    const target = this.getTarget(logFile, true);
    // T05-3：单文件容量上限——达到 maxFileBytes 先轮转（保留 3 份）再追加，
    // 防止长期运行日志无限增长。轮转同样受 allowlist 与路径边界约束。
    if (fs.existsSync(target.filePath)) {
      const stats = fs.statSync(target.filePath);
      if (stats.size >= this.maxFileBytes) {
        this.rotateAndRetain(logFile, { now: new Date(), maxRetainedFiles: 3 });
      }
    }
    const serialized = JSON.stringify(entry);
    fs.appendFileSync(target.filePath, `${serialized}\n`, { encoding: 'utf8', flag: 'a' });
  }

  /**
   * 轮转和保留只能针对固定 allowlist 中的单个 JSONL 文件；调用方不能提供路径或 glob。
   */
  rotateAndRetain(logFile: LogFileName, options: { now: Date; maxRetainedFiles: number }): void {
    if (!Number.isInteger(options.maxRetainedFiles) || options.maxRetainedFiles < 0 || options.maxRetainedFiles > 365) {
      fail('LOG_RETENTION_INVALID');
    }

    const target = this.getTarget(logFile, false);
    if (fs.existsSync(target.filePath)) {
      assertRegularFileIsNotLink(target.filePath);
      const stamp = createRotationStamp(options.now);
      // 同秒内多次轮转会碰撞：追加单调后缀 -1/-2/…（正则允许 \.rotated 前的任意段）
      let rotatedPath = path.join(target.directory, `${target.fileName}.${stamp}.rotated`);
      let suffix = 1;
      while (fs.existsSync(rotatedPath)) {
        rotatedPath = path.join(target.directory, `${target.fileName}.${stamp}-${suffix}.rotated`);
        suffix += 1;
      }
      fs.renameSync(target.filePath, rotatedPath);
    }

    const rotationPattern = new RegExp(
      `^${escapeRegExp(target.fileName)}\\.\\d{14}(?:-\\d+)?\\.rotated$`
    );
    const retained = fs
      .readdirSync(target.directory, { withFileTypes: true })
      .filter((entry) => rotationPattern.test(entry.name))
      .map((entry) => {
        const candidate = path.join(target.directory, entry.name);
        assertRegularFileIsNotLink(candidate);
        return { candidate, modifiedAt: fs.statSync(candidate).mtimeMs };
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt || right.candidate.localeCompare(left.candidate));

    for (const candidate of retained.slice(options.maxRetainedFiles)) {
      fs.unlinkSync(candidate.candidate);
    }
  }

  private getTarget(
    logFile: LogFileName,
    createDirectory: boolean
  ): { directory: string; filePath: string; fileName: string } {
    const definition = LOG_FILES[logFile];
    if (!definition) fail('LOG_TARGET_OUTSIDE_ALLOWLIST');
    const [subdirectory, fileName] = definition;
    const directory = path.resolve(this.logRoot, subdirectory);
    if (!isSameOrDescendant(directory, this.logRoot) || directory === this.logRoot)
      fail('LOG_TARGET_OUTSIDE_ALLOWLIST');

    if (createDirectory && !fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    assertExistingDirectoryIsNotLink(directory);

    const filePath = path.resolve(directory, fileName);
    if (path.dirname(filePath) !== directory) fail('LOG_TARGET_OUTSIDE_ALLOWLIST');
    return { directory, filePath, fileName };
  }
}
