# PROCESS-RUNTIME-DEPLOY-06 PowerShell 兼容与部署验收证据

**日期**：2026-07-24
**状态**：整改进行中；本文件只记录已完成的局部验收，不宣告 DEPLOY-01–06 或 Phase 2.5 完成。

## 已通过的新增证据（2026-07-24）

- PowerShell 5.1 兼容性专项：`node --test packages/backend/test/deployment-powershell-compatibility.test.mjs` 为 **6/6 passed**。部署脚本不再用 `python -c` 或 `node -e` 传入源码；`Path.GetRelativePath` 已替换为共享兼容 helper。
- 受控验证组合：Node `v24.14.0`、Python `3.10.19 x64`、`rapidocr-onnxruntime 1.4.4`。支持门禁为 Node 20/22/24 LTS，Node 25 被 bootstrap/start/check 拒绝。
- 标准质量门禁：`pnpm type-check`、后端 build、前端 build 均通过；`pnpm test` 为 backend **248/248 passed**（本次先以 Node 24 重建本 worktree 的 `better-sqlite3`，解决 Node 25 ABI 141 与 Node 24 ABI 137 不匹配的本机依赖残留）。
- 无 AI 配置 E2E：2026-07-24 在新的隔离根 `H:\ai-studybuddy-tmp\runs\deploy06-final-e2e-20260724-001` 复跑 `pnpm test:e2e`，为 **21/21 passed**；Playwright 明确置空 AI 配置，因此证明的是离线确定性学生主线，而非真实 AI 调用。
- OCR：源码 Converter runtime 测试 **2/2 passed**（超时终止和临时输入清理）；真实 Worker smoke 覆盖中文“人工智能学习助手”、空白、损坏、不存在路径、JSON 输出和 `tmp\ocr-smoke` finally 清理。
- r2 独立安装根：`check-installation`、生产 start/stop/restart、`/api/health`、静态首页、SPA fallback、未知 API 404、仅 `127.0.0.1` 监听和最小数据持久化均通过。安装检查的全局 migration `2/2`、学期 migration `9/9`、SQLite `quick_check`、OCR import、生产依赖、静态前端、loopback、无明文密钥和 E2E 根误用检查均为 pass；未运行服务/未注册计划任务是预期 warn。
- 备份/恢复：合成 SQLite 与 `materials/` 哨兵的 hash manifest、只读备份、恢复、恢复前 recovery point 和资料恢复均通过；新增隔离 migration 不兼容故障注入：global schema version 999 使生产启动 exit 1，且无 PID/端口残留；恢复验证过的只读备份后回到 version 2、数据文件可写、health 成功。发现并修复 restore 复制只读备份 payload 后保留 `IsReadOnly` 的 P1：恢复脚本现在逐文件清除只读属性，专项回归为 6/6 passed。备份不含 config、logs、tmp、models、backups 或密钥路径。
- r3/r4 部署包均成功生成；r4 额外确认包含恢复后清除只读属性的修复与 RuntimeChecks helpers，包扫描确认排除 `.git`、`node_modules`、`.env.local`、真实数据、凭据、日志、临时文件、模型、WSL venv 和 Playwright 证据。
- 隔离完整 app 目录回滚演练：保留整个旧 `app` 目录，激活仅替换 `backend/server.js` 的合成失败候选，启动 exit 1 且无 PID/监听；切回保留的完整 app 后 health 成功、停止清理完成。失败候选保留供检查。此证据验证回退步骤，不宣称已完成真实版本升级。

## 当前阻断与未完成（不得提前勾选）

- 系统默认 `C:\Program Files\nodejs\node.exe` 是 Node `v25.4.0`，不属于产品支持范围；已通过的 Node 24 来自临时受控验证 PATH，不能作为使用机器部署前置依赖。需要安装并持久化同源 Node 20/22/24 LTS + npm。
- r3 全新安装根 bootstrap 实测失败：better-sqlite3 的 Node 24 预编译下载三次超时，后续 node-gyp 因缺少 Visual Studio C++ Build Tools 失败。不得把 r2 结果误写成 r3 新根 bootstrap 成功；不能复制 `node_modules` 绕过。
- parent-report 实际注册返回 `0x80070005 Access is denied`；失败前后均未留下测试任务，`-WhatIf` 路径通过。须在具有当前用户任务计划注册权限的环境完成实际 register/inspect/unregister。
- migration 不兼容故障注入、备份恢复和隔离完整 app 目录的合成候选回滚已验证；独立使用机器或真正等价的受控新用户环境验收仍尚未完成。
- 文档治理、diff、rebase、fast-forward 合入 master、master 复验与 `origin/master` 推送尚未开始；在这些门禁及上述阻断解除前，不能报告 DEPLOY-01–06 或 Phase 2.5 完成。

## 新发现并修复的 P0

Windows PowerShell 5.1 的 .NET Framework 不提供 `[System.IO.Path]::GetRelativePath`，导致 backup 首次真实运行失败。已改为共享 `Get-AIStudyBuddyRelativePath` helper，并重新打包、全新 bootstrap 与备份恢复复验。

## 开发机重启现场证据（2026-07-24，部分完成）

- 仅修改主 G2 工作区中 Git 忽略的 `.env.local`：`APP_DATA_ROOT` 切换到新的仓库外开发运行根，`PYTHON_PATH` 明确为 `D:\miniconda\py310\python.exe`；同时创建 `runs/local-dev-20260723-001`、`logs`、`tmp`、`backups`。未触碰未提交的 `packages/backend/src/services/semester-access-service.ts`。
- 初次标准 `pnpm` 启动暴露两项迁移残留：旧 `H:\.pnpm-store` 读取拒绝与包级启动器仍引用已不存在的 `I:\ai-studybuddy`。没有删除该机器级旧 store；将已验证为 Git 忽略的旧工作区 `node_modules` 移至仓库外 quarantine 后，以新的外部开发缓存执行 `pnpm install --frozen-lockfile --store-dir <external-cache>` 成功（537 packages，`better-sqlite3` 安装成功）。新后端/前端启动器均无旧 `I:\ai-studybuddy` 引用。
- 以受支持 Node `v24.14.0`（临时验证 PATH）运行标准 `pnpm --filter @ai-studybuddy/backend run dev` 和 `pnpm --filter @ai-studybuddy/frontend run dev -- --host 127.0.0.1 --port 5173`：`GET /api/health` 为 HTTP 200，Vite 首页为 HTTP 200、标题 `AI StudyBuddy`，3000/5173 均只监听 `127.0.0.1`。
- **未完成/不作完成结论**：系统全局 `C:\Program Files\nodejs\node.exe` 仍是不受支持的 Node `v25.4.0`；本次 Node 24 来自受控验证运行时，尚未完成面向开发机用户的受支持 Node 20/22/24 安装与持久化选择。因此 DEPLOY-01 继续为“整改中”，不能用本证据替代全量 build/test/E2E 或使用机器验收。

## PowerShell 7 最终 r2 包复验（2026-07-24，已通过）

- 独立测试根：`H:\ai-studybuddy-runtime\install-ps7-final-r2-20260724-001`，不复用 PowerShell 5.1、备份恢复或含合成资料的安装根；仅用受控 Node `v24.14.0` 和 `D:\miniconda\py310\python.exe`。
- 初次全新 bootstrap 已实际完成 Node 生产依赖、隔离 venv、`rapidocr-onnxruntime==1.4.4`、`production.env` 和部署脚本复制。外层执行器在 10 分钟后未回显返回，但安装根随后存在全部后置产物；以 `-SkipNodeInstall -SkipOcrInstall` 的幂等 PowerShell 7 bootstrap 明确返回 `Bootstrap ready`，并再次确认未复制 AI/SMTP/飞书密钥。
- `check-installation.ps1`：Windows、Node 24、Python 3.10 x64、OCR import、运行目录、生产依赖、静态资源、回环配置、无明文密钥、正式数据根非 E2E 根均为 `pass`。未启动服务/未初始化数据库/未注册家长任务以预期 `warn` 展示，没有伪造通过。
- `test-ocr-runtime.ps1 -RuntimeRoot <root> -PythonPath <venv-python>`：中文输出“人工智能学习助手”；空白、损坏和不存在输入均通过；`tmp/ocr-smoke` 在 finally 后不存在。部署包不携带仓库级 Converter timeout/cleanup 测试，因此脚本正确报告该测试不在包内；该源码专项验收仍单独保留。
- `start-production.ps1`：`/api/health` 200、静态首页 200、SPA 深链 `/exam-workbench` 200、未知 API 404，唯一监听为 `127.0.0.1:3000`。`stop-production.ps1` 后端口与 PID 文件均清理；restart 使用新 PID 后 health 再次 200；最终再次 stop，未留下后台服务。
