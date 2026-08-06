# 仓库协作指南

**版本**：v1.20
**日期**：2026-07-28

本文件是通用 AI Agent 入口。完整、工具无关的协作规则见 `docs/12-开发规范-Dev-Rules.md`。

## 项目结构与当前状态

`<repo-root>` 是唯一主系统 Git 仓库（本开发机为 `H:\ai-studybuddy`），中文优先。当前不再是空仓库：

- `packages/backend`：Express/SQLite/Worker/Adapter/API 实现。
- `packages/frontend`：React/Vite 最小页面。
- `packages/shared`：共享类型。
- `docs/`：有效设计、任务、测试和规范文档。
- `.plans/`：已批准或待批准的任务计划。

Phase 0.8 已完成，S1 基础与 S2 核心已实现。Phase 1 的 S1/S2/S3/S4/S6 简版、学生端产品化、配置中心及 T12/M01/M02/M03/Post-M03 维护任务均已完成主线复验并推送 `origin/master`；S3 Worker 不属于当前 MVP。Phase 2-T01–T06 已全部完成主线复验并推送：S5 现有能力包括模拟考 Schema/生成/作答/结果、确定性只读临考速背、确定性即时只读冲刺计划，以及考试工作台冲刺区集成；T04/T05/T06 不引入持久化 `CramPlan`、StudyEvent、Worker 或真实 AI 调用。POST-PHASE2 全系统验证、完整 E2E、文档对齐与主线复验均已完成并推送 `origin/master`；开发机 Windows 原生 + Node 24 基线已验证，但用户电脑安装运行仍待目标机器验收。用户于 2026-07-28 重新开放 Phase 3，但仅纳入高权重必做项恢复计划 `PHASE3-REOPEN-HIGH-WEIGHT-20260728`：T02-R1、T02-R2、T04-1～T04-3、T02-R3、T05-1～T05-3、T02-R4、T02-R6。它们仍须独立审查、逐项计划、验证、主线复验和推送；T02 总体、真实 ACL/backup/restore、restore 写入、用户电脑实机证据及未纳入的 T01、T02-R5、T03 均未完成。完整 S7 产品接入尚未开始，外部候选能力不等于 Schema、Adapter、API、Worker、前端或用户机完成。

## 必读顺序

每次处理仓库任务前必须先读：

1. `docs/00-文档索引-Index.md`
2. `docs/04-开发任务清单-Todo-List.md`
3. 与任务相关的子系统 PRD、`docs/08`、`docs/10`、`docs/11`
4. `docs/12-开发规范-Dev-Rules.md`

开工前还必须在 `docs/04` 找到当前任务及行动计划索引。没有任务行时先登记；计划列为“尚未创建”时，只能创建/审查 `.plans/` 计划，不能直接写业务代码。

产品事实以 `docs/01-总PRD-产品需求-Product-Requirements.md` 和 `docs/02-七子系统地图-Scenario-Systems.md` 为准。旧归档草稿、外部参考项目、截图和聊天记录都不是当前执行依据。

## 执行可见性规则

对会产生明显等待、长时间输出或关键状态变化的命令，执行前必须先告诉用户“现在执行哪一步、目的是什么”；执行中若等待较久，应继续用简短进度说明，避免用户只看到终端黑屏或大段无上下文输出。

## 常用命令

```powershell
git status --short --branch
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

会写入运行数据的命令必须先设置隔离目录：

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\<task-id>'
pnpm -r --filter backend run dev
```

`<task-id>` 是占位符，不得原样执行。

## Git 工作流硬规则

- `master` 只代表已集成、已验证、且 `docs/04` 状态同步的事实；不得把“分支已完成”说成“master 已完成”。
- 每个任务先从最新 `master` 创建任务分支：Codex 用 `codex/<work-id>-<scope>`，Claude 用 `claude/<work-id>-<scope>`，人工可用 `human/<work-id>-<scope>`；`work-id` 可为 `phase1-t03a`、`process`、`hotfix` 等，示例：`codex/phase1-t03a-s3-schema`、`codex/process-git-workflow`。
- 任务分支可以推送远端作备份或审查，但这不等于完成。完成判定必须以合回 `master` 后的代码、文档和验证结果为准。
- 分支合回 `master` 前必须：实现范围已完成、测试/构建/治理检查通过、`docs/04` 勾选并登记证据、无越权文件。
- 合并流程固定：`git checkout master` → `git pull --ff-only origin master` → 将任务分支 rebase 到最新 `master` → `git checkout master` → `git merge --ff-only <task-branch>`；不能快进或有冲突时停下，不强行合并。
- 合并后必须在 `master` 重新运行要求的验证，再 `git push origin master`。只有 `origin/master` 包含该提交后，才可向用户报告任务完成。
- 交付说明必须写清：任务分支名、提交哈希、是否已合并 `master`、是否已推送 `origin/master`、`docs/04` 更新位置。
- 脏状态必须先在 `docs/04` 登记并按语义改动、计划、生成物、依赖残留或外部证据分层；未经精确路径核验和用户批准，不得用 `git clean`、`git reset --hard`、覆盖 checkout 或批量删除处理。
- 当前开发机的新任务 worktree 只能创建在 `H:\ai-studybuddy-worktrees`；`<repo-root>`（本机 `H:\ai-studybuddy`）内禁止 `.worktrees` 根。历史仓内目录必须先审计并获批后迁出或处置，不能用文件系统删除替代 Git 管理。

## 编码与命名规范

- 文档命名：`NN-中文标题-English-Title.md`；子系统 PRD 放在 `docs/subsystems/`。
- 后端路径必须走 `paths.ts`，环境变量走 `env.ts`，API 响应统一 `{ success, data, error }`。
- 新增后端接口测试优先放在 `packages/backend/test/<feature>-api.test.mjs`，集成测试优先，不 mock DB。
- 前端只消费后端 API，不直接读取 SQLite、上传目录、临时文件或 Provider 配置。
- 提交信息使用 `type(scope): 中文描述`。

## 文档门禁

新增任何设计文档前必须：

1. 先读 `docs/00-文档索引-Index.md`。
2. 检查目标文档是否已存在。
3. 检查触发条件是否满足。
4. 不满足则不创建，只说明“还不到创建时机”。
5. 满足则创建并同步更新索引。
6. 提交前运行 `scripts/check-docs-governance.ps1`。

当前状态：S1/S2/S3/S4/S5/S6 PRD 均已创建；Phase 1 与 Phase 2-T01–T06 已完成主线集成、复验和 `origin/master` 推送。S5 的 T04 临考速背、T05 冲刺计划和 T06 工作台冲刺区均为确定性只读/即时聚合边界，不新增持久化计划、StudyEvent、Worker 或真实 AI 调用。POST-PHASE2 全系统验证、完整 E2E、文档对齐与主线复验均已完成并推送 `origin/master`；Phase 3 的高权重必做恢复计划已于 2026-07-28 创建，11 项纳入任务尚待独立审查和逐项实施；T02 总体及其他未纳入任务仍未完成。S7-MVP 已完成，完整 S7 继续等待独立门禁，S3 Worker 不属于当前 MVP。

## 标准 16 步流程摘要

1. 读文档定边界。
2. 检查文档门禁。
3. 写 `.plans/` 计划。
4. 独立审查计划。
5. 用户明确批准。
6. 拆分任务逐项实现；长命令/关键命令前先说明当前步骤和目的。
7. 编写测试。
8. type-check。
9. build。
10. test。
11. smoke / 浏览器验收。
12. 独立审查、修复、回归。
13. 更新任务清单和文档：任务完成交付前，必须先定位 `docs/04-开发任务清单-Todo-List.md` 中对应任务行，勾选已完成项并登记验证证据；纯计划任务则登记“计划待批”，不得误勾实现项。
14. 文档治理检查。
15. diff 检查。
16. 提交并交付说明。

## 最高优先级禁令

- 不凭记忆创建文档，不提前触发未来 PRD。
- 不复制 KaoBuddy 或其他无明确许可证项目的源码、视觉、图片、长段文案或品牌资产。
- 不提交真实 API Key、Provider URL、资料原文、完整 UUID、正式运行数据或外部试炼场依赖。
- 不硬编码 `H:\...`、`I:\...` 等本机盘符到未来业务代码。
- 不回滚他人变更；并行协作时先确认文件所有权和当前 diff。
