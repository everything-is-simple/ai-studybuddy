# Phase 0.8 T09 修复计划：AI 笔记解析 + 考试表单受控值

**状态**：**已批准（方案 B）、修复已提交、隔离复验已通过、T09 已可勾选完成**。范围锁定为 P0-1 + P0-2；`response_format` 按用户边界暂缓；首次 AI 预算经用户批准由 30 秒放宽到 35 秒。
**日期**：2026-07-14
**分支**：`Asteria-malf-pas/t09-e2e-validation`（延续 T09 失败证据的追溯链，不从 master 另开）
**修复提交**：`4f595c6 fix(t09): 修复 AI 笔记 JSON 解析与考试表单受控值`；后续补丁修正 `JSON.parse` 失败信息为固定字符串并新增敏感哨兵测试（详见 §11 变更日志）。
**子系统归属**：S2 NoteBuilder（主） + S1 StudyRhythm 考试表单一处（次）。
**文档门禁**：文档无需变更。本任务是修复 S1/S2 已实现能力的两处缺陷，不触发新设计文档。

## 1. 问题排名与本计划范围

T09 未通过后，按阻塞第一个里程碑的程度重排：

| 级别     | 问题                                                                                        | 是否本计划                       |
| -------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| **P0-1** | AI 笔记生成 `JSON.parse` 失败：真实 Provider 三次成功响应，但笔记/导图/知识模块全部落不了盘 | **是**                           |
| **P0-2** | 考试表单受控 `value` 依赖 `creatingExamFor`，提交前该值为 `null`，输入框显示始终为空        | **是**                           |
| P0.5     | Worker `setInterval` 不等上一轮 `runOnce`                                                   | 否 → 待真实复现后立项            |
| P1       | 补文契约（前端入口 vs 服务端 `replaceText` 允许状态）                                       | 否 → T10 独立立项                |
| P1       | 浏览器任务创建 / 考试确认 UI                                                                | 否 → T11 独立立项                |
| P2       | 轮询 `visibilitychange`、tmp 清理复测                                                       | 否 → tmp 清理并入本计划复验 Step |

**取舍**：P0-2 跨 S1，微违反「每个 PR 只主攻一个子系统」的默认约束。但 T09 本身就跨 S1/S2 验收，本次目标是「让 T09 通过 + 里程碑可勾选」，且修复极小（几行 + 一个前端测试）。用户批准范围时请显式选定：

- **方案 A（最小）**：仅 P0-1。P0-2 留到独立小修复。
- **方案 B（推荐）**：P0-1 + P0-2 一次批修完。

## 2. 根因

### 2.1 P0-1：AI JSON 解析（四层叠加）

1. **提示词无 JSON 契约**：`openai-provider.ts:14` 的 `note_generation` 系统提示只有一句「你是一名学习助手，请根据输入资料生成结构化的中文学习笔记」，从未声明必须返回 `{ markdown, highlights, mindMap, knowledgeModules }` 或不得含围栏。
2. **`response_format` 未启用**：`chat.completions.create` 未设 `response_format`。**用户已批准**：中转渠道兼容性不明，本计划不把它作为默认发送、不作为必需条件；后续按 Provider 支持情况再加可配置开关。
3. **解析前无清洗**：`material-job-worker.ts:198` 的 `parseAi` 直接 `JSON.parse(content)`，不剥围栏、不裁前后缀。
4. **测试掩盖**：`note-builder-api.test.mjs` 的 mock 用 `JSON.stringify(...)`，永远返回干净 JSON，掩盖真实模型行为。

修复必须同时覆盖「提示词严格约束」（第 1 层）+「服务端安全提取/校验」（第 3、4 层）。

### 2.2 P0-2：受控 `value` 三元表达式

`course-page.tsx:167、174、182` 三个输入框都写作：

```
value={creatingExamFor === course.id ? examForm.name : ''}
```

`creatingExamFor` 在提交前恒为 `null`。React 受控输入的显示由 `value` 决定 —— 每次 `onChange` 更新 state 后重渲染，`value` 又回退为 `''`。用户看到的是永远清空的输入框，即使 `examForm` 里可能存了字符，用户也无从确认，多数情况下会认为「表单坏了」而放弃提交。

## 3. 修复方案

### 3.1 提示词加 JSON schema 约束 — `openai-provider.ts`

- 只改 `note_generation` 一项。其他 taskType 本次不动。
- 新提示词必须**逐字段**声明与 `AiNotePayload`、`parseAi`、`toMindMapData` 现有校验一致的 schema：
  - `markdown`（string，非空，结构化中文笔记，允许 KaTeX 行内 `$...$` 与块级 `$$...$$`）
  - `highlights`（数组，`{ content, importance: 'low'|'medium'|'high', position }`）
  - `mindMap`（Markmap Markdown 字符串，必须含 `# 一级` 与 `## 二级`；或 `{ title, children[] }` 树）
  - `knowledgeModules`（**非空**数组，`{ title, contentSummary?, importance: 'low'|'medium'|'high'|'critical', difficulty: 'easy'|'medium'|'hard', sourceEvidence, examRelevance? }`）
- 必须显式声明：**只返回单个 JSON 对象，不含 Markdown 围栏、不含任何解说文字**。
- 不改 `response_format`、不改路由/降级逻辑。

### 3.2 服务端安全提取与解析 — `material-job-worker.ts`

- `parseAi(content)` 顶部新增私有纯函数 `sanitizeAiJson(raw: string): string`：
  1. `trim`；
  2. 若被 ` ```json … ``` ` 或 ` ``` … ``` ` 围栏包裹，剥掉围栏（含大小写与语言标记容错）；
  3. 兜底：截取第一个 `{` 到最后一个 `}` 之间的子串。
- `parseAi` 用 `try/catch` 单独包裹 `JSON.parse`，失败时抛出：`AI 输出无法解析为 JSON（前120字符：…）`。截断片段**不含**完整正文、不含密钥；已有的 500 字符截断（`retryOrFail`）保持不变。
- 现有的 schema 校验（`markdown`/`highlights`/`knowledgeModules`/`mindMap`）**保持不变**。清洗只负责「拿到 JSON 字符串」，校验仍然严格。
- 不改重试次数、不改 `retryOrFail`、不改数据库事务。

### 3.3 P0-2 受控值修正 — `course-page.tsx`

- 把 `creatingExamFor` 的双职责拆分为两个 state：
  - `activeExamCourseId: string | null` —— 当前正在编辑考试的课程（决定哪个课程的表单展开、其他表单是否禁用）；
  - `submittingExamFor: string | null` —— 当前正在提交的课程（决定「保存中…」文案、按钮禁用）。
- 三个输入框改为 `value={examForm.name}` / `value={examForm.examAt}` / `value={examForm.goal}`。
- 用 `activeExamCourseId !== null && activeExamCourseId !== course.id` 表达「其他课程表单禁用」。
- 用户开始输入任一字段时，若 `activeExamCourseId` 为 `null`，自动 `setActiveExamCourseId(course.id)`；提交成功后清空 `examForm` 并把 `activeExamCourseId` 置 `null`。
- 保留现有 API 信封处理与中文反馈；**不新增考试确认操作**（T11）。

### 3.4 用真实容错测试替换掩盖性 mock

- `packages/backend/test/note-builder-api.test.mjs`（或新增 `note-generation-parsing.test.mjs`）保留原干净 JSON 主路径，**追加**四类 mock：
  1. 裸 JSON（现状回归）；
  2. ` ```json\n{…}\n``` ` 围栏包裹 —— 断言 `completed`、笔记/导图/模块落盘；
  3. 前置一句中文解说 + JSON —— 断言可提取并落盘；
  4. 彻底非 JSON 的自由文本 —— 断言 3 次重试后 `pending_quality_check`、`normalized_text` 保留、`error_summary` 不含密钥/正文。
- Mock 通过 `MaterialJobWorker` 构造函数注入 `ai`，不接触真实 Provider。
- 前端新增 `packages/frontend/test/course-page.test.tsx`（若 jsdom 支持不足则改为在 `study-rhythm-api.test.ts` 补 payload 断言）：验证用户输入后表单显示正确值、`createExam` 收到正确 payload、提交期间按钮禁用。

## 4. 涉及文件

```
packages/backend/src/adapters/ai/openai-provider.ts        # 3.1 提示词
packages/backend/src/services/material-job-worker.ts       # 3.2 sanitizeAiJson + try/catch
packages/backend/test/note-builder-api.test.mjs            # 3.4 四类容错测试
packages/frontend/src/pages/course-page.tsx                # 3.3 受控值 + 拆分 state
packages/frontend/test/course-page.test.tsx  (新增，若可行) # 3.4 前端回归
# 或 packages/frontend/test/study-rhythm-api.test.ts       # 若前端组件测试环境不足，退回到 API payload 断言
```

**不改**：`router.ts`、`note-builder-service.ts`、`study-rhythm-service.ts`、其他 taskType 提示词、`material-upload-page.tsx`、`material-status.tsx`、`use-material-polling.ts`、任何 `docs/` 设计文档（除完成后按 Step 13 更新 04/09/本计划）。

## 5. 标准工作流（Step 6–16）

- **Step 6–7**：按 3.1 → 3.2 → 3.4 后端测试 → 3.3 → 3.4 前端测试的顺序实现，逐项 TaskUpdate。
- **Step 8** `pnpm type-check`：零错误。
- **Step 9** `pnpm -r --filter backend run build`：零错误。
- **Step 10** `pnpm test`：后端 97+4 全绿、前端 12+1 全绿。
- **Step 11** `pnpm -r --filter backend run dev`：用 mock 或隔离 `APP_DATA_ROOT` 手动 smoke 一次。
- **Step 12**：核心 diff 交 GPT 独立审查 → 修边界 → 回归 Step 8–11。
- **Step 13**：修复通过后，按 T09 原计划在隔离 `APP_DATA_ROOT` + 隔离端口重跑「文本 PDF + 真实 Provider」主路径。**只有**主路径完成 + tmp 清理后读回都通过，才在 `docs/04` 勾选 T09 与第一个里程碑、在 `docs/09` 与 `.plans/phase0.8-t09-end-to-end-validation-plan.md` 追加复验证据。
- **Step 14** 文档治理：`scripts/check-docs-governance.ps1`。
- **Step 15** `git diff --check`。
- **Step 16**：提交 `fix(t09): 修复 AI 笔记 JSON 解析与考试表单受控值` 并给交付说明。

## 6. T09 复验补充点（在 Step 13 里执行）

除 T09 原计划已列的证据外，本次修复必须额外证明：

1. 「围栏 JSON」在真实 Provider 出现时不再进入 `pending_quality_check`（可用日志中的 `sanitize hit` 计数或事后代码检查证明）；
2. 浏览器创建 pending 考试的截图（`01-courses-and-pending-exam.png`）替换为**纯浏览器操作**证据，不再靠 API 绕过；
3. 完成笔记后再执行 tmp 清理与清理后读回，产出 `08-after-tmp-cleanup.png`，补齐 T09 原计划的第 8 张截图。

## 7. 不做什么（防范围蔓延）

- 不修 Worker 单飞（P0.5）。SQLite 乐观锁提供实际保护；T09 未真实复现重叠。仅在 T09 复验产生新的重叠证据时另行立项。
- 不改 `replaceText` 状态契约（P1 T10）。
- 不新增任务创建 / 考试确认 UI（P1 T11）。
- 不改前端轮询 `visibilitychange`（P2）。
- 不启用 `response_format`（用户已批准暂缓）。
- 不合并到 master、不推送分支，直到 T09 复验通过并由用户决定合并目标。

## 8. 批准与后续闸口

**用户已批准（方案 B）**：修复 P0-1 + P0-2，两者先写失败测试再写实现；`response_format` 不启用；Worker 单飞、补文契约、考试确认/任务创建 UI、页面轮询优化均不纳入；复验前 T09 与第一个里程碑不勾选。

修复实施完毕；下一步是**隔离 Provider 复验**（§9），只有全部通过后才允许更新 `docs/04`、`docs/09`，并由用户决定合并目标。

## 9. 隔离 Provider 复验清单（下一步待执行）

复验必须从完整 `pnpm test` 起步（不是仅本次 5+1 新增用例）。验收必须证明：

1. **真实 Provider 主路径**：合成文本 PDF → 转换 → AI 生成，笔记 Markdown、Markmap、知识模块、`study_events.material_note_completed` 全部落盘；本地时长 ≤ 上限；token/model/latency 按脱敏白名单记录。
2. **浏览器可创建考试**：pending 考试通过纯浏览器操作创建成功；截图作为 `01-courses-and-pending-exam.png` 的最终证据，替换 T09 原运行中的 API 绕过版本。
3. **无 Provider 降级**：文本保留、有限重试、`pending_quality_check` 中文状态、页面刷新不白屏；`ai_generation_error_message` 不含 API Key、正文、V8 诊断字符串。
4. **tmp 清理与读回**：仅在主路径完成笔记且已从浏览器与 API 读回后，按 run-id 白名单删除 tmp；重启后端后重新加载 `/notes/:noteId`、知识模块、事件、原文件 `storage_key`。
5. **证据脱敏**：截图与 JSONL/CSV 仅存脱敏字段与短哈希；仓库外 evidence/ 中不得出现 Provider URL、Key、完整 UUID、绝对数据路径或 AI 正文。

全部通过后，才允许：更新 `docs/04-开发任务清单-Todo-List.md` 勾选 T09 与第一个里程碑；在 `docs/09-测试验收计划-Test-Plan.md` 追加复验证据；在本计划 §11 追加复验记录。若任一项失败，保持不勾选并如实记录新的阻塞。

## 10. 不做什么（防范围蔓延，重申）

- 不修 Worker 单飞（P0.5）。SQLite 乐观锁提供实际保护；T09 未真实复现重叠。仅在 T09 复验产生新的重叠证据时另行立项。
- 不改 `replaceText` 状态契约（P1 T10）。
- 不新增任务创建 / 考试确认 UI（P1 T11）。
- 不改前端轮询 `visibilitychange`（P2）。
- 不启用 `response_format`（用户已批准暂缓）。
- 不合并到 master、不推送分支，直到 T09 复验通过并由用户决定合并目标。

## 11. 变更日志

- **2026-07-14 初版**：方案 A/B 分列；等待用户批准。
- **2026-07-14 已批准**：用户回复方案 B、附加边界（不启用 `response_format`、先失败测试再写实现、复验前不勾选任何 milestone）；进入 Step 6–16。
- **2026-07-14 修复提交**：`4f595c6 fix(t09): 修复 AI 笔记 JSON 解析与考试表单受控值`。改动 6 个文件：openai-provider 严格 JSON schema 提示；material-job-worker 新增 `sanitizeAiJson`、`parseAi` 加 try/catch；course-page 拆分 `activeExamCourseId`/`submittingExamFor`、`value` 直接绑到 `examForm.*`；新增两份回归测试；本计划文件同步入库。回归防护通过「stash 撤回改动 → 测试失败 → apply 恢复 → 测试通过」双向验证。后端 101/101、前端 13/13。
- **2026-07-14 独立审查补丁**：用户指出 `parseAi` 里 `AI 输出无法解析为 JSON：${cause}` 会把 V8 `SyntaxError.message` 拼入 error_summary（V8 会回显畸形位置附近的字符，如 `Unexpected token 's', "…sk-…" is not valid JSON`），可能泄漏 AI 输出里嵌入的敏感串。修复：把 `${cause}` 去掉，改为固定字符串 `AI 输出无法解析为 JSON`；新增测试用例 `S2 畸形 JSON 含敏感哨兵时，error_summary 不得回显运行时 cause`，用 `sk-DEADBEEF-DO-NOT-LEAK-42` 作为哨兵，同时断言不含 `Unexpected token`、`is not valid JSON`、`position N` 等 V8 诊断字符串。修补后测试从 4 → 5 全过；再次经 stash 双向回归验证。后端 102/102、前端 13/13。
- **2026-07-15 隔离复验补证**：真实 Provider 主路径已完成资料转换、AI 笔记、Markdown、Markmap、4 个知识模块和 `material_note_completed` 事件落盘；浏览器纯操作创建 pending 考试成功；无 Provider 降级进入 `pending_quality_check` 且刷新不白屏；按 run 白名单删除 `semesters/<semesterHash>/tmp` 后重启后端，API 与浏览器均能读回笔记、模块和思维导图。脱敏证据写在仓库外 evidence/browser-evidence。首次 AI 生成耗时 31,987 ms；2026-07-15 用户批准将首次 AI 预算从 30 秒放宽到 35 秒，因此 T09 与第一个里程碑可勾选完成。
- **2026-07-15 复核纠正**：复核发现 `4f595c6`/`20a67c6` 两次提交说明和本文件都误报「`git diff --check`：通过」——实际 `packages/backend/test/note-generation-parsing.test.mjs` 和 `packages/frontend/test/course-page.test.tsx` 末尾各多了一行空行，`git diff --check` 会报 `new blank line at EOF`。已删除两处多余空行并重新确认 `git diff --check` 通过（仅剩预期内的 LF/CRLF 提示）；`pnpm type-check`、后端 build、`pnpm test`（后端 102/102、前端 13/13）、文档治理脚本均重新复核通过。此纠正不影响功能结论，仅修正此前对 Step 15 的误报。
