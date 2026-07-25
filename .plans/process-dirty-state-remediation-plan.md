# 多 worktree 脏状态审计、归属判定与安全收口计划

**计划编号**：PROCESS-DIRTY-20260725
**状态**：执行中；用户于 2026-07-25 明确要求立即开展大扫除。已完成不丢失内容的 Batch 0/目录归拢，删除和原脏工作区语义收口仍受后续精确门禁约束。
**创建日期**：2026-07-25
**计划工作树**：`codex/process-dirty-state-remediation-plan`，从 `origin/master` @ `b1c88968733a2ded70ed4781e63f9aa9d17b3e71` 创建。
**任务清单位置**：`docs/04-开发任务清单-Todo-List.md` 的 `PROCESS-DIRTY-20260725` 记录及行动计划索引。

---

## 1. 系统目的与本计划的判断原则

AI StudyBuddy 已形成学生本机学习闭环的雏形：一名在 Windows 本机学习的学生围绕课程和考试目标，完成学习节奏、资料笔记、练习、错题改错与考前冲刺；家长只接收脱敏的异步摘要，而不是系统操作者。当前收口工作的目的不是“为了让所有 `git status` 变绿而删除东西”，而是保护这个已具备雏形的产品事实，让每一份未提交内容都有**可解释的归属、风险等级和后续去向**。

因此本计划遵循：

1. `origin/master` 上已集成、已复验且由 `docs/04` 同步的内容，才是当前产品事实。
2. “脏状态”不等于垃圾：它可能是业务语义改动、待审计划、可再生生成物、依赖缓存或外部证据；必须分别处理。
3. 任何可能丢失内容的动作都必须先形成清单、核对绝对路径、检查占用进程，并取得针对该批次的明确批准。
4. 不把开发机 Node 24 基线、S7 外部候选、G2、Docker/WSL 或用户电脑验收混入本计划的完成结论。

产品目的与现有系统边界以 `docs/01-总PRD-产品需求-Product-Requirements.md`、`docs/02-七子系统地图-Scenario-Systems.md` 为准；本计划只治理版本控制与本机工作区状态。

---

## 2. 计划范围与非范围

### 2.1 范围

- 对当前已发现的主工作区和独立 worktree 进行只读盘点、分类、归属判定和安全收口设计。
- 为每一类状态定义：保留、迁移为正式任务、提交计划、生成物清理、依赖残留清理或延后归档的条件。
- 为语义改动建立单独验证门，而不是把它误删为“脏文件”。
- 在 `docs/04`、`docs/00`、`docs/06`、`docs/12`、`AGENTS.md` 和 `CLAUDE.md` 记录一致的治理规则。
- 后续获批实施时，在新的、干净的 worktree 中完成可迁移内容的审查、验证、集成和主线复验。

### 2.2 非范围

本计划创建与审查阶段，以及任何未获逐批批准的后续阶段，均不做以下事项：

- 不在 `H:\ai-studybuddy` 当前脏工作区执行 `git reset --hard`、覆盖式 checkout、`git clean`、批量删除或回滚。
- 不直接修改 `packages/backend/src/services/semester-access-service.ts` 的 `CURRENT_SEMESTER_VERSION`，不处理 migration 9 的业务语义，除非后续专门的学期版本判定任务获批。
- 不实现或接入 S7、AuralConverter、Schema、Adapter、API、Worker、前端、ASR 或 G2；不运行真实 AI、Provider、SMTP、飞书、Docker 或 WSL。
- 不修改永久 Windows Firewall、服务、组策略、注册表或安全策略。
- 不做用户电脑安装运行验收；不把开发机验证写成用户机完成。
- 不修改正式运行数据、真实资料、密钥、模型或外置组件证据目录。

---

## 3. 当前只读审计快照（2026-07-25）

| 区域 | 当前状态 | 初步分类 | 不能直接做的事 | 后续需要的决定 |
| --- | --- | --- | --- | --- |
| `H:\ai-studybuddy` | 分支 `codex/phase1-5-g2-wsl-isolation-exec`；5 个已跟踪文件显示修改、2 个未跟踪计划文件；相对当前主线落后且有自身提交 | **语义风险 + 行尾噪声 + 待审计划** | 不得 reset、覆盖 checkout 或删除 | 对 `CURRENT_SEMESTER_VERSION = 8` 与 migration 9 进行专门的行为判定；计划文件需决定保留/迁移/提交 |
| `H:\ai-studybuddy\packages\backend\src\services\semester-access-service.ts` | 与当前主线的实质差异为 `CURRENT_SEMESTER_VERSION` 从 `9` 改为 `8` | **高优先级语义风险** | 不得以“恢复主线”为由直接改回 `9` | 明确数据迁移事实、受影响数据库、测试契约及用户意图后，再独立批准修改 |
| `H:\ai-studybuddy\.worktrees\process-runtime-deployment` | 仅未跟踪 `node_modules.shared-deps\` | **依赖残留候选** | 不得使用宽泛清理命令 | 核对没有进程/工作树依赖后，按精确绝对路径清理或保留 |
| `H:\ai-studybuddy-worktrees\phase1-5-t02-asr-candidate-harness-plan` | 仅未跟踪 T02 候选 harness 计划 | **待审计划** | 不得因 ASR 暂缓而删除计划 | 用户决定保留、独立提交计划或归档；不触发 ASR 产品实现 |
| `H:\ai-studybuddy-worktrees\phase1-5-t02-whispercpp-formal-revalidation-plan` | 仅未跟踪正式复验计划 | **待审计划** | 不得删除或宣称已实施 | 用户决定保留、独立提交计划或归档；不触发 G2 或 S7 接入 |
| `H:\ai-studybuddy-worktrees\process-runtime-deploy-compatibility-clean-20260724` | 6 个已跟踪脚本/任务清单修改、1 个未跟踪计划、约 309 个可疑编译/测试生成物 | **待比较的运行时修复草稿 + 生成物残留** | 不得把已跟踪修改和生成物一起删除 | 逐个比较脚本差异是否已被 Node 24 主线覆盖；仅在白名单和预检通过后清理生成物 |
| `H:\ai-studybuddy-components\local-asr-whispercpp` 及其 `runs`/`evidence` | 仓库外组件候选和证据 | **外部证据，不是主仓脏状态** | 不得纳入主仓清理、复制入 `packages/` 或改变产品状态 | 保持独立；仅在单独 T02/G2 任务处理 |

快照说明：上表是截至本计划创建时的初步审计，不是对文件内容归属的最终裁定。任何状态在实施前必须再次以 `git status --short --branch`、`git diff`、`git log` 和进程检查复核；不得根据旧快照删除文件。

---

## 4. 批次化实施路径（每批均需单独明确批准）

### Batch 0：可复验只读基线与责任清单

**目的**：在不写入、不删除的前提下，为每个 worktree 记录可复现快照。
**步骤**：

1. 对每个已列工作树记录绝对路径、分支、`HEAD`、与 `origin/master` 的 ahead/behind、`git status --short`、跟踪差异和未跟踪根目录。
2. 用内容特征把条目分为：语义改动、行尾/格式差异、计划文件、编译输出、测试输出、依赖目录、外部证据。
3. 记录每项的建议所有者和建议去向，但不移动、不删除、不提交用户原始改动。
4. 产出脱敏清单到计划任务自己的证据位置；不读取或记录密钥、真实数据、模型正文或资料内容。

**通过条件**：每一项都有分类和下一步；无文件内容发生改变。
**失败/阻塞**：发现未知正式数据、密钥、运行中进程或无法说明的提交关系时，标记 `BLOCKED`，不进入清理。

### Batch 1：学期版本 8/9 语义判定（高风险，独立任务）

**目的**：确认主工作区的 `CURRENT_SEMESTER_VERSION = 8` 是待恢复的意外改动，还是为了兼容真实历史数据的尚未完成修复。
**步骤**：

1. 从最新 `origin/master` 创建新的专用 worktree，不在 `H:\ai-studybuddy` 修改。
2. 只读核查 migration 定义、版本常量、学期选择/归档测试、空数据库与隔离测试库升级路径；不得使用正式数据根。
3. 比较主工作区差异、其唯一提交和当前主线中的同一业务事实。
4. 写出至少两种候选处置及影响：保持 9、修复到 8、或采用兼容迁移；说明每种对既有数据库和测试的影响。
5. 将结论提交用户确认；没有明确选择不得改版本常量、不得清理该主工作区。

**通过条件**：有可重复的隔离测试证据、明确的用户选择和独立实施计划。
**禁止**：不得因为“让主工作区干净”而把版本号直接覆盖为主线值。

### Batch 2：运行时兼容草稿逐项归属

**目的**：区分 `process-runtime-deploy-compatibility-clean-20260724` 中的 6 项已跟踪修改，哪些已在 Node 24 开发机部署基线进入主线，哪些仍是有效未集成修复，哪些已经过期。
**步骤**：

1. 逐个比较 `scripts/bootstrap-runtime.ps1`、`scripts/check-installation.ps1`、`scripts/lib/AIStudyBuddy.Deployment.psm1`、`scripts/start-production.ps1`、`scripts/test-ocr-runtime.ps1`、`docs/04-开发任务清单-Todo-List.md` 与 `origin/master`。
2. 对候选修复建立“已覆盖 / 需要迁移 / 需要重新验证 / 过期”结论；不把整批差异一次性合入。
3. 若存在有效修复，只将该修复复制到从最新主线创建的干净任务分支，按开发机 Node 24 基线重新验证，再按 Git 流程合入。
4. 若全部已覆盖或过期，只记录比对证据；待生成物批次获批后才处理该旧 worktree 的残留。

**通过条件**：每个已跟踪文件都有独立结论和证据；不发生盲目覆盖或重复合并。

### Batch 3：仅白名单生成物与依赖残留的安全清理

**目的**：在不触碰语义内容、不影响运行中进程的前提下，移除已确认可再生的输出。
**前置**：Batch 0 已完成；用户批准了**精确列表**；每个目标路径已确认在预期 worktree 内；无运行中的 Node、测试、Playwright、Python 或编辑器进程正在使用它。
**步骤**：

1. 输出拟处理绝对路径列表、文件计数、扩展名分布和父目录边界。
2. 排除 `.git`、源代码、`.plans`、`docs`、数据库、`data`、`materials`、`backups`、密钥、外置组件目录及任何未分类文件。
3. 只对已批准的单个路径使用 PowerShell `Remove-Item -LiteralPath <exact-path> -Recurse -Force`；每次删除前复核 `Resolve-Path` 的父目录仍在目标 worktree 内。
4. 不执行 `git clean`、不基于通配符递归到仓库根、不在命令间把路径交给另一 shell。
5. 删除后复查 `git status --short`、文件计数和关键脚本/计划是否仍存在。

**通过条件**：只移除白名单生成物或依赖目录；Git 跟踪内容和计划文件保持完整；无运行数据或外部证据被触碰。
**失败/阻塞**：任一路径归属不明、进程占用、预期外文件、状态变化不符，立即停止并保留现场。

### Batch 4：未跟踪计划文件的归档/提交决定

**目的**：让有价值的计划成为可审计资产，或明确保留而不误报已经执行。
**步骤**：

1. 对两个 T02 计划和主工作区的 Node 24/学期版本计划分别进行独立审查。
2. 用户按计划选择：提交到相应任务分支、转移到新的计划分支、保留原处等待，或在有内容备份和明确批准后归档。
3. 任何提交只包含计划/文档，不将 `node_modules`、日志、运行目录、证据包或密钥带入主仓。

**通过条件**：每个未跟踪 `.plans` 文件有明确归属和状态，不将“计划存在”写成“功能已实现”。

### Batch 5：陈旧但干净的 worktree 生命周期

**目的**：区分仍有分支价值的干净 worktree 与可在未来移除的重复 checkout。
**步骤**：

1. 只读记录所有 `git worktree list --porcelain` 条目及其分支是否已经被主线包含。
2. 对候选移除项先确认没有未提交状态、没有打开编辑器/终端使用、没有唯一未推送提交。
3. 仅在用户批准每个精确 worktree 后，使用 Git 的 worktree 管理命令处理；不从文件系统直接删除 worktree 根。

**通过条件**：不影响 `H:\ai-studybuddy` 主工作区、当前 `master` 集成 worktree 或仍有独立计划价值的目录。

### Batch 6：集成与最终复验（只适用于实际获批迁移的内容）

**目的**：仅对真正形成提交的修复完成主线闭环。
**步骤**：按 `docs/12` 的 rebase、fast-forward 合并、主线复验和推送流程执行。
**通过条件**：`origin/master` 包含对应提交，`docs/04` 记录实际证据，且没有把用户机验收、S7 产品接入或外置候选能力误写为完成。

---

## 5. 统一安全门禁与命令边界

| 门禁 | 必须满足 | 不满足时的结论 |
| --- | --- | --- |
| G0 计划门 | 本文件及 `docs/04` 计划记录已审查；用户明确批准某一批次 | 只允许继续讨论或只读盘点 |
| G1 语义门 | 学期版本 8/9 的迁移、测试、数据影响和用户意图已明确 | 保留主工作区原状，标记 `BLOCKED` |
| G2 差异门 | 每项运行时脚本修改与最新主线逐项比较完毕 | 不得删除旧草稿或重复合并 |
| G3 删除门 | 精确绝对路径、类别、进程检查、父目录验证、预期后状态和用户批准齐全 | 不得执行删除 |
| G4 计划门 | 每个未跟踪计划已决定保留、提交、迁移或归档 | 不得把计划当垃圾或当已完成能力 |
| G5 主线门 | 只有需要集成的已验证修改才进入主线流程 | 不得因清理需要合并无关改动 |

所有批次均禁止：`git reset --hard`、`git clean`、强推、覆盖 checkout、跨 worktree 移动未分类文件、删除仓库根或用通配符对多目录递归处理。任何涉及运行数据的验证仍必须使用隔离 `APP_DATA_ROOT`。

---

## 6. 证据与验收标准

### 6.1 每批证据最低要求

- 执行日期、操作者、工作tree绝对路径、分支、`HEAD`、`origin/master` 基线。
- 命令、退出码、脱敏摘要和前后 `git status --short --branch`。
- 对语义改动：最小 diff 摘要、关联测试和明确的业务影响说明。
- 对删除：批准的精确路径清单、`Resolve-Path` 结果、占用进程检查、删除前后计数和状态复查。
- 对计划：计划文件路径、审查结论、用户批准范围和“尚未实施”的边界。

### 6.2 本计划完成的验收标准

本计划在**计划/文档层**完成，不代表收口已经实施。其完成条件是：

1. 所有已发现脏状态都按类别、风险、路径和后续门禁登记；
2. `docs/04` 有对应任务记录和行动计划索引；
3. 目录治理、协作入口和开发规范一致写明“脏状态不等于可删除垃圾”；
4. 明确保护学生本机产品雏形和主线事实；
5. 明确保留以下未完成结论：用户电脑安装运行待验收；S7 产品接入未开始；Phase 3 暂缓；ASR/G2/Docker/WSL 均为独立门禁；
6. 纯文档治理检查和 `git diff --check` 通过。

---

## 7. 计划自审

- [x] 没有把“让工作区变干净”置于保护业务语义之前。
- [x] 将学期版本 8/9 作为独立高风险判定，而非自动回滚项。
- [x] 将可再生生成物、`node_modules` 残留、未跟踪计划和外部组件证据分开处理。
- [x] 对每个可能写入或删除的批次设置了明确批准门、路径边界和停止条件。
- [x] 未把开发机 Node 24 基线、用户电脑验收、S7 候选能力或 G2 结论混为一谈。
- [x] 未扩大到产品代码、ASR、Docker/WSL、Firewall 或真实外部服务。
- [x] 规定了主线仍以 `origin/master`、验证和 `docs/04` 同步为准。

---

## 8. 需要的后续批准

请不要用“全部清理”作为泛化授权。后续应至少按以下顺序明确批准：

1. **批准 Batch 0**：只读盘点与责任清单；
2. **批准 Batch 1**：学期版本 8/9 的隔离判定；
3. 在看到 Batch 0/1/2 的精确清单后，再单独批准任何 Batch 3 删除目标；
4. 对 T02 计划、陈旧 worktree 和任何实际代码迁移分别确认。

在这些批准之前，保留现状，不执行删除、重置、覆盖或业务版本修改。

---

## 9. 目录边界决定（2026-07-25，立即生效）

用户已明确要求：`H:\ai-studybuddy` 是主系统目录，必须尽可能干净，**禁止作为 worktree 根目录或包含任何 `H:\ai-studybuddy\.worktrees\*` 工作树**。从本决定起：

1. 唯一允许创建新任务 worktree 的当前开发机根目录是 `H:\ai-studybuddy-worktrees`；创建前必须确认目标在该根目录内，且不在 `<repo-root>` 内。
2. 不得新建、恢复、复制或移动 worktree 到 `H:\ai-studybuddy\.worktrees`；已有的 1 个登记 worktree 和 15 个未登记旧目录只可按获批的清单迁出或安全处置。
3. 历史文档/旧计划中出现的仓内 `.worktrees` 路径仅作为历史证据，不构成当前许可；当前规则以 `docs/06` 和 `docs/12` 为准。
4. 此决定不授权删除：先完成只读归属判定，再由用户逐批批准 Git worktree 移动、无效残留清理或归档。


## 10. 2026-07-25 实施记录

本轮按“先迁出、后判定、暂不销毁”的原则完成第一批实际收口：

1. 从仓库内迁出仍有效的 worktree：
   - `H:\ai-studybuddy\.worktrees\process-runtime-deployment` → `H:\ai-studybuddy-worktrees\process-runtime-deployment`；
   - 使用 `git worktree move`；分支 `codex/process-runtime-deployment`、HEAD `99fdeb54c9d56c79e3eaf20706e974ced94a06e4` 与 1 条未跟踪状态完整保留。
2. 移除 3 个干净、无占用且 HEAD 已被 `origin/master` 包含的陈旧登记 worktree 工作副本：
   - `H:\ai-studybuddy-origin-master-readonly`；
   - `H:\ai-studybuddy-worktrees\process-dev-machine-node24-runtime-baseline`；
   - `H:\ai-studybuddy-worktrees\process-system-truth-document-reconciliation`。
   Git 分支和提交仍保留，没有执行强制删除。
3. 将仓库内剩余 15 个已失去 Git 登记、且多数仍指向历史 `I:\...` gitdir 的目录整体迁至：
   - `H:\ai-studybuddy-worktrees\_legacy-unregistered-20260725`。
   迁移前确认该路径下不存在有效登记 worktree、无占用进程；迁移后 15 个直接子项计数一致。
4. 将外部 worktree 根中 6 个未登记旧目录归拢到上述隔离区的 `_external-root-remnants`；将两个确认包括隐藏项在内均为空的顶层目录 `H:\ai-studybuddy-day-study`、`H:\ai-studybuddy-logs` 归拢到 `_empty-top-level-directories`。
5. 最终复查：
   - `H:\ai-studybuddy\.worktrees` 不存在；
   - `H:\ai-studybuddy-worktrees` 顶层仅保留 8 个有效登记 worktree 和 1 个历史隔离区；
   - 本地 `master` 与 `origin/master` 均为 `d8b060ae5e1b0cca33559f30cdbc2464bc44a908`；
   - 原始脏工作区没有被 reset、覆盖 checkout、回滚或删除。

本轮没有销毁隔离区内容。后续优先级为：先判定并无损收口原脏工作区（尤其学期版本 8/9 与计划迁移），再处理运行时兼容工作树中的大规模生成物/草稿；Firewall、G2、ASR、Docker/WSL 与 Phase 3 不作为当前开发主线。

## 11. Batch 1 学期版本 8/9 无损收口结果（2026-07-25）

本批次是在用户已经批准“更新/大扫除”的范围内执行；目标不是把旧状态直接改掉，而是保留可恢复证据后，让主系统回到唯一已集成事实。

### 11.1 输入事实与保存方式

1. 原主工作区当时位于分支 `codex/phase1-5-g2-wsl-isolation-exec`，相对 `origin/master` 为 1 个提交领先、16 个提交落后；唯一业务语义差异是 `packages/backend/src/services/semester-access-service.ts` 中 `CURRENT_SEMESTER_VERSION` 从主线的 `9` 变为 `8`，并伴随计划文件迁移/新增。
2. 已先创建仅作恢复用途的外置归档 worktree 与分支：`H:\ai-studybuddy-worktrees\archive-pre-semester-cleanup-20260725`、`codex/archive-pre-semester-cleanup-20260725`。
3. 原状态已提交为 `152d81fcb2775ae8e91ccbc24511cdcb478d97ff`（`chore(archive): 保存学期版本收口前状态`），同时保留未丢弃的 `stash@{0}`：`archive: pre-semester-version-cleanup 2026-07-25`。归档分支永不合并到 `master`，其作用仅为可追溯恢复点。

### 11.2 收口结论

1. 当前主工作区已安全切换到干净 `master`，并 fast-forward 到 `origin/master` 的 `9caeee9edfb1a6e2b8651fd1a49259621d88bb77`；未使用 `git reset --hard`、覆盖式 checkout、`git clean` 或文件系统删除来处理原脏状态。
2. 当前 `semester-access-service.ts` 的 `CURRENT_SEMESTER_VERSION = 9` 已与 `packages/backend/src/db/migrations.ts` 的学期迁移版本和 `semester-selector-service.ts` 的当前版本一致。版本 `8` 被明确保留为历史归档状态，不作为新的主线事实。
3. 验证均使用隔离 `APP_DATA_ROOT`：`pnpm type-check`、`pnpm -r --filter backend run build`、`pnpm -r --filter @ai-studybuddy/frontend run build`、`error-fixer-archive-api.test.mjs` 单文件 5/5，以及后续 `pnpm test` 全量 242/242 均通过。第一次全量运行曾有两项同文件测试在 10 秒健康等待内失败且 stderr 为空；单文件与完整复跑均通过，因此当前只能登记为未复现的测试启动异常，不能伪造为已确认业务 Bug，也不能据此改动业务代码。

### 11.3 剩余清理顺序（不得跳批）

1. **Batch 2 — 运行时兼容草稿归属**：先只读审查 `codex/process-runtime-deploy-compatibility` 与 `codex/process-runtime-deploy-compatibility-clean`。将已跟踪脚本/文档草稿、未跟踪计划、以及 TypeScript/E2E 生成物逐项分开；只有用户批准精确文件清单后，才可移动、提交或删除生成物。
2. **Batch 3 — 现有部署 worktree 归属**：审查 `codex/process-runtime-deployment` 的未跟踪内容及其是否仍对应有效部署任务；保留、归档或删除都必须由精确路径、进程检查和用户批准支持。
3. **Batch 4 — 暂停计划归属**：`phase1-5-t02-*` worktree 中的未跟踪 ASR 计划只登记为暂停草稿；不得借清理之名继续 G2、Firewall、WSL、Docker、S7 产品接入或创建 AuralConverter。
4. **Batch 5 — 历史隔离区保留期审查**：`H:\ai-studybuddy-worktrees\_legacy-unregistered-20260725` 目前是保护性隔离区，不是自动删除队列。后续是否删除、压缩备份或长期保留，需先完成目录级清单与单独批准。
5. **完成条件**：`H:\ai-studybuddy` 始终保持干净且仅承载已集成的主系统；每个外部状态都有所有权、用途、恢复点和处置结论；随后回到 `docs/04` 中学生本机学习闭环的下一项实际产品任务。Firewall/G2/ASR/Docker/WSL、S7 产品接入、用户电脑验收和 Phase 3 继续是独立未完成门禁。
