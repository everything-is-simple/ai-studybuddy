# PROCESS-RUNTIME-DEPLOY 证据记录（2026-07-23）

分支/worktree：

- Worktree：`H:\ai-studybuddy\.worktrees\process-runtime-deployment`
- 分支：`codex/process-runtime-deployment`
- 基线：`origin/master`
- 主仓库原 G2 分支 `codex/phase1-5-g2-wsl-isolation-exec` 未提交 `packages/backend/src/services/semester-access-service.ts` 未覆盖。

## 已完成证据

### 1. 部署包 20260723-3（中间包）

命令：

```powershell
$out='H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-3'
.\scripts\build-deployment-package.ps1 -OutputRoot $out
```

结果：

- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-3`
- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-3.zip`
- 关键文件存在：`app\backend\server.js`、`app\backend\package.json`、`app\backend\package-lock.json`、`app\shared\index.js`、`app\requirements-ocr.txt`、`scripts\bootstrap-runtime.ps1`、`scripts\start-production.ps1`、`scripts\stop-production.ps1`、`scripts\check-installation.ps1`、`scripts\run-parent-report-task.ps1`、`deployment\runtime-compatibility.json`、`README-Windows.md`。
- 排除扫描通过：未发现 `node_modules`、`.env.local`、`.git`、`logs`、`tmp`、`models`。

注：该包为中间包；最终提交使用 20260723-4。


### 1b. 最终部署包 20260723-4

命令：

```powershell
$out='H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-4'
.\scripts\build-deployment-package.ps1 -OutputRoot $out
```

结果：

- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-4`
- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-4.zip`
- 关键文件存在：`app\backend\server.js`、`app\backend\package.json`、`app\backend\package-lock.json`、`app\shared\index.js`、`app\requirements-ocr.txt`、`scripts\bootstrap-runtime.ps1`、`scripts\start-production.ps1`、`scripts\stop-production.ps1`、`scripts\check-installation.ps1`、`scripts\run-parent-report-task.ps1`、`deployment\runtime-compatibility.json`、`README-Windows.md`。
- 排除扫描通过：未发现 `node_modules`、`.env.local`、`.git`、`logs`、`tmp`、`models`。
- `scripts\bootstrap-runtime.ps1` 已包含 `npm ci --omit=dev` 3 次重试提示：`Installing production Node dependencies (attempt $attempt/3)...`。
- bootstrap 最终失败信息会明确指出 `better-sqlite3` 等 native dependency 需要匹配的 prebuilt 下载或 Visual Studio C++ Build Tools fallback，并提示使用 `deployment/runtime-compatibility.json` 中验证过的运行时。

### 2. 全新安装根 bootstrap

命令：

```powershell
.\scripts\bootstrap-runtime.ps1 `
  -InstallRoot 'H:\ai-studybuddy-runtime\install-test-20260723-3' `
  -AppSource 'H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-3\app' `
  -PythonPath 'D:\miniconda\py310\python.exe'
```

结果：

- Node 依赖：`added 199 packages in 1m`
- OCR venv：`H:\ai-studybuddy-runtime\install-test-20260723-3\runtime\venv\Scripts\python.exe`
- Python：`Python 3.10.19 x64`
- RapidOCR 依赖安装成功。
- 输出：`No AI/SMTP/Feishu secret was created or copied.`

前一次 `install-test-20260723-2` 曾因 `prebuild-install read ECONNRESET` 触发 `better-sqlite3` fallback 编译并因缺少 Visual Studio C++ Build Tools 失败；已增强 bootstrap 为 npm ci 3 次重试并给出可操作错误。

### 3. 安装检查

命令：

```powershell
.\scripts\check-installation.ps1 -InstallRoot 'H:\ai-studybuddy-runtime\install-test-20260723-3'
```

结果：exit 0。

- pass：windows、node `v25.4.0`、runtime-config、loopback-host `127.0.0.1`、data-root-config、frontend-static-root、python `Python 3.10.19; x64`、ocr-worker、目录 ACL 只读探测、backend/frontend/ocr-script/node-lock/node-dependencies、secure-config-state、secret-files、plain-secret-config、e2e-isolation。
- 预期 warn：服务未启动、无数据库、家长报告未注册。

### 4. 生产启动/停止 smoke

命令：

```powershell
.\scripts\start-production.ps1 -InstallRoot 'H:\ai-studybuddy-runtime\install-test-20260723-3'
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-WebRequest http://127.0.0.1:3000/
Invoke-WebRequest http://127.0.0.1:3000/courses/spa-fallback-check
Invoke-WebRequest http://127.0.0.1:3000/api/unknown-runtime-check -SkipHttpErrorCheck
.\scripts\stop-production.ps1 -InstallRoot 'H:\ai-studybuddy-runtime\install-test-20260723-3'
```

结果：

- 启动：`AI StudyBuddy running at http://127.0.0.1:3000`，PID `10532`。
- 端口：`127.0.0.1:3000 Listen PID 10532`。
- Health：`{ "success": true, "data": { "version": "0.8.0", "timestamp": "2026-07-23T17:35:51.725Z" } }`。
- `/`：200 HTML，含 `<div id="root">`。
- `/courses/spa-fallback-check`：200 HTML，含 `<div id="root">`。
- `/api/unknown-runtime-check`：404 JSON `{"success":false,"error":{"code":"NOT_FOUND","message":"API route not found"}}`。
- 停止：`Stopped AI StudyBuddy backend PID 10532. User data was not deleted.`，停止后 127.0.0.1:3000 无监听，PID 文件删除。

### 5. OCR smoke

命令：

```powershell
& 'H:\ai-studybuddy-runtime\install-test-20260723-3\app\scripts\test-ocr-runtime.ps1' `
  -PythonPath 'H:\ai-studybuddy-runtime\install-test-20260723-3\runtime\venv\Scripts\python.exe' `
  -RuntimeRoot 'H:\ai-studybuddy-runtime\install-test-20260723-3'
```

结果：

- `OCR_IMPORT_OK`
- `Repository OCR converter timeout/cleanup test not present; worker smoke completed.`
- `OCR smoke passed with 人工智能学习助手`

### 6. 备份/恢复 smoke

安装根：`H:\ai-studybuddy-runtime\install-test-20260723-3`；恢复根：`H:\ai-studybuddy-runtime\restore-smoke-20260723-3`。

结果：

- 备份：`H:\ai-studybuddy-runtime\install-test-20260723-3\backups\backup-smoke-20260723-174043`
- `Files: 3`
- backup integrity：`Integrity files: 5`、`Zero-byte files: 0`、`Manifest hashes verified: 3`
- restore WhatIf：`WhatIf: restore validated; no data changed.`
- actual restore：`Restore completed ...`，`Recovery point retained at: H:\ai-studybuddy-runtime\restore-smoke-20260723-3\backups\recovery-20260723-174043`
- restored integrity：`Integrity files: 3`、`Zero-byte files: 0`
- payload 白名单：`studybuddy.db`、`semesters\smoke-semester-20260723-3\semester.db`、`semesters\smoke-semester-20260723-3\materials\synthetic-note.txt`

### 7. 家长报告任务链测试

命令：

```powershell
pnpm --filter backend exec node --test test/parent-report-scheduler-script.test.mjs
```

结果：2/2 pass。

- 注册脚本通过部署 wrapper 运行，含每日 22:30、登录补发和 StartWhenAvailable。
- wrapper 校验运行根和回环监听，只调用部署包内已编译 runner。


### 8. 完整验证与 E2E

隔离运行目录：

- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-tests-20260723`
- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-e2e-20260723`

命令与结果：

```powershell
$env:APP_DATA_ROOT='H:\ai-studybuddy-tmp\runs\process-runtime-deployment-tests-20260723'
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

结果：全部退出码 0；后端全量测试 `242/242 pass`。

E2E 首次运行发现新系统缺少 Playwright Chromium：`chrome-headless-shell.exe` 不存在；按提示执行：

```powershell
pnpm exec playwright install chromium
```

随后重跑：

```powershell
$env:APP_DATA_ROOT='H:\ai-studybuddy-tmp\runs\process-runtime-deployment-e2e-20260723'
pnpm test:e2e
```

结果：`21 passed (41.7s)`。

### 9. 最终部署包 20260723-6 与新安装 smoke

因全量测试暴露 `adapters/converter.ts` 直接读取 `process.env`，已将 OCR Worker 子进程环境构造集中到 `config/env.ts`，并回归 `config-source-governance.test.mjs` 与 `ocr-converter-runtime.test.mjs`。因 OCR smoke 脚本成功后保留 `$LASTEXITCODE=1`，已在成功路径归零并回归。

最终包：

- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-6`
- `H:\ai-studybuddy-tmp\runs\process-runtime-deployment-package-20260723-6.zip`

结果：关键文件扫描通过；未发现 `node_modules`、`.env.local`、`.git`、`logs`、`tmp`、`models`。

使用 `20260723-5` 新安装根验证最终后端代码与运行链路：

- 安装根：`H:\ai-studybuddy-runtime\install-test-20260723-5`
- bootstrap：`npm ci --omit=dev` 第 1 次成功，安装 199 个生产 Node 包；Python venv 为 `runtime\venv\Scripts\python.exe`；RapidOCR 依赖安装成功；未创建或复制 AI/SMTP/Feishu 密钥。
- check-installation：exit 0；服务未启动、无数据库、家长报告未注册均为预期 warn。
- start/stop smoke：`http://127.0.0.1:3000/api/health` 成功，`/` 与 SPA fallback 返回 HTML，未知 `/api` 返回 JSON 404；停止后删除 PID 且不删除用户数据。
- 包内 `scripts\test-ocr-runtime.ps1`：`OCR_IMPORT_OK`，`OCR smoke passed with 人工智能学习助手`，最终 `$LASTEXITCODE=0`。

### 10. 备份/恢复 smoke（20260723-5 安装根 + 20260723-6 脚本）

合成数据：

- `data\studybuddy.db`
- `data\semesters\smoke-semester-20260723-5\semester.db`
- `data\semesters\smoke-semester-20260723-5\materials\synthetic-note.txt`
- 排除样本：`tmp\should-not-backup.tmp`、`config\.env`

结果：

- 备份：`H:\ai-studybuddy-runtime\install-test-20260723-5\backups\backup-smoke-20260723-5`
- `Files: 3`
- backup integrity：`Integrity files: 5`、`Zero-byte files: 0`、`Manifest hashes verified: 3`
- restore WhatIf：验证通过且不改数据
- actual restore：恢复到 `H:\ai-studybuddy-runtime\restore-smoke-20260723-5`
- restored integrity：`Integrity files: 3`、`Zero-byte files: 0`
- 恢复文件白名单：`studybuddy.db`、`semesters\smoke-semester-20260723-5\semester.db`、`semesters\smoke-semester-20260723-5\materials\synthetic-note.txt`
- 排除样本未进入备份 payload。

## 仍需完成

- 提交任务分支，rebase 到最新 master，fast-forward 合入后主线复验并推送 origin/master。
- 更新 docs/04 任务状态和主线最终证据。
