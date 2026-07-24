# 开发机 Windows 原生 Node 24 运行时基线与用户机验收门禁计划

**状态**：任务分支已 fast-forward 合入本地 `master`；独立主线部署路径和仓库验证已通过，待 `origin/master` 推送。用户电脑验收仍未开始。
**计划日期**：2026-07-24
**任务分支**：`codex/process-dev-machine-node24-runtime-baseline`
**独立 worktree**：`H:\ai-studybuddy-worktrees\process-dev-machine-node24-runtime-baseline`
**运行隔离根目录**：`H:\ai-studybuddy-tmp\runs\dev-machine-node24-baseline-20260724-01`

## 1. 目标、结论边界与依据

### 本轮唯一目标

建立可复验的**开发机 Windows 原生 + Node 24**部署运行基线。验收主线必须是从干净部署包（或同等干净部署输入）完成的实际使用机器安装路径，而不是只运行开发测试。

### A. 本轮允许证明的结论

仅在所有计划内验证均通过、主线复验完成且已推送 `origin/master` 后，才可记录：

> 开发机上的 Windows 原生环境，在 Node 24 下可按部署脚本完成安装、OCR 验证、启动、健康检查、停止及必要的数据安全检查。

“开发机”必须绑定实际验收组合（Windows、Node 精确版本、Python 精确版本、架构、部署包来源、验证日期和脚本退出码），不得泛化为所有 Windows、所有 Node 24 补丁版本或所有机器。

### B. 本轮绝不能证明的结论

无论开发机验证结果如何，必须保留以下状态：

> 用户电脑可安装、可运行尚未实机验收；在用户电脑到位之前，它只是后续交付门禁，不得标记为完成，不得写入完成声明。

用户电脑到位后，必须另建计划，在目标机器上从独立安装介质重跑安装、OCR、启动、健康检查、停止和数据安全验收；不得以开发机结果替代。

### 已核实的仓库事实（2026-07-24）

1. 当前主工作区是 `H:\ai-studybuddy`，分支为 `codex/phase1-5-g2-wsl-isolation-exec`，存在未提交的 `AGENTS.md`、`CLAUDE.md`、`docs/00-*`、`docs/01-*`、`packages/backend/src/services/semester-access-service.ts` 修改及未跟踪的既有 Node 24/学期版本后续计划；不得 `reset --hard`、覆盖式 checkout、删除或回滚它们。
2. 当前分支落后 `origin/master` 的部署准备提交。`origin/master` 已包含 `deployment/runtime-compatibility.{json,psd1}`、部署包构建脚本、bootstrap/installation/OCR/start/stop/backup/restore 脚本和 2026-07-23 的部署证据，因此本轮只能在从最新 `origin/master` 创建的独立 worktree 实施。
3. 当前远端运行时事实仍是 `minimumMajor=20`、`maximumMajor=25`、`verified=v25.4.0`。实际 Node 版本硬编码检查位于至少 `bootstrap-runtime.ps1`、`check-installation.ps1`、`start-production.ps1` 和 `run-parent-report-task.ps1`；部署兼容性事实必须只在完整 Node 24 部署路径通过后再同步。
4. 用户提供的待复验开发机输入为：Windows 11；Node `v24.14.0`、npm `11.9.0`、pnpm `11.9.0`；Python `3.10.19`（`D:\miniconda\py310\python.exe`）；Visual Studio Community 2026、MSVC、Windows SDK、MSBuild 可用；`better-sqlite3@12.11.1` 已针对 Node ABI 137 重建并完成内存 SQLite 读写。它们是本计划的待重新记录输入，而非本计划已生成的验收证据。
5. 用户已说明：干净 `origin/master` 在相同 Node 24 环境的 backend 测试通过；当前主工作区的测试异常源于本地学期版本 8/9 不一致。该问题继续由既有 `.plans/phase1-5-runtime-node24-semester-version-followup-plan.md` 单独处理；本计划不得修改、迁移、绕过或以其解释部署结果。

### 已阅读的执行依据

- `docs/00-文档索引-Index.md`
- `docs/04-开发任务清单-Todo-List.md`
- `docs/06-本地目录治理-Dev-Environment.md`
- `docs/09-测试验收计划-Test-Plan.md`
- `docs/12-开发规范-Dev-Rules.md`
- `origin/master` 中的运行时兼容性文件、部署脚本、`process-runtime-01` 至 `05` 计划及部署证据。

## 2. 范围与非范围

### 范围

- 从最新 `origin/master` 的干净独立 worktree 构建部署包，并以隔离安装根运行 bootstrap、安装检查、OCR smoke、生产启动、loopback 健康检查、停止和数据安全检查。
- 记录 Node/npm/pnpm/Python/MSVC/Windows SDK/MSBuild/better-sqlite3 的实际版本与加载结果，记录每个验证命令的退出码、关键脱敏输出、失败阶段、根因与修复边界。
- 验证完成后，**仅在完整路径通过时**收紧并同步部署运行时事实，使其精确反映已验收的 Node 24 开发机基线；再从更新后的部署包重跑完整实际安装路径。
- 在现有任务清单/运行时证据中留下三段准确状态：开发机 Node 24 基线结果、用户电脑待验收门禁、ASR/Docker/WSL 暂缓边界。

### 非范围

- 不宣称、勾选或暗示用户电脑已经安装或可运行；不在没有目标机器时做替代性“用户机”验收。
- 不修改 S7 PRD，不装配 ASR Adapter，不启动真实 ASR、真实 AI、Provider、QQ SMTP 或飞书。
- 不运行或改写永久 Windows Firewall 规则；ASR/WSL/Docker 只保留为独立环境门禁，既不构成产品实现，也不阻塞本计划。
- 不开始 T05/T06 或 Phase 3。
- 不把 Visual Studio、MSVC、Windows SDK 或 MSBuild 宣传为普通最终用户强制前置；它们仅记录为开发机 `better-sqlite3` 原生编译/恢复能力。
- 不修改 `CURRENT_SEMESTER_VERSION`、迁移、学期数据、后端业务代码、S7 文档，亦不覆盖当前主工作区未提交文件。
- 不读取、输出、写入或提交真实 API Key、Provider URL、真实用户资料、正式运行数据、`node_modules`、原生编译缓存、临时安装目录、测试数据库或日志。
- 本计划不执行备份/恢复功能验收；若执行期间发现必须验证备份/恢复，必须先补充计划并获得再次批准，且只能使用隔离根中的合成测试数据。

## 3. 获批后的实施步骤

### Step 0：隔离与任务登记

1. 在**当前主工作区不执行任何写入性 Git 操作**；先重新记录其 `git status --short --branch`，确认既有脏改动仍原样存在。
2. `git fetch origin`，记录 `origin/master` 的精确提交；使用 `git worktree add -b codex/process-dev-machine-node24-runtime-baseline H:\ai-studybuddy-worktrees\process-dev-machine-node24-runtime-baseline origin/master` 建立独立任务树。若该分支名已存在或远端主线变化，停止并以最新 `origin/master` 重建，不从旧当前分支分叉。
3. 仅在新 worktree 中新增/更新本任务条目和本计划的状态。先在 `docs/04-开发任务清单-Todo-List.md` 登记“开发机 Windows 原生 + Node 24 基线：计划已批准、执行中；用户电脑待实机验收；ASR/Docker/WSL 暂缓”，不得勾选完成。
4. 创建唯一 `20260724-01`，例如 `20260724-01`，以及：
   - `$RunRoot = H:\ai-studybuddy-tmp\runs\dev-machine-node24-baseline-20260724-01`
   - `$PackageRoot = $RunRoot\deployment-package`
   - `$InstallRoot = $RunRoot\install-root`
   - `$AppDataRoot = $RunRoot\app-data`
   - `$EvidencePath = .plans\evidence\process-dev-machine-node24-baseline-20260724-01.md`

所有运行命令显式设置 `APP_DATA_ROOT=$AppDataRoot`（如目标部署脚本通过安装根派生数据目录，则同时记录该映射），且所有输出均位于 `$RunRoot`。不得使用正式安装根、正式用户目录或当前主工作区的运行数据。

### Step 1：版本、Native Addon 与工具链预检

在新 worktree 和隔离目录中，依次记录命令、退出码、架构和脱敏输出：

1. `node --version`、`npm --version`、`pnpm --version`、`& 'D:\miniconda\py310\python.exe' --version`；确认目标为 Node `v24.14.0`、npm/pnpm `11.9.0`、Python `3.10.19`，并记录实际值而不伪造。
2. 以 PowerShell 的 `Get-Command` 和版本查询确认 MSBuild、C++ 编译器/Visual Studio 和 Windows SDK 的实际可用性；此项是开发机恢复能力记录，不成为最终用户要求。
3. 在干净依赖环境中加载 `better-sqlite3@12.11.1`：输出 `process.version`、`process.versions.modules`、包版本和 `select sqlite_version()` 的结果，关闭内存 DB；预期 ABI `137` 且读写成功。
4. 若任一项失败，记录失败的命令、退出码和最小根因；可在任务 worktree 中只做与 Node 24 native addon 安装/加载直接相关的修复调查，但不得改运行时兼容性事实、不得借由学期版本问题修复通过，也不得触发其他产品范围。

### Step 2：构建干净部署输入并做内容安全检查

1. 在新 worktree 中执行 `scripts/build-deployment-package.ps1 -OutputRoot $PackageRoot`（不使用当前工作区 `dist`、`node_modules` 或历史部署包）。记录构建退出码和部署包清单。
2. 扫描部署包，确认不存在 `node_modules`、`.git`、`.env.local`、正式 `.env`、日志、`tmp`、模型目录、SQLite 运行数据、密钥或真实资料；仅记录命中类别/数量，不打印任何文件机密内容。
3. 若部署包构建失败，先记录其阶段和退出码；只有修复属于本计划范围并经可审查最小变更时才继续。不得把开发测试通过代替部署包构建。

### Step 3：真实安装路径验证（第一次）

从 `$PackageRoot`（或其实际生成的干净 app/scripts/deployment 根）执行包内脚本，而不是直接运行仓库脚本；参数以包内脚本实际 `param` 为准，所有步骤都记录起止时间、完整退出码、脱敏关键输出和安装根。

1. `bootstrap-runtime.ps1`：传入 `$InstallRoot`、干净 AppSource 和固定 Python 路径；允许它执行生产依赖安装与受控 OCR venv 安装。不得使用真实 Provider 或密钥。
2. `check-installation.ps1`：确认安装结构、Node/npm、Python/venv、OCR 依赖、安全配置和数据根状态；预期 exit `0`。服务未启动/空测试数据若脚本按设计给出 warning，必须逐项记录并判断是否为预期，而不是笼统忽略。
3. `test-ocr-runtime.ps1`：只使用仓库提供的合成/固定 OCR smoke 文本或本轮生成的非敏感合成输入；预期 OCR import 和 smoke 均成功、exit `0`。不下载或运行 ASR 模型。
4. `start-production.ps1`：在实际脚本支持的前提下使用空闲 loopback 端口；若脚本端口固定，则先确认 `127.0.0.1:3000` 空闲且记录占用检查。禁止公开绑定。
5. 使用 PowerShell `Invoke-WebRequest` 或等价命令访问 `http://127.0.0.1:<实际端口>/api/health`；记录 HTTP 状态、响应是否符合健康契约、监听地址为 `127.0.0.1`，不记录任何敏感配置。
6. 无论健康检查成功或失败，都在 `finally` 路径运行 `stop-production.ps1`；确认 PID/服务进程已停止且停止脚本 exit `0`。不得通过遗留服务进程掩盖失败。
7. 检查 `$InstallRoot`、`$AppDataRoot` 和 `$RunRoot`：验证仅产生隔离测试数据；检查停止后没有删除安装根外的数据、没有产生或复制密钥/Provider 配置，且部署包排除项仍未进入安装输入。此为本轮必要数据安全检查，不等同于备份/恢复验收。

**第一次路径的失败决策：** 任一步骤非零、健康检查非 loopback 成功、OCR 非零、停止失败或数据安全检查失败，即将开发机基线记录为“未通过”，保留当前 Node 25 兼容性事实，不执行版本宣称更新；仅提交事实证据和允许范围内的最小修复（若有），并保持用户电脑状态为待验收。

### Step 4：仅在第一次完整通过后更新运行时事实

满足 Step 1–3 全部通过后，才允许进行以下最小、可审查改动：

1. 更新 `deployment/runtime-compatibility.json` 与 `deployment/runtime-compatibility.psd1`：`VerifiedNode`/`verified` 精确写为实际通过的 Node 24 版本（预期 `v24.14.0`），验证日期写实际日期；将普通部署可接受的 Major 范围收紧为 `24..24`，而不是保留未经 Node 24 用户机实测支持含义的 `20..25` 宽范围。
2. 同步所有实际命中的部署 Node 检查：至少 `scripts/bootstrap-runtime.ps1`、`scripts/check-installation.ps1`、`scripts/start-production.ps1`、`scripts/run-parent-report-task.ps1`。优先让这些脚本读取同一兼容性事实或使用一致的 24-only 检查，避免重复的版本范围漂移；不修改非部署产品逻辑。
3. 更新部署/运行时记录与 `docs/04-开发任务清单-Todo-List.md`，明确分开：
   - 开发机 Windows 原生 + Node 24 基线：已验证（附命令、日期、退出码、隔离目录、分支/主线状态）。
   - 用户电脑安装运行：待目标机器到位后验收，当前不宣称完成。
   - ASR / Docker / WSL：独立环境门禁暂缓，未进入产品实现。
4. 不重写 Phase 0/Phase 1 的历史 Node 25 环境记录；它们保留为当时事实。新记录只能阐明当前部署基线替换了旧的“已验证 Node”部署声明。

### Step 5：更新后的回归、主线收口与证据

1. 用更新后的 worktree 重新构建一个**新的**干净部署包，再从新的 `$RunRoot`/安装根重复 Step 1 的 addon 加载检查和 Step 3 的 bootstrap → installation check → OCR → start → `/api/health` → stop → 数据安全检查。只有第二次完整通过，才可称脚本和兼容性事实已一致。
2. 运行仓库门禁，运行数据一律使用 `$AppDataRoot` 或新的隔离子目录：
   - `pnpm type-check`
   - `pnpm -r --filter backend run build`
   - `pnpm -r --filter @ai-studybuddy/frontend run build`
   - `pnpm test`
   - `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`
   - `git diff --check`
3. 生成 `$EvidencePath`，只记录版本、命令、退出码、脱敏摘要、部署包排除扫描、安装根/隔离根、health 状态和明确边界；不收录真实秘密、用户数据、长原始日志或完整 UUID。
4. 审查 `git status --short --branch` 与 `git diff --name-only`：只允许兼容性文件、实际命中的部署脚本、任务清单、计划/证据及最小必要测试文件；禁止 `node_modules`、缓存、运行数据、部署包、SQLite、日志和密钥进入暂存区。
5. 以 `type(scope): 中文描述` 提交；再按固定流程 fetch/rebase 到最新 `origin/master`、fast-forward 合并入 `master`。在 `master` 上至少重跑 Step 5 的静态/测试/治理检查与最终部署包实际安装路径，并在成功后 `git push origin master`、用 `git ls-remote --heads origin master` 确认。
6. 只有上述 `master` 复验和远端推送均完成，才可在任务清单写“开发机基线已验证”。无论结果如何，用户电脑行必须保持“待目标机器实机验收”。

## 4. 验收标准与失败记录格式

### 开发机通过标准（全部满足）

- Node 24 的精确版本、ABI、npm/pnpm、固定 Python、工具链状态及 `better-sqlite3` 内存 SQLite 读写均有实际记录。
- 从新 worktree 构建的干净部署包不含禁止项。
- 两轮（兼容性更新前、更新后）均完成：bootstrap、installation check、OCR smoke、loopback production start、`/api/health`、stop、隔离数据安全检查，且每步 exit `0`；服务不得公开绑定。
- Node 24-only 兼容性配置与所有实际命中部署检查一致，第二轮部署路径使用的是更新后的包。
- 类型检查、两个 build、完整测试、文档治理和 diff 检查通过；主线复验、`origin/master` 推送完成。

### 不通过/阻断记录格式

每次失败至少记录：`步骤`、`命令`、`退出码`、`实际 Node/Python/ABI`、`隔离根`、`首次失败时间`、`已确认根因或“待调查”`、`允许修复边界`、`是否影响后续步骤`。禁止把学期版本 8/9、Firewall、ASR、Docker/WSL 或用户电脑缺席误写成 Node 24 部署成功/失败的根因，除非证据直接证明关联。

## 5. 计划自审

- **目标可证性：通过。** 验收对象限定为一个开发机组合，且要求从干净部署包走完整安装路径并在兼容性修改后复跑。
- **用户机边界：通过。** 用户电脑是显式、不可完成的后续实机门禁；计划没有任何可将开发机结论外推为用户机结论的完成条件。
- **当前工作区安全：通过。** 所有实施都在获批后新建的 `origin/master` worktree；禁止 reset、覆盖 checkout、删除或回滚当前脏改动。
- **范围控制：通过。** 排除 S7/ASR、Firewall、Docker/WSL、T05/T06、Phase 3、真实 AI/Provider 和学期版本 8/9 修复。
- **运行时事实控制：通过。** 不预先修改 Node 25 事实；只有两轮完整部署通过后才收紧为 Node 24-only，并同步实际硬编码检查。
- **数据与隐私：通过。** 所有安装/运行数据在隔离目录，部署包与暂存区均进行禁止项检查；不读取或记录真实秘密、资料、正式数据。
- **仓库流程：通过。** 计划包含任务清单登记、测试/构建/文档治理/diff、主线 fast-forward 复验、远端推送及准确交付状态。
- **执行复核（2026-07-24）：通过（任务分支）。** 两个独立安装根均从干净部署包完成 bootstrap、installation check、OCR smoke、回环启动/健康检查、停止和数据安全检查；最终 Node 24-only 包的各步骤均 exit `0`。完整脱敏证据见 `.plans/evidence/process-dev-machine-node24-baseline-20260724-01.md`。仍须在最新 `master` 上复验并推送 `origin/master` 后，才能记录为主线已验证。用户电脑验收继续保持未完成。
