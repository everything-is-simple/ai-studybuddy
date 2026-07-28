# T02 共同可信批准与 no-follow 读取最小计划

**计划编号**：PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-20260728
**状态**：📝 仅计划，待独立审查；不授权任何实现、真实读取或修复
**创建日期**：2026-07-28
**任务分支**：`codex/phase3-t02-common-trusted-approval-plan`（仅本计划和 `docs/04` 索引）
**触发原因**：T02-R1 的外置 approval record 尚无可信信任锚且对 record / manifest / 包候选文件存在 check-then-read 间隙；T02-R2 的真实根与安全描述符读取同样要求同一 no-follow 句柄。两项 P1 共同阻断 R1 真实签收和 R2 真实 ACL 采证。

---

## 1. 唯一目标与完成口径

制定一个可由后续**最小实现切片**落实的共同安全契约，使 T02-R1 和 T02-R2 仅能接受不可被普通调用者伪造或替换的、来源可验证的批准记录，并使批准记录、R1 manifest/候选包文件、R2 目标根/安全描述符均通过同一 no-follow 安全读取原语消除“先检查、后按路径读取”的 TOCTOU 间隙。

本计划完成仅表示：范围、推荐信任锚、拒绝规则、接口契约、合成测试矩阵、残余风险和后续审批切片已被记录并接受独立审查。它**不表示**已实现可信批准、已关闭 TOCTOU、已完成 T02-R1/R2、已扫描任何真实内容、已读取真实 ACL、已修复 ACL、已完成 T02/Phase 3、已完成上线或用户电脑验收。

## 2. 严格范围

后续实现若获批准，唯一允许的共同底座范围为：

1. 定义并验证批准记录的不可变 schema、固定公钥、detached signature、签发窗口、用途、目标绑定和失败码；
2. 定义 Windows 本地固定卷、映射网络盘/UNC/重解析点的拒绝策略；
3. 定义可供 R1/R2 调用的同一安全打开与读取接口，以及平台不能证明语义时的 fail-closed 行为；
4. 使用仓库内**合成夹具**和测试专用密钥验证签名、路径绑定、卷分类、重解析点、替换竞争和脱敏失败路径；
5. 仅在本计划、后续专门实现计划和 `docs/04` 中记录非敏感的契约与证据摘要。

所有真实步骤仍须在独立计划、独立审查和用户单项批准后进行。特别是 R1 的仓库跟踪清单/实际候选包扫描及 R2 的六类逻辑根真实 ACL 读取均不在本计划或共同实现切片的运行范围。

## 3. 明确禁止项

本计划及其共同实现切片不得：

- 修改 `scripts/build-deployment-package.ps1`，不得变更部署包 manifest 格式或补造 `buildCommit`、`packageFingerprint` 等身份字段；
- 读取、枚举、暂存、提交、删除或以任何方式处理未跟踪目录、整个工作区、用户目录、磁盘根或任意真实候选部署包；
- 执行真实秘密扫描、读取真实 ACL、读取真实目录安全描述符、读取真实部署包 manifest、或产生真实机器证据；
- 实现或触及 T04/T05、真实 backup/restore、恢复写入、服务、计划任务、ACL 修复、`Set-Acl`、`icacls` 修改、写探针、进程/服务控制；
- 把合成夹具、测试密钥、分支提交、计划审查或静态检查表述为真实扫描、真实机器 ACL 证据、R1/R2 完成或 Phase 3 完成；
- 输出批准记录原文、签名、绝对路径、文件名、环境变量、真实 SID、ACL 原文、秘密值、候选内容或原始错误。

## 4. 推荐的信任锚：固定公钥 detached signature

三种候选方案中，推荐并要求后续实现采用**固定公钥验证 detached signature**，不采用“仅受控目录 + ACL”或“仅预登记摘要”作为单独信任锚。

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 固定公钥 detached signature | **采用** | 签名可把批准内容的来源和完整性绑定到离线受控私钥；本地调用者即使能新建、替换或移动 JSON，也不能生成可验证的新批准。无需把可写目录 ACL 当作信任根。 |
| 受控批准目录 + 文件身份/ACL 校验 | 不单独采用 | 管理员/继承/重解析/所有者变化会把“目录可写性”重新变成难以证明的本地信任假设；它最多是签名记录的防误用存放约束，不能替代签名。 |
| 预登记 record hash + artifact ID | 不单独采用 | 没有独立、已认证的预登记服务或不可变日志时，本地 hash 文件仍可被替换；若未来已有独立审批系统，可作为签名之外的第二因子。 |

### 4.1 生产批准记录的最小不可变内容

批准记录必须为严格 schema 的 UTF-8 数据，旁置独立签名文件；二者由同一 no-follow 原语读取。生产验证器只接受编译/发布物内固定的**公钥 ID + 公钥字节 + 算法版本**，不得接受 CLI 参数、环境变量、批准记录字段、配置文件或网络下载提供的替代公钥。

签名覆盖序列化规范明确的完整 payload，至少包含：

- `approvalVersion`、`approvalId`、`policyId=PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-20260728`、`purpose`（仅 `T02-R1` 或 `T02-R2`）；
- 签发者 key ID、签发时间、不可延展的 `notBefore`/`expiresAt` 窗口、一次性 nonce/序列号和明确的撤销/过期语义；
- 完整 Git commit、工具/安全读取契约版本和仅限该 purpose 的调用预算；
- 不回显的 `scopeBinding`：由后续安全打开操作从同一句柄取得并比较的本地卷身份、对象文件 ID、规范化路径摘要、逻辑类别/包根摘要及允许的 artifact 元数据；
- R1 专用的单一候选包 scope 与批准的仓库提交绑定；R2 专用的机器/安装实例**不透明别名**、安装根身份和固定六类逻辑类别绑定；
- 不含秘密值、资料原文、完整主机名、用户名、绝对路径、原始 ACL 或可作为输出的敏感内容。

记录文件及 signature 文件的路径不构成信任来源；通过固定公钥验证、purpose、时窗、提交、契约版本、scopeBinding 与本地句柄身份同时匹配才可被接受。任何字段未知、重复、超长、非规范编码、算法/key ID 不匹配、签名无效、时钟/时窗无法证明、撤销状态不可证明或绑定不匹配，均返回固定脱敏错误码并停止。

### 4.2 私钥与轮换的运行前提

签名私钥必须位于独立受控签发环境，不能保存在仓库、部署包、测试夹具、普通运行配置、环境变量或批准记录旁。后续实现计划必须明确算法、最小密钥长度、签发人职责、双人复核、丢失/泄露处置和公钥轮换版本；测试只能通过依赖注入使用与生产公钥完全分离的测试键，生产入口不得提供测试键覆盖开关。

本地时钟不是密码学信任根：若运行环境无法按批准流程确认当前时间可信，或检测到显著回拨/不一致，必须 fail-closed；不得因“签名正确”绕过时窗。无可信撤销渠道时只允许很短、不可延展的批准窗口，并将离线撤销局限作为 P1 残余风险记录。

## 5. Windows 本地卷与映射网络盘拒绝规则

批准记录、R1 候选包根/文件和 R2 安装实例/六类逻辑根都必须满足相同的本地存储前提；任一无法证明时拒绝。

1. 只允许已由 no-follow 句柄验证的现存常规文件或目录；任何最终项或中间路径组件为 symlink、junction、mount-point reparse、cloud placeholder 或其他 reparse tag，均为 `REPARSE_RISK`。
2. 拒绝 UNC 和扩展 UNC（包括 `\\server\share`、`\\?\UNC\...`）；拒绝 `GetDriveTypeW` 为 remote、removable、CD-ROM、RAM disk、unknown 或无法判定的卷。
3. 对盘符、卷 GUID、`SUBST`、目录挂载点和设备映射进行句柄级验证：只有能从同一链路证明为本机固定卷且设备路径不属于 `Mup`、`LanmanRedirector`、`WebDavRedirector`、`Rdbss` 或其他重定向器的目标才可继续。盘符字符串、路径前缀或 `GetDriveTypeW=DRIVE_FIXED` 单独均不足以放行。
4. 不接受“映射网络盘看起来是本地盘”“已缓存到本地”“管理员手工确认”“测试环境无错误”等替代证据；任一 API 不可用、结果冲突、权限不足、对象在比较期间改变，均按 `LOCAL_VOLUME_UNPROVEN` 或更具体固定码拒绝。
5. 不输出卷序列号、设备路径、真实盘符、真实根或文件 ID；只可在脱敏结果中报告 `LOCAL_FIXED_VOLUME_VERIFIED`、`REMOTE_OR_UNPROVEN_VOLUME`、`REPARSE_RISK` 等固定状态。

## 6. 同一 no-follow 安全句柄契约（关闭 TOCTOU）

### 6.1 唯一允许的抽象

后续实现必须提供单一内部抽象（名称可调整，例如 `openVerifiedNoFollow` / `readVerifiedNoFollow`），而非各调用点先 `lstat`/`realpath` 再 `readFile` 或 `Get-Acl`。抽象接收：预期对象种类、允许根/对象身份绑定、最大可读字节数、用途和最小操作（读取普通文件、读取目录安全描述符、枚举经批准的**已跟踪清单条目**等）；返回的只能是**同一已验证句柄**上的内容/安全描述符和最小非敏感身份摘要。

对每一个路径组件及最终对象，抽象必须在同一打开链路中：

1. 从可信本地卷锚点逐段 no-follow 打开，而非先解析字符串后重新按普通路径打开；
2. 验证对象类型、非 reparse、卷身份、最终路径/对象 ID、父子关系和 scopeBinding；
3. 在同一仍持有的 handle 上读取文件字节，或读取目录安全描述符；
4. 在读后从同一 handle 复核对象 ID/卷身份及允许根关系；
5. 任一步不可原子证明、发生替换、锁定/共享语义不足、对象消失或平台能力不足时关闭 handle、清空内容并 fail-closed。

禁止把“读取后再次 `lstat`”“普通 `readFile`/`Get-Acl`”“比较路径字符串”“仅禁止最终 symlink”作为等价替代。

### 6.2 Windows 与跨平台 fail-closed

Windows 实现必须由经过独立代码审查的低层 helper 提供逐组件、句柄相对的 no-follow 语义；它必须能证明中间目录和最终对象均未跟随 reparse，并从相同 handle 读取对象身份与内容/安全描述符。仅用 PowerShell `Get-Acl`、.NET 路径 API、`lstat` + `realpath`、或只给最终 `CreateFileW` 加 `FILE_FLAG_OPEN_REPARSE_POINT` 均**不足以**证明中间组件未被跟随，不能作为降级路径。

若目标平台、Node/.NET/PowerShell 版本或可审计的 native helper 无法提供上述语义，R1/R2 入口必须返回 `NOFOLLOW_HANDLE_UNSUPPORTED`（R2 可细化为 `ACL_EVIDENCE_NOFOLLOW_UNSUPPORTED`），不得执行读取。POSIX 仅在可证明逐层 `openat` + `O_NOFOLLOW`、fd 身份验证和同 fd 读取的实现存在时才可启用；否则同样拒绝。此共同抽象不授予递归枚举或任意路径访问。

### 6.3 对 R1/R2 的限定接入

- **R1**：approval record、detached signature、正式 manifest 与每一候选包文件都必须通过该抽象读取；仓库候选仍只来自 `git ls-files -z`，后续 R1 不得将“安全打开”扩展为读取未跟踪目录或全盘发现。现有 manifest 缺少身份字段时继续以 `SECRET_SCAN_PACKAGE_MANIFEST_MISMATCH` 停止，绝不手改 manifest 绕过。
- **R2**：只允许从批准安装实例推导 `config`、`data`、`logs`、`backups`、`tmp`、`models` 六个根本身；同一目录 handle 读取安全描述符。不得递归、读取子项、读取内容、计算 hash、调用服务/计划任务 API、备份/恢复或 ACL 写入。有效访问继续固定 `EFFECTIVE_ACCESS_UNKNOWN`。

## 7. 合成测试与静态验证矩阵

所有测试使用仓库内临时合成夹具、测试密钥和隔离数据根；不得接触真实批准记录、真实安装、真实包、用户数据或未跟踪目录。每个失败断言均检查序列化结果、异常和日志不含路径、文件名、签名原文、测试私钥、动态用户名/SID、哨兵秘密或原始内容。

| 类别 | 最小用例 | 预期 |
| --- | --- | --- |
| 签名信任锚 | 有效测试签名；篡改 payload/signature；错误 key ID/算法；替换公钥；重复/未知字段；编码不规范 | 仅合法生产格式可验证；其余固定码、无回显 |
| 时窗与用途 | 过期、未生效、时钟不可证明、错误 policy/purpose、提交/契约版本不符、nonce 重放 | 全部 fail-closed；不能把 R1 record 用于 R2 或反向使用 |
| scope 绑定 | 不同包根/文件 ID/卷/路径摘要；R2 错误实例别名或非六类类别；缺失绑定 | 拒绝，绝不依据用户传入路径放行 |
| no-follow 与 TOCTOU | 最终项及中间项 symlink/junction/reparse；approval/manifest/候选文件在打开后替换；目录重命名；句柄身份改变 | 关闭句柄、清空读取值、固定错误；不存在普通路径回退 |
| 卷分类 | UNC、扩展 UNC、映射网络盘、`SUBST`、目录挂载点、remote/unknown/removable/重定向器模拟、无法取证 API | `REMOTE_OR_UNPROVEN_VOLUME` 或固定拒绝码；无盘符/设备路径输出 |
| R1 接入边界 | Git 已跟踪清单与合成包条目；未跟踪候选、目录发现、manifest 身份缺失 | 未跟踪不读取；身份缺失继续 `SECRET_SCAN_PACKAGE_MANIFEST_MISMATCH` |
| R2 接入边界 | 固定六类根；静态源码 denylist（递归、内容读取、ACL 写、服务/计划任务、备份/恢复） | 仅六类根可达；禁止项不存在；有效访问未知 |
| 能力缺失与脱敏 | 无 native helper、不支持 no-follow、权限/共享失败、异常注入、超长/含换行输入 | `NOFOLLOW_HANDLE_UNSUPPORTED` 或固定码；无原始输出 |

后续共同实现的最低验证为：相关定向测试、既有边界测试、`scripts/check-docs-governance.ps1`、`git diff --check`；若实现触及 Node/PowerShell 共享库，再按规范运行 type-check、相关构建和隔离 `APP_DATA_ROOT` 的测试。测试通过只证明合成契约，不构成真实 R1/R2 证据。

## 8. 当前风险分级与停止规则

### P0（条件触发，当前未在真实环境判定）

- 固定签名私钥疑似泄露、错误签发、算法被攻破或生产验证器接受攻击者控制的公钥/签名：停止 R1/R2，撤销相关批准记录并进入独立 T02-P0 处置；
- no-follow helper 被证明可跟随中间 reparse、从替换对象读取或把未验证内容交给 R1/R2：停止共同实现与所有真实操作，按 P0 安全边界缺陷处置；
- 任何未来真实 R1/R2 运行发现秘密泄露或可直接破坏活动数据边界：停止普通 Wave，转入 T02-P0。

本计划没有真实扫描或 ACL 读取，因此**不能**得出“P0=0”的环境结论。

### P1（现有阻塞，未解决）

1. 现有 R1 approval record 只有 schema/时窗校验，尚无可信签发锚；必须由本共同切片替换后才能尝试真实签收。
2. 现有 R1 的 record、manifest、候选文件安全读取仍有 TOCTOU；R2 的 no-follow 读取同样尚未实现。
3. Windows 逐组件句柄相对 no-follow helper 的可行性、可审计性和故障注入测试尚未证明；无法证明即永久 fail-closed，不得用路径 API 降级。
4. 当前部署包 manifest 缺少 R1 所需的 `buildCommit` 与 `packageFingerprint` 身份契约；本计划明确不修改它，因此 R1 真实签收仍被正确阻断。
5. 离线签名记录的撤销与本机时间可信度有限；需要短时窗、签发流程和未来独立的撤销/时钟治理决定，不能静默假设可信。
6. R2 的批准机器/安装实例和六类真实根尚未提供；没有其独立、签名绑定批准，R2 不得读取。

## 9. 独立审查重点

独立审查必须确认：

- 推荐方案确实以固定公钥 detached signature 为唯一必需信任锚，且不依赖普通调用者可改的目录/配置/环境变量；
- record 的 scopeBinding、purpose、时窗、提交和版本不能被重放或跨 R1/R2 复用；
- Windows 规则明确拒绝 UNC、映射盘、重定向器、`SUBST`/挂载点不确定性和所有 reparse，而非仅检查字符串；
- no-follow 契约要求从同一 handle 验证并读取，且覆盖中间路径，不把 `lstat + readFile`、`Get-Acl` 或“读后再检查”误作关闭 TOCTOU；
- 计划未改变 manifest 契约、未加入真实读取/扫描/ACL 操作、未触及 T04/T05 或未跟踪目录；
- 测试不会将合成密钥或夹具结果表述为真实签收/真实机器证据；
- 是否仍有 P0 或需要 P1 修改，并给出精确章节和最小修复建议。

## 10. 需要用户另行批准的后续切片（顺序固定）

1. **PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-IMPLEMENTATION-20260728**：仅实现并测试本计划的签名验证、Windows 卷拒绝和 no-follow helper；不得运行真实 R1/R2，不改部署包脚本/manifest，不触及 T04/T05。须先独立审查并获单项批准。
2. **PHASE3-T02-R1-NOFOLLOW-ADOPTION-20260728**：把已审查共同抽象接入 R1 的 approval/manifest/候选读取，仅合成回归；真实扫描仍需独立目标 artifact 签名批准。若要改变部署包身份契约，另立最小计划，不能夹带在此切片。
3. **PHASE3-T02-R2-NOFOLLOW-ADOPTION-20260728**：把共同抽象接入 R2 六类根只读 ACL 证据，仅合成夹具与静态 denylist；真实 ACL 读取仍须由签名的目标机器/安装实例/窗口批准。
4. **部署包身份契约（如仍需要）**：仅在 R1 需要的 `buildCommit`/`packageFingerprint` 与当前 manifest 不兼容时，单独制定、审查、批准该变更；不得手工修改包或绕过 mismatch。
5. **真实 R1 签收** 与 **真实 R2 ACL 采证**：均须在各自接入通过独立复审后，获得各自精确 artifact/机器、实例、窗口、签名批准和运行前复核；任何 P1/P0 结论触发新的最小修复/处置计划，而非当场写入修复。

在上述批准前，Wave 0 仍处于“计划存在、真实操作未获准且被共同 P1 阻断”的状态。
