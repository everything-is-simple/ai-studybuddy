# POST-PHASE2 全系统验证与文档对齐计划

**日期**：2026-07-21
**任务分支**：`codex/post-phase2-full-validation`
**基线**：`origin/master` @ `4dcc0b2e6bbb130e6e3826e1595ca5995741d2a0`
**状态**：用户已明确批准执行全测试、完整端到端测试、实现与设计文档对齐、提交、fast-forward 合入 `master` 并推送 `origin/master`

## 1. 目标

在 Phase 2-T01–T06 已进入 `origin/master` 后，对当前系统做一次完整、隔离、可重复的质量收口：

1. 跑通类型检查、双端生产构建和全量单元/集成测试。
2. 跑通 `e2e/` 下全部 Playwright spec，而不是只验证 Phase 2 专项页面。
3. 以当前代码、路由、API、Schema、测试与 Git 历史为事实，对齐入口规范、产品文档、架构、测试计划、开发规范、任务清单和 S5 PRD 的当前态表述。
4. 在任务分支记录证据并推送，随后按固定流程 rebase、fast-forward 合入 `master`，在主线重新完成同范围验证后推送 `origin/master`。

本任务不进入 Phase 3；用户已明确要求 Phase 3 暂缓。

## 2. 验证范围

### 2.1 分支全量验证

所有会写运行数据的命令使用仓库外隔离目录：

```powershell
$env:APP_DATA_ROOT = 'I:/ai-studybuddy-tmp/runs/post-phase2-full-validation-20260721-branch-full'
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

### 2.2 分支完整端到端验证

```powershell
$env:APP_DATA_ROOT = 'I:/ai-studybuddy-tmp/runs/post-phase2-full-validation-20260721-branch-e2e'
pnpm test:e2e
```

验收对象是执行时 `e2e/` 下全部 spec。计划创建时共有 15 个 spec；最终以 Playwright 实际发现和执行的测试数量为准。证据、截图、trace 与 HTML report 只写入隔离目录，不提交仓库。

### 2.3 主线复验

fast-forward 合入最新 `master` 后，在新的 master 隔离目录重新运行：

- `pnpm type-check`
- 后端生产 build
- 前端生产 build
- `pnpm test`
- `pnpm test:e2e`
- 文档治理与 diff 检查

## 3. 实现与设计文档对齐

以当前主线实现为事实，语义审计至少覆盖：

- `AGENTS.md`
- `CLAUDE.md`
- `docs/00-文档索引-Index.md`
- `docs/01-总PRD-产品需求-Product-Requirements.md`
- `docs/02-七子系统地图-Scenario-Systems.md`
- `docs/04-开发任务清单-Todo-List.md`
- `docs/08-共同底座架构-Architecture.md`
- `docs/09-测试验收计划-Test-Plan.md`
- `docs/10-后端开发规范-Backend-Guidelines.md`
- `docs/11-前端开发规范-Frontend-Guidelines.md`
- `docs/12-开发规范-Dev-Rules.md`
- `docs/15-前端信息架构与界面范围研究-Frontend-Information-Architecture.md`
- `docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md`

修订原则：

1. 修正当前态中仍称 Phase 2、S5 T02–T06、T05 或 T06 “未开始/待批准”的表述。
2. 将 Phase 1 和 Phase 2 的完成事实、当前路由/API/测试事实与实现对齐。
3. S5 PRD 的验收清单和路线图只勾选实际已有证据的能力；不把未实现的 StudyEvent、S6 扩展或 AI 能力误标完成。
4. 保留历史证据段在当时时点的原始语义；必要时增加“后续状态见完成证据”，不篡改历史。
5. 明确 Phase 3 暂缓，S7 与 S3 Worker 继续按既有门禁等待。

## 4. 失败处理

- 测试或 E2E 失败时，先分类为环境问题、测试隔离问题、既有实现回归或文档不一致。
- 仅允许修复 Phase 0.8–Phase 2 已实现能力的阻塞回归，并补充对应自动化测试；不新增 Phase 3、S7、S3 Worker 或其他产品范围。
- 不使用真实学习资料、正式数据库、真实 API Key、QQ SMTP、飞书 Webhook、真实 AI Provider 或正式 Windows 计划任务 smoke。
- 不通过删除测试、降低断言、跳过用例或扩大超时来掩盖失败。

## 5. 提交与合入

1. 计划与任务登记先经治理、diff 检查后提交并推送任务分支。
2. 完成分支验证、E2E 和文档对齐后，更新 `docs/04` 为“分支完成、待主线复验”并提交、推送。
3. `git fetch --prune origin`，任务分支 rebase 到执行时最新 `origin/master`。
4. 在干净 `master` 工作树执行 `git pull --ff-only origin master` 与 `git merge --ff-only codex/post-phase2-full-validation`。
5. 主线重新完成全量验证和完整 E2E，再同步 `docs/04` 最终完成状态，提交并推送 `origin/master`。

## 6. 完成标准

- 分支与主线的 type-check、双端 build、`pnpm test` 均通过。
- 分支与主线的 `pnpm test:e2e` 均通过，实际执行的全部 spec/测试数量有证据。
- 当前态文档不再误称 Phase 2 或 T05/T06 未启动，Phase 3 明确暂缓。
- 文档治理、`git diff --check`、`git diff --cached --check` 通过。
- 任务分支已推送、fast-forward 合入 `master`，最终 `origin/master` 包含完成提交。

## 7. 非目标

- 不实施 Phase 3。
- 不创建家长 Web 面板、家长账号、公网入口或远程登录。
- 不启动 S7、S3 Worker、真实 AI/Provider、QQ SMTP、飞书或 Task Scheduler 外部 smoke。
- 不新增业务 API、Schema/migration、页面或持久化能力，除非全量回归证明现有已交付能力存在阻塞缺陷且修复严格限于该缺陷。
