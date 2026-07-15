# AI StudyBuddy 后端开发规范 Backend Guidelines

**版本**：v1.2
**日期**：2026-07-16
**状态**：有效
**用途**：Phase 0.8 正式后端开发的目录结构、SQLite 约定、Adapter 输出、日志、环境变量和验证规则。写第一个后端服务 / Adapter / API / Worker 前必须读本文件。

---

## 一、后端目录结构

```text
packages/backend/src/
  config/         环境变量集中读取
  db/             数据库连接、路径、migration、SQL 文件
    sql/          schema SQL 文件
  adapters/       Adapter 实现（StorageAdapter、PdfConverter、OcrConverter 等）
  api/            Express 路由
  services/       业务服务（SemesterOnboardingService、ReportService 等）
  utils/          日志、ID 生成等工具
  server.ts       Express 启动入口
```

- 业务代码不自行拼接路径，统一走 `db/paths.ts`。
- 业务代码不直接 `require("better-sqlite3")`，统一走 `db/connection.ts`。
- 业务代码不直接 import `I:\ai-studybuddy-composer` 的任何文件。

---

## 二、SQLite 连接约定

### 2.1 双库模型

| 库     | 文件名          | 职责                                                               | 写入频率       |
| ------ | --------------- | ------------------------------------------------------------------ | -------------- |
| 全局库 | `studybuddy.db` | 系统配置、孩子档案、学期索引、备份记录                             | 低频，小而稳定 |
| 学期库 | `semester.db`   | 课程实例、考试尝试、任务、事件、资料索引、知识模块、jobs、报告证据 | 随学习活动写入 |

全局库不写学期业务明细；学期库之间互不共享事务或文件空间。

### 2.2 打开时必做

```typescript
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

### 2.3 关闭或归档前必做

```typescript
db.pragma('wal_checkpoint(TRUNCATE)');
// 然后执行 PRAGMA integrity_check 确认结果为 ok
db.close();
```

### 2.4 并发约束

- 单 Node 进程写入，不并发打开多个写连接。
- 学期库通过 `SemesterDatabaseFactory` 按需打开，使用后关闭。
- 全局库在进程生命周期内保持打开。

---

## 三、路径安全约定

- `APP_DATA_ROOT` 通过环境变量读取，禁止硬编码盘符。
- `paths.ts` 统一生成所有路径，业务代码不自行拼接。
- 所有路径经 `resolveAppDataPath()` 校验：resolved path 必须在 `APP_DATA_ROOT` 内，否则抛错。
- 拒绝包含 `..` 的相对路径段。

存储拓扑：

```text
APP_DATA_ROOT/
  studybuddy.db
  semesters/<semester-id>/
    semester.db
    files/
    tmp/
  tmp/
  backups/
```

---

## 四、Migration 约定

- Schema 与 migration SQL 以 `src/db/sql/*.ts` 的字符串常量维护，并由 `migrations.ts` 直接 import；不得在运行时读取未复制到 `dist/` 的 `.sql` 文件。
- `schema_migrations` 表记录已执行 version；全局库和学期库各自维护独立记录。
- Migration 版本必须从 1 连续递增。runner 先检查已执行版本，再按顺序执行未执行版本；发现版本缺口必须失败，不得静默跳过。
- 每个 migration 的 SQL 与其 version 记录必须在同一个 SQLite 事务内提交。首版 schema 作为 v1，后续结构变更新增 v2、v3……，不改写已发布版本。
- Schema 可使用 `CREATE TABLE IF NOT EXISTS` 保持首版初始化幂等，但不能以幂等 SQL 代替版本化迁移。
- 构建脚本清理 `dist/` 时必须同步清理 `tsconfig.tsbuildinfo`，再执行 project build；测试必须覆盖干净构建后的 `dist` 运行态。

---

## 五、Adapter 统一输出格式

### 5.1 Converter 输出

所有 Converter（PdfConverter、OcrConverter、TextConverter）统一返回 `ConverterResult`：

```typescript
interface ConverterResult {
  ok: boolean;
  sourceType: 'pdf' | 'image' | 'text';
  text?: string;
  metadata?: { pageCount?: number; charCount?: number; hasFormula?: boolean; hasTable?: boolean };
  warnings?: string[];
  error?: string;
}
```

### 5.2 报告发送输出

报告发送必须返回按渠道划分的结果，便于只重试失败渠道：

```typescript
interface ReportSendResult {
  channel: 'email' | 'feishu';
  success: boolean;
  errorSummary?: string;
}
```

### 5.3 Adapter 边界

- 业务代码不得直接依赖 Python 命令、绝对路径、SMTP 授权码或 Webhook URL。
- 分级 fallback 的最终人工出口必须明确（参见 `08-共同底座架构` 第四节）。

### 5.4 AI Provider Adapter

- OpenAI-compatible 接入统一通过 `OpenAiProvider`；业务 Service、Job 和 API 不得直接实例化 SDK 客户端。
- `AiProviderRouter` 负责按 priority 轮询、首个成功返回、`fallbackUsed` 标记和失败汇总；未配置抛 `AI_NOT_CONFIGURED`。
- Router 健康状态只存在于单个 Router 实例内，并按 Provider 实例隔离。连续失败第 5 次后固定冷却 10 分钟；冷却期间跳过该 Provider，后续 Provider 成功时 `fallbackUsed` 仍为 `true`。
- 冷却到期允许恢复探测：成功清零，失败立即进入新的 10 分钟冷却。阈值和冷却时间属于当前产品固定规则，不新增环境变量、数据库或跨进程共享。
- 本次至少真实调用过一个 Provider 但最终全部失败时抛 `AI_ALL_PROVIDERS_FAILED`；全部 Provider 均处于冷却且没有外部调用时抛 `AI_ALL_PROVIDERS_COOLING_DOWN`，错误只包含 Provider 名称和最早恢复时间。
- Provider 必须支持构造函数注入 `fetch`，Router 必须支持注入 `now` 与 `logger`，以便测试模拟成功、失败、超时、冷却和恢复；测试不得使用真实 API Key 或真实模型网络请求。

---

## 六、API 响应信封约定

使用 `@ai-studybuddy/shared` 中的 `ApiSuccess<T>` / `ApiError`：

```typescript
// 成功
{ success: true, data: T, meta?: { page?: number; pageSize?: number; total?: number } }

// 失败
{ success: false, error: { code: string; message: string } }
```

- 所有 API 端点必须返回此信封格式。
- 错误码使用大写蛇形命名（如 `SEMESTER_NOT_FOUND`、`DB_INIT_FAILED`）。
- AI 开发验证路由 `POST /api/dev/ai/generate` 校验 `taskType`、`inputText`，并保持 `AI_NOT_CONFIGURED`（503）与 `AI_ALL_PROVIDERS_FAILED`（502）的稳定语义。

---

## 七、日志规范

### 7.1 禁止输出

- API Key
- SMTP 授权码
- 完整 Feishu Webhook URL
- 学生隐私全文（资料正文、笔记正文、完整答案、聊天内容）
- 完整堆栈跟踪到生产日志（开发环境可输出，生产只记摘要和 error code）

AI Router 请求日志额外只允许记录 `taskType`、Provider 名称、model、token、耗时、fallback 和失败摘要；不得记录请求输入、模型输出或 Provider 配置中的密钥。

熔断日志只允许两个事件：`AI_PROVIDER_CIRCUIT_OPENED` 记录 `provider`、`cooldownStartedAt`、`cooldownEndsAt`，`AI_PROVIDER_CIRCUIT_CLOSED` 记录 `provider`、`cooldownEndedAt`；除日志自身时间外不得接收或记录原始 Error、Key、URL、正文或完整 UUID。

### 7.2 日志目录

运行日志写入 `I:\ai-studybuddy-logs`，不进入主仓库 Git。

### 7.3 错误日志格式

```text
[ERROR] <error_code> <简短摘要> <可选 context 键值对>
```

---

## 八、环境变量约定

### 8.1 文件管理

- `.env.example` 列出所有变量名（不填真实值），提交到 Git。
- `.env.local` 从 `.env.example` 复制后填真实值，`.gitignore` 已忽略。
- `.env.*.local` 同样忽略。

### 8.2 读取约定

- 后端从 `process.env` 读取，通过 `src/config/env.ts` 集中管理。
- 禁止在业务代码中直接调用 `process.env`。
- 启动时校验必需变量（如 `APP_DATA_ROOT`）必须存在且可写。

### 8.3 变量清单

| 变量名               | 用途                                                                           | 必填                      |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------- |
| `APP_DATA_ROOT`      | 运行数据根目录                                                                 | 是                        |
| `BACKEND_PORT`       | 后端端口（默认 3000）                                                          | 否                        |
| `BACKEND_HOST`       | 后端监听地址（默认 127.0.0.1）                                                 | 否                        |
| `AI_PROVIDERS`       | 多 Provider JSON 数组；按 `priority` 升序 fallback                             | 否；推荐配置              |
| `AI_TIMEOUT_MS`      | 单次 AI 请求超时毫秒数（默认 60000）                                           | 否                        |
| `AI_BASE_URL`        | legacy 单 Provider 的 OpenAI-compatible Base URL；仅 `AI_PROVIDERS` 为空时使用 | 否                        |
| `AI_API_KEY`         | legacy 单 Provider API Key；仅 `AI_PROVIDERS` 为空时使用                       | 否                        |
| `AI_MODEL`           | legacy 单 Provider 模型名；仅 `AI_PROVIDERS` 为空时使用                        | 否                        |
| `SMTP_HOST`          | QQ SMTP 主机；`.env.example` 已给出 `smtp.qq.com` 示例                         | 否；S6 正式发送报告时必填 |
| `SMTP_PORT`          | QQ SMTP 端口；`.env.example` 已给出 `465` 示例                                 | 否；S6 正式发送报告时必填 |
| `SMTP_SECURE`        | 是否 SSL；`.env.example` 已给出 `true` 示例                                    | 否；S6 正式发送报告时必填 |
| `SMTP_USER`          | QQ 邮箱地址；只填入 `.env.local`                                               | 否；S6 正式发送报告时必填 |
| `SMTP_AUTH_CODE`     | QQ SMTP 授权码；只填入 `.env.local`，不得进入日志或提交                        | 否；S6 正式发送报告时必填 |
| `SMTP_TO`            | 家长收件邮箱；只填入 `.env.local`                                              | 否；S6 正式发送报告时必填 |
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook URL；只填入 `.env.local`，不得进入日志或提交                      | 否；S6 正式发送报告时必填 |

> Phase 0.7 已验证 QQ SMTP 与飞书 Webhook 的真实送达；Phase 0.8 T06 只实现 S1 学习节奏核心 API，不消费这些报告发送变量。正式业务发送留到 S6 ParentReport。

---

## 九、试炼场边界

- `packages/` 不得 import `I:\ai-studybuddy-composer` 的任何代码。
- 试炼场代码只作思路参考，Phase 0.8 以 Adapter 方式重新实现。
- 试炼场的 `.env.local`、`.venv`、`node_modules`、输出和真实凭据不进入主仓库。

---

## 十、测试与验证命令

```powershell
# 类型检查
pnpm type-check

# 编译
pnpm build

# 文档治理检查
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1

# 空白行检查
git diff --check
```

涉及 API 变更时，额外手动验证：

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```
