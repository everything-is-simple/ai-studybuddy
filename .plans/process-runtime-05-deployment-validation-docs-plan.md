# 全新机器验收与部署文档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 形成不含秘密和运行数据的 Windows 部署包、完整验收矩阵与可追溯的新鲜证据。

**Architecture:** `build-deployment-package.ps1` 从生产装配输出和白名单脚本/文档生成版本目录及 manifest，所有排除项由自动测试固定。部署文档说明 bootstrap、配置、启停、备份恢复、升级回滚和任务计划；验收证据只记录命令、版本、计数和脱敏结果。

**Tech Stack:** PowerShell、pnpm、Playwright、Markdown 文档治理。

---

### Task 1: 部署包构建

**Files:**

- Create: `scripts/build-deployment-package.ps1`
- Create: `deployment/README-Windows.md`
- Test: `packages/backend/test/deployment-package-script.test.mjs`

- [ ] **Step 1: 写失败测试**：白名单包含编译后端/前端、shared 资产、OCR Worker/requirements、启停/检查/备份/恢复脚本、模板和兼容性清单；黑名单排除 `.git`、`node_modules`、env local、数据库、秘密、日志、缓存、Playwright 证据。
- [ ] **Step 2: 实现 staging、manifest/hash 与原子输出。**
- [ ] **Step 3: 构建包并扫描路径和高风险秘密模式。**

### Task 2: 文档同步

**Files:**

- Modify: `docs/00-文档索引-Index.md`
- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify: `docs/06-本地目录治理-Dev-Environment.md`
- Modify: `docs/08-共同底座架构-Architecture.md`
- Modify: `docs/09-测试验收计划-Test-Plan.md`
- Create: `docs/16-Windows使用机器部署与运维-Windows-Deployment-Operations.md`

- [ ] **Step 1: 依据实现事实写目录边界、运行时版本、配置/密钥、启停、备份恢复、升级回滚、任务计划和排障。**
- [ ] **Step 2: 明确 S7/G2 证据与产品部署分离，Docker/WSL 非使用机器常驻依赖。**
- [ ] **Step 3: 更新索引和 docs/04 状态/证据，运行文档治理。**

### Task 3: 完整验收与主线收口

**Files:**

- Create: `.plans/evidence/process-runtime-deployment-20260723.md`

- [ ] **Step 1: 分支运行 type-check、双端 build、全量 test、完整 E2E（`H:\ai-studybuddy-tmp\runs\...`）、OCR smoke、生产启停、安装检查、部署包扫描、备份恢复。**
- [ ] **Step 2: 记录版本、命令、退出码、测试计数与边界，不记录秘密/资料原文。**
- [ ] **Step 3: 独立自审后修复并回归；运行 docs governance 与 `git diff --check`。**
- [ ] **Step 4: rebase 最新 master、fast-forward 合入、主线重复同范围验证并推送 `origin/master`。**
