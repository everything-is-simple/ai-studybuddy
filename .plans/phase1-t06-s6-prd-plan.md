# Phase 1-T06 S6 家长观察 PRD Plan

> **状态**：已获用户明确执行授权（2026-07-17）。本计划只覆盖 T06 PRD 文档任务，不授权 T06A/T06B 实现。

## 1. 目标

创建 S6 家长观察子系统轻量 PRD，并同步文档索引与任务清单，让下一门禁从“创建 S6 PRD”推进到“T06A 报告生成独立计划”。

## 2. 范围

### 本轮创建

- `docs/subsystems/06-S6-家长观察子系统PRD-ParentReport.md`
- `.plans/phase1-t06-s6-prd-plan.md`

### 本轮修改

- `docs/00-文档索引-Index.md`
- `docs/04-开发任务清单-Todo-List.md`
- 必要状态同步：`AGENTS.md`、`CLAUDE.md`、`docs/08-共同底座架构-Architecture.md`、`docs/12-开发规范-Dev-Rules.md`、`docs/subsystems/03-S4-错题改错子系统PRD-ErrorFixer.md`

## 3. PRD 必须覆盖的产品边界

- S6 目标：向家长发送脱敏、简洁、可解释的日报、周报、月报和考前提醒。
- 数据来源：课程、考试、任务、StudyEvent、资料处理状态、知识模块、练习结果、错题/薄弱点、T05 回流后的 `error_review` 任务。
- 报告边界：不得包含资料原文、笔记正文、完整题干、完整答案、学生作答、聊天内容、真实渠道地址或完整 UUID。
- 规则优先：规则报告必须可独立生成；AI 只做摘要或润色增强；AI 失败时保留规则报告。
- 渠道边界：QQ SMTP 与飞书 Webhook 留给 T06B；PRD 只定义需求，不写实现。
- 本地优先：不做家长 Web 面板、远程登录、公网入口、云同步、移动端 App 或家长独立账号。

## 4. 非目标

- 不新增业务代码、API、数据库 Schema、shared 类型、Worker、调度器或前端页面。
- 不实现 SMTP、飞书 Webhook、报告生成 Service 或真实 Provider smoke。
- 不触碰 S5、S7、Phase 3 或历史正式运行数据。
- 不提交 API Key、SMTP 授权码、Webhook URL、资料原文、完整 UUID 或家长渠道地址。

## 5. 验证

必须运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
git diff --cached --check
```

由于本轮只改文档和 `.plans`，默认不运行 `pnpm type-check`、后端构建、前端构建或 `pnpm test`。若实际改动超出文档范围，则按 `docs/12-开发规范-Dev-Rules.md` 补跑代码验证矩阵。

## 6. 独立自审清单

- [x] S6 PRD 已在 `docs/00` 登记为有效文档。
- [x] `docs/04` 只勾选 T06 PRD 两项，不勾选 T06A/T06B。
- [x] PRD 明确隐私边界、AI 降级、渠道失败隔离和去重需求。
- [x] PRD 未把概念需求落成代码、Schema、API 或环境变量。
- [x] 验证命令通过后再提交。
