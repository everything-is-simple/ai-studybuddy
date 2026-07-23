# 使用机器 Bootstrap 与安装检查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Windows 使用机器提供受控目录/venv 初始化、生产启停和完全只读的安装检查，不依赖开发机盘符。

**Architecture:** 所有脚本默认根目录为 `%LOCALAPPDATA%\AIStudyBuddy`，也允许测试传入 `-InstallRoot`。bootstrap 是唯一可创建目录/venv/配置模板的入口；check-installation 只读；start 写 PID/日志，stop 只终止 PID 文件指向且命令行匹配安装根的进程。

**Tech Stack:** PowerShell、Node.js、Python venv、Windows DPAPI 既有配置中心。

---

### Task 1: 共享部署脚本库

**Files:**
- Create: `scripts/lib/AIStudyBuddy.Deployment.psm1`
- Test: `packages/backend/test/windows-deployment-scripts.test.mjs`

- [ ] **Step 1: 写失败测试**：校验默认目录、回环 host、语义版本检查、可写探针、端口探测、PID 安全校验和秘密文件扫描均通过参数实现且不含硬编码盘符。
- [ ] **Step 2: 实现纯函数和只读探测函数，输出结构化对象。**
- [ ] **Step 3: 运行 Pester 不作为前置依赖；由 Node 测试启动 PowerShell 验证函数输出。**

### Task 2: Bootstrap

**Files:**
- Create: `scripts/bootstrap-runtime.ps1`
- Create: `deployment/runtime-compatibility.json`
- Create: `deployment/.env.production.example`
- Test: `packages/backend/test/bootstrap-runtime-script.test.mjs`

- [ ] **Step 1: 写失败测试**：在临时 LOCALAPPDATA 下 `-WhatIf`/测试模式验证目录规划、venv 路径、配置不覆盖、Node/Python 范围和无秘密默认值。
- [ ] **Step 2: 实现目录创建、Python venv、锁定依赖安装、配置模板生成和兼容性清单落盘；不复制 Conda、cache、model。**
- [ ] **Step 3: 在隔离临时根执行 bootstrap 并验证幂等。**

### Task 3: 启停与只读检查

**Files:**
- Create: `scripts/start-production.ps1`
- Create: `scripts/stop-production.ps1`
- Create: `scripts/check-installation.ps1`
- Test: `packages/backend/test/production-lifecycle-scripts.test.mjs`

- [ ] **Step 1: 写失败测试**：start 前置检查 Node、数据目录、migration、Python/import、端口和权限；stop 不按端口滥杀；check 只读且检查 Windows/运行时/目录/OCR/DB/health/端口/任务/配置/秘密/E2E 数据根误用。
- [ ] **Step 2: 实现脚本，日志只记录错误码和脱敏摘要；后端 host 强制 `127.0.0.1`。**
- [ ] **Step 3: 在临时安装根完成启动、健康检查、深链访问、停止和重复停止。**
