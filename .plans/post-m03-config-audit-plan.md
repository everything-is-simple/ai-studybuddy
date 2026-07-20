# Post-M03 Configuration Audit and Secret Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 审计并统一系统配置来源，确保设置页只以脱敏摘要识别已配置渠道，同时为当前页面内新输入的假秘密提供默认遮挡、可显隐且刷新复位的安全交互。

**Architecture:** 后端继续保持 `DPAPI active > environment fallback > unconfigured`，配置状态 API 只返回白名单摘要；不新增秘密读取接口，也不把秘密写入 SQLite 或浏览器存储。所有后端环境变量读取集中到 `packages/backend/src/config/env.ts`，设置页用局部 React 状态控制新输入值的 `password/text` 类型，已保存值仍不可回显。

**Tech Stack:** TypeScript、Express、React、Vitest、Node test runner、Playwright、pnpm、PowerShell。

---

### Task 1: 配置来源和优先级审计

**Files:** `.env.example`、`packages/backend/src/config/env.ts`、DOCX/PPTX converter、`docs/10-后端开发规范-Backend-Guidelines.md`、后端配置测试。

- [x] 写源码治理失败测试：只有 `config/env.ts` 可直接读取 `process.env`。
- [x] 运行后端目标测试，确认因 DOCX/PPTX converter 越过统一入口而失败。
- [x] 在 `env.ts` 导出按调用读取的 DOCX/PPTX ZIP 限额函数，保持测试可动态设置阈值。
- [x] 在 `.env.example` 和 `docs/10` 登记八个 ZIP 限额变量、`.env.local` 搜索顺序、进程环境覆盖关系，以及 `DPAPI active > environment fallback` 优先级。
- [x] 运行配置治理、runtime fallback、DOCX/PPTX 测试，确认只使用假值与 `example.invalid`。

### Task 2: 设置页敏感输入显隐和安全摘要

**Files:** `packages/frontend/src/pages/settings-page.tsx`、`packages/frontend/test/settings-page.test.tsx`、`e2e/settings-provider-presets.spec.ts`。

- [x] 写前端失败测试：官方/自定义 Provider、SMTP 授权码和飞书 Webhook 默认 `password`，点击显示后仅当前输入框为 `text`，隐藏后恢复。
- [x] 写重新挂载/刷新失败测试：输入清空、默认遮挡，`localStorage` 与 `sessionStorage` 均无秘密写入。
- [x] 运行目标测试并确认因没有显示/隐藏按钮而失败。
- [x] 新增只使用组件 state 的 `SecretInput`，为显示/隐藏按钮提供明确可访问名称。
- [x] 保持已保存配置只显示 `•••••••• 已保存，不可回显`，不新增后端秘密回读。
- [x] 回归 Provider 分组、中转站、Claude“后续适配”、QQ SMTP 首屏三项、飞书首屏单项和失败切换说明。

### Task 3: 全量自动化与浏览器验收

**Files:** `docs/04-开发任务清单-Todo-List.md`；仓库外证据目录 `I:\ai-studybuddy-tmp\runs\post-m03-config-audit\playwright`。

- [x] 依次运行 `pnpm type-check`、后端 build、前端 build、`pnpm test`、`pnpm test:e2e`、文档治理和 `git diff --check`。
- [x] 使用真实本地 Express/Vite + Playwright 路由 mock 验证 sentinel 显隐、刷新遮挡、配置摘要、Provider 列表和浏览器存储。
- [x] 截图与 HTML 报告只写仓库外运行目录；连接测试按钮只命中 Playwright 路由 mock，不发送外部请求。
- [x] 自审 `git diff`、变量名单、秘密边界和测试退出码，并在 `docs/04` 登记证据。

### Task 4: 提交、推送与主线集成

- [ ] 使用 `fix(settings): 完善配置来源审计与敏感信息展示` 提交任务分支。
- [ ] 推送 `codex/post-m03-config-audit`。
- [ ] 在另一个独立干净 master 集成 worktree 中 `pull --ff-only`、rebase 任务分支并 `merge --ff-only`；不操作主仓工作区。
- [ ] 在 master 集成 worktree 重跑验证矩阵，确认远端未漂移后推送 `origin/master`。
- [ ] 记录最终提交哈希、退出码、截图/报告路径和安全确认。
