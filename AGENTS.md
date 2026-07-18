# 仓库协作指南

**版本**：v1.9
**日期**：2026-07-19

本文件是通用 AI Agent 入口。完整、工具无关的协作规则见 `docs/12-开发规范-Dev-Rules.md`。

## 项目结构与当前状态

`I:\ai-studybuddy` 是唯一主系统 Git 仓库，中文优先。当前不再是空仓库：

- `packages/backend`：Express/SQLite/Worker/Adapter/API 实现。
- `packages/frontend`：React/Vite 最小页面。
- `packages/shared`：共享类型。
- `docs/`：有效设计、任务、测试和规范文档。
- `.plans/`：已批准或待批准的任务计划。

Phase 0.8 已完成，S1 基础与 S2 核心已实现。Phase 1 已完成 T00 协作基线、T10 人工补文恢复、T11 考试确认与任务创建闭环、T02 Provider 健康熔断、T03/T03A/T03B/T03C/T03D S3 限时练习闭环、T04/T04A/T04B S4 错题改错闭环、T05 回流规则，以及 T06 S6 家长观察 PRD、T06A 家长报告生成、T06B 家长报告推送、T07 S1 时间线扩展、T08 本机配置中心与连接验收、T09A 学期创建/选择与切换、T09B 每日学习首页和 T09C 课程课表与考试目标完善。T06B 采用冻结脱敏快照、QQ SMTP 与飞书渠道隔离、渠道级去重/重试和一次性 Windows 计划任务 runner；真实渠道 smoke 未作为常规验证依赖。T09D 全局导航与学生旅程 E2E 已在任务分支完成实现、独立复审修复与分支复验，当前仍待 fast-forward 合入、主线复验和推送后才可登记完成；T09E 尚未创建计划、尚未启动。S5/S7 继续按各自门禁等待。

## 必读顺序

每次处理仓库任务前必须先读：

1. `docs/00-文档索引-Index.md`
2. `docs/04-开发任务清单-Todo-List.md`
3. 与任务相关的子系统 PRD、`docs/08`、`docs/10`、`docs/11`
4. `docs/12-开发规范-Dev-Rules.md`

开工前还必须在 `docs/04` 找到当前任务及行动计划索引。没有任务行时先登记；计划列为“尚未创建”时，只能创建/审查 `.plans/` 计划，不能直接写业务代码。

产品事实以 `docs/01-总PRD-产品需求-Product-Requirements.md` 和 `docs/02-七子系统地图-Scenario-Systems.md` 为准。旧归档草稿、外部参考项目、截图和聊天记录都不是当前执行依据。

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
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\<task-id>'
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

当前状态：S1/S2/S3/S4/S6 PRD 已创建；T03A–T03D、T04A/T04B、T05 回流规则、T06 S6 PRD、T06A 家长报告生成、T06B 家长报告推送、T07 S1 时间线扩展、T08 本机配置中心、T09A 学期创建/选择与切换、T09B 每日学习首页与 T09C 课程课表和考试目标已完成。T09D 全局导航与学生旅程 E2E 已在任务分支完成实现、独立复审修复与分支复验，待主线集成；T09E 尚未创建计划、尚未启动；S5 与 S7 仍按各自门禁等待。

## 标准 16 步流程摘要

1. 读文档定边界。
2. 检查文档门禁。
3. 写 `.plans/` 计划。
4. 独立审查计划。
5. 用户明确批准。
6. 拆分任务逐项实现。
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
- 不硬编码 `I:\...` 等本机盘符到未来业务代码。
- 不回滚他人变更；并行协作时先确认文件所有权和当前 diff。
