// ============================================================
// 环境变量集中读取 — 后端开发规范第 8 节
// 业务代码不直接调用 process.env，统一从此模块读取。
// ============================================================

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

export type NodeEnv = 'development' | 'test' | 'production';

// 从 monorepo 根目录读取 .env.local
// tsx 运行时 __dirname 可能指向源文件目录，process.cwd() 更可靠
const envCandidates = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(__dirname, '../../../.env.local'),
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[CONFIG] MISSING_ENV ${key} not set in .env.local`);
  }
  return value;
}

function readNumberEnv(key: string, fallback: number): number {
  return Number(process.env[key] ?? fallback);
}

function readBoundedNumberEnv(key: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`[CONFIG] INVALID_NUMBER ${key} must be between ${minimum} and ${maximum}`);
  }
  return Math.floor(value);
}

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV ?? 'development';
  if (value === 'development' || value === 'test' || value === 'production') return value;
  throw new Error('[CONFIG] INVALID_NODE_ENV unsupported runtime mode');
}

function readBackendHost(): '127.0.0.1' {
  const value = process.env.BACKEND_HOST ?? '127.0.0.1';
  if (value !== '127.0.0.1') {
    throw new Error('[CONFIG] INVALID_BACKEND_HOST backend must listen on loopback');
  }
  return value;
}

export function getDocxZipLimits() {
  return {
    maxEntries: readNumberEnv('DOCX_ZIP_MAX_ENTRIES', 10000),
    maxEntrySizeBytes: readNumberEnv('DOCX_ZIP_MAX_ENTRY_SIZE_BYTES', 50 * 1024 * 1024),
    maxTotalSizeBytes: readNumberEnv('DOCX_ZIP_MAX_TOTAL_SIZE_BYTES', 100 * 1024 * 1024),
    maxDocumentXmlSizeBytes: readNumberEnv('DOCX_ZIP_MAX_DOCUMENT_XML_SIZE_BYTES', 20 * 1024 * 1024),
  };
}

export function getPptxZipLimits() {
  return {
    maxEntries: readNumberEnv('PPTX_ZIP_MAX_ENTRIES', 10000),
    maxEntrySizeBytes: readNumberEnv('PPTX_ZIP_MAX_ENTRY_SIZE_BYTES', 50 * 1024 * 1024),
    maxTotalSizeBytes: readNumberEnv('PPTX_ZIP_MAX_TOTAL_SIZE_BYTES', 100 * 1024 * 1024),
    maxSlideXmlSizeBytes: readNumberEnv('PPTX_ZIP_MAX_SLIDE_XML_SIZE_BYTES', 20 * 1024 * 1024),
  };
}

// AI Provider 配置项（按优先级失败切换 + 冷却）
export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  priority: number;
}

function parseAiProviders(): ProviderConfig[] {
  const raw = process.env.AI_PROVIDERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, idx) => ({
      name: String(item.name ?? `provider-${idx}`),
      baseUrl: String(item.baseUrl ?? ''),
      apiKey: String(item.apiKey ?? ''),
      model: String(item.model ?? ''),
      priority: Number(item.priority ?? 0),
    }));
  } catch {
    throw new Error('[CONFIG] INVALID_AI_PROVIDERS AI_PROVIDERS must be a valid JSON array');
  }
}

// ── APP_DATA_ROOT ──────────────────────────────────────────
const APP_DATA_ROOT = requireEnv('APP_DATA_ROOT');
const resolvedRoot = path.resolve(APP_DATA_ROOT);

// 确保数据根目录存在
fs.mkdirSync(resolvedRoot, { recursive: true });

// 校验可写
try {
  const testFile = path.join(resolvedRoot, '.write-test');
  fs.writeFileSync(testFile, 'ok');
  fs.unlinkSync(testFile);
} catch (e) {
  throw new Error(`[CONFIG] DATA_ROOT_NOT_WRITABLE APP_DATA_ROOT=${resolvedRoot} ${e}`);
}


function readParentEnvironmentValue(key: string): string | undefined {
  const sourceKey = Object.keys(process.env).find((candidate) => candidate.toUpperCase() === key.toUpperCase());
  const value = sourceKey ? process.env[sourceKey] : undefined;
  return value ? value : undefined;
}

function addParentEnvironmentValue(environment: Record<string, string>, key: string): void {
  const value = readParentEnvironmentValue(key);
  if (value) environment[key] = value;
}

function createWindowsChildEnvironment(tempRoot: string): Record<string, string> {
  const environment: Record<string, string> = { TEMP: tempRoot, TMP: tempRoot };
  addParentEnvironmentValue(environment, 'SYSTEMROOT');
  addParentEnvironmentValue(environment, 'WINDIR');
  return environment;
}

export function getOcrWorkerEnvironment(options: {
  tempRoot: string;
  cacheRoot?: string;
  requiresPathLookup?: boolean;
}): Record<string, string> {
  const environment = createWindowsChildEnvironment(options.tempRoot);
  if (options.cacheRoot) {
    environment.OCR_CACHE_ROOT = options.cacheRoot;
    environment.XDG_CACHE_HOME = options.cacheRoot;
  }
  if (options.requiresPathLookup ?? true) {
    addParentEnvironmentValue(environment, 'PATH');
    addParentEnvironmentValue(environment, 'PATHEXT');
  }
  return environment;
}

export function getWhisperCppEnvironment(options: { tempRoot: string }): Record<string, string> {
  return createWindowsChildEnvironment(options.tempRoot);
}

// ── 导出配置 ───────────────────────────────────────────────
export const config = {
  appDataRoot: resolvedRoot,

  nodeEnv: readNodeEnv(),
  backendPort: Number(process.env.BACKEND_PORT ?? 3000),
  backendHost: readBackendHost(),
  frontendStaticRoot: process.env.FRONTEND_STATIC_ROOT ?? '',
  // T05 仅供隔离验证注入固定时钟；未设置时服务使用真实当前时间。
  cramPlanNow: process.env.CRAM_PLAN_NOW ?? '',
  configAllowedOrigins: process.env.CONFIG_ALLOWED_ORIGINS ?? '',

  // OCR 子进程配置（T04 使用）
  pythonPath: process.env.PYTHON_PATH ?? 'python',
  ocrTimeoutMs: Number(process.env.OCR_TIMEOUT_MS ?? 60000),
  ocrCacheRoot: path.resolve(process.env.OCR_CACHE_ROOT ?? path.join(resolvedRoot, 'models', 'rapidocr')),
  ocrTempRoot: path.resolve(process.env.OCR_TEMP_ROOT ?? path.join(resolvedRoot, 'tmp', 'ocr')),

  // S7-MVP 本机 whisper.cpp 运行时。默认空值表示未配置，绝不猜测本机路径或回退云端。
  localAsrWhisperCliPath: process.env.LOCAL_ASR_WHISPER_CLI_PATH ?? '',
  localAsrWhisperModelPath: process.env.LOCAL_ASR_WHISPER_MODEL_PATH ?? '',
  localAsrWhisperTimeoutMs: readBoundedNumberEnv('LOCAL_ASR_WHISPER_TIMEOUT_SECONDS', 90, 1, 300) * 1000,
  localAsrWhisperMaxFileBytes: readBoundedNumberEnv(
    'LOCAL_ASR_WHISPER_MAX_FILE_BYTES',
    25 * 1024 * 1024,
    1024,
    100 * 1024 * 1024
  ),

  // AI Provider（T05 时使用）
  aiProviders: parseAiProviders(),
  aiBaseUrl: process.env.AI_BASE_URL ?? '',
  aiApiKey: process.env.AI_API_KEY ?? '',
  aiModel: process.env.AI_MODEL ?? '',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60000),

  // SMTP（T06 时使用）
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpAuthCode: process.env.SMTP_AUTH_CODE ?? '',
  smtpTo: process.env.SMTP_TO ?? '',

  // 飞书（S6 ParentReport 使用）
  feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL ?? '',
} as const;
