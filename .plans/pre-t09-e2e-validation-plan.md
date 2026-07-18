# Phase 1 Pre-T09：已实现功能端到端验收计划

**状态**：执行中
**日期**：2026-07-18
**任务分支**：`codex/pre-t09-e2e-validation`
**目标门禁**：进入 T09A 前，对 `origin/master` 已合入的 T00、T10、T11、T02、T03/T03A/T03B/T03C/T03D、T04/T04A/T04B、T05、T06/T06A/T06B、T07、T08 做一次隔离的系统级回归。

## 1. 目标与边界

本计划只验证已有能力是否能在当前 `origin/master` 上共同运行，不实现 T09A 或任何新业务功能。验收结果按“环境问题、T09 前已知缺口、已实现功能回归、文档与实现不一致、需用户批准的新范围”分类，并在仓库外保存脱敏证据。

明确不做：

- 不实现 T09A 学期创建/选择/切换，不实现 T09B–T09E、每日首页、家长 Web 面板、S5、S7 或 S3 Worker。
- 不改 Schema；只有在发现已实现能力的阻塞缺陷时，才允许小范围修复对应业务代码并补测试。
- 不运行真实 AI Provider、QQ SMTP、飞书 Webhook 或正式 Windows 任务计划注册 smoke；使用现有规则报告、可注入 Adapter 和自动化测试。
- 不使用真实学习资料、密钥、完整 UUID、Provider URL 或正式 `APP_DATA_ROOT`。

## 2. 文档与代码依据

执行前已阅读并以以下文档和当前代码为准：

- `AGENTS.md`
- `docs/00-文档索引-Index.md`
- `docs/04-开发任务清单-Todo-List.md`
- `docs/08-共同底座架构-Architecture.md`
- `docs/09-测试验收计划-Test-Plan.md`
- `docs/10-后端开发规范-Backend-Guidelines.md`
- `docs/11-前端开发规范-Frontend-Guidelines.md`
- `docs/12-开发规范-Dev-Rules.md`
- `docs/15-前端信息架构与界面范围研究-Frontend-Information-Architecture.md`
- `docs/subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md`
- `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`
- `docs/subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md`
- `docs/subsystems/03-S4-错题改错子系统PRD-ErrorFixer.md`
- `docs/subsystems/06-S6-家长观察子系统PRD-ParentReport.md`

## 3. 文件与证据边界

本任务计划阶段只创建/修改：

- 创建：`.plans/pre-t09-e2e-validation-plan.md`
- 修改：`docs/04-开发任务清单-Todo-List.md`，登记验证任务和最终证据，不勾选 T09A 或未完成的新功能。
- 如发现已实现能力的 P0/P1 阻塞缺陷：只修改该缺陷涉及的现有源码与对应测试文件；不扩展 Schema/API/页面范围。

测试运行目录固定使用仓库外：

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\pre-t09-e2e-validation'
```

实际执行时可追加短 run id；所有服务用专用本地端口。截图、HAR、脱敏 API 摘要和日志只写入 `I:\ai-studybuddy-tmp\runs\pre-t09-e2e-validation\evidence`，不提交仓库。删除目录前必须先解析绝对路径并确认位于该验收 run 根目录内。

## 4. 验收步骤

### Task 1：核验基线与治理

- [x] 确认 `git status --short --branch`、`git rev-parse HEAD`、`git rev-parse origin/master`，记录当前分支从最新 `origin/master` 创建。
- [x] 检查 `package.json`、`packages/backend/package.json`、`packages/frontend/package.json` 的真实脚本，不猜包名。
- [x] 运行 `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`、`git diff --check`。
- [x] 复核文档声明的 T08 已实现、T09A 仅为下一门禁；若 `AGENTS.md` 与 `origin/master` 文档存在差异，以当前主线文档/代码为准并在证据中指出差异。

### Task 2：自动化类型、构建与单元/集成测试

- [x] 在隔离 `APP_DATA_ROOT` 下运行 `pnpm type-check`。
- [x] 运行 `pnpm -r --filter @ai-studybuddy/backend run build` 与 `pnpm -r --filter @ai-studybuddy/backend run test`，记录后端测试总数和失败。
- [x] 运行 `pnpm -r --filter @ai-studybuddy/frontend run build` 与 `pnpm -r --filter @ai-studybuddy/frontend test`，记录前端文件/测试总数和失败。
- [x] 运行根级 `pnpm test`，确认 build、后端测试、前端测试均真实执行；不得删除测试、降低断言或伪造结果。
- [x] 按 `docs/09` 补充运行 `pnpm test:e2e`；如服务启动/端口或浏览器依赖导致失败，按分类记录，不把环境失败误记为业务通过。

### Task 3：API 级验收

使用隔离后端和合成数据，通过 HTTP 客户端检查以下路径：

- `GET /api/health`；开发初始化/学期初始化接口。
- 课程创建/列表、考试目标创建/读取/确认、任务读取。
- 资料上传/列表/状态、笔记读取、知识模块读取。
- 练习生成、限时提交/规则批改、完成事件。
- 错题列表、错题详情、错因确认、原题重做/重做结果、薄弱点/掌握状态。
- 时间线查询及 `courseId`、重复 `eventType`、空状态/错误边界。
- `GET /api/config/status` 与三个渠道的测试/激活输入校验；只用固定失败/注入测试，不传真实秘密。

每个响应都断言 `{ success, data, error }` 信封。错误响应检查：不包含密钥、Authorization、完整路径、完整 UUID 或第三方原始错误体；配置 API 只返回 `configured`、掩码和脱敏状态。API 验收记录 HTTP 状态、错误码、短 ID 哈希和计数，不记录正文、秘密或完整 UUID。

### Task 4：浏览器端主路径

隔离启动 backend `start` 和 frontend `preview`，使用真实 Playwright 浏览器（现有 `e2e/*.spec.ts` 优先复用；页面缺少现成 spec 时用一次性浏览器脚本，不提交测试脚本）：

1. `/settings`：配置中心、运行状态、AI Provider、QQ SMTP、飞书 Webhook 可见；秘密字段是 `password`；提交后清空；页面、控制台和 localStorage 不出现秘密；未配置时有明确降级提示。
2. `/courses`：页面打开；如仍有开发期 `semesterId` 输入，记录为 T09A 前已知缺口；验证课程列表/创建、考试目标创建/状态展示和首次配置提示。
3. `/materials`：资料入口可见；上传合成文本文件到隔离目录；处理状态可刷新；失败显示中文反馈；成功链接进入笔记页。
4. `/notes/:noteId`：Markdown、KaTeX、思维导图/优雅降级、知识模块均不白屏；刷新后状态保持。
5. 考试工作台：进入当前考试；当前课程近期 StudyEvent 可见；只渲染正式接入事件；时间线加载、空态、500 错误和局部重试不影响其他工作台区块。
6. S3：发起练习、进入限时作答、提交答案、查看规则批改结果，并确认完成事件能在工作台时间线读回。
7. S4：查看错题、打开详情、确认错因、执行重做路径，确认薄弱点/掌握状态展示和错误/空状态。
8. S6：不发真实渠道；通过规则报告生成/投递自动化测试和仓库外合成 run 检查脱敏快照、日报/周报/月报/考前提醒边界、渠道去重/失败隔离/重试/双失败本机留档。

浏览器证据至少覆盖成功、空态、失败/重试、刷新后状态；窗口检查 `390px` 与桌面宽度无横向溢出。截图只 mask/截取脱敏内容并写到仓库外。

### Task 5：失败处理与边界内修复

- [x] 每个失败建立记录：场景、命令/路径、实际输出摘要、分类、优先级 P0–P3、是否阻塞 T09A、证据位置。
- [x] 环境问题只修复本地启动/依赖/端口/脚本问题，不改产品语义。
- [x] 已知 T09 前缺口只记录，不为消除缺口实现 T09A。
- [x] 已实现功能的 P0/P1 回归可在本分支小范围修复，并先补最小回归测试；若需要 Schema、公开 API 契约或新页面范围，停下并请求批准。
- [x] 每次修复后重跑受影响专项、完整 `pnpm test`、治理检查和 `git diff --check`。

### Task 6：收尾、证据和集成

- [x] 在 `docs/04-开发任务清单-Todo-List.md` 的 T08 后登记本轮 Pre-T09 验收结论、命令、测试计数、浏览器路径、问题分级和未实现边界；不勾选 T09A。
- [x] 完成独立计划自审：范围覆盖、无占位符、与当前脚本/文档一致。
- [x] 运行最终 `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`、`git diff --check` 和与修复范围相符的全量验证。
- [x] 提交使用 `docs(phase1): 记录 Pre-T09 端到端验收证据` 或实际范围更准确的中文提交信息。
- [x] 按仓库固定流程将任务分支 rebase 最新 `origin/master`，快进合入 `master`；在 `master` 重新运行要求验证后推送 `origin/master`。若合并、验证或远端推送失败，停下并如实交付分支状态，不宣称主线完成。

## 6. 实际验收结果（2026-07-18）

### 自动化与治理

- `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`：通过。
- `git diff --check`：通过。
- `pnpm type-check`：通过。
- `pnpm -r --filter @ai-studybuddy/backend run build`：通过。
- `pnpm -r --filter @ai-studybuddy/backend run test`：通过，`212/212`。
- `pnpm -r --filter @ai-studybuddy/frontend run build`：通过；仅有 Vite chunk 大于 500 kB 的非阻塞警告。
- `pnpm -r --filter @ai-studybuddy/frontend test`：通过，`10 files / 52 tests`。
- 根级 `pnpm test`：通过，真实执行根级 build、后端 `212/212` 和前端 `10 files / 52 tests`。
- `pnpm test:e2e`：最终 `5 passed`，使用隔离 `APP_DATA_ROOT` 和 Playwright 自启动 backend/frontend。

### 浏览器与 API

- 现有 E2E：S4 错题改错、T11 多考试与任务闭环、S3 限时练习/超时提交/刷新恢复、不存在练习错误态、T07 时间线和移动端适配均通过。
- 一次性浏览器脚本（未提交）验证 `/settings`、`/courses`、`/materials`、`/notes/:noteId`；合成文本资料从上传、处理状态到 mock worker 生成笔记后，笔记 Markdown、思维导图、知识模块可刷新读回。
- HTTP/API 合成检查确认标准 `{ success, data, error }` 信封；课程、资料、笔记、知识模块和配置状态路径可读。其余考试、任务、练习、错题、时间线、配置输入校验和 S6 规则/隔离/重试边界由现有后端集成测试覆盖。

### 问题记录

- **P1，已修复**：loopback Origin 策略未声明 PATCH，导致浏览器 PATCH 预检失败；补充 `PATCH,DELETE` 并增加回归测试。首次 `pnpm test:e2e` 为 `4 passed / 1 failed`，修复后为 `5 passed`。
- **P2，可接受**：T09A 前 `/courses` 仍需手输 `semesterId`；不阻塞本轮已实现底座验收，留给 T09A。
- **P3，记录**：Vite 报告部分 chunk 大于 500 kB；不影响功能验收，未扩大到产品化性能工作。
- **未执行外部边界**：真实 AI Provider、QQ SMTP、飞书 Webhook、正式 Windows Task Scheduler smoke 均按计划不执行。

结论：当前实现到 T08 的已实现能力在隔离环境下通过自动化和浏览器回归；P0/P1 已清零。可进入 T09A 的独立计划/审查/批准流程，但不能把本验证分支直接等同于已合入 `master`。

## 7. 验收完成口径

只有在计划已创建、`docs/04` 有真实证据、自动化与浏览器主路径结果真实记录、P0/P1 已修复或明确阻塞、治理/diff 通过、提交成功，并在需要时按仓库流程合入/推送 `origin/master` 后，才可称“Pre-T09 端到端验收完成”。分支通过只能称“验证分支通过”。
