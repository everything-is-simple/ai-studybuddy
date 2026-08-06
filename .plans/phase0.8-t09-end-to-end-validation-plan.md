# Phase 0.8 T09：端到端验证计划

**状态**：已获批准并执行 AGENTS.md Step 6–16；修复后隔离复验通过，T09 验收完成。
**日期**：2026-07-14
**文档门禁**：文档无需变更。本任务验证已有 S1、S2 和 T08 前端，不触发新设计文档。

## 1. 目标、边界与前置条件

### 目标

在一次性、隔离的本机数据目录中验证：

创建课程/考试目标 → 上传文本型 PDF → 转换与 AI 笔记
→ 前端 Markdown + KaTeX + Markmap → 知识模块、来源和关联任务
→ confirmed 考试影响 priorityBucket → tmp 清理后笔记仍可读取
→ 记录脱敏的 token 与响应时间

### 边界

- 只验证 Phase 0.8 的 S1 + S2 + T08 页面；不实现 S3/S4/S5/S6/S7，不发送报告。
- 不使用真实学生资料、姓名、考试信息或教材正文；只用公开/自行制作的合成样本。
- 不修改业务代码、不勾选 T09、不执行正式 E2E，直到用户批准。
- 不使用正式 APP_DATA_ROOT、不污染已有本机数据、不导入 composer 试炼场代码。
- 证据不包含 API Key、Authorization、完整 Provider URL、PDF/笔记/提示词全文、绝对数据路径或完整 UUID。

### 已核实的前置条件

| 项目      | 结论                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| 设计依据  | 已读 00、01、02、04、08、09、10、11、S1 PRD、S2 PRD；归档旧稿未作为依据。     |
| Git 起点  | 创建本计划前工作区干净；当前分支为 t04a-docs-update。                         |
| Phase 0.7 | 开发机验收已完成；HP 16GB 复测非阻塞，不能伪写为已通过。                      |
| S1 / T06  | 课程、考试、任务、事件、时间线 API 已实现；priorityBucket 为读取时派生值。    |
| S2 / T07  | 上传、转换、AI 笔记、模块、Worker、重试和待质检降级已实现。                   |
| T08       | /courses、/materials、/notes/:noteId 已实现；KaTeX、Markmap、资料轮询已接入。 |
| T09       | 计划创建时任务清单为未完成；修复后复验已通过并回填完成结论。                  |

## 2. 验收对象

| 范围         | API / 页面                                                     | 关键证明                                                       |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| 课程、考试   | POST/GET /api/courses、POST/GET /api/exams；/courses           | 课程归属、目标、日期和 confirmationStatus 保存。               |
| 任务与优先级 | POST/GET /api/study-tasks；笔记页                              | 任务关联考试、模块；priorityBucket 不持久化而按状态/日期派生。 |
| 上传与处理   | POST /api/materials/upload、GET /api/materials；/materials     | pending 经转换和生成到终态，页面轮询展示中文状态。             |
| 笔记与模块   | GET /api/notes/:id、GET /api/knowledge-modules；/notes/:noteId | Markdown、KaTeX、Markmap、来源证据和关联任务分别可见。         |
| AI 降级      | retry API、资料页                                              | AI 失败仍保存 normalized text，最终为 pending_quality_check。  |

涉及数据对象：course_instances、assessment_attempts、study_tasks、materials、normalized_texts、structured_notes、mind_maps、knowledge_modules、study_events、jobs。

Job：material_convert、note_generate；Job 状态 pending/running/completed/failed。资料成功主线为 pending → converting → converted → note_generating → completed；失败终态为 conversion_failed 或 pending_quality_check。

文件边界：原 PDF 只通过逻辑 storage_key 指向 semesters/<semester-id>/files/<course-id>/...。可删除的仅是当前验收 run 内的根 tmp/ 与 semesters/<semester-id>/tmp/；绝不删除 files/、数据库、backups/ 或其他学期。

## 3. 隔离数据、PDF 与证据

1. 获批后生成随机 <run-id>，令临时后端进程的 APP_DATA_ROOT 指向仓库外的新目录，例如 I:\ai-studybuddy-t09-validation\<run-id>；使用专用端口。
2. 不编辑、打印或复制现有 .env.local。AI 所需变量仅以进程环境注入；验收根目录和证据目录均不进入 Git。
3. 在该目录创建专用 ready 学期、课程、考试、任务和资料；结束后仅在绝对路径确认属于 <run-id> 时才删除，或按用户要求保留复核。
4. PDF 为 1–3 页的文本型合成/公开许可文件，包含无敏感行内与块级公式；记录 SHA-256、页数、大小、抽取字符数，不记录正文。扫描 PDF/OCR 不替代本轮文本 PDF 主路径。
5. 仓库外 evidence/ 只存脱敏 API 摘要（短哈希 ID、状态、计数、字段存在性、HTTP 状态、时长）、截图和白名单 AI 指标。

## 4. 获批后的验收顺序

### A. 回归与启动

1. 再次核对 Git 状态、分支和 .gitignore。
2. 先执行：pnpm type-check、pnpm -r --filter backend run build、pnpm test。
3. 使用隔离环境启动后端与前端，确认 /api/health；不使用真实数据根目录。

### B. 文本 PDF + AI 成功主路径

1. 在 /courses 创建课程和考试目标，保存浏览器证据。当前 UI 创建考试默认是 pending，必须如实记录。
2. 为验证 priorityBucket，通过脱敏 API 额外创建同课程的 confirmed 考试，并创建一个同时关联该考试与后续模块的任务；该 API 步骤用于覆盖当前 T08 未提供的确认/任务创建 UI。**结论边界：本次 priorityBucket 验收通过只证明后端在读取时的派生逻辑正确，不证明用户可从浏览器完成考试确认或学习任务创建；该浏览器闭环仍是 T11 的独立立项理由。**
3. 在 /materials 上传合成文本 PDF，观察 pending → converting → converted → note_generating → completed。记录状态时间戳。
4. 时间预算：PDF 转换 30 秒；首次 AI 35 秒；重试 AI 45 秒；资料页轮询遵守 2→4→8→16→30 秒。超时不无限等待，进入降级验证并如实标记。2026-07-15 经用户批准，首次 AI 预算由 30 秒放宽到 35 秒。
5. 完成后读取资料、笔记、模块、任务、事件和 Job，验证：笔记 Markdown 非空；公式实际渲染；Markmap SVG 可见；模块有 materialId 和可在 normalized text 关键词定位的 sourceEvidence；任务有正确的 knowledgeModuleId/assessmentAttemptId；存在 material_note_completed StudyEvent。
6. 建立 priority 对照：相同未来 deadline 的考试关联任务，pending 考试应为 bucket 2，confirmed 应为 1；另用过期任务确认 bucket 0 优先。记录 API 证据与笔记页关联任务展示。

### C. AI 未配置/失败降级

1. 使用第二个隔离 run-id，不配置 Provider（或使用无凭据隔离进程），上传同类 PDF。
2. 证明转换仍产生非空 normalized text；有限重试后资料为 pending_quality_check；错误摘要不含密钥/正文；页面显示可理解的中文状态而非白屏。
3. 此 run 只证明 fallback，不当作真实 AI 笔记成功。

### D. 临时文件清理

1. 仅在成功主路径所有读取证据已采集后，枚举允许目标并确认它们解析后都属于当前 <run-id>。
2. 只删除这两个 tmp 目录的内容；禁止递归删除验收根目录，禁止触碰 files、DB、backups 和其他学期。
3. 删除后重启隔离后端，重开 /notes/:noteId 并读取模块、任务、事件和原始文件 storage_key。任一读取失败立即停止并保留隔离目录诊断。

## 5. 浏览器检查与截图

所有截图均为合成内容，遮盖 UUID/本机路径，不显示 DevTools 网络头、环境变量、日志全文或 Provider URL。

1. 01-courses-and-pending-exam.png：课程及 UI 创建的 pending 考试。
2. 02-material-upload-pending.png：选中课程与等待/处理中。
3. 03-material-completed.png：完成状态、模块数、查看笔记入口。
4. 04-note-markdown-katex.png：标题、列表、实际渲染的行内和块级公式（不显示全文）。
5. 05-note-markmap.png：可见 Markmap。
6. 06-modules-source-tasks.png：来源证据摘要、关联任务、priorityBucket。
7. 07-ai-degraded-state.png：第二 run 的待质检中文状态。
8. 08-after-tmp-cleanup.png：清理后仍可读取同一笔记。

同时检查刷新/路由恢复、失败区中文反馈而不白屏、页面不暴露存储路径或密钥、页面可见性恢复时的轮询。

## 6. AI token、模型与性能记录

每次真实 AI 调用只向仓库外的脱敏 JSONL/CSV 写入：

run_id,timestamp_utc,material_id_hash,job_id_hash,task_type,
provider_name,model,fallback_used,token_used,latency_ms,
wall_clock_generation_ms,result_status,error_code

- provider_name、model、token_used、latency_ms 来自 AiResponse、structured note 和 AiLogger 的允许字段。
- 同时记录上传 API、转换、AI 生成和总终态耗时；记录成功、超时、未配置和全部 Provider 失败。
- 严禁保存 Key、请求/响应正文、prompt、完整 ID、真实课程/考试内容或完整 base URL。
- 查询 API 的本地观察目标为 <500 ms；不满足时如实记录。外部 Provider 不可用则标记 BLOCKED_EXTERNAL/失败，不引用历史 smoke test 伪称通过。

## 7. 自动化、治理与候选修复

获批后的 Step 8–15：

    pnpm type-check
    pnpm -r --filter backend run build
    pnpm test
    pnpm -r --filter backend run dev
    powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
    git diff --check

必要时新增集成测试优先为 packages/backend/test/t09-end-to-end-validation.test.mjs，使用临时 APP_DATA_ROOT 和 mock AI；真实 Provider/凭据/PDF 不进入测试。

| 候选缺口    | 当前事实                                                                                                                                                                                 | 本计划的处理与门控                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 考试确认 UI | T08 创建考试未传 confirmationStatus，后端默认 pending，页面没有确认操作。                                                                                                                | 先用 API 建 confirmed 对照；若要纯浏览器闭环，须获批后补 API/前端/测试并重新验收。                                                                  |
| 创建任务 UI | T08 没有任务创建页；S2 Worker 只建模块和 StudyEvent，并不自动建 StudyTask。                                                                                                              | 用 API 建双关联验收任务；不能伪称 UI/Worker 已自动生成，修复须另行批准。                                                                            |
| 手动补文 UI | `material-status` 仅在 `pending_quality_check` 显示回调入口，但资料页未传 `replace-text` 回调；服务端当前只允许 `conversion_failed` 或 `pending` 调用 replace-text，和该 UI 状态不一致。 | 降级 run 要如实记录该 API 在 `pending_quality_check` 的实际结果；不能将其写成已可恢复。若立项，前后端状态契约、重复提交保护和回归测试必须一起修复。 |
| Worker 重入 | setInterval 不等待上一轮 runOnce 结束，慢 AI 时需观察是否重叠。                                                                                                                          | 记录 Job 数、attempts 和重复情况；仅复现后提出最小修复及回归测试。                                                                                  |

任何新缺陷都先形成最小脱敏复现（期望/实际/证据），请求用户批准修复范围，再改业务代码；修复后全量回归，不直接勾选 T09。

## 8. T09 结论后的实施优先级（由 T08 反推）

本节只定义 T09 之后的**立项顺序与触发门槛**，不授权任何业务代码修改，也不把候选项计为 T09 已完成。T09 的两次隔离 run 完成后，先按下列门槛出具脱敏结论，再决定唯一的下一项任务。

| T09 结论                                                                                                  | 下一步                            | 原因与门控                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 发现数据丢失、跨学期/课程串数据、Job 永久卡住、同一资料产生重复笔记/异常 attempts、tmp 误删风险或隐私泄露 | **P0：先修复该验收阻塞问题**      | 先保存最小脱敏复现、界定受影响状态与数据，再由用户批准最小修复范围；修复后重跑 T09 两个 run。                                 |
| 未发现 P0，但实际观察到 `startPolling()` 的重叠 `runOnce()` 导致重复领取、attempts 异常或终态错误         | **P0.5：Worker 执行控制**         | 以 T09 的时间线、Job 数与 attempts 为证据；只修复已复现的重入路径，并新增慢 AI/重叠轮询回归测试。未复现则不得预防性大改队列。 |
| 主路径和降级路径均无上述阻塞                                                                              | **推荐 T10：S2 人工补文恢复闭环** | 以最小增量让资料在 `pending_quality_check` 后仍能从浏览器恢复到笔记完成；它直接补齐 T08 已暴露的异常恢复断点。                |
| T10 验收通过                                                                                              | **推荐 T11：S1 学习任务闭环**     | 再让确认后的考试、知识模块和学习任务进入浏览器可操作闭环，避免在资料处理稳定性未确认前扩展 S1 UI。                            |

### 推荐 T10：人工补文恢复闭环（默认下一功能）

目标是让用户在资料处于 `pending_quality_check` 时粘贴 1–1,048,576 字符的替代文本，并由既有 `note_generate` Job 继续处理，最终显示笔记或可理解的失败状态。

- 范围必须同时覆盖：资料页把 `onReplaceText` 接入 `MaterialStatus`；输入/取消/提交和重复点击防护；前端展示 API 中文错误；服务端 `replaceText` 的允许状态与前端入口对齐；不改变其他学期、课程或资料。
- 该项不是“只接一个按钮”：当前组件只在 `pending_quality_check` 展示入口，而服务端 `replaceText` 拒绝该状态。T10 必须先为这份状态契约写失败测试，再以最小改动统一它。
- 必测路径：`pending_quality_check` → 手动输入 → `converted` → `note_generating` → `completed`；取消不发请求；重复提交不重复创建可执行 Job/笔记；非法长度和服务端错误可见；课程/学期隔离；页面刷新后终态可读。
- T10 的真实 Provider 验收继续使用合成文本、隔离 `APP_DATA_ROOT` 和脱敏 evidence；自动化集成测试使用 mock AI，不写入凭据、正文或真实路径。

### 推荐 T11：考试驱动的学习任务闭环（T10 后独立立项）

目标是让浏览器用户能够确认考试、创建与课程/考试/知识模块关联的学习任务，并看到确认考试驱动的 `priorityBucket`；S2 Worker 仍不负责自动创建 `StudyTask`。

- 考试确认需要先设计并批准状态变更 API（现有后端只提供创建考试时的 `confirmationStatus`，没有更新端点），再提供页面操作；不得通过在前端重建考试来冒充“确认”。
- 任务创建页面须显式选择课程、可选考试与可选知识模块，沿用统一 API 信封；任务状态变更必须证明相应 `StudyEvent`，而不能只以页面文字判断成功。
- 必测路径：`pending` 考试与 `confirmed` 考试的同条件任务 `priorityBucket` 对照；确认状态和 `confirmedAt` 刷新后保持；课程/考试/模块外键正确；非法跨课程关联被拒绝；任务状态变更写入事件；表单错误、刷新恢复和中文反馈正确。
- 本项不将“上传资料后自动建学习任务”纳入范围；那是另一个产品决策，须独立设计。

## 9. 独立风险审查与修订结论

| 审查维度                       | 风险                                                 | 修订后的控制措施                                                                              |
| ------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Provider 不可用                | 成功路径不能依赖单一 Provider。                      | 单独无 Provider run，验证 pending_quality_check 与文本保留。                                  |
| 文本/扫描 PDF 与 OCR           | 扫描件可无文本；OCR 等待不应冒充 PDF 主路径。        | 主路径固定文本 PDF；扫描/OCR 留作后续独立覆盖；采用 30/30/45 秒上限。                         |
| Job、轮询、终态重试            | 可能卡住、重复或重试耗尽。                           | 记录状态/attempts/时间线，最多 3 次，检查 completed/conversion_failed/pending_quality_check。 |
| confirmationStatus 与 priority | confirmed 才驱动 bucket 1，UI 现有缺口会造成假阳性。 | API 对照 + 明确候选 UI 修复，不把 pending UI 操作写成已触发。                                 |
| 来源和关联                     | 模块、资料、任务、事件不是同一件证据。               | 分别断言 material/sourceEvidence、两个任务外键、S2 Event，并截图。                            |
| tmp 清理                       | 递归误删会损害 files/DB/其他学期。                   | run-id 路径白名单、先列举核验、清理后重启读回、失败即止损。                                   |
| 隐私                           | 截图、API 和日志易泄露正文/密钥。                    | 合成输入、字段白名单、短哈希、仓库外 evidence，禁截网络头/环境变量。                          |

**修订结论**：采用“真实文本 PDF + 已配置 Provider”的成功 run 与“无 Provider”的降级 run，二者完全隔离；并显式记录考试确认、任务创建、手动补文三个前端缺口。priorityBucket 的 API 对照仅验证读取时派生逻辑，不等同于浏览器已支持考试确认或任务创建。缺口均为候选修复，不在批准前修改。

## 10. 预期文件变更

### 本次 Step 1–5

    .plans/phase0.8-t09-end-to-end-validation-plan.md

### 获批并完成真实验收后才可能更新

    docs/04-开发任务清单-Todo-List.md
    docs/09-测试验收计划-Test-Plan.md

### 仅复现缺口且用户批准修复后才可能修改

    packages/backend/test/t09-end-to-end-validation.test.mjs
    packages/backend/src/services/material-job-worker.ts
    packages/backend/src/services/study-rhythm-service.ts
    packages/frontend/src/pages/course-page.tsx
    packages/frontend/src/pages/material-upload-page.tsx
    packages/frontend/src/components/material-status.tsx
    packages/frontend/test/*.test.ts

不会创建 S3/S4/S6 PRD，也不会创建 docs/12-_、docs/13-_ 或 docs/14-*。

## 11. Step 6–16 执行记录（2026-07-14）

- 隔离 worktree、`pnpm type-check`、后端 build 与全量测试已执行；在隔离 `APP_DATA_ROOT` 下，后端 97/97、前端 12/12 通过。新 worktree 需要先生成被 Git 忽略的 `packages/shared/dist` 声明产物，且全量测试需要显式隔离 `APP_DATA_ROOT`，二者均未修改业务源码。
- 成功 run 与无 Provider run 均使用同一份合成文本 PDF、独立数据根和仓库外脱敏 evidence。两次 `material_convert` 均成功并保留 normalized text。
- 真实 Provider run 的 `note_generate` 3 次均收到成功响应（`pixel-k12` / `gpt-5.5`；token 701/784/831；约 15.4/20.0/16.2 秒），但响应后的严格 JSON 解析失败，未生成结构化笔记、思维导图或知识模块；只保存 `JSON_PARSE`、允许的 token/耗时字段和短哈希，不保存 Provider URL、Key、Prompt、正文或完整 UUID。因此成功主路径、笔记/模块关联和 tmp 清理后的笔记读回均未通过或未执行。
- 无 Provider run 的 `note_generate` 在约 14 秒内按 3 次有限重试进入 `pending_quality_check`；资料页显示“需要人工补文”，刷新不白屏。`replace-text` 在该终态返回 `INVALID_STATUS`，符合当前后端只允许 `conversion_failed` 补文的规则；缺口是页面没有可用补文入口，恢复 UX 与状态提示尚未统一。
- 浏览器可创建课程，但考试表单的初始受控输入不能保留必填值，无法提交考试。priorityBucket 的 API 对照为：过期任务 0、同一未来 deadline 的 confirmed 考试关联任务 1、pending 考试关联任务 2；只证明后端读取时派生逻辑，不证明浏览器闭环或列表排序。无 Provider run 本次未观察到 Worker 重入，三次尝试时间符合约 5 秒退避；但独立审查确认 `setInterval` 不等待 `runOnce()`，因此不能称 Worker 已证明串行。审查还记录：前端轮询在页面隐藏时不会停止且状态变化不重置退避；OCR 使用系统临时目录，尚无 `APP_DATA_ROOT/tmp` 清理实现或清理后读回证据。
- 未修改业务代码，未创建 S3/S4/S6 PRD 或 `docs/12-*`、`docs/13-*`、`docs/14-*`。下一步先以最小脱敏复现修复真实 Provider 响应的 JSON 解析契约，再重跑成功 run；在没有完成笔记前，不执行 tmp 删除或提前立项 T10/T11。

## 12. 修复后隔离复验记录（2026-07-15）

- 修复基线为 `4f595c6`，独立审查补丁为 `20a67c6`；复验前已完成 `pnpm type-check`、后端 build、两次全量 `pnpm test`。首次全量测试出现一次后端健康检查波动，单文件复跑与第二次全量均通过：后端 102/102、前端 13/13。
- 真实 Provider run 使用同一类合成文本 PDF 与隔离数据根，`material_convert` 1 次完成，`note_generate` 1 次完成并落盘：normalized text 258 字符、Markdown 430 字符、highlights 4、knowledge modules 4、4/4 模块有关联资料和 `sourceEvidence`，`material_note_completed` 事件 1 条。记录允许字段：token 1949、AI 耗时 31,987 ms、模型名与 provider 名；未记录 Key、Provider URL、提示词或正文全文。
- 浏览器证据已补齐：`01-courses-and-pending-exam.png` 由纯浏览器操作创建 pending 考试；`02-note-markdown-katex-markmap.png` 展示笔记正文、KaTeX 渲染文本、Markmap 区域与模块；截图前已遮盖 semesterId 输入框可见值。
- 无 Provider 降级复验使用独立 run，显式清空 Provider 环境变量。PDF 转换 1 次完成，AI 3 次有限重试后进入 `pending_quality_check`；normalized text 258 字符保留，`hasNote=false`、模块数 0。数据库错误/状态字段的脱敏检查不含 `sk-`、资料正文短语、V8 诊断串或 Provider URL。浏览器截图 `03-degraded-pending-quality-check.png` 与刷新后 `04-degraded-after-refresh.png` 均可读。
- tmp 清理按 run 白名单只删除 `semesters/<semesterHash>/tmp`；清理记录已脱敏为相对路径。删除后重启后端，API 读回笔记、highlights、Markmap 与 4 个知识模块一致；浏览器截图 `05-after-tmp-cleanup-note-readback.png` 证明清理后页面仍可读。
- 结论：P0-1 与 P0-2 的功能阻塞已修复，T09 的核心业务闭环已通过真实 Provider 与浏览器复验。首次 AI 生成耗时 31,987 ms；2026-07-15 用户批准将首次 AI 预算从 30 秒放宽到 35 秒，因此本次复验满足性能门禁。T09 与第一个里程碑可标记完成；任务创建/考试确认 UI、人工补文恢复闭环和 Worker 单飞仍按 T10/T11/后续缺口处理。
