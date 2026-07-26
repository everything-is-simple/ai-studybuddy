# PHASE3-T02G：Windows 运行目录、ACL 与备份/恢复安全边界——实施计划

**状态**：计划已创建并完成本轮静态自审；待独立审查/用户批准，实施未开始。
**计划日期**：2026-07-26
**计划分支**：`codex/phase3-t02g-windows-data-acl-backup-restore-plan`
**审计基线**：`origin/master` / `master` 均为 `9c58e0a8808f7a07d459d375bb10fa16e63a932c`（2026-07-26 `git fetch origin master` 后，左右计数 `0	0`）。

> 本文件是后续最小实施切片的安全边界、测试门禁和审查清单，不是实现、部署、ACL 变更、备份、恢复或用户电脑验收记录。计划获批也不等于实施完成。

---

## 1. 任务目标、范围与非范围

### 1.1 目标

为 Windows 单机运行目录、ACL 证据和备份/恢复路径建立一份可执行、可拒绝危险输入且可在合成夹具中验证的后续实施计划。该计划应让未来实现者能够：

1. 明确 `config`、`data`、`logs`、`backups`、`tmp`、`models`、`runtime`、`run` 与应用包目录的职责、所有权、生命周期和受控根关系；
2. 以**只读、脱敏**方式收集 Windows ACL 的最小证据，并把缺失的目标用户电脑证据单列为未来门禁；
3. 约束 backup/restore 的输入、输出、manifest、recovery point、覆盖和危险目标拒绝条件；
4. 明确 bootstrap/check/start/health/stop/backup/restore 的路径解析、写入/覆盖/删除和错误输出应如何被后续切片审计；
5. 把可在仓库外合成夹具中验证的行为，与必须另行批准才能在真实安装或用户电脑执行的操作严格分开。

### 1.2 本轮唯一允许范围

本轮仅创建本计划，并在 `docs/04-开发任务清单-Todo-List.md` 的 **Phase 3 行动计划索引**登记 `PHASE3-T02G` 为“计划已创建、待审查/批准；实现未开始”。

本轮进行的审计只读取已跟踪的代码、脚本和有效文档；不读取环境文件、真实用户资料、真实日志、正式数据库、备份、模型、用户目录或外部 worktree 数据。

### 1.3 严格非范围

本计划及本轮均不：

- 修改 `package`、`bootstrap`、`check`、`start`、`health`、`stop`、`backup`、`restore` 或任何日志业务脚本；
- 新增或修改 ACL、目录权限、备份、恢复、删除、部署、数据迁移、服务或日志逻辑；
- 运行真实 ACL 修改、备份、恢复、部署、打包、递归删除、日志轮转/清理、服务、健康检查或业务测试；
- 读取、复制、处理或引用真实用户资料、真实日志、正式数据库、备份、模型、环境文件、用户目录或外部 worktree 数据；
- 调用 Provider、SMTP、Webhook、OCR、whisper.cpp 或网络服务；
- 处理 S7、G2、S3 Worker、用户电脑验收、PHASE3-T02 总体收尾、Phase 3 总体收尾、Docker/WSL 或生产防火墙；
- 创建未来 PRD、路线图或任何超出 T02G 的实施计划。

---

## 2. 已确认事实、未知项与禁止推断

### 2.1 已确认的只读事实

1. `docs/06-本地目录治理-Dev-Environment.md` 是当前 Windows 单机目录治理 SoT：正式使用机器采用 `%LOCALAPPDATA%\AIStudyBuddy`，开发与验证数据必须使用仓库外、可再生的隔离根；源码仓库、worktree、正式/半正式数据、日志、临时目录和备份必须按职责隔离。
2. `scripts/lib/AIStudyBuddy.Deployment.psm1` 的 `Get-AIStudyBuddyPaths` 当前把安装根派生为 `app`、`data`、`logs`、`tmp`、`models`、`backups`、`runtime`、`config`、`run`，并把 `production.env`、PID 和后端 stdout/stderr 日志置于这些逻辑根下。
3. 后端 `packages/backend/src/db/paths.ts` 将数据库、学期资料、学期临时目录和家长报告留档派生自 `APP_DATA_ROOT`；数据库只保存逻辑 `storage_key`，不应持久化绝对宿主路径。
4. `scripts/backup-data.ps1` 当前白名单复制全局库及 `data\semesters` 下的文件，排除路径名中的 `tmp`、`config`、`backup(s)`，生成每文件 SHA-256 manifest，并把备份文件设置为只读；其 manifest 当前包含 `sourceDataRoot` 宿主路径字段。这是审计观察，不是对该行为的认可或实现结论。
5. `scripts/restore-data.ps1` 当前在 `-WhatIf` 路径完成 manifest 格式、相对路径、payload 边界和哈希检查后不写活动数据；实际路径会创建 `backups\recovery-<timestamp>`，复制活动库/学期目录作为恢复点，再复制 payload 并清除目标文件只读属性。这是审计观察，不代表在本轮运行或认可真实恢复。
6. `docs/13-部署运维指南-Deployment.md` 与 `docs/09-测试验收计划-Test-Plan.md` 要求备份白名单覆盖 `studybuddy.db`、学期库与 materials，排除 config、tmp、logs、models、缓存和秘密；恢复应保留 recovery point；任何会写运行数据的验证都必须使用仓库外隔离 `APP_DATA_ROOT`。
7. 当前部署 helper 中只看见对目录可写性的探针和 `Get-Acl` 可读性检查；本轮没有执行它们，因而没有产生任一目录的 ACL 事实证据。
8. T02E 已完成部署包输出与 staging 删除受控根保护；T02F 已完成运行日志脱敏、轮转与保留/清理的独立边界。两者均明确排除 ACL、备份/恢复及更广泛部署脚本边界。

### 2.2 未知项（必须在未来实施前复核，不得据此推断）

- 目标用户电脑的 Windows 版本、磁盘格式、安装根是否已存在、是否有继承 ACL、owner、DACL/SACL、拒绝 ACE、网络重定向、reparse point 或端点防护策略；
- `%LOCALAPPDATA%\AIStudyBuddy`、其所有子目录和真实备份目的地的实际 owner、继承状态、有效访问权限、加密/同步/防病毒影响；
- 当前 Windows 用户、管理员、其他本机用户、SYSTEM、计划任务和备份存储介质在真实目标机器上的应有访问模型；
- backup manifest 的 `sourceDataRoot` 是否是所有消费端必需字段，以及是否应去除、改为逻辑根标识或仅在受控诊断中保留；
- 真实恢复时服务、SQLite、计划任务、打开文件、并发写入、reparse point、跨卷路径、磁盘空间和故障中断的实际行为；
- 现有 `APP_DATA_ROOT` 与部署安装根下 `data` 的映射是否在所有启动路径保持一致；
- `bootstrap/check/start/health/stop` 的所有未来调用者、可传入参数和错误消息在用户电脑上的实际组合。

### 2.3 禁止推断

不得因为目录可由当前开发机用户创建、`Get-Acl` 可读、`-WhatIf` 可走到验证分支、历史部署 smoke 曾通过、或某个测试在合成夹具通过，就推断：

- 真实 ACL 最小权限正确；
- 任意用户电脑可安装/可运行；
- 真实备份或恢复安全、完整、可回滚；
- PHASE3-T02、Phase 3、安全与隐私基线审计、生产上线或用户电脑验收完成。

---

## 3. 目录、所有权、生命周期与受控根模型

| 逻辑目录 | 用途与数据级别 | 预期所有权/访问原则（待实施前复核） | 生命周期与写入方 | 受控根边界 |
| --- | --- | --- | --- | --- |
| `app` / `scripts` | 已部署应用与脚本，非用户学习数据 | 安装用户可读；是否可写、管理员更新模型与继承 ACL 均待目标机证据 | bootstrap/升级写入；运行时不应把用户数据写入此处 | 不得作为 `APP_DATA_ROOT`、备份 payload、临时输出或递归删除目标 |
| `config` | DPAPI 受保护配置与无密钥运行字段 | 仅当前 Windows 用户/所需当前用户任务可访问；不得以 ACL 替代 DPAPI | 设置中心或 bootstrap 创建；备份必须排除 | 不得进入 backup payload、部署包、日志或合成测试输出 |
| `data` / `APP_DATA_ROOT` | SQLite、学期库、资料、脱敏报告留档 | 当前用户为最小可用访问主体；其他主体权限须用真实证据决定 | 应用运行时读写；恢复仅在独立批准/停止服务后进行 | 受保护根：不得被 package/staging/tmp/log cleanup 作为目标；备份仅白名单读取 |
| `logs` | T02F 受控 JSONL/后端 stdout/stderr，含敏感运行摘要风险 | 当前用户可写，避免宽泛共享；具体 ACL 待证据 | 运行时追加、T02F 控制的轮转/保留 | 与 data、backups、repo、用户目录不得重叠；T02G 不改日志逻辑 |
| `backups` | 只读备份、manifest、README 与恢复点 | 当前用户管理；备份介质/共享/同步策略需真实机审查 | backup 创建；restore 创建 recovery point；仅未来批准操作可写 | 不得与 active data、package output、staging 或 tmp 同根/重叠；不得作为递归清理目标 |
| `tmp` | 可再生中间文件、隔离测试夹具 | 当前用户可写；只允许受控清理 | Worker/转换/合成验证；不得储存唯一数据 | 必须证明位于隔离根、非 data/materials/backups/config；本计划不执行清理 |
| `models` | OCR/ASR 本地模型和缓存 | 不含用户资料；访问和下载策略待另项审查 | 运行时缓存或受控安装 | 不进 Git、部署包、常规数据备份或清理目标 |
| `runtime` / `run` | Python venv、PID 等运行控制资产 | 运行账户最小可用；升级/修复权限待实际证据 | bootstrap 创建，start/stop 使用 | 不属于 active data；不得混入 backup payload；不以本切片修改 |

**根关系总则**：未来实现必须在任何枚举、复制、覆盖、创建、ACL 检查或删除前获取规范绝对路径，按 Windows 大小写不敏感和完整路径段比较，拒绝空值、相对路径、卷根、仓库根、用户主目录、外部 worktree、`APP_DATA_ROOT`、安装根、受保护根交叠、跨卷意外、`..` 逃逸与任一无法可靠处理的 reparse point。字符串前缀比较不足以证明包含关系。

---

## 4. 威胁模型与风险分级

| 风险 | 等级 | 触发面 | 最小安全目标与未来门禁 |
| --- | --- | --- | --- |
| 恶意/误配 ACL 使其他本机用户或主体读到 data/config/backups | P1 | 默认继承、宽泛 Users/Everyone ACE、owner/继承不明、共享/同步目录 | 先只读采集 owner、DACL、继承和有效访问证据；未形成允许主体矩阵即阻断真实安装/ACL 修复声明 |
| ACL 修复误锁当前用户、计划任务或恢复流程 | P1 | `Set-Acl`/`icacls`、继承替换、owner 变更 | 另建批准切片；先在合成目录模拟并有明确回滚/管理员门禁；本切片绝不执行 |
| 恶意或损坏备份 manifest/payload 覆盖活动数据或逃逸目标 | P1 | 绝对路径、`..`、重解析点、重复/碰撞条目、hash/清单不一致 | 任何写入前验证 format、允许路径集合、规范化 payload 边界、重复/大小/数量上限、regular-file/reparse 状态和 hash；失败 fail closed |
| 恢复前未停止服务或生成 recovery point 失败 | P1 | SQLite 打开、计划任务、磁盘不足、复制中断 | 真实恢复必须独立批准，先停止和确认服务/任务，再验证 recovery point 完整性；任一步失败不得写 payload |
| manifest、控制台或错误输出泄露绝对宿主路径、资料名或秘密 | P1 | `sourceDataRoot`、异常 message、Copy/ACL 命令输出 | 未来 API/CLI 仅稳定错误码和脱敏类别；证据仅记录逻辑根、短哈希和非敏感结果；审查 `sourceDataRoot` 最小化方案 |
| backup 输出根可被输入指向安装根/data/用户目录/外部 worktree | P1 | `-OutputRoot`、Name、符号链接、跨卷 | 在创建目录前验证显式受控根、目标新建性、非重解析点和 protected-root 不交叠；绝不默认在任意输入位置写入 |
| bootstrap/check/start/health/stop 路径或错误串造成意外写入/信息泄露 | P2 | `InstallRoot`、PID、stdout/stderr、目录探针、启动失败 | 静态审计每个写入/删除点；合成夹具验证路径拒绝和错误脱敏；真实服务验证另批批准 |
| logs 与 T02F 边界或 package staging 与 T02E 边界重新被扩大 | P2 | 共享 helper、宽泛“运行目录清理”实现 | 新代码只负责本计划明确的 ACL/backup/restore helper；调用接口/测试不触及 T02E/T02F 已保护路径 |
| tmp/models 误被视为可无条件删除或可备份用户数据 | P2 | 通配符、递归枚举、缓存混入 | 路径类别白名单、受保护哨兵、reparse 拒绝和合成夹具；不执行真实清理 |

P1 在未来实施或真实机器验收前必须闭合或由用户明确签收剩余风险；P2 必须有针对性测试、固定错误输出和文档登记。P3（可读性、诊断格式、非敏感文案）不得掩盖 P1/P2。

---

## 5. 与既有 T02 切片的明确不重叠边界

### 5.1 T02E：部署包输出与 staging 删除

T02E 已负责 `build-deployment-package.ps1` 的受控输出根、唯一 staging 子目录、部署包排除项及 staging 递归清理。T02G：

- 不修改 package 输出、staging 创建/删除、ZIP 覆盖规则或 T02E 测试；
- 只把 package output/staging 明确视为**不能与安装根、`APP_DATA_ROOT`、backups、logs、models、config 或真实运行根重叠**的保护边界；
- 任何发现 T02E 的缺陷必须作为单独审计发现记录，不得借 T02G 修改其实现。

### 5.2 T02F：运行日志脱敏、轮转与保留/清理

T02F 已负责运行日志的 allowlist、脱敏、轮转、保留和清理保护。T02G：

- 不修改日志文件 allowlist、轮转、保留、清理、日志 API 或其测试；
- 只记录 logs 的目录所有权、ACL 证据和与 data/backups 的不重叠关系；
- 不把“目录 ACL”扩展为真实日志轮转、真实清理或任何递归删除。

### 5.3 其他接口

- T02A/T02C 的生产错误与配置脱敏契约继续适用：新边界只能产生固定错误码/类别，不得回显绝对路径、原始命令输出、stack、环境值、秘密或用户数据。
- T02B 的子进程最小环境不在本切片改动范围；`runtime`/`models` 仅作为目录边界登记。
- T02D 的秘密扫描证明边界不在本切片扩大；本计划不扫描真实包、磁盘、环境文件或用户目录。

---

## 6. 候选文件清单（均待未来实施前复核）

下表不是本轮修改清单，也不授权修改。候选文件必须在获批实施时重新从最新 `origin/master` 审计；若实际责任边界不同，应停止并更新计划，而非扩大实现。

| 候选文件 | 未来审查/最小可能职责 |
| --- | --- |
| `scripts/lib/AIStudyBuddy.Deployment.psm1` | 统一安装根/受保护根分类、规范路径、reparse 检查、非破坏性 ACL 证据采集及 backup/restore 前置验证 helper；不得暗含 ACL 修改或宽泛删除 |
| `scripts/backup-data.ps1` | 受控 output root、Name、白名单、manifest 最小化、regular-file/reparse 处理和脱敏错误；不得在实施前运行真实备份 |
| `scripts/restore-data.ps1` | manifest/payload 预检、恢复目标保护、recovery point 原子门禁、服务停止证据接口、恢复写入顺序和脱敏失败；不得在实施前真实恢复 |
| `scripts/test-data-integrity.ps1` | 对合成 backup fixture 进行格式/hash/排除项/manifest 脱敏断言；不读取真实备份 |
| `scripts/bootstrap-runtime.ps1`、`scripts/check-installation.ps1` | 仅审计/证明目录创建、只读 ACL 检查、受保护根和错误输出边界；不在本计划中改变行为 |
| `scripts/start-production.ps1`、`scripts/stop-production.ps1`、health 入口 | 审计 data/logs/tmp/models/backups 的路径、PID 与失败输出；真实启停/健康检查另行批准 |
| `packages/backend/src/config/env.ts`、`packages/backend/src/db/paths.ts`、`packages/backend/src/db/backups.ts` | 核对 `APP_DATA_ROOT`、逻辑 `storage_key`、备份/恢复业务路径与部署根的映射；不改业务代码 |
| `packages/backend/test/*deployment*`、`*backup*`、`*paths*`（候选，待实施前复核） | 仓库外合成夹具、失败矩阵、Windows reparse/ACL 只读证据抽象；不得接触真实数据 |
| `docs/04-开发任务清单-Todo-List.md`、`docs/06-本地目录治理-Dev-Environment.md`、`docs/09-测试验收计划-Test-Plan.md`、`docs/13-部署运维指南-Deployment.md` | 仅在未来事实和验证证据已经成立时同步；不得提前宣称真实机 ACL 或恢复完成 |

---

## 7. 未来实施分解、验收标准与失败测试优先级

### Slice G1：逻辑根与保护类别（先于所有写入）

**目标**：建立单一、无副作用的路径分类/比较能力，并明确安装根、仓库根、用户主目录、`APP_DATA_ROOT`、data、config、logs、backups、tmp、models、runtime、package output、staging、外部 worktree 的保护关系。

**最低验收**：

- 对空/空白/相对/卷根/仓库根/用户目录/外部 worktree/受保护根交叠/跨卷异常/`..`/case 变体均拒绝；
- 禁止字符串前缀伪包含（如 `C:\root` 与 `C:\root-escape`）；
- 发现或无法可靠判断 symlink、junction、mount point 或其他 reparse point 时 fail closed；
- 所有可见错误只包含稳定类别，例如 `PATH_EMPTY`、`PATH_PROTECTED_ROOT`、`PATH_OUTSIDE_CONTROLLED_ROOT`、`PATH_REPARSE_POINT`，不含宿主路径。

**优先失败测试（P1）**：相邻前缀、驱动器根、相对路径、`..`、不存在/无法规范化、junction/symlink、`APP_DATA_ROOT` 与 backup output 相同或互为父子。

### Slice G2：只读 Windows ACL 证据契约

**目标**：仅为合成目录和未来真实机人工采证定义统一、脱敏的 ACL 证据模型；不改变 owner、DACL、SACL 或继承。

**最低验收**：

- 合成夹具可读取 owner、继承状态、显式/继承 ACE 的主体类别与 allow/deny 类型；不记录 SID 以外的个人目录、绝对路径或命令原文；
- 只读证据能区分“可读取”“拒绝/不可读取”“API 不支持/无法可靠判断”，后两者不能被写成通过；
- 输出为逻辑目录类别、短哈希/稳定主体分类和 pass/fail/unknown，不输出真实用户名、完整 SID、宿主路径或 ACL 原文；
- 真实用户电脑 ACL 检查必须有独立用户批准、目标机器、非敏感采证格式和结果归档位置，且只读操作仍不得被表述为 ACL 修复完成。

**优先失败测试（P1）**：不可读 ACL、继承关闭、deny ACE、未知主体、无权限运行、reparse 目录、采证序列化不泄露合成路径/用户名哨兵。

### Slice G3：备份创建边界

**目标**：让 backup 仅向显式、受控、隔离且新建的输出目录写入；payload 仅来自白名单逻辑数据，manifest 最小化。

**最低验收**：

- output root 必须经 G1 验证，且不能为安装根、data、config、logs、tmp、models、backups 的危险交叠、仓库根、用户目录、外部 worktree 或 T02E package/staging 根；
- Name 不得造成空/根/相对/逃逸/已有目录覆盖；输出创建前检查父根、目标新建性、reparse 状态和跨卷规则；
- 枚举仅从明确白名单的数据路径开始，遇到 reparse/non-regular file/越界/无法说明的文件种类即拒绝或明确跳过并输出稳定分类；
- manifest 不含绝对 `sourceDataRoot`、用户资料名之外的额外敏感字段、秘密、日志或 config；若兼容性要求保留该字段，必须另批批准并证明其不会外露；
- payload、manifest、README 的每一条错误均脱敏，不回显真实路径/文件名/异常内容。

**优先失败测试（P1）**：危险 output root、已有 backup 覆盖、payload 发现 junction、`config/tmp/logs/models/backups` 被列入、manifest 含合成绝对路径哨兵、复制/哈希失败泄露哨兵。

### Slice G4：恢复验证与写入门禁

**目标**：在任何活动数据写入前，完整验证 backup、payload 与目标；真实恢复要有停止服务和 recovery point 门禁。

**最低验收**：

- `-WhatIf` 仅对合成 fixture 执行，证明验证失败或通过均不创建目录、不复制文件、不变更只读属性；
- manifest 条目拒绝绝对路径、`..`、空路径、重复/冲突路径、受保护类别、越界、缺失、hash 不符、reparse/non-regular file、数量/大小超限；
- 实际恢复的未来设计必须先证明服务/计划任务已停止、活动 data 根安全、recovery point 完整创建且可验证；任一步失败即不开始 payload 写入；
- 恢复目标只允许既定 data 子集，绝不允许 config、logs、tmp、models、backups、app、scripts、runtime 或任意调用者路径；
- 恢复后解除只读属性仅限已验证的新写入 regular files；不得跟随 reparse point；所有失败脱敏。

**优先失败测试（P1）**：`-WhatIf` 不落盘、恶意 manifest、hash 不符、目标/源 reparse point、recovery point 创建失败、服务未停止证据、复制中断、只读属性恢复范围错误、错误输出泄露。

### Slice G5：脚本边界回归与 Windows 原生证据

**目标**：在不扩大 T02E/T02F 的前提下，以合成夹具证明 bootstrap/check/start/health/stop/backup/restore 的路径参数、目录探针、PID/日志和错误边界不会越过受保护根。

**最低验收**：

- 每个脚本逐项登记：参数来源、规范化点、读路径、写路径、覆盖/删除点、服务/网络副作用、错误输出和测试替身；
- 只运行批准的纯函数/静态检查或合成夹具测试；任何需要 Node 服务、真实安装、用户目录或真实 `APP_DATA_ROOT` 的检查转为待验收证据；
- 在支持 Windows reparse/ACL 行为的原生 Windows 环境中记录合成夹具命令、PowerShell 版本、返回代码和脱敏结果；不能用 Docker/WSL 或其他平台结果替代；
- T02E package/staging 与 T02F log rotation/retention 专项回归只在受批准的相关测试存在时执行，且不改变其实现。

---

## 8. 隔离夹具与证据设计

### 8.1 合成、仓库外夹具

未来所有会创建文件的针对性测试必须使用新建的、无真实数据的仓库外根，例如：

```text
H:\ai-studybuddy-tmp\runs\phase3-t02g-<test-id>\
  install-root\       # 合成 app/config/data/logs/backups/tmp/models/runtime/run
  backup-output\      # 仅测试批准的 output 子目录
  fixture-backup\     # 合成 manifest + payload
  protected-sentinels\
  outside-root\
```

- 路径只使用随机/非敏感测试标识；文件只含无意义合成哨兵，不含真实姓名、资料、秘密、日志或数据库；
- 对所有保护根建立哨兵并在测试前后核对内容/哈希不变；
- 若 Windows 权限允许，用专门创建的 junction/symlink fixture 验证 fail-closed；若环境无法可靠创建或检查，则测试必须标记 `unsupported`/失败并阻断对应真实操作，不得跳过后宣称通过；
- ACL fixture 仅创建在该隔离根，绝不读取或修改真实 `%LOCALAPPDATA%`、用户目录、仓库、worktree 或生产路径；
- 测试结束后的夹具处置必须遵循独立批准的精确路径白名单；测试本身不能以递归删除验证为由触碰其他目录。

### 8.2 必须另行批准的真实操作

以下均不是本计划或一般实施测试的一部分：真实用户电脑 ACL 采证、任何 ACL 修改、正式安装根创建/修复、真实备份、真实恢复、真实 service start/stop/health、真实计划任务、真实模型/资料/数据库处理。每项至少需：

1. 独立任务批准和用户确认的精确目标机器/目录；
2. 已完成的 G1–G4 合成证据及风险复审；
3. 备份/恢复前的当前数据状态、停止服务与 recovery point 专项门禁；
4. 脱敏的执行记录和明确的成功/失败/未知结论；
5. 不把单机证据外推为其他用户、其他目录或生产上线完成。

---

## 9. 真实操作禁止项与安全停止条件

未来实施出现任一项必须在**任何写入、复制、属性改变、ACL 命令、服务调用或递归枚举之前**停止：

- 不能证明路径位于新建合成受控根，或路径与仓库、用户目录、外部 worktree、安装根、`APP_DATA_ROOT`、data、config、logs、backups、tmp、models、runtime、package/staging 保护根重叠；
- 目标为空、相对、卷根、无法规范化、跨卷关系不明、已有未知内容，或包含/解析到 reparse point；
- ACL 证据不可读、不完整、主体/继承语义不明、需要管理员权限或可能修改真实目录；
- backup/restore 需要真实数据、真实服务、真实环境文件、真实用户目录、真实备份或无批准的 recovery point；
- manifest、控制台、测试失败或日志可能输出绝对路径、用户名、SID、文件内容、stack、原始命令、环境变量值、秘密或个人信息；
- 工作树/目标分支/祖先存在未能安全确认的非本任务改动、冲突或 non-fast-forward 风险；
- 需求延伸到 T02E/T02F 实现、生产防火墙、Docker/WSL、S7、G2、S3 Worker、用户电脑验收、T02 或 Phase 3 总体收尾。

停止时仅报告脱敏的阻塞类别、逻辑目录类别和下一步审批需求；不得尝试“修复后继续”。

---

## 10. 主线复验、文档登记、提交与推送规则

1. 实施必须从届时最新且干净的 `origin/master` 新建独立分支/worktree；不得重写、合并或回退 T02A–T02F。
2. 纯计划/文档任务只运行 `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`、`git diff --check`、状态检查和必要的只读搜索；不得运行会写运行数据的测试、服务或部署脚本。
3. 后续代码实施只运行经批准的最小定向测试，并在任何写数据命令前将 `APP_DATA_ROOT` 指向新建、仓库外隔离根；完整测试、真实 Windows 证据和用户机操作各自另有门禁。
4. 只有测试、构建（如适用）、文档治理、`git diff --check`、独立审查、`docs/04` 事实登记和最新主线复验均通过后，才可按仓库 fast-forward 流程合入并推送 `origin/master`。
5. 推送任务分支仅是备份/审查，不等于主线或任务整体完成。

---

## 11. 本轮计划自审结论

- 范围只覆盖 T02G 的**计划创建与静态自审**；未修改运行、部署、ACL、备份、恢复、删除或日志逻辑。
- 已明确 data/config/logs/backups/tmp/models/runtime 的用途、受保护根、未知 ACL 事实和后续最小实现切片。
- 已把合成夹具验证与真实用户电脑/真实操作分开；真实操作均需要独立批准。
- 已明确不重叠于 T02E 的 package/staging 删除和 T02F 的日志轮转/保留边界。
- 已为路径、ACL、backup 和 restore 定义 P1 优先失败测试、fail-closed 停止条件和脱敏输出契约。

**自审结论：通过（仅表示本计划文件范围、状态措辞和门禁一致）。** 本结论不表示 T02G 实施、ACL 修复、备份/恢复验证、PHASE3-T02 总体、Phase 3、安全与隐私基线审计、生产上线或用户电脑验收完成。
