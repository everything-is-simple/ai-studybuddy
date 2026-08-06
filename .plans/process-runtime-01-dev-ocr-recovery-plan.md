# 开发环境重启与 OCR 运行时恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用仓库外隔离目录和明确的 Python 解释器恢复开发机可重复运行环境，并形成可自动复验的 RapidOCR smoke。

**Architecture:** `.env.local` 只保存开发机路径且不提交；OCR Python 包由 `packages/backend/requirements-ocr.txt` 声明，smoke 通过 PowerShell 驱动真实 `ocr-worker.py` 子进程并把输入、缓存和证据写入仓库外运行目录。S7/ASR 不进入本工作包。

**Tech Stack:** PowerShell 7/Windows PowerShell、Python 3.10、RapidOCR ONNX Runtime、Node.js/pnpm。

---

### Task 1: 固化 OCR 依赖契约

**Files:**

- Create: `packages/backend/requirements-ocr.txt`
- Modify: `.env.example`
- Test: `packages/backend/test/ocr-runtime-contract.test.mjs`

- [ ] **Step 1: 写失败测试**：断言依赖清单存在、仅包含允许的运行依赖且固定 `rapidocr-onnxruntime` 版本；断言 `.env.example` 提供 `PYTHON_PATH`、`OCR_TIMEOUT_MS`、`OCR_CACHE_ROOT` 的安全占位，不含盘符。
- [ ] **Step 2: 运行 `pnpm --filter @ai-studybuddy/backend test -- ocr-runtime-contract` 并确认因文件缺失失败。**
- [ ] **Step 3: 创建最小依赖清单和脱敏环境模板。**
- [ ] **Step 4: 重跑专项测试并确认通过。**

### Task 2: 创建可重复 OCR smoke

**Files:**

- Create: `scripts/test-ocr-runtime.ps1`
- Test: `packages/backend/test/ocr-runtime-script.test.mjs`

- [ ] **Step 1: 写失败测试**：静态验证脚本强制接收 Python、运行根目录，覆盖中文图、空白图、不存在路径、损坏图、超时、逐行 JSON 解析和 finally 清理，并拒绝仓库内运行根目录。
- [ ] **Step 2: 运行专项测试确认脚本尚不存在而失败。**
- [ ] **Step 3: 实现脚本**：生成合成 PNG、调用 Worker、记录脱敏 JSON 摘要，使用 `RAPIDOCR_HOME`/模型缓存目录，结束时删除临时输入；超时通过受控短超时子用例验证并终止进程树。
- [ ] **Step 4: 使用 `D:\miniconda\py310\python.exe` 安装依赖并运行真实 smoke。**
- [ ] **Step 5: 验证仓库内无模型缓存、图片和运行证据。**

### Task 3: 恢复开发机配置与基线

**Files:**

- Local-only modify: `H:\ai-studybuddy\.env.local`
- Runtime create: `H:\ai-studybuddy-runtime\runs\local-dev-20260723-001`, `logs`, `tmp`, `backups`

- [ ] **Step 1: 仅在原开发工作树写入批准的 `.env.local` 值，不提交、不复制秘密。**
- [ ] **Step 2: 创建仓库外目录并验证可写。**
- [ ] **Step 3: 在隔离 `APP_DATA_ROOT` 下运行 type-check、双端 build、全量 test。**
- [ ] **Step 4: E2E 改用 `H:\ai-studybuddy-tmp\runs\...`，满足 Playwright 强制隔离规则。**
- [ ] **Step 5: 提交依赖契约、脚本和自动测试，不提交 `.env.local`、缓存或证据。**
