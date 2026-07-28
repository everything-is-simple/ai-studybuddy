# T02 共同可信批准与 no-follow 最小实施计划

**计划编号**：PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-IMPLEMENTATION-20260728
**状态**：🧪 实施分支已完成共同接口与合成验证，并完成三轮源码审查 P1 处置及回归；无 production trust anchor、production 固定 fail-closed；待最终源码独立复审与主线集成；不授权真实 R1/R2 操作
**创建日期**：2026-07-28
**任务分支**：`codex/phase3-t02-common-trusted-approval-implementation-plan`（仅计划和 `docs/04` 索引）
**前置计划**：已通过第二位独立审查的 `PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-20260728`，位于已推送提交 `23f2e20` 的 `codex/phase3-t02-common-trusted-approval-plan`；该前置计划未合入 `master`，本计划仅引用其已审查契约，不复制或合并其文件。

---

## 1. 唯一目标与完成口径

在不运行任何真实 R1 秘密扫描或 R2 ACL 读取的前提下，实现并测试三项共同**底座接口**：

1. 严格 detached-signature 批准记录 schema/验证契约及测试专用动态密钥验证；production 不配置 production trust anchor，固定 fail-closed；
2. 受认证验证器完整性不可证明时的 fail-closed gate；
3. Windows 本地卷/UNC/映射盘/reparse 拒绝和逐组件、同一 handle no-follow 读取的抽象接口与合成适配器。

本切片的完成仅表示：这些库的 schema、固定失败码、默认拒绝行为和仓库内合成测试已实现并通过。它**不表示**已有受认证生产发布物、已有可证明的 Windows native no-follow helper、已读取批准记录/manifest/包文件/ACL、已完成 R1/R2、已解决正式 manifest 身份缺失、已完成 T02/Phase 3 或用户电脑验收。

生产入口在本切片结束后仍必须默认停止：没有外部受认证验证器身份时为 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`；没有经独立审查的 Windows 句柄相对 native backend 时为 `NOFOLLOW_HANDLE_UNSUPPORTED`。测试注入的密钥、attestation provider 与内存适配器绝不得通过 CLI、环境变量或普通生产配置启用。

## 2. 严格范围与禁止项

### 2.1 允许范围

- 纯 CJS 共同库、测试辅助模块、Node `node:test` 合成测试以及最小文档/任务索引同步；
- **仅测试进程内存**的合成对象图，用于模拟目录组件、卷类别、reparse、打开后替换和同流内容变化；不得把真实文件系统临时目录作为 no-follow、卷类别、reparse 或竞争语义的夹具；
- 测试进程内生成的测试专用签名密钥，且私钥绝不写入仓库、测试输出、环境变量或 fixtures；
- 对固定字节数组的 detached signature、严格 schema、短时窗只读授权语义与脱敏错误测试；
- 生产默认拒绝的 capability gate 和测试专用 dependency injection。

### 2.2 明确禁止

- 不调用 `scripts/confirm-secret-scan-signoff.cjs`、`scripts/confirm-secret-scan-signoff.ps1` 或真实 R1 扫描函数；不读取 Git 工作区、实际候选包、真实批准 record/signature、真实 manifest、用户数据或运行数据；
- 不调用 `Get-Acl`、`Set-Acl`、`icacls`、任何 ACL/目录安全描述符读取；不调用服务、计划任务、备份、恢复或进程控制命令；
- 不读取、枚举、暂存、提交、删除或断言未跟踪目录，尤其不处理主工作树既有未跟踪目录；
- 不修改 `scripts/build-deployment-package.ps1`、部署包 manifest 格式、`scripts/lib/AIStudyBuddy.SecretScan.cjs`、R1 CLI/PowerShell 包装、`scripts/lib/AIStudyBuddy.Deployment.psm1` 或任何 R2 入口；
- 不实现 native helper、代码签名、安装器、发布链、真实 Windows 句柄读取或真实卷探测；这些需要独立最小计划和审查，不能以测试 mock 冒充已具备；
- 不触及 T04/T05、backup/restore、ACL 修复、真实恢复写入或其他 Phase 3 任务；
- 不输出 record 原文、signature、公钥字节、测试私钥、路径、文件名、完整主机名、用户名/SID、环境变量、原始异常、fixture 内容或哨兵值。

## 3. 精确文件范围

| 文件 | 变更 | 单一责任 |
| --- | --- | --- |
| `scripts/lib/AIStudyBuddy.TrustedApproval.cjs` | 新增 | 严格 approval envelope schema、测试闭包内 Ed25519 detached-signature 验证契约；production 不配置任何 trust anchor、固定 fail-closed；purpose/policy/commit/contract/time/scope/content-identity 比对；只返回内部冻结的非序列化 approval capability 或固定错误码。 |
| `scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs` | 新增 | 验证器完整性 gate；生产 API 不接受 CLI/环境变量/配置或调用参数提供的 identity，缺少外部受认证 provider 时固定拒绝；测试仅通过非契约测试缝直接注入。 |
| `scripts/lib/AIStudyBuddy.NoFollow.cjs` | 新增 | 平台无关的逐组件 no-follow handle 抽象、Windows 卷类别拒绝策略、同 handle 读/复核状态机与**默认 unsupported backend**；生产 API 无 backend 注入入口，禁止调用 `fs.readFile`、`realpath`、`Get-Acl` 或路径式降级。 |
| `packages/backend/test/trusted-approval-contract.test.mjs` | 新增 | 内存测试密钥、签名篡改、精确 canonical record、短时窗重复只读、purpose/commit/scope/content-identity、production gate 与脱敏测试。 |
| `packages/backend/test/verifier-integrity-gate.test.mjs` | 新增 | 验证器身份缺失、版本不符、篡改 provider 结果与测试注入隔离；证明生产默认固定拒绝，并断言伪造/附加调用参数不能绕过。 |
| `packages/backend/test/nofollow-contract.test.mjs` | 新增 | 合成逐组件 handle backend：UNC/映射盘/`SUBST`/remote/reparse 拒绝、同 handle 读取、打开后替换、对象 ID 与内容身份变化、无 backend fail-closed、无路径泄露及失败零字节交付。 |
| `packages/backend/test/helpers/trusted-approval-fixture.mjs` | 新增 | 唯一允许导入 `__TEST_ONLY_*` factory 的测试 helper：内存 approval payload、进程内动态测试键、哨兵值、合成 handle/volume/reparse/race 适配器；不得提供真实文件系统 fallback。 |
| `packages/backend/test/trusted-approval-test-seam-isolation.test.mjs` | 新增 | 只检查 Git 已跟踪源码的静态依赖：仅 allowlist helper 可引用 `__TEST_ONLY_*`，并拒绝生产文件、动态 require、重导出和 test helper/test backend 泄漏。 |
| `.plans/phase3-t02-common-trusted-approval-nofollow-implementation-20260728-plan.md` | 新增 | 本计划与审查修订记录。 |
| `docs/04-开发任务清单-Todo-List.md` | 修改 | 在 Phase 3 行动计划索引登记此计划的真实状态；不勾选 R1/R2 实现完成。 |

除上述文件外一律不改。特别是不得为了“接入验证”修改 R1/R2 现有文件；接入只能留给第 10 节的后续批准切片。

## 4. 接口契约

### 4.0 信任锚、生产/test 隔离与确定性 record 格式

- **本次不写入生产信任锚**：不会在 `AIStudyBuddy.TrustedApproval.cjs` 中写入生产 SPKI DER Base64、公钥指纹或其他 production key 材料；`keyId = asb-phase3-t02-approval-ed25519-v1` 仅保留为严格 record schema 的预留固定标识，绝不表示已配置或可用的生产密钥。私钥绝不进入仓库、日志、fixture、环境变量或测试输出。
- production trust anchor 的实际 SPKI DER、SHA-256 指纹和受控交付验证不属于本次实施；缺失时 production API 必须保持固定拒绝，且不得自行生成、推断、选择或用测试 key 代替生产信任锚。后续仅可在独立计划、独立审查和用户单项批准后配置。
- 本切片不支持 production key、运行时 key rotation 或 production key fallback。未来任何 production key、`keyId`、算法或指纹配置均需新的最小计划、独立审查、用户批准和 source review。测试 key 只允许 `asb-test-*` namespace，且测试必须断言其不能等于预留 production `keyId`。
- 已文档化的生产 API 不接受 key、resolver、identity、provider、backend、platform 或 capability 参数；它们不读取 CLI、环境变量、普通配置、网络或路径。生产函数必须先执行内部 integrity gate，因此在本切片一律 fail-closed。
- 可测试性仅由三个共同 CJS 模块内未文档化的精确 `__TEST_ONLY_*` factory 提供，用于建立与生产闭包分离的动态 test-key/test-provider/in-memory-backend 实例；它**不属于生产契约**，不能改变已文档化生产函数的行为。角色 allowlist 固定如下：
  1. 只有 `scripts/lib/AIStudyBuddy.TrustedApproval.cjs`、`scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs`、`scripts/lib/AIStudyBuddy.NoFollow.cjs` 可以**定义并导出**各自精确命名的 `__TEST_ONLY_*` factory；各自的已文档化生产函数不得接受、调用或沿执行路径暴露这些 factory。
  2. 只有 `packages/backend/test/helpers/trusted-approval-fixture.mjs` 可以**直接 import/require**并调用这些 factory；三个 contract test 只能导入该 helper，不能直接导入 factory。
  3. 只有 `packages/backend/test/trusted-approval-test-seam-isolation.test.mjs` 可以作为**扫描器**保留匹配字面量，但不得 import、调用或 re-export factory。
  4. 其余任何 Git 已跟踪 `.cjs/.js/.mjs` 文件一律不得包含 factory 标识、fixture helper/test-backend 路径，或对 factory 的直接/计算式 `require`、`import`、re-export。
- 必须新增 `trusted-approval-test-seam-isolation.test.mjs`。它只用 `git ls-files -z -- scripts packages` 取得 Git 已跟踪的 `.cjs/.js/.mjs` 文件（绝不枚举未跟踪目录），按上述角色 allowlist 检查 source；共同 CJS 模块内对 factory 的动态/计算式 require 一律失败。该静态检查是防误接入门禁，不声称可抵御能够任意修改受审源码的攻击者。
- record 是严格 ASCII 字节序列，总长 `1..2048` 字节：无 BOM、无 NUL、无 CR/LF 以外控制字节、无前后空白、仅 `\n` 换行且最后一个字节必须为 `\n`。它必须恰好有下列行、顺序固定、每个字段只出现一次，且无空行或未知字段：

  ```text
  format=ASB-TA1
  keyId=asb-phase3-t02-approval-ed25519-v1
  policyId=<1..96 ASCII [A-Za-z0-9._-]>
  purpose=<T02-R1|T02-R2>
  fullCommit=<40 lowercase hex>
  contractVersion=<positive decimal, no leading zero>
  notBeforeEpochMs=<0..253402300799999 decimal, no leading zero>
  notAfterEpochMs=<0..253402300799999 decimal, no leading zero>
  approvalId=<16..64 ASCII [A-Za-z0-9_-]>
  scopeBinding=sha256:<64 lowercase hex>
  artifactContentIdentity=sha256:<64 lowercase hex>
  ```

  `notBeforeEpochMs < notAfterEpochMs`，且窗口不超过 `900000` ms。parser 必须以原始字节先验证上述语法与顺序，再按同一格式重新序列化并逐字节相等；任何 duplicate、unknown、非 ASCII、别名、空白、数字变体、编码变体或长度越界均固定失败。detached signature 必须恰为 64 个二进制字节，并直接验证**完整、未改写的 canonical `recordBytes`**，不得预哈希、拼接额外字节或通过 JSON 再解析。

### 4.1 `AIStudyBuddy.TrustedApproval.cjs`

仅暴露以下内部 API（命名可等价调整，语义不得放宽）：

```js
verifyTrustedApproval(input)
```

- 生产入口必须是**不解构**的单一 `input` 参数。函数体的第一条有效语句必须是模块内部固定调用 `requireTrustedVerifierIntegrity({ requiredContractVersion: "1" })`；在 gate 成功前不得检查 `input` 类型、枚举/读取其属性、解构、展开、日志化或触碰 `recordBytes`、`signatureBytes`、`expected`。gate 成功后才验证 `input` 的精确字段全集并读取它们。`recordBytes` 和 `signatureBytes` 只能由未来 R1/R2 接入层的 no-follow verified handle 提供；本切片测试只传内存字节，库本身不得按路径打开文件。
- production 验证器在本切片没有配置、读取或选择任何 trust anchor：它必须先由第 4.2 节 gate 固定拒绝，绝不接受来自 CLI、环境变量、record、配置、网络或调用参数的 key。测试动态生成的专用密钥只能存在于第 4.0 节定义的闭包隔离测试实例。
- parser 必须按第 4.0 节 raw-byte 规则拒绝重复字段、未知字段、非 ASCII/非规范 UTF-8、超长值、非法标识符、算法/key ID 不匹配及所有自由文本字段；签名输入就是第 4.0 节完整 canonical `recordBytes`；验证前后都不得回显原始值。
- R1 的 `artifactContentIdentity` 必须包含算法、canonicalization version、entry count 和 package fingerprint / canonical entry-list digest；本库仅比较已由同一 verified-handle 扫描流产生的值，绝不自行按路径 hash。
- 授权模型固定为短时窗、可重复、完全相同 scope 的只读授权；`approvalId` 仅作关联，不实现 nonce 消费、调用预算或可回滚本地状态。跨 purpose、commit、scope、contract 或时窗的复用一律拒绝。
- production gate 的上述调用必须在任何 JavaScript 参数解构、getter/`Proxy` property access、type check 或错误格式化前完成；随后才比较 record/expected 的 `contractVersion`。本切片因未有注册入口而固定失败。额外字段、伪造 object/`Symbol`/冻结 capability，以及会抛错的 `Proxy`/getter 都不得改变为成功、触发 getter 或泄露底层异常。只有闭包隔离的测试实例可构造 synthetic integrity 成功路径。成功只返回不可 JSON 序列化、冻结的 capability；失败只抛固定 `TRUSTED_APPROVAL_*` 或 gate 码，`message === code`。

### 4.2 `AIStudyBuddy.VerifierIntegrity.cjs`

```js
requireTrustedVerifierIntegrity({
  requiredContractVersion,
})
```

- 这是 `verifyTrustedApproval` 模块内部无条件执行的必经 gate。生产 API 没有 identity/provider 注入参数；它只接受未来受认证发布/启动边界在独立 adoption 切片中注册的、不可由普通调用者替换的 verifier identity（至少含 contract version 与完整性声明）。
- 本切片不实现代码签名、安装器、发布证明、自校验引导或注册入口；因此生产 `requireTrustedVerifierIntegrity` 必须固定抛 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`。
- 测试 provider 只能通过未文档化、非生产契约的 `__TEST_ONLY_*` factory 由精确列出的测试文件直接创建；所有非测试目录静态禁止导入该 factory。provider 返回的任何原始数据都不可进入错误或可观察输出。

### 4.3 `AIStudyBuddy.NoFollow.cjs`

```js
createNoFollowReader()
```

返回的方法仅允许：

```js
openVerifiedPath(input)
readVerifiedFile(input)
readVerifiedDirectorySecurityDescriptor(input)
closeVerifiedHandle(input)
```

- API 将路径视作不可信 locator；生产 API 没有 platform 或 backend 注入参数，平台只能由模块内部确定；且不可在无 backend 时将 locator 交给 `fs.readFile`、`lstat`、`stat`、`realpath`、PowerShell 或其他路径 API。生产 unsupported reader 的四个方法均必须使用不解构的单一 `input`（或等价地完全无参数）；每个方法在任何 `input` 类型检查、属性读取、枚举、解构、展开、日志、错误格式化、backend 调用或路径操作之前，固定抛出 `NOFOLLOW_HANDLE_UNSUPPORTED`。
- backend 必须逐组件从已验证的本地卷锚点 no-follow 打开，并从**同一 handle**返回对象种类、reparse 状态、卷类型/设备类别、对象 ID、父子关系、字节流或目录安全描述符及读后身份复核。facade 不得接受“先检查、后普通读取”的 backend 声明。
- Windows 策略对 UNC/扩展 UNC、remote/removable/CD-ROM/RAM/unknown、`SUBST`、目录挂载点、Mup/LanmanRedirector/WebDavRedirector/Rdbss 或任何无法证明的设备映射拒绝；任一中间/最终 reparse 也拒绝。只允许 backend 已证明为 local fixed volume 的结果。
- `readVerifiedFile` 必须在同一 handle 上先读取到私有缓冲、在交付任意字节前后复核 object ID、父子关系和不可变 `contentVersion`；仅当所有复核一致且未超过 `maxBytes` 时才返回一份新复制的完整 `Buffer`。任何替换、内容不稳定、读超限、锁定/共享不确定或 backend 能力不足均清空私有缓冲、关闭 handle 并失败；不得返回 bytes、stream、partial result、object ID、contentVersion 或可复用 handle。R1 同流 fingerprint 的实际 tee 由后续 R1 adoption 完成，本切片只暴露不可降级的 bytes/identity contract。
- `readVerifiedDirectorySecurityDescriptor` 仅定义接口，不接入 `Get-Acl` 或真实目录；其未来成功语义也必须先私有完整读取、前后 identity/contentVersion 复核后才交付完整新复制字节。无 native backend 时固定 `NOFOLLOW_HANDLE_UNSUPPORTED`。
- 本切片的生产 backend 为明确 unsupported：不得触发 `Proxy`/getter、不得调用 backend、不得返回 bytes/stream/partial result/handle。只有测试通过未文档化、非生产契约的 `__TEST_ONLY_*` factory 创建内存合成 reader 后，才可在进入合成 backend 时校验 `input` 字段；所有非测试目录静态禁止导入该 factory，且它不允许 Node/PowerShell 文件系统 fallback。

## 5. 固定失败码与可观察性

所有错误 `message` 必须等于 `code`；CLI、日志与测试断言只允许固定码、非敏感布尔值及计数，不得包含输入回显。

| 分类 | 固定码 |
| --- | --- |
| approval 格式/签名 | `TRUSTED_APPROVAL_RECORD_INVALID`、`TRUSTED_APPROVAL_SCHEMA_INVALID`、`TRUSTED_APPROVAL_KEY_UNTRUSTED`、`TRUSTED_APPROVAL_SIGNATURE_INVALID`、`TRUSTED_APPROVAL_CANONICALIZATION_INVALID` |
| approval 绑定 | `TRUSTED_APPROVAL_POLICY_MISMATCH`、`TRUSTED_APPROVAL_PURPOSE_MISMATCH`、`TRUSTED_APPROVAL_COMMIT_MISMATCH`、`TRUSTED_APPROVAL_CONTRACT_MISMATCH`、`TRUSTED_APPROVAL_TIME_WINDOW_INVALID`、`TRUSTED_APPROVAL_SCOPE_MISMATCH`、`TRUSTED_APPROVAL_CONTENT_IDENTITY_MISMATCH` |
| verifier gate | `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`、`TRUSTED_VERIFIER_CONTRACT_MISMATCH` |
| no-follow/backend | `NOFOLLOW_HANDLE_UNSUPPORTED`、`NOFOLLOW_LOCAL_VOLUME_UNPROVEN`、`NOFOLLOW_REMOTE_OR_UNPROVEN_VOLUME`、`NOFOLLOW_REPARSE_RISK`、`NOFOLLOW_OBJECT_KIND_MISMATCH`、`NOFOLLOW_HANDLE_IDENTITY_CHANGED`、`NOFOLLOW_READ_LIMIT_EXCEEDED`、`NOFOLLOW_READ_FAILED` |

不新增 R1/R2 业务结果码；未来接入层可将固定共同码映射到其既有脱敏结果码，但只能在独立 adoption 切片中完成。

## 6. 合成测试矩阵

所有 security 语义夹具均只在测试进程内存中创建；不触碰系统临时目录、仓库未跟踪目录、实际部署包、真实 record、真实 manifest、运行数据或真实 ACL。普通测试框架若自身创建临时目录，该目录不得被共同库读取、不得参与 no-follow/volume/reparse/race 断言，也不得作为安全证明。每个失败用例都以随机哨兵验证错误、序列化结果和测试输出不含路径、文件名、测试私钥、record/signature 原文或哨兵。

| 类别 | 合成用例 | 必须断言 |
| --- | --- | --- |
| 签名测试/production 拒绝 | 有效动态测试键；payload/signature 单字节篡改；错误 key ID/算法；试图通过 record/环境/调用参数替换 key，或由非测试文件导入 `__TEST_ONLY_*` factory | 仅精确测试文件可用；production 未配置 key 且固定拒绝；无敏感回显 |
| 严格 record schema | 第 4.0 节每个字段的缺失/重复/顺序错、非法 ASCII/UTF-8、BOM/CRLF/空白、超长、数字 alias、错误 policy/purpose/commit/contract、非 64-byte signature | 固定 `TRUSTED_APPROVAL_*`，不回显原输入；对每条规范至少一正一反内存 fixture |
| 时窗与重复语义 | 过期、未生效、不可证明的时间、R1→R2 复用、scope 不同；相同短时窗同 scope 的只读重复 | 前者拒绝；后者明确允许且不创建消费状态 |
| R1 内容身份 | 算法/version/entry-count/digest 不符；内容 ID 缺失；对象 ID 相同但合成流字节变动 | `TRUSTED_APPROVAL_CONTENT_IDENTITY_MISMATCH`，无部分成功 capability |
| verifier gate | 生产无注册能力、contract 不符、测试 provider 抛错/返回自由文本；生产调用附加伪造 object/`Symbol`/冻结 capability、`Proxy`、`recordBytes`/`expected` getter 或抛错 getter；仅 `__TEST_ONLY_*` 测试 factory 成功 | 生产默认 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`；不得触发 getter/Proxy；附加调用参数不可改变拒绝；无 provider 数据回显 |
| 本地卷策略 | UNC/扩展 UNC、mapped remote、`SUBST`、mount point、Mup/Lanman/WebDav/Rdbss、removable/unknown、local fixed | 非 local fixed 一律固定拒绝；不得输出路径/盘符/设备名 |
| no-follow 组件链 | 中间或最终 reparse、对象种类错、父子关系断裂、打开后替换、读后 ID/`contentVersion` 改变、超限；生产 unsupported reader 收到参数、`Proxy` 或抛错 getter；生产 backend 缺失 | 合成失败清空缓存/结果、关闭合成 handle、固定 `NOFOLLOW_*`；生产 unsupported 不触发 getter/backend 且固定 `NOFOLLOW_HANDLE_UNSUPPORTED`；任何失败均零字节/零 stream/零可复用 handle 交付，且无普通路径 fallback |
| R2 只读接口 | 合成目录 descriptor 请求、无 backend、试图请求内容读取/递归/ACL 写操作 | 仅接口 contract；无 backend 拒绝；源码静态 denylist 不出现 `Get-Acl`/`Set-Acl`/`icacls`/服务/计划任务/备份恢复命令 |
| test seam、范围与输出 | 仅 helper allowlist 可导入 `__TEST_ONLY_*`；Git 已跟踪 source 的静态 import/require/re-export/dynamic-require 检查；不改 R1/R2/deployment/packaging 文件；所有错误含哨兵 | 改动集精确、输出无泄露、合成结果不表述为真实证据 |

最低验证命令：新的四组定向 Node 测试（含 test-seam isolation）、`scripts/check-docs-governance.ps1`、`git diff --check`；若实现阶段新增 CJS 模块，再运行 `pnpm type-check`、backend build、frontend build，以及设置隔离 `APP_DATA_ROOT` 的 `pnpm test`。任何运行数据写入命令必须使用隔离根。通过仅构成合成接口证据。

## 7. 实施步骤与停止条件

1. 不获取、不写入、不核验 production SPKI/keyId/fingerprint。先新增第 4.0 节 exact record parser/签名模块与测试辅助夹具；production `verifyTrustedApproval(input)` 必须先经第 4.2 节 gate 固定拒绝 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`。测试动态 key 仅可通过 allowlist helper 的闭包隔离、非契约 `__TEST_ONLY_*` factory 使用，绝不得成为 production fallback。
2. 新增 verifier integrity gate，先完成生产默认拒绝、test-seam isolation 静态检查与测试 direct injection；确认 `verifyTrustedApproval(input)` 不解构、在读取任何调用方字段前无条件调用 gate，并用 Proxy/getter 回归证明。
3. 新增 no-follow facade、拒绝表和内存合成 backend；生产 reader factory 与四个 reader 方法都必须为不解构边界，先验证 unsupported facade 在任何 input/Proxy/getter/backend 访问前固定拒绝、路径 API 完全没有 fallback、失败零字节交付和非测试目录不能导入测试 factory，再测试逐组件/同 handle 状态机。
4. 只运行合成测试；不得调用 R1/R2 入口或真实 PowerShell ACL API。
5. 完成定向测试、全量所需检查、文档治理与 diff 检查；更新 `docs/04` 仅登记“共同接口/合成测试完成（如实际完成）”，绝不勾选 R1/R2 或真实采证。
6. 若任何测试需要真实 Windows 目录、真实 record、真实 ACL、动态编译 native helper、代码签名、发布物、额外依赖或改动 R1/R2 文件，立即停止并另立计划；不得把阻塞用 mock 绕过后声称 backend 已实现。

## 8. P0 / P1 与残余阻塞

### P0（条件触发）

- 实现使生产路径接受可由 CLI、环境变量、配置或调用参数替换的公钥、测试 key、验证器 identity、platform 或 backend；生产 `verifyTrustedApproval` 未内部无条件 gate；或让任一非 allowlist 文件导入/调用 `__TEST_ONLY_*` factory；
- 存在 `fs.readFile`/`Get-Acl`/路径式读取等降级路径，使未经同一 handle 验证的实际内容/ACL 可被 R1/R2 使用；
- 错误/日志/测试失败泄露私钥、record、signature、路径、文件名、用户数据、ACL 原文或哨兵内容；
- 任何人在本切片中运行真实 R1/R2、真实 ACL 或写入性 Phase 3 操作。

触发即停止普通 Wave，按 T02-P0 独立处置；本计划不运行真实操作，不能宣称环境 P0=0。

### P1（预期保留）

1. 本切片不实现受认证发布物、代码签名或 native helper，因此生产 verifier integrity 与 Windows no-follow backend 默认保持不可用/拒绝；
2. R1 尚未接入共同库，现有 R1 仍有 approval trust/TOCTOU 实现缺口，且正式 manifest 仍缺 `buildCommit` / `packageFingerprint`；
3. R2 尚未接入共同库，也没有签名绑定的目标机器/安装实例/六类根；
4. 离线 record 的撤销和本机时间可信度仍有限；真正一次性授权仍需独立受认证原子消费方案；
5. 合成适配器可验证接口状态机，不能证明 Windows 内核级逐组件 no-follow 语义或真实机器 ACL 结果。
6. production trust anchor、其受控交付和 release integrity 认证被明确留到后续切片；本计划不生成私钥、不写入 production public key，也不把测试 key 升格为生产 key。

## 9. 独立审查重点

独立审查必须检查：

- 文件清单是否精确，且没有改动 R1/R2/deployment/manifest/T04/T05；
- 测试 key、authenticated identity provider、test backend 是否完全隔离；本次是否确实未写入 production trust anchor，且 production 是否默认为 fail-closed；
- record parser 是否处理 duplicate/unknown/encoding/canonicalization，且签名与 policy/purpose/commit/contract/time/scope/content identity 全部绑定；
- “短时窗可重复只读”是否清楚替代一次性消费承诺，未偷偷引入本地可回滚状态；
- no-follow facade 是否完全禁止 `fs.readFile`、`realpath`、普通 `Get-Acl` 与最终项-only 的降级方案，且中间 reparse、网络/映射卷、身份变化均拒绝；
- 合成测试是否覆盖对象 ID 不变但内容改变、打开后替换、UNC/重定向器、输出脱敏和无 backend 的失败；
- 计划是否诚实保留 native helper、发布物完整性、R1/R2 adoption、manifest 契约及真实操作为后续门禁；
- 是否有 P0/P1，给出最小修复建议和明确的“通过 / 有条件通过 / 不通过”。

## 10. 实施后仍需用户另行批准的切片

本计划即使实施并通过，也**不**授权下列事项：

1. **PHASE3-T02-WIN32-NOFOLLOW-NATIVE-HELPER-20260728**：仅在确认工具链、受认证发布路径与 Windows 原生逐组件句柄语义后，实现/审查 native backend；不得夹带 R1/R2 真实操作。
2. **PHASE3-T02-VERIFIER-RELEASE-INTEGRITY-20260728**：仅实现并验收代码签名/受认证发布物/启动边界完整性证明；不得把开发工作树当成生产可信验证器。
3. **PHASE3-T02-R1-NOFOLLOW-ADOPTION-20260728**：仅将已经过独立审查且实际可用的共同库接入 R1，先做合成回归；仍不得真实扫描。若需部署包 identity 字段，另立 manifest 契约计划。
4. **PHASE3-T02-R2-NOFOLLOW-ADOPTION-20260728**：仅将共同库接入 R2 的六类逻辑根只读证据，先做合成/静态验证；仍不得真实 ACL 读取。
5. **真实 R1 签收** 与 **真实 R2 ACL 采证**：分别需要精确的签名 artifact/机器/实例/窗口批准、接入复审和运行前复核；任何 P1/P0 均另立最小修复或处置计划。

在这些单项批准前，Wave 0 仍不得运行真实秘密扫描、真实 ACL 读取、ACL 修复、备份/恢复或任何 T04/T05 工作。


## 11. 独立审查与修订记录

- **首轮独立只读审查（2026-07-28，提交 `ea766f3f`）**：结论“不通过”。发现 P0：生产 `verifyTrustedApproval` 仍接收 `verifierIntegrity` 调用参数，可能伪造 integrity 前提；另有 P1：record 格式不足够确定、test seam allowlist/静态门禁未具体化、生产 platform 参数与零字节失败语义未固定、临时目录措辞冲突、生产 trust anchor 标识与轮换规则不足。
- **首轮作者修订**：删除生产 `verifierIntegrity` 与 platform/backend 注入，改为内部 gate / 无参 facade；固定 record raw-byte 语法、signature 输入及窗口；明确 trust anchor 材料来源、标识、指纹和无运行时轮换；限定 security fixture 为内存并定义失败零字节交付。
- **第二轮独立只读审查（2026-07-28，提交 `a9aa0a47`）**：结论“不通过”。发现 P0：生产 API 示例的参数解构可能在 gate 前触发 getter/Proxy；P1：`__TEST_ONLY_*` 静态检查未区分 factory 定义者、唯一导入 helper 与扫描器。
- **本次作者最小修订**：将生产入口固定为不解构的 `verifyTrustedApproval(input)`，规定 gate 必须在任何调用方字段访问前执行，并加入 Proxy/getter 回归；将 test seam 门禁改为四角色精确 allowlist。
- **第三轮独立只读审查（2026-07-28，提交 `6231a28e`）**：结论“有条件通过”，无 P0；P1 指出 production unsupported no-follow reader 的方法示例仍可能因参数解构在固定拒绝前触发 getter/Proxy。
- **本次作者最小修订**：四个生产 no-follow 方法改为不解构的单一 `input`，并规定在任何调用方属性访问、backend 调用或路径操作前固定抛 `NOFOLLOW_HANDLE_UNSUPPORTED`；测试矩阵加入 Proxy/getter/零交付回归。
- **第四轮独立只读审查（2026-07-28，提交 `e232e6c8`）**：结论“通过”，P0=0、P1=0。确认 production unsupported no-follow reader 的四个方法均为不解构边界，先于任何调用方字段访问固定拒绝 `NOFOLLOW_HANDLE_UNSUPPORTED`；Proxy/getter、零 backend 调用和零交付回归已纳入测试矩阵。
- **当前状态**：计划已通过独立审查，现仅待用户单项实施批准；该通过不等于实施批准，不授权真实 R1/R2、真实 ACL、真实 record/候选包/manifest 读取或任何后续真实操作。

- **用户批准的最小修订（2026-07-28，待本轮独立只读复核）**：用户明确批准本次不写入 production trust anchor；production verifier 在 production 环境固定 fail-closed；仅实现共同接口、进程内合成夹具与测试专用动态密钥测试；不得接入或执行真实 T02-R1/T02-R2。production trust anchor 配置、发布完整性认证以及 R1/R2 接入留待后续单独计划、独立审查和逐项批准。本修订删除“缺少三元组即停止全部实现”的要求，但绝不放宽 production 固定拒绝、测试/生产隔离或真实操作禁令。

- **无 production trust anchor 修订的独立复核（2026-07-28）**：首轮结论“有条件通过”，P0=0；发现 P1：文件范围表和实施步骤残留“先提供 production anchor 才能开始”的旧前置，与用户修订冲突。最小修复提交 `bb74a2c` 删除两处冲突表述；复核结论“通过”，P0=0、P1=0。该复核只授权本计划的共同接口与合成测试，绝不授权 production trust anchor、真实 R1/R2 或其他后续切片。
- **本分支实现与验证记录（2026-07-28，首次源码独立审查前）**：新增三项共同 CJS 模块与四组进程内合成测试；production approval verifier 固定在读取调用方 input 前抛 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`，production no-follow reader 四个方法固定在读取 input 前抛 `NOFOLLOW_HANDLE_UNSUPPORTED`。定向 Node 测试 13/13、`pnpm type-check`、backend/frontend build 与隔离 `APP_DATA_ROOT` 的全量 `pnpm test`（backend 305/305）均通过。未运行真实扫描、ACL、record、候选包、manifest 或用户数据读取。
- **首次源码独立审查与 P1 修复回归（2026-07-28，待最终源码独立复审）**：审查结论“有条件通过”，P0=0、P1=4；最小修复为：production verifier gate 后不再返回 caller input；测试 verifier 仅接受 Ed25519 public key，getter/Proxy 与 crypto 异常均映射为固定脱敏错误；test-seam 扫描改为精确角色 allowlist，允许合同测试导入公开 API 但仍拒绝直接/计算式 factory 访问和 helper 重导出；no-follow 合成覆盖 remote/UNC/mapped/SUBST/MUP/Lanman/WebDav/Rdbss/removable/cdrom/ram/unknown/mount-point/reparse 及 objectId、parentId、contentVersion 三类替换竞争。定向 Node 测试 14/14、`pnpm type-check`、backend/frontend build 与隔离 `APP_DATA_ROOT` 的全量 `pnpm test`（backend 306/306）均通过。未读取或执行真实 R1/R2、真实 ACL/record/候选包/manifest/用户数据；仍待最终独立源码复审。
- **第二轮源码独立审查与 P1 修复回归（2026-07-28，待最终源码独立复审）**：审查结论“有条件通过”，P0=0、P1=2；最小修复为：test-only approval factory 现在只接受真实 `crypto.KeyObject` 的 Ed25519 public key，形状伪造键固定拒绝；`expected` getter/Proxy 与 integrity getter/运行期方法异常均重新构造固定脱敏错误，绝不保留 caller 控制的 message/stack；test-seam 扫描对相邻静态字符串拼接重复折叠后检测 `__TEST_ONLY_`，新增 `__TE` + `ST_ONLY_` 绕过回归。定向 Node 测试 15/15、`pnpm type-check`、backend/frontend build 与隔离 `APP_DATA_ROOT` 的全量 `pnpm test`（backend 307/307）均通过。未读取或执行真实 R1/R2、真实 ACL/record/候选包/manifest/用户数据；仍待最终独立源码复审。
- **第三轮源码独立审查 P1 处置（2026-07-28，待最终源码独立复审）**：审查提出透明 `Proxy<KeyObject>` 与括号/注释分隔静态拼接两项 P1。运行时证实 Node 24 的透明 Proxy 对 `instanceof`、native key type、export 与 verify 均与 target 等价，JavaScript 无可靠 Proxy 身份检测；因此测试 verifier 在检查 Ed25519 public `KeyObject` 后立即导出 SPKI DER 并 native 重新导入为新的 `KeyObject`，不保留调用方对象。test-seam 由正则改用现有 TypeScript AST，对普通静态字符串、括号和 `+` 递归求值，覆盖括号分组与注释分隔的 computed marker。新增合成回归通过；仍需最终独立源码复审。
