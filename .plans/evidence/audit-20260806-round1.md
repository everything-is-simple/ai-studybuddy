# AUDIT-20260806 偏差核查记录（第一轮）

**日期**：2026-08-06
**状态**：第一轮核查完成，偏差清单已确认；修复进行中

## 一、核查范围

按 `docs/04` 的 Phase 划分逐项对照设计文档与实现代码（只读核查）：

- Phase 0.8：S1 学习节奏、S2 资料笔记、共同底座（storage/converter/migrations）
- Phase 1：S3 限时练习、S4 错题改错、S5（未触发）、S6 家长报告、T08 配置中心、T09 学期/首页/导航
- Phase 1.5：S7 课堂录音 MVP
- Phase 2：S5 期末冲刺（模拟考/速背/冲刺计划/工作台）
- Phase 2.5/3：部署环境、T02A–T02G 安全边界

## 二、已确认偏差清单

### A 类：docs/14-项目代码百科 端点文档过期（文档需修）

| # | 文档记录 | 代码实际 | 说明 |
|---|---|---|---|
| A1 | `POST /api/class-capture/transcribe` | `POST /api/class-captures/transcribe` | S7 单复数 |
| A2 | `POST /api/class-capture/save` | `POST /api/class-captures/save-to-notes` | S7 单复数+语义名 |
| A3 | `POST /api/materials/:id/retry-convert` | `POST /api/materials/:id/retry-conversion` | 命名差异 |
| A4 | `POST /api/materials/:id/retry-note` | `POST /api/materials/:id/retry-ai-generation`、`/generate-note` | 命名差异 |
| A5 | `GET /api/practice-sessions/:id/result` | `GET /api/practice-sessions/:id/history-result` | S3 结果端点改名 |
| A6 | `GET /api/semesters/:id/practice-history` | `GET /api/practice-sessions/history`（query 参数） | S3 历史路径不同 |
| A7 | `POST /api/mock-exam-papers/:id/start` | `POST /api/mock-exam-papers/:id/attempts` | S5 开始端点改名 |
| A8 | `GET /api/mock-exam-attempts/:id/result` | `GET /api/mock-exam-attempts/:id`（返回完整结果） | S5 无独立 result |
| A9 | `POST /api/semesters/confirm` | `POST /api/semesters`（staging/ready）+ dev `init-semester` | 学期创建流程 |
| A10 | S1 区块用 `PUT /api/assessment-attempts*` | 实际 `POST/PATCH /api/exams*`、`PATCH /api/courses/:id`、`DELETE /api/courses/:id` | S1 端点体系 |
| A11 | S4 区块用 `PUT /api/mistakes/:id/*` | 实际 `PATCH /api/mistakes/:id/error-cause`、`PATCH /api/mistakes/:id/status` | 方法差异 |
| A12 | 配置中心缺 `GET /api/config/presets`、`POST /api/config/ai/test-provider` | 代码已有 | 文档缺项 |
| A13 | 缺 `GET /api/materials/:id/original-pdf`、`PATCH /api/notes/:id`、`GET /api/db-health` 等 | 代码已有 | 文档缺项 |

### B 类：功能等价但需确认的差异

| # | 差异 | 结论 |
|---|---|---|
| B1 | S3 PRD 承诺 `GET /api/practice-sessions` 分页列表 | 代码用 `GET /api/practice-sessions/history` 实现，功能等价；路径不同应更新 PRD 或标注 |
| B2 | S3 PRD 状态枚举 `in_progress/submitted/graded` | 与代码完全一致 ✅ |
| B3 | S4 状态机 待复盘→需要复习→已掌握→可重开 | 与代码 `pending_review/needs_review/mastered` 一致 ✅ |
| B4 | S6 冻结快照+去重+3次重试+脱敏 | 与代码一致 ✅ |
| B5 | S5 只读、无持久化 CramPlan、无 AI | 与代码一致 ✅ |
| B6 | S7 受控 WAV、同步 whisper.cpp、不保存原录音 | 与代码一致 ✅ |

### C 类：文档与代码均无异常（抽查通过）

- 资料格式边界（T04 表：PDF/JPG/TXT/MD/DOCX/PPTX/HTML/URL）与 `converter.ts` 类型路由一致（需再确认 .doc/.ppt 拒绝提示）
- `ApiSuccess<T>/ApiError` 信封一致
- 错误码大写蛇形命名一致

## 三、结论

**代码实现整体符合设计文档的产品语义**（状态机、边界、脱敏、只读均兑现）；主要偏差为 **docs/14 的端点文档未随实现演进同步更新**（A 类 13 项）。B/C 类为功能等价或抽查通过。

## 四、处置

- A 类：更新 `docs/14-项目代码百科-Code-Wiki.md` 端点表与路由表，使其与 `app.ts`/各 router 实际注册一致；同步 `docs/00` 无需改（14 已有效）。
- B1：更新 S3 PRD API 表标注实际端点。
- 全部修复走任务分支 `claude/audit-20260806-doc-code-deviation`，验证通过后合入 master 并推送。

---

## 五、第二轮核查结论（2026-08-06）

### 行为级核查（代码与文档语义一致性）

| 核查点 | 文档承诺 | 代码实际 | 结论 |
|---|---|---|---|
| Worker 串行/恢复/重试 | docs/08：单进程串行、过期 running 恢复、重试上限 | `material-job-worker.ts`：runOnce 串行、recoverStale 恢复 running→pending、max_attempts=3 | ✅ 一致 |
| Worker setInterval 不等待 | docs/04 T09 已登记技术债 | `startPolling` 仍 `void this.runOnce()` | ⚠️ 既有已知项，文档如实记录 |
| 配置脱敏 | docs/10：掩码值、固定错误码、禁回显秘密 | `configuration-service.ts` summarize/maskEmail | ✅ 一致 |
| T02A 统一错误/回环 | .plans/t02a：统一 JSON 错误、127.0.0.1 | `api-error-handler.ts` safeErrors、`api-origin-policy.ts` loopback | ✅ 一致 |
| T02D 秘密扫描边界 | .plans/t02d：相对路径+短指纹 | `AIStudyBuddy.SecretScan.cjs` isSensitivePath/resolveCandidate | ✅ 一致 |
| T02E 打包受控根 | .plans/t02e：拒绝仓库根/磁盘根 | `build-deployment-package.ps1` New-AIStudyBuddyPackageBoundary | ✅ 一致 |
| T02F 日志 allowlist | .plans/t02f：固定 JSONL allowlist | `runtime-log-boundary.ts` LOG_ENTRY_FIELDS | ✅ 一致 |
| 前端规范 | docs/11：组件不直接 fetch、禁秘密进浏览器存储 | 前端仅 use-api-request/refetch，无裸 fetch | ✅ 一致 |
| 错误码命名 | docs/10：大写蛇形 | S3/S4/S7 错误码抽查 | ✅ 一致 |

### 既有测试失败（与审计无关，登记为既有项）

- `packages/backend/test/trusted-approval-contract.test.mjs` 在 **master（8739a4bc）同样失败**：`TRUSTED_ANCHOR_INVALID`。
- 原因：`createInvalidKeyFactoryAttempt` 用 RSA 公钥伪造 Ed25519 anchor，期望 `TRUSTED_ANCHOR_INVALID`；当前 Node 24 环境下 fixture 的 `createTrustAnchorFixture` KeyObject 校验行为与测试预期不符。
- 属 Phase 3 T02 信任锚既有实现细节，不在本审计修复范围；建议登记为后续独立问题。

### 文档状态检查

- docs/01 总 PRD、docs/00 索引：状态描述与 docs/04/代码一致 ✅
- docs/13：Node 24 收紧（本轮已修）✅
- docs/14：端点/路由/数据模型/技术栈/备份（本轮已修）✅
- S3 PRD 端点（本轮已修）✅

---

## 六、信任锚测试失败修复（TRUSTED_ANCHOR_INVALID，2026-08-06）

### 问题
`packages/backend/test/trusted-approval-contract.test.mjs` 第 114 行失败：
`createTransparentProxyApprovalFixture().verifier.verifyTrustedApproval(...)` 期望不抛错，实际抛 `TRUSTED_ANCHOR_INVALID`。master（8739a4bc）上同样失败，为既有问题。

### 根因（Node 24 原生 KeyObject getter 限制）
- fixture 用 `new Proxy(publicKey, {})`（无 trap）包装 Ed25519 KeyObject。
- Node 24 中 KeyObject 的 `type`/`asymmetricKeyType` getter 与 `export()` 方法要求**原始 `this`**（`node:internal/crypto/keys` 的 `getKeyObjectSlots` 检查 `ERR_INVALID_THIS`）。
- 无 trap 的透明 Proxy 在访问 getter 时破坏原始 `this` → `type` 读不到、`export` 抛 `ERR_INVALID_THIS` → verifier catch 后转 `TRUSTED_ANCHOR_INVALID`。
- 实测确认：`new Proxy(keyObject, {})` 的 `p1.type` 抛 `ERR_INVALID_THIS`；带 get trap（函数 bind target）的 `p2.type` 返回 `'public'`、`p2.export()` 正常。

### 修复（双保险）
1. `scripts/lib/AIStudyBuddy.TrustAnchor.cjs`：读取 KeyObject 字段改用 `Reflect.get`（保持原始 this），导出改用 `Reflect.apply(keyObject.export, keyObject, args)`（绑定原始 this）。既保持"不触碰调用方无关属性"的脱敏边界，也让透明 Proxy KeyObject 可被验证。RSA 伪键仍被拒绝（`asymmetricKeyType !== 'ed25519'`）。
2. `packages/backend/test/helpers/trusted-approval-fixture.mjs`：`createTransparentProxyApprovalFixture` 的 Proxy 加 `get` trap，函数属性 bind 回 target，使 Proxy 包装的 KeyObject 与原始对象真正等价（符合测试"透明 Proxy 与 target 等价"的原始意图）。

### 验证
- 信任锚测试族 15/15 通过（trusted-approval-contract 7/7、trust-anchor-contract 2/2、trusted-approval-test-seam-isolation 3/3、verifier-integrity-gate 3/3）。
- 后端全量 330/330 通过；`pnpm type-check` 通过；前端 28 files / 149 tests 通过。
