# P0.8 T05 共同底座——AI Provider Router 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 目标

在主仓库 `packages/backend` 中封装 `AiProviderRouter`，抽象化对大语言模型的调用。采用**多 Provider 轮询链**架构，按优先级依次尝试多个中转站，第一个成功即返回，全部失败才报错。默认接入通过中转（OpenAI `/v1/chat/completions` 兼容协议）调用的 GPT 系列模型，并预留 Nvidia NIM 免费端点（kimi/glm/deepseek）作为兜底。核心要求是实现无隐私侵入的安全记录：仅记录模型名、耗时、Token 消耗及失败原因，**绝对不记录学生隐私原文**。

### 已确认的 Provider 配置（7 路）

| 优先级 | 名称 | Base URL | 模型 | 备注 |
|---|---|---|---|---|
| 1 | pixel-k12 | `https://ai-pixel.online/v1` | gpt-5.5 | Pixel 0.04× |
| 2 | pixel-team | `https://cf.ai-pixel.online/v1` | gpt-5.5 | Pixel team 0.05× |
| 3 | pixel-plus | `https://ai-pixel.online/v1` | gpt-5.5 | Pixel plus 0.1× |
| 4 | xiaoji-codex | `https://api.68886868.xyz/v1` | gpt-5.5 | 小鸡 0.1× |
| 5 | shayulajiao | `https://shayulajiao.xyz/v1` | gpt-5.5 | 鲨鱼辣椒 0.1× |
| 6 | xiaoji-cc | `https://api.68886868.xyz/v1` | gpt-5.5 | 小鸡 cc 0.1× |
| 7 | nvidia-free | `https://integrate.api.nvidia.com/v1` | deepseek-ai/deepseek-v4-pro | 免费兜底 |

所有 Provider 均走 `openai` SDK 的 `chat.completions.create`（`/v1/chat/completions`）。配置存储在 `.env.local` 的 `AI_PROVIDERS` JSON 数组中（已写入）。

## 范围、依据与不可变约束

- **接口规范**：输入输出遵循 `@ai-studybuddy/shared/types.ts` 中的 `AiRequest` 和 `AiResponse` 类型。
- **协议兼容**：全部走 `openai` Node.js SDK 的 `chat.completions.create`（`/v1/chat/completions`）。所有已确认的中转站均支持此端点。
- **多 Provider 轮询 (核心架构)**：
  - 环境变量 `AI_PROVIDERS` 存储 JSON 数组，每项包含 `name`、`baseUrl`、`apiKey`、`model`、`priority`。
  - Router 按 priority 升序排列，依次尝试，第一个成功即返回。
  - 向后兼容：若 `AI_PROVIDERS` 为空或不存在，fallback 到 `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` 单 Provider 模式。
- **超时控制 (P1)**：每个 Provider 调用有独立超时（默认 60 秒，通过 `AI_TIMEOUT_MS` 配置），超时视为该 Provider 失败，轮到下一个。
- **安全与隐私 (P0)**：
  - `ai-logger`：系统日志或存储记录中，禁止输出 `inputText`、生成的 `content` 乃至完整报错堆栈（仅生产）。
  - API 凭证必须通过 `src/config/env.ts` 读取，禁止硬编码。
- **未配置降级处理**：当 `AI_PROVIDERS` 为空且 `AI_API_KEY` 也为空时，服务必须能正常启动；但在调用 AI 功能端点时，需明确返回 `AI_NOT_CONFIGURED` 的 `ApiError`。
- **验证手段**：使用 Dev API 提供 mock 环境及真实环境的 smoke test。单元测试必须独立 mock 网络请求，使用构造函数注入 `fetch`（或对应接口），不依赖真实 API Key 即可跑通。

## 关键文件路径

| 类型 | 路径 |
|---|---|
| 共享类型 | `packages/shared/src/types.ts` (已存在) |
| 环境变量配置 | `packages/backend/src/config/env.ts`<br>`.env.example` |
| AI Logger 工具 | `packages/backend/src/utils/ai-logger.ts` |
| 接口定义 | `packages/backend/src/adapters/ai/provider.ts` |
| OpenAI 兼容实现 | `packages/backend/src/adapters/ai/openai-provider.ts` |
| 路由分发器 | `packages/backend/src/adapters/ai/router.ts` |
| 导出文件 | `packages/backend/src/adapters/ai/index.ts`<br>`packages/backend/src/adapters/index.ts` |
| Dev API | `packages/backend/src/api/dev-ai.ts`<br>`packages/backend/src/server.ts` |
| 测试文件 | `packages/backend/test/ai-router.test.mjs` |
| 任务清单 | `docs/04-开发任务清单-Todo-List.md` |

---

## 任务拆分

### Task 1: 依赖安装与环境变量扩展

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: 安装 SDK**
  在 `packages/backend` 下执行：`pnpm add openai`。
- [ ] **Step 2: 完善 `.env.example` 与 `env.ts`**
  更新 `.env.example`，补充新增的 AI 环境变量占位符（`AI_PROVIDERS`、`AI_TIMEOUT_MS`，以及向后兼容的 `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`）。
  在 `config/env.ts` 中新增：
  ```typescript
  // 多 Provider 轮询链（JSON 数组）
  aiProviders: JSON.parse(process.env.AI_PROVIDERS || "[]") as ProviderConfig[],
  // 单 Provider 向后兼容
  aiBaseUrl: process.env.AI_BASE_URL ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "",
  // 超时
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60000),
  ```
  定义 `ProviderConfig` 接口：`{ name: string; baseUrl: string; apiKey: string; model: string; priority: number }`。

---

### Task 2: 定义 Provider 接口与隐私安全 Logger

**Files:**
- Create: `packages/backend/src/adapters/ai/provider.ts`
- Create: `packages/backend/src/utils/ai-logger.ts`

- [ ] **Step 1: 抽象 `AiProvider` 接口**
  定义接口 `AiProvider`，声明 `generate(request: AiRequest): Promise<AiResponse>`。
- [ ] **Step 2: 实现 `AiLogger` (P0)**
  在首次创建的 `utils/` 目录下提供日志记录功能，要求仅记录：`taskType`, `provider`, `model`, `tokenUsed` (映射自 OpenAI 的 `total_tokens`，建议保留 `prompt_tokens`/`completion_tokens` 于内部调试对象), `latencyMs`, `fallbackUsed`, 以及异常时的简要 `errorCode` 与信息。
  必须通过类型限制或剔除，确保调用时无法意外打印出 `inputText` 或 `content`。

---

### Task 3: 实现 OpenAI 兼容的 Provider

**Files:**
- Create: `packages/backend/src/adapters/ai/openai-provider.ts`

- [ ] **Step 1: 实现 `OpenAiProvider` 类**
  实现 `AiProvider` 接口，构造函数接收 baseURL, apiKey, defaultModel，以及**可选的 `fetch` 函数**用于注入测试。
  内部实例化 `OpenAI` 客户端：`new OpenAI({ baseURL, apiKey, fetch: customFetch })`。
- [ ] **Step 2: `generate` 逻辑实现**
  - 根据 `AiRequest.taskType` 生成基础的 `messages`（包含一个简单的 system prompt 占位和用户的 inputText，此阶段所有 taskType 统一使用默认模型，按 taskType 的精细化路由及语言选择 (`language?: "zh" | "en"`) 留给后续业务接入时实现）。
  - 调用 `client.chat.completions.create`，并应用 `timeout` 配置。
  - 计算 `latencyMs`。
  - 解析 `usage` 返回准确的 `tokenUsed`。
  - 包装为标准的 `AiResponse` 对象并返回，其中 `provider` 标明来源，`fallbackUsed` 置为 `false`。
  - 捕获异常（如 OpenAIError），抛出携带标准 Error 信息的受控异常。

---

### Task 4: 实现 Router 分发与 Fallback 逻辑

**Files:**
- Create: `packages/backend/src/adapters/ai/router.ts`
- Create: `packages/backend/src/adapters/ai/index.ts`

- [ ] **Step 1: 实现 `AiProviderRouter`**
  实现 `AiProvider` 接口。内部维护一个 `OpenAiProvider[]` 列表（按 priority 排序）。
  初始化逻辑：
  1. 读取 `config.aiProviders`（JSON 数组），为每项创建一个 `OpenAiProvider` 实例。
  2. 若 `aiProviders` 为空，fallback 到 `config.aiBaseUrl`/`aiApiKey`/`aiModel` 创建单个 Provider。
  3. 若两者都为空，标记为未配置状态。
  当未配置时，调用 `generate` 直接抛出 `AI_NOT_CONFIGURED` 错误。
- [ ] **Step 2: 轮询重试机制**
  `generate(request: AiRequest)` 核心逻辑：
  ```typescript
  const failures: Array<{ provider: string; error: string }> = [];
  for (const provider of this.providers) {
    try {
      const result = await provider.generate(request);
      result.fallbackUsed = failures.length > 0;
      aiLogger.recordSuccess(result, failures); // 让 logger 内部处理尝试记录
      return result;
    } catch (err) {
      failures.push({ provider: provider.name, error: err.message });
      aiLogger.recordFailure(provider.name, err);
      continue;
    }
  }
  throw new AllProvidersFailedError(failures);
  ```
  - 第一个成功立即返回，`fallbackUsed` 标记是否经历过失败重试。
  - 全部失败向外抛出包含每个 Provider 失败原因的异常（映射到 `ApiError` code `AI_ALL_PROVIDERS_FAILED`）。
- [ ] **Step 3: 导出模块与统一注册**
  通过 `ai/index.ts` 导出 `AiProviderRouter` 等模块。
  在 `packages/backend/src/adapters/index.ts` 中引入并统一 re-export（例如：`export * from "./ai";`）。

---

### Task 5: 暴露 Dev API 与单元测试

**Files:**
- Create: `packages/backend/src/api/dev-ai.ts`
- Modify: `packages/backend/src/server.ts`
- Create: `packages/backend/test/ai-router.test.mjs`

- [ ] **Step 1: 实现与挂载 Dev 路由**
  实现 `POST /api/dev/ai/generate`，接收 `AiRequest` 格式的 body。
  校验请求体：确保 `taskType` 和 `inputText` 为非空 string，否则返回 HTTP 400 及 `ApiError`。
  在 `server.ts` 中注册：`app.use("/api/dev/ai", aiDevRouter);`。
  返回 `ApiSuccess<AiResponse>` 或 `ApiError` 格式。
- [ ] **Step 2: 编写单元测试**
  使用 Node.js 原生测试运行器。通过构造函数注入 mock `fetch` 模拟成功与失败场景：
  1. 测试常规生成（单 Provider 成功），验证耗时、token 统计正常。
  2. 测试第一个 Provider 失败，自动轮询到第二个成功，`fallbackUsed=true`。
  3. 测试所有 Provider 连续失败，抛出 `AI_ALL_PROVIDERS_FAILED` 异常。
  4. 测试某 Provider 超时，轮到下一个成功返回。
  5. 测试未配置状态返回 `AI_NOT_CONFIGURED`。
  - Run:
    ```powershell
    pnpm --filter @ai-studybuddy/backend run build
    pnpm --filter @ai-studybuddy/backend run test
    ```

---

### Task 6: 复跑与治理验证

**Files:**
- Modify: `docs/04-开发任务清单-Todo-List.md`

- [ ] **Step 1: 验证全局**
  - `pnpm type-check`
  - `pnpm build`
  - `pnpm test`
- [ ] **Step 2: 治理脚本**
  - `powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1`
  - `git diff --check`
- [ ] **Step 3: 更新任务清单**
  在 `docs/04-开发任务清单-Todo-List.md` 中勾选 0.8-T05 对应的子项。

---

## 明确不做

- 不在此任务中实现具体的业务 Prompt 模板（如真正实用的错题分析、笔记生成，那是后续具体子系统的业务）。当前仅验证大模型接口通路。
- 不接入未提供 OpenAI 兼容协议的模型平台，未来如有需要再单独扩展 Provider。
