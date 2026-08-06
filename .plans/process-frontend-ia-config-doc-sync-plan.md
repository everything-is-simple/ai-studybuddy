# 本机配置中心文档同步实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenDesign 图形界面研究及本机配置中心的安全、测试和启动门禁写入权威文档，防止后续实现遗漏或误把秘密保存到浏览器。

**Architecture:** 本轮只更新研究、架构、前后端规范、索引和任务清单。配置中心登记为 Phase 1-T08 候选工作包，排在当前 T07 之后并继续要求独立计划、审查和用户批准。

**Tech Stack:** Markdown、PowerShell 文档治理脚本、Git diff 检查。

---

### Task 1: 固化产品与安全边界

**Files:**

- Modify: `docs/15-前端信息架构与界面范围研究-Frontend-Information-Architecture.md`
- Modify: `docs/08-共同底座架构-Architecture.md`
- Modify: `docs/10-后端开发规范-Backend-Guidelines.md`
- Modify: `docs/11-前端开发规范-Frontend-Guidelines.md`

- [x] **Step 1:** 在界面研究文档写清首次启动向导、配置中心分区、四态状态、测试动作和功能降级。
- [x] **Step 2:** 在架构文档登记普通设置与秘密分离、Windows 用户级加密存储、后端动态配置快照和 `.env.local` 兼容边界。
- [x] **Step 3:** 在后端规范登记秘密永不回传、内存测试后原子激活、固定脱敏错误和真实渠道测试必须显式触发。
- [x] **Step 4:** 在前端规范登记密码输入、掩码状态、不可回显、测试按钮、状态反馈和禁止 `localStorage` 保存秘密。

### Task 2: 登记后续任务而不改变当前门禁

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify: `docs/00-文档索引-Index.md`

- [x] **Step 1:** 在 Phase 1 路线图中新增 T08“本机配置中心与连接验收”，明确 T07 仍是当前下一门禁。
- [x] **Step 2:** 在索引版本历史登记本次研究和配置中心边界同步。
- [x] **Step 3:** 不勾选 T07/T08 实现项，不声称配置中心已实现。

### Task 3: 验证与交付

**Files:**

- Verify: `.plans/process-frontend-ia-config-doc-sync-plan.md`
- Verify: `docs/00-文档索引-Index.md`
- Verify: `docs/04-开发任务清单-Todo-List.md`
- Verify: `docs/08-共同底座架构-Architecture.md`
- Verify: `docs/10-后端开发规范-Backend-Guidelines.md`
- Verify: `docs/11-前端开发规范-Frontend-Guidelines.md`
- Verify: `docs/15-前端信息架构与界面范围研究-Frontend-Information-Architecture.md`

- [x] **Step 1:** 运行 `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`，预期通过。
- [x] **Step 2:** 运行 `git diff --check`，预期无空白错误。
- [x] **Step 3:** 精确暂存授权文档后运行 `git diff --cached --check`，预期无空白错误。
- [x] **Step 4:** 提交 `docs(process): 固化本机配置中心与界面边界`；不包含 `.od-skills/`。

## 非目标

- 不实现 `ConfigurationService`、设置 API、DPAPI Adapter、连接测试服务或前端设置页面。
- 不发送真实 AI、QQ SMTP、飞书 Webhook 请求，不注册真实 Windows 计划任务。
- 不改变当前下一门禁 T07，不提前批准或完成 T08、S5、S7、Phase 3。
