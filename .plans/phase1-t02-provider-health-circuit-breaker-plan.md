# Phase 1-T02：Provider 健康熔断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and `superpowers:executing-plans` to implement this plan task-by-task. 未经用户明确批准不得修改业务代码；默认在当前会话内执行，不自动派发子 Agent。

**状态**：待用户明确批准，尚未开始业务实现

**日期**：2026-07-15

**任务归属**：Phase 1 共同底座；扩展现有 `AiProviderRouter`，不重建 Router

**Goal:** 在保留 Provider 优先级故障转移的前提下，增加按 Provider 维度的连续失败计数、5 次熔断、10 分钟冷却、到期恢复和脱敏健康日志。

**Architecture:** 健康状态仅保存在单个 `AiProviderRouter` 实例的生命周期内，以 Provider 实例作为 Map 键，不新增 SQLite 表或环境变量。Router 注入可控时钟与日志器，生产环境默认使用 `Date.now` 和现有 `aiLogger`；测试通过假时钟推进 10 分钟，不真实等待。冷却结束后的首次调用作为恢复探测：成功清零，失败立即重新进入完整冷却期。

**Tech Stack:** TypeScript、Node.js、现有 `AiProvider`/`OpenAiProvider` Adapter、Node test runner、pnpm workspace。

---

## 1. 已确认事实

- `packages/backend/src/adapters/ai/router.ts` 已按配置 `priority` 升序构造 Provider，并按数组顺序逐个尝试，首个成功即返回。
- 当前 Router 没有任何跨请求健康状态；同一故障 Provider 会在每次请求中继续被调用。
- `packages/backend/test/ai-router.test.mjs` 已覆盖单 Provider 成功、优先 Provider 失败后的 fallback、全部失败、超时 fallback 和未配置错误。
- `packages/backend/src/utils/ai-logger.ts` 已有请求成功/失败日志，但没有熔断开启或冷却结束事件。
- Phase 1-T02 只扩展共同底座，不开始 S3 业务实现，不创建 S4–S7 PRD，不进行真实外部 Provider 调用。

## 2. 行为契约

### 2.1 状态与计数

每个 Provider 实例维护：

```ts
interface ProviderHealthState {
  consecutiveFailures: number;
  cooldownUntil: number | null;
}
```

- Provider 调用抛出的任何错误都计为一次失败，包括网络错误、超时、HTTP 错误和 SDK 错误。
- 同一 Provider 成功一次后，`consecutiveFailures` 立即清零，`cooldownUntil` 归空。
- 其他 Provider 的成功或失败不得改变当前 Provider 的计数。
- 状态按 Provider 实例隔离，而不是按名称隔离，避免同名 Provider 配置互相污染。

### 2.2 熔断与冷却

- 默认阈值固定为 `5` 次连续失败。
- 第 5 次失败发生后立即设置 `cooldownUntil = now + 10 分钟`。
- 冷却期内 Router 跳过该 Provider，不调用 `generate()`，继续按原优先级检查后续 Provider。
- `now >= cooldownUntil` 时自动解除跳过并允许一次恢复探测。
- 恢复探测成功：清零失败计数，后续请求恢复正常优先级。
- 恢复探测失败：保留失败历史并立即重新设置新的 10 分钟冷却，不要求再累计 5 次。
- 不做半开并发配额、指数退避、永久禁用、跨进程共享或数据库持久化。

### 2.3 fallback 与错误语义

- 只要优先 Provider 失败或因冷却被跳过，而后续 Provider 成功，返回值 `fallbackUsed` 必须为 `true`。
- 被冷却跳过的 Provider 以安全摘要 `AI_PROVIDER_COOLDOWN` 进入本次尝试摘要，不伪装成真实调用失败。
- 若本次请求至少实际调用过一个 Provider 但最终没有成功，继续抛出 `AllProvidersFailedError`，保持 `AI_ALL_PROVIDERS_FAILED` 兼容语义。
- 若本次请求开始后所有 Provider 都因冷却被跳过，抛出新的 `AllProvidersCoolingDownError`：

```ts
export class AllProvidersCoolingDownError extends AiProviderError {
  readonly retryAt: string;
  readonly providers: string[];
}
```

错误码固定为 `AI_ALL_PROVIDERS_COOLING_DOWN`；`retryAt` 是最早可恢复时间的 ISO 字符串。错误中只包含 Provider 名称和时间，不包含 Key、base URL、请求正文、模型输出或完整 UUID。

### 2.4 日志契约

在 `AiLogger` 增加两个事件：

```ts
export interface AiCircuitOpenedPayload {
  provider: string;
  cooldownStartedAt: string;
  cooldownEndsAt: string;
}

export interface AiCircuitClosedPayload {
  provider: string;
  cooldownEndedAt: string;
}
```

- `AI_PROVIDER_CIRCUIT_OPENED`：仅记录 `provider`、`cooldownStartedAt`、`cooldownEndsAt`、日志时间。
- `AI_PROVIDER_CIRCUIT_CLOSED`：仅记录 `provider`、`cooldownEndedAt`、日志时间。
- 熔断日志不得接收或记录原始 Error、Key、base URL、输入正文、输出正文或完整 UUID。
- 同一冷却窗口只记录一次 OPENED；到期被下一次请求观察到时只记录一次 CLOSED。

## 3. 文件范围

| 文件 | 动作 | 责任 |
| --- | --- | --- |
| `packages/backend/src/adapters/ai/router.ts` | 修改 | 健康状态、可控时钟、熔断/恢复、冷却错误与 fallback 语义 |
| `packages/backend/src/utils/ai-logger.ts` | 修改 | 增加脱敏熔断开启/结束事件 |
| `packages/backend/src/adapters/ai/index.ts` | 修改 | 导出新的冷却错误类型 |
| `packages/backend/src/adapters/index.ts` | 修改 | 从统一 Adapter 入口导出新的冷却错误类型 |
| `packages/backend/test/ai-router.test.mjs` | 修改 | 单元与 Adapter 集成回归测试 |
| `docs/04-开发任务清单-Todo-List.md` | 实现完成后修改 | 标记 T02 完成并记录验证证据 |
| `docs/00-文档索引-Index.md` | 仅在完成态需要时修改 | 同步当前正式下一任务状态，不创建新设计文档 |

不修改 `env.ts`，因为 5 次和 10 分钟是已确认的产品规则，不增加运行时调参面；不新增数据库迁移。

## 4. 实施任务

### Task 1：先用失败测试锁定健康状态与优先级行为

**Files:**
- Modify: `packages/backend/test/ai-router.test.mjs`
- Test: `packages/backend/test/ai-router.test.mjs`

- [ ] **Step 1：增加可控时钟和可观测 Provider 测试工具**

在测试文件中增加：

```js
function createClock(initialNow = Date.parse('2026-07-15T00:00:00.000Z')) {
  let current = initialNow;
  return {
    now: () => current,
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

function createRecordingLogger() {
  const events = [];
  return {
    events,
    logger: {
      recordSuccess(payload) {
        events.push({ event: 'success', payload });
      },
      recordFailure(payload) {
        events.push({ event: 'failure', payload });
      },
      recordCircuitOpened(payload) {
        events.push({ event: 'opened', payload });
      },
      recordCircuitClosed(payload) {
        events.push({ event: 'closed', payload });
      },
    },
  };
}
```

- [ ] **Step 2：增加“前 4 次失败不熔断，第 5 次开启冷却”的失败测试**

测试使用一个始终失败的 primary 和一个成功的 secondary，连续调用 Router 5 次；断言 primary 共被调用 5 次、每次均 fallback 到 secondary、只产生一次 OPENED，且结束时间比开始时间晚 `600_000` 毫秒。

- [ ] **Step 3：增加“冷却期间跳过 primary”的失败测试**

第 5 次失败后不推进时钟，再调用一次；断言 primary 调用次数仍为 5，secondary 被调用，结果 `fallbackUsed === true`，本次摘要使用 `AI_PROVIDER_COOLDOWN`。

- [ ] **Step 4：运行 Router 测试确认红灯**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/ai-router.test.mjs
```

预期：新增断言失败，原因是 `AiProviderRouterOptions` 尚不支持 `now/logger`，且 Router 尚无熔断行为。

### Task 2：实现最小健康状态、熔断和冷却跳过

**Files:**
- Modify: `packages/backend/src/adapters/ai/router.ts`
- Modify: `packages/backend/src/utils/ai-logger.ts`

- [ ] **Step 1：扩展日志接口**

在 `AiLogger` 中加入：

```ts
recordCircuitOpened(payload: AiCircuitOpenedPayload): void;
recordCircuitClosed(payload: AiCircuitClosedPayload): void;
```

默认实现输出 `AI_PROVIDER_CIRCUIT_OPENED` 与 `AI_PROVIDER_CIRCUIT_CLOSED` JSON 事件，字段严格限定为行为契约列出的名称。

- [ ] **Step 2：向 Router 注入时钟与日志器**

扩展选项：

```ts
export interface AiProviderRouterOptions {
  providers?: AiProvider[];
  fetch?: typeof fetch;
  now?: () => number;
  logger?: AiLogger;
}
```

Router 默认值为：

```ts
this.now = options?.now ?? Date.now;
this.logger = options?.logger ?? aiLogger;
```

- [ ] **Step 3：增加进程内 Provider 健康 Map**

在 Router 内增加固定常量和状态：

```ts
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 10 * 60 * 1000;

private readonly health = new Map<AiProvider, ProviderHealthState>();
```

提供私有方法惰性初始化状态、检查冷却、记录失败并开启冷却、成功后清零。不得把状态放到模块级全局变量。

- [ ] **Step 4：保持原优先级循环并加入跳过逻辑**

在调用 `provider.generate()` 前：

1. 若 `now < cooldownUntil`，记录安全摘要并 `continue`；
2. 若 `now >= cooldownUntil`，清除冷却时间、记录 CLOSED，然后执行恢复探测；
3. 调用失败后递增该 Provider 计数；达到阈值或恢复探测失败时开启新冷却；
4. 调用成功后清零该 Provider 状态；
5. `fallbackUsed` 同时考虑真实失败和冷却跳过。

- [ ] **Step 5：运行新增测试确认绿灯**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/ai-router.test.mjs
```

预期：原 Router 测试和 Task 1 新测试全部通过。

### Task 3：锁定冷却恢复、成功清零和重新熔断

**Files:**
- Modify: `packages/backend/test/ai-router.test.mjs`
- Modify: `packages/backend/src/adapters/ai/router.ts`

- [ ] **Step 1：增加“冷却到期后恢复探测成功”的失败测试**

Provider 前 5 次失败、第 6 次成功；开启冷却后推进假时钟 `600_000` 毫秒，再调用 Router。断言 primary 被重新调用并成功、secondary 不再调用、产生一次 CLOSED。

- [ ] **Step 2：增加“成功清零”的失败测试**

恢复成功后让 primary 再失败 1 次；断言只 fallback，不立即 OPENED。随后再连续失败至新的第 5 次，才产生下一次 OPENED。

- [ ] **Step 3：增加“恢复探测失败立即重新冷却”的失败测试**

冷却到期后 primary 再次失败；断言当次 fallback 成功，同时产生新的 OPENED，下一请求不会再次调用 primary。

- [ ] **Step 4：补足最小实现并回归 Router 测试**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/ai-router.test.mjs
```

预期：恢复、清零和重新冷却场景全部通过。

### Task 4：增加多 Provider 隔离和全冷却错误语义

**Files:**
- Modify: `packages/backend/src/adapters/ai/router.ts`
- Modify: `packages/backend/src/adapters/ai/index.ts`
- Modify: `packages/backend/src/adapters/index.ts`
- Modify: `packages/backend/test/ai-router.test.mjs`

- [ ] **Step 1：先写多 Provider 交叉测试**

构造 primary、secondary、tertiary：primary 连续失败并熔断，secondary 独立累计但未到阈值，tertiary 成功。断言三个 Provider 的计数互不影响，仍按原数组优先级执行。

- [ ] **Step 2：先写全冷却错误测试**

让全部 Provider 分别达到阈值并处于冷却，再发起请求；断言没有 Provider 被调用，并得到：

```js
assert.ok(caught instanceof AllProvidersCoolingDownError);
assert.equal(caught.code, 'AI_ALL_PROVIDERS_COOLING_DOWN');
assert.deepEqual(caught.providers, ['primary', 'secondary']);
assert.equal(caught.retryAt, '2026-07-15T00:10:00.000Z');
```

- [ ] **Step 3：实现并导出稳定错误类型**

在 Router 定义 `AllProvidersCoolingDownError`，从 `adapters/ai/index.ts` 和 `adapters/index.ts` 导出。仅当本次请求实际调用数为 0 且所有 Provider 被冷却跳过时抛出；混合“真实失败 + 冷却跳过”继续使用 `AllProvidersFailedError`。

- [ ] **Step 4：运行 Router 测试**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/ai-router.test.mjs
```

预期：多 Provider 隔离和稳定错误语义通过。

### Task 5：验证 Adapter 级 fallback 与日志脱敏

**Files:**
- Modify: `packages/backend/test/ai-router.test.mjs`
- Modify: `packages/backend/src/utils/ai-logger.ts`

- [ ] **Step 1：增加 OpenAiProvider Adapter 集成测试**

使用 `.invalid` 测试 URL、占位测试 Key 和受控 `fetch`：primary 的 fetch 连续返回 500，secondary 返回合法 chat completion。连续 5 次请求后，第 6 次断言 primary fetch 未增加、secondary 仍成功，证明不是只测 MockProvider 的方法调用。

- [ ] **Step 2：增加熔断日志字段白名单测试**

从 recording logger 读取 OPENED/CLOSED payload，断言键集合只包含：

```js
['provider', 'cooldownStartedAt', 'cooldownEndsAt']
['provider', 'cooldownEndedAt']
```

把测试输入设置为明显敏感占位文本，并断言序列化日志不包含输入正文、测试 Key、`.invalid` URL 或原始错误消息。

- [ ] **Step 3：运行后端专项测试**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/ai-router.test.mjs
```

预期：Router、OpenAiProvider fallback 和日志脱敏测试全部通过，不访问外网。

### Task 6：全量验证、文档收尾与提交准备

**Files:**
- Modify after implementation: `docs/04-开发任务清单-Todo-List.md`
- Modify if needed: `docs/00-文档索引-Index.md`

- [ ] **Step 1：设置唯一隔离运行目录**

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t02-20260715-final'
```

实际执行时如目录已存在，必须换一个新的 run id，不得复用正式运行数据。

- [ ] **Step 2：运行类型检查和构建**

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
```

预期：全部退出码为 0。

- [ ] **Step 3：运行专项和全量测试**

```powershell
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/ai-router.test.mjs
pnpm test
```

预期：全部测试通过；测试日志不包含真实 Key、Provider URL、正文或完整 UUID。

- [ ] **Step 4：更新完成态文档**

仅在实现和验证全部通过后：

- 把 `docs/04` 的 Phase 1-T02 状态改为完成；
- 记录阈值、冷却时间、恢复语义、测试数量和隔离路径摘要；
- 保持 S3 业务代码未开始、S4–S7 未触发；
- 不创建新的子系统 PRD。

- [ ] **Step 5：运行治理与差异检查**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git status --short --branch
```

预期：治理和 diff 检查通过；变更范围只包含本计划列出的 Router、日志、导出、测试和完成态文档。

- [ ] **Step 6：隐私与范围审计**

```powershell
rg -n "sk-|api[_-]?key|https?://|AI_PROVIDER_CIRCUIT_(OPENED|CLOSED)" packages/backend/src packages/backend/test docs/04-开发任务清单-Todo-List.md
```

逐条确认命中只包含环境变量名、`.invalid` 测试值或脱敏事件名；不得提交真实凭据、真实 Provider URL、正文、完整 UUID 或运行数据。

- [ ] **Step 7：提交门禁**

默认不 push。只有在用户确认验收和提交范围后，才按显式路径暂存并提交：

```powershell
git add packages/backend/src/adapters/ai/router.ts packages/backend/src/adapters/ai/index.ts packages/backend/src/adapters/index.ts packages/backend/src/utils/ai-logger.ts packages/backend/test/ai-router.test.mjs docs/00-文档索引-Index.md docs/04-开发任务清单-Todo-List.md .plans/phase1-t02-provider-health-circuit-breaker-plan.md
git diff --cached --check
git commit -m "feat(ai): 增加 Provider 健康熔断"
```

如果某个列出的文档实际无变化，则不暂存该文件。未经明确要求不得 push。

## 5. 验收标准

- [ ] 同一 Provider 连续失败 4 次不熔断，第 5 次失败后冷却 10 分钟。
- [ ] 冷却期内不调用该 Provider，仍按既有优先级 fallback 到其他 Provider。
- [ ] 冷却到期自动允许恢复探测；成功清零，失败立即重新冷却。
- [ ] Provider 健康状态互相隔离，Router 实例之间也互相隔离。
- [ ] 全部 Provider 冷却时返回稳定的 `AI_ALL_PROVIDERS_COOLING_DOWN`，不发外部请求。
- [ ] 熔断 OPENED/CLOSED 日志只含 Provider 名称和冷却时间字段。
- [ ] 不改变 `AI_NOT_CONFIGURED`、`AI_ALL_PROVIDERS_FAILED` 和既有 priority fallback 行为。
- [ ] 不新增数据库、环境变量、真实外部调用、S3 代码或未来 PRD。
- [ ] type-check、backend build、专项测试、`pnpm test`、docs governance、隐私扫描和 `git diff --check` 全部通过。

## 6. 明确非目标

- 不做每请求轮换、随机选择或负载均衡。
- 不做跨进程/跨重启健康状态共享。
- 不做指数退避、自适应阈值、并发半开配额或 Provider 管理 UI。
- 不修改 AI prompt、笔记生成、S3 练习生成或 Worker 重试策略。
- 不进行真实 Provider smoke，不记录或提交真实 Key、Provider URL、正文、完整 UUID 或正式运行数据。
- 不 push，除非用户另行明确要求。

## 7. 批准门禁

本文件创建和文档治理通过，只代表 T02 已具备可执行计划，不代表业务实现已获授权。只有用户明确说“批准 Phase 1-T02 计划”或同等清晰表述后，才可按本计划修改 `packages/backend` 业务代码。
