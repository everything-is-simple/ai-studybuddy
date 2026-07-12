// ============================================================
// 环境变量集中读取 — 后端开发规范第 8 节
// 业务代码不直接调用 process.env，统一从此模块读取。
// ============================================================

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// 从 monorepo 根目录读取 .env.local
// tsx 运行时 __dirname 可能指向源文件目录，process.cwd() 更可靠
const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), "../../.env.local"),
  path.resolve(__dirname, "../../../.env.local"),
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

// AI Provider 配置项（多 Provider 轮询链）
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
      baseUrl: String(item.baseUrl ?? ""),
      apiKey: String(item.apiKey ?? ""),
      model: String(item.model ?? ""),
      priority: Number(item.priority ?? 0),
    }));
  } catch {
    throw new Error("[CONFIG] INVALID_AI_PROVIDERS AI_PROVIDERS must be a valid JSON array");
  }
}

// ── APP_DATA_ROOT ──────────────────────────────────────────
const APP_DATA_ROOT = requireEnv("APP_DATA_ROOT");
const resolvedRoot = path.resolve(APP_DATA_ROOT);

// 确保数据根目录存在
fs.mkdirSync(resolvedRoot, { recursive: true });

// 校验可写
try {
  const testFile = path.join(resolvedRoot, ".write-test");
  fs.writeFileSync(testFile, "ok");
  fs.unlinkSync(testFile);
} catch (e) {
  throw new Error(
    `[CONFIG] DATA_ROOT_NOT_WRITABLE APP_DATA_ROOT=${resolvedRoot} ${e}`
  );
}

// ── 导出配置 ───────────────────────────────────────────────
export const config = {
  appDataRoot: resolvedRoot,

  backendPort: Number(process.env.BACKEND_PORT ?? 3000),
  backendHost: process.env.BACKEND_HOST ?? "127.0.0.1",

  // OCR 子进程配置（T04 使用）
  pythonPath: process.env.PYTHON_PATH ?? "python",
  ocrTimeoutMs: Number(process.env.OCR_TIMEOUT_MS ?? 60000),

  // AI Provider（T05 时使用）
  aiProviders: parseAiProviders(),
  aiBaseUrl: process.env.AI_BASE_URL ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60000),

  // SMTP（T06 时使用）
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpAuthCode: process.env.SMTP_AUTH_CODE ?? "",
  smtpTo: process.env.SMTP_TO ?? "",

  // 飞书（T06 时使用）
  feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL ?? "",
} as const;
