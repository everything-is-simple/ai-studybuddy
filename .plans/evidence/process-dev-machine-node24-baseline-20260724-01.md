# 开发机 Windows 原生 Node 24 运行时基线——脱敏执行证据

**日期**：2026-07-24
**状态**：任务分支验证通过；尚待最新 `master` 复验和 `origin/master` 推送。
**计划**：`.plans/process-dev-machine-windows-node24-runtime-baseline-plan.md`
**任务分支**：`codex/process-dev-machine-node24-runtime-baseline`
**worktree**：`H:\ai-studybuddy-worktrees\process-dev-machine-node24-runtime-baseline`

## 1. 结论边界

本证据只支持以下结论（待主线复验及推送完成后）：

> 开发机上的 Windows 原生环境，在 Node 24 下可按部署脚本完成安装、OCR 验证、启动、健康检查、停止及必要的数据安全检查。

它**不**支持“用户电脑可安装、可运行”的结论。用户电脑仍须在目标机器到位后，另建计划并从独立安装介质完成实机验收。ASR、Docker、WSL、永久 Windows Firewall 规则、真实 AI/Provider、QQ SMTP 与飞书均未进入本轮。

## 2. 已验证的开发机组合

- Windows：Windows 11，版本 `10.0.22631.0`。
- Node.js：`v24.14.0`，x64，ABI `137`。
- npm / pnpm：`11.9.0` / `11.9.0`。
- Python：`D:\miniconda\py310\python.exe`，`3.10.19`，x64。
- 开发机恢复能力：Visual Studio Community 2026 与 Windows SDK 可发现；普通 PowerShell 未将 `cl.exe` / `msbuild.exe` 放入 PATH，这不构成用户机前置条件。
- Native addon：`better-sqlite3@12.11.1` 在 ABI `137` 加载并完成 SQLite 内存读写；SQLite 版本 `3.53.2`。

## 3. 隔离与部署输入

- 证据、包和非正式日志根：`H:\ai-studybuddy-tmp\runs\dev-machine-node24-baseline-20260724-01`。
- 最终部署包：`deployment-package-node24-final-scoped` 及同名 zip；构建 exit `0`。
- 最终安装根：`H:\ai-studybuddy-runtime\dev-machine-node24-baseline-20260724-01-node24-final`。该根独立于 E2E 运行目录，满足正式数据根不得指向 `ai-studybuddy-tmp\runs` 的安全门禁。
- 包排除扫描：`node_modules`、`.git`、`.env` / `.env.local`、日志、tmp、models、数据库、私钥/证书文件均为 `0` 项。

## 4. 最终 Node 24 包的实际路径

| 步骤 | 输入 / 断言 | 结果 |
| --- | --- | --- |
| 构建部署包 | `build-deployment-package.ps1` | exit `0` |
| Bootstrap | `bootstrap-runtime.ps1`，固定 Python 3.10.19 | exit `0`；生产 Node 依赖和受控 RapidOCR venv 创建成功 |
| 安装检查 | `check-installation.ps1` | exit `0`；Node `v24.14.0`、Python x64、RapidOCR import、目录与回环配置均通过；服务未启动/首次无数据库仅为预期 warning |
| OCR | `test-ocr-runtime.ps1` | exit `0`；合成中文图识别到“人工智能学习助手”，空白、损坏和缺失文件契约及临时清理通过 |
| 启动和健康 | `start-production.ps1 -Port 30126`，随后 `GET http://127.0.0.1:30126/api/health` | exit `0`；`success=true`，监听地址仅 `127.0.0.1` |
| 停止 | `stop-production.ps1` | exit `0`；`run\backend.pid` 删除，隔离安装根关联的 Node 进程为 `0` |
| 数据安全 | 仅统计类别与路径，不输出配置值 | exit `0`；无明文外部配置、无 active 加密外部配置、无包禁入项、无安装根外数据库 |

完整原始命令输出保留在隔离运行目录，未加入 Git。

## 5. 修复与失败边界

1. Windows PowerShell 调用原生 Python 时，含嵌套双引号的 `-c` 文本会被错误拆解；将部署脚本的 RapidOCR 预检改为只执行 import，并由退出码判断。该修复覆盖 bootstrap、安装检查、启动和 OCR smoke。
2. 含中文的 OCR 和父报告 PowerShell 脚本在 Windows PowerShell 5.1 需要 UTF-8 BOM；已改为 BOM UTF-8，并以 `Parser.ParseFile` 验证。
3. 曾将安装根放在 `ai-studybuddy-tmp\runs` 下，正确被 `e2e-isolation` 门禁拒绝；已改用独立的 `H:\ai-studybuddy-runtime` 根，未放宽安全规则。
4. 一次带 stdout 转发管道的外层记录命令超时，但启动脚本已输出健康就绪；随后以脱离该管道的标准 PowerShell 调用复验，调用 exit `0`，健康、PID 创建和停止均通过。该现象不作为产品脚本失败结论。

## 6. Node 24 运行时事实

- `deployment/runtime-compatibility.json`：Node major `24..24`，已验证 `v24.14.0`，日期 `2026-07-24`。
- `deployment/runtime-compatibility.psd1`：与 JSON 同步。
- 两个文件均明确 `development-machine-windows-native` 验证范围和 `pending-target-machine` 用户机验收状态。
- `bootstrap-runtime.ps1`、`check-installation.ps1`、`start-production.ps1` 与 `run-parent-report-task.ps1`：仅接受 Node major 24。

这不是对全部 Windows 电脑或全部 Node 24 补丁版本的普通用户支持承诺。

## 7. 仓库级验证（任务分支）

隔离仓库测试根：`H:\ai-studybuddy-tmp\runs\dev-machine-node24-baseline-20260724-01\repo-tests`。

- `pnpm type-check`：exit `0`。
- `pnpm -r --filter backend run build`：exit `0`。
- `pnpm -r --filter @ai-studybuddy/frontend run build`：exit `0`；仅既有大分包警告。
- `pnpm test`：exit `0`；backend `242` 通过、`0` 失败。
- `scripts/check-docs-governance.ps1`：exit `0`。
- `git diff --check`：exit `0`。

## 8. 未完成门禁

- 用户电脑安装和运行：**待目标机器到位后实机验收；当前不宣称完成。**
- ASR / Docker / WSL：独立环境门禁暂缓，未进入产品实现。
- 本任务尚未完成主线 fast-forward 合并、主线复验或 `origin/master` 推送。
