# 仓库协作指南

**版本**：v1.2
**日期**：2026-07-16

本文件是通用 AI Agent 入口。完整、工具无关的协作规则见 `docs/12-开发规范-Dev-Rules.md`。

## 项目结构与当前状态

`I:\ai-studybuddy` 是唯一主系统 Git 仓库，中文优先。当前不再是空仓库：

- `packages/backend`：Express/SQLite/Worker/Adapter/API 实现。
- `packages/frontend`：React/Vite 最小页面。
- `packages/shared`：共享类型。
- `docs/`：有效设计、任务、测试和规范文档。
- `.plans/`：已批准或待批准的任务计划。

Phase 0.8 已完成，S1 基础与 S2 核心已实现。S3 PRD 已在 Phase 1-T03 中创建，Phase 1-T03A 实施计划已创建并自审，但 S3 Schema/API/业务代码尚未开始；S4–S7 仍按门禁等待。

## 必读顺序

每次处理仓库任务前必须先读：

1. `docs/00-文档索引-Index.md`
2. `docs/04-开发任务清单-Todo-List.md`
3. 与任务相关的子系统 PRD、`docs/08`、`docs/10`、`docs/11`
4. `docs/12-开发规范-Dev-Rules.md`

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

当前状态：S1/S2/S3 PRD 已创建；T03A 计划已创建但尚未获批实施；S3 Schema/API/业务代码尚未开始；S4/S5/S6/S7 未触发。

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
