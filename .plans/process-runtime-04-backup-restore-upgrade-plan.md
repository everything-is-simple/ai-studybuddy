# 数据备份恢复与升级回滚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SQLite 全局库、学期库和 materials 提供停止服务后的可验证备份、非破坏性恢复及升级回滚边界。

**Architecture:** 备份使用 staging + manifest + SHA-256 后原子改名，内容仅来自 `data` 白名单；恢复先验证 manifest/hash，再给当前数据创建 recovery-point，最后复制到新 staging 并切换。密钥、日志、tmp、cache、models 不进入普通备份。

**Tech Stack:** PowerShell、SQLite 文件布局、SHA-256、JSON manifest。

---

### Task 1: 备份脚本

**Files:**
- Create: `scripts/backup-data.ps1`
- Test: `packages/backend/test/data-backup-script.test.mjs`

- [ ] **Step 1: 写失败测试**：构造假全局库、学期库、materials、秘密/日志/tmp，断言仅白名单进入备份，manifest 含版本、相对路径、大小、hash，运行中 PID 会拒绝备份。
- [ ] **Step 2: 实现 staging、hash、只读标记和失败清理。**
- [ ] **Step 3: 运行专项测试并检查源数据未修改。**

### Task 2: 恢复与数据库预检

**Files:**
- Create: `scripts/restore-data.ps1`
- Create: `scripts/test-data-integrity.ps1`
- Test: `packages/backend/test/data-restore-script.test.mjs`

- [ ] **Step 1: 写失败测试**：覆盖有效恢复、hash 不符拒绝、路径穿越拒绝、当前数据 recovery-point、失败后源数据保留、materials 完整性。
- [ ] **Step 2: 实现只读预检和显式 `-ConfirmRestore` 门禁。**
- [ ] **Step 3: 执行备份→修改→恢复→健康/数据库初始化 smoke。**

### Task 3: 家长报告计划任务适配

**Files:**
- Modify: `scripts/register-parent-report-task.ps1`
- Modify: `scripts/unregister-parent-report-task.ps1`
- Test: `packages/backend/test/parent-report-scheduler-script.test.mjs`

- [ ] **Step 1: 扩展失败测试**：命令指向当前安装版本、当前用户数据目录，默认不注册，要求显式启用；不硬编码开发机路径，不删除学习数据。
- [ ] **Step 2: 最小修改脚本参数和任务 action；保持当前用户身份与既有默认调度时间。**
- [ ] **Step 3: 使用 `-WhatIf`/XML 或 dry-run 验证，不发送真实报告。**
