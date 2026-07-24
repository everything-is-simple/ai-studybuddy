# Windows PowerShell 兼容性与部署验收整改 Implementation Plan

> **任务**：PROCESS-RUNTIME-DEPLOY-06
> **状态**：用户于 2026-07-24 指示优先从最重要的问题开始整改；本计划限定本轮 P0/P1 实现与验收边界。
> **前置事实**：DEPLOY-01 至 DEPLOY-05 的产物已进入 `origin/master`，但 2026-07-24 严格复核确认它们尚未全部闭环；本任务不得将历史“完成”文案当作验收事实。

## 目标

修复 Windows 自带 PowerShell 5.1 对生产部署脚本中内嵌 Python/Node 代码的原生命令参数传递问题，并以新的、彼此隔离的安装根完成 bootstrap、检查、生产启动/停止、OCR 与数据持久性验收。结果必须同时兼容 Windows PowerShell 5.1 与 PowerShell 7；不得接入 S7/ASR 产品链路，不改变网络或防火墙边界。

## 问题与根因

`start-production.ps1` 在 Windows PowerShell 5.1 调用：

```powershell
& $env:PYTHON_PATH -c 'import rapidocr_onnxruntime; print("OCR_IMPORT_OK")'
```

时，Python 实际收到的代码失去字符串引号，产生 `NameError: name 'OCR_IMPORT_OK' is not defined`。OCR 包本体已可在受控 venv 中直接导入；故 P0 是 PowerShell 到原生命令的参数边界，不是 OCR 依赖损坏。

相同风险位于 `bootstrap-runtime.ps1`、`check-installation.ps1` 和 `test-ocr-runtime.ps1`；`check-installation.ps1` 的内联 `node -e` SQLite 预检也必须移除，避免将单 shell 偶然通过误报为跨 shell 可用。

## 约束

- 仅在新 worktree/分支 `codex/process-runtime-deploy-compatibility` 修改；绝不触碰 `H:\ai-studybuddy` 的 G2 未提交 `packages/backend/src/services/semester-access-service.ts`。
- 不提交真实密钥、资料、SQLite、模型缓存、`.env.local` 或运行日志。
- 后端继续仅监听 `127.0.0.1`；不新增防火墙规则、局域网或公网入口。
- Docker/WSL 仅保留验证用途；本任务不把它们变成使用机器前置依赖。
- 每次 install/backup/restore smoke 使用互不复用的仓库外根目录；不得把备份夹具写入安装 smoke 根。
- 任务完成前，`docs/04` 必须如实反映“整改中”，不得声称部署准备已交付。

## 实施与验收步骤

### Task 1：建立可测试的跨 shell 运行时检查契约

**Files:**
- Create: `scripts/lib/AIStudyBuddy.RuntimeChecks.py`
- Create: `scripts/lib/AIStudyBuddy.RuntimeChecks.cjs`
- Modify: `scripts/lib/AIStudyBuddy.Deployment.psm1`
- Create test: `packages/backend/test/deployment-powershell-compatibility.test.mjs`

- [ ] 先写失败测试：固定两个 helper 必须存在，调用模式只允许 Python 版本/x64 与 OCR import、Node 依赖 import 与 SQLite 只读预检；四个生产脚本不得继续含 `python -c` 或 `node -e` 内联代码。
- [ ] Python helper 只输出脱敏 JSON，分别报告解释器版本/位数和 RapidOCR import 状态；错误也以机器可解析、无秘密的 JSON 表达。
- [ ] Node helper 用当前后端工作目录解析生产依赖；SQLite 预检接收数据库路径和 scope，执行 readonly + `quick_check` + migration version，输出 JSON。
- [ ] PowerShell module 只通过脚本文件调用 helpers，统一处理退出码、JSON 解析和可操作错误；不使用字符串拼接或环境变量构造命令行。
- [ ] 运行专项测试，确认旧风险模式和 helper 契约均受回归保护。

### Task 2：替换 P0 脚本调用点并补 PowerShell 5.1 回归入口

**Files:**
- Modify: `scripts/start-production.ps1`
- Modify: `scripts/bootstrap-runtime.ps1`
- Modify: `scripts/check-installation.ps1`
- Modify: `scripts/test-ocr-runtime.ps1`
- Create: `scripts/test-windows-powershell-compatibility.ps1`

- [ ] `start-production.ps1` 使用 Python helper 做 OCR import 预检；失败必须拒绝启动，成功才允许创建 PID/后端子进程。
- [ ] `bootstrap-runtime.ps1` 使用 helper 检查 Python x64、OCR import 和 Node 生产依赖，保留现有版本/目录/venv 门禁。
- [ ] `check-installation.ps1` 使用 helpers 进行 Python、OCR、Node 和 SQLite 只读检查；检查命令保持只读，不自动修复、不覆盖数据库、不开放端口。
- [ ] `test-ocr-runtime.ps1` 不再把 Python 程序传给 `-c`；合成图片生成器写入受控 `tmp\ocr-smoke`，finally 后验证清理。
- [ ] 新增兼容性 smoke 驱动，以 `powershell.exe -NoProfile -ExecutionPolicy Bypass` 实际调用检查、OCR、启动、健康检查和停止流程；可选择额外用 `pwsh` 复验。它必须只接受明确的干净安装根和端口，结束时保证后端停止。

### Task 3：重建干净安装根，完成 P0/P1 真实验证

**Evidence roots (repository external):**
- `H:\ai-studybuddy-runtime\install-smoke-ps51-20260724-<id>`：只用于 bootstrap/start/stop/persistence。
- `H:\ai-studybuddy-runtime\backup-smoke-20260724-<id>`：只用于备份夹具。
- `H:\ai-studybuddy-tmp\runs\process-runtime-deploy06-<id>`：测试、部署包与 E2E 证据。

- [ ] 构建新的无秘密部署包，并检查黑名单（`.git`、`node_modules`、`.env.local`、SQLite、模型、日志、tmp、Playwright 证据）仍被排除。
- [ ] 在全新 install smoke 根运行 bootstrap；记录 Node/Python/venv 的实际版本，但不记录密钥或机器私有路径到 Git。
- [ ] 分别用 Windows PowerShell 5.1 和 PowerShell 7 执行 `check-installation.ps1`、`test-ocr-runtime.ps1`、`start-production.ps1` 与 `stop-production.ps1`；验证 `/api/health`、首页、SPA fallback、API 404 和 127.0.0.1 监听。
- [ ] 重启后验证最小学习数据持久性；AI/SMTP/飞书均未配置时，离线确定性主线仍可运行且不伪造发送成功。
- [ ] 不复用历史 `install-test-20260723-5`，因为它已经被备份夹具污染且不再代表可启动安装实例。

### Task 4：如实回填文档与重新建立后续验收队列

**Files:**
- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify as evidence requires: `docs/09-测试验收计划-Test-Plan.md`, `docs/13-部署运维指南-Deployment.md`
- Create: `.plans/evidence/process-runtime-deploy06-20260724.md`

- [ ] 记录 PowerShell 5.1/Pwsh 的命令、退出码、测试计数、脱敏结果与证据根；不把尚未做的独立使用机器、migration 失败或旧包回滚写成已完成。
- [ ] 将 DEPLOY-01 至 DEPLOY-05 保持为整改中，只有相应的严格验收确实闭环、合入 `master` 并推送 `origin/master` 后才更新状态。
- [ ] 完成与此范围相关的 `pnpm type-check`、后端/前端 build、专项/全量测试、E2E、docs governance 和 `git diff --check`。
- [ ] rebase 最新 `origin/master`，fast-forward 合并，合并后重新验证并推送；若远端网络不可用，只报告分支验证，不报告主线完成。

## 完成标准

1. Windows PowerShell 5.1 不再因内联 Python/Node 字符串引号失败；PowerShell 7 同样回归通过。
2. `start-production.ps1` 在干净安装根实际启动单个本地后端，健康接口成功，停止脚本清理 PID/监听。
3. `check-installation.ps1` 的 OCR/SQLite/Node 检查真实反映状态，不再因 shell 参数问题误报。
4. OCR smoke 覆盖中文、空白、损坏、不存在、Worker JSON、超时/清理，并不保留临时输入。
5. 文档状态与现场证据一致；未完成的 DEPLOY-01/04/05 验收仍明确保留。
6. 本任务不改变 S7/G2 的正式状态，也不引入 AuralConverter、真实 ASR、Docker/WSL 常驻服务、防火墙或公网能力。
