# T02 共同可信批准与 no-follow 最小实施计划

**计划编号**：PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-IMPLEMENTATION-20260728
**状态**：📝 已创建，待独立审查与用户单项实施批准；不授权真实 R1/R2 操作
**创建日期**：2026-07-28
**任务分支**：`codex/phase3-t02-common-trusted-approval-implementation-plan`（仅计划和 `docs/04` 索引）
**前置计划**：已通过第二位独立审查的 `PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-20260728`，位于已推送提交 `23f2e20` 的 `codex/phase3-t02-common-trusted-approval-plan`；该前置计划未合入 `master`，本计划仅引用其已审查契约，不复制或合并其文件。

---

## 1. 唯一目标与完成口径

在不运行任何真实 R1 秘密扫描或 R2 ACL 读取的前提下，实现并测试三项共同**底座接口**：

1. 固定公钥 detached signature 的严格批准记录验证；
2. 受认证验证器完整性不可证明时的 fail-closed gate；
3. Windows 本地卷/UNC/映射盘/reparse 拒绝和逐组件、同一 handle no-follow 读取的抽象接口与合成适配器。

本切片的完成仅表示：这些库的 schema、固定失败码、默认拒绝行为和仓库内合成测试已实现并通过。它**不表示**已有受认证生产发布物、已有可证明的 Windows native no-follow helper、已读取批准记录/manifest/包文件/ACL、已完成 R1/R2、已解决正式 manifest 身份缺失、已完成 T02/Phase 3 或用户电脑验收。

生产入口在本切片结束后仍必须默认停止：没有外部受认证验证器身份时为 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`；没有经独立审查的 Windows 句柄相对 native backend 时为 `NOFOLLOW_HANDLE_UNSUPPORTED`。测试注入的密钥、attestation provider 与内存适配器绝不得通过 CLI、环境变量或普通生产配置启用。

## 2. 严格范围与禁止项

### 2.1 允许范围

- 纯 CJS 共同库、测试辅助模块、Node `node:test` 合成测试以及最小文档/任务索引同步；
- 内存或仓库外临时**合成**对象图，用于模拟目录组件、卷类别、reparse、打开后替换和同流内容变化；
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
| `scripts/lib/AIStudyBuddy.TrustedApproval.cjs` | 新增 | 严格 approval envelope schema、唯一固定 Ed25519 公钥验证、detached signature 验证、purpose/policy/commit/contract/time/scope/content-identity 比对；只返回内部冻结的非序列化 approval capability 或固定错误码。 |
| `scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs` | 新增 | 验证器完整性 gate；生产 API 不接受 CLI/环境变量/配置或调用参数提供的 identity，缺少外部受认证 provider 时固定拒绝；测试仅通过非契约测试缝直接注入。 |
| `scripts/lib/AIStudyBuddy.NoFollow.cjs` | 新增 | 平台无关的逐组件 no-follow handle 抽象、Windows 卷类别拒绝策略、同 handle 读/复核状态机与**默认 unsupported backend**；生产 API 无 backend 注入入口，禁止调用 `fs.readFile`、`realpath`、`Get-Acl` 或路径式降级。 |
| `packages/backend/test/trusted-approval-contract.test.mjs` | 新增 | 内存测试密钥、签名篡改、严格 schema、短时窗重复只读、purpose/commit/scope/content-identity 与脱敏测试。 |
| `packages/backend/test/verifier-integrity-gate.test.mjs` | 新增 | 验证器身份缺失、版本不符、篡改 provider 结果与测试注入隔离；证明生产默认固定拒绝。 |
| `packages/backend/test/nofollow-contract.test.mjs` | 新增 | 合成逐组件 handle backend：UNC/映射盘/`SUBST`/remote/reparse 拒绝、同 handle 读取、打开后替换、对象 ID 与内容身份变化、无 backend fail-closed、无路径泄露。 |
| `packages/backend/test/helpers/trusted-approval-fixture.mjs` | 新增 | 仅测试用：内存 approval payload、临时测试键、哨兵值、合成 handle/volume/reparse/race 适配器；不得提供真实文件系统 fallback。 |
| `.plans/phase3-t02-common-trusted-approval-nofollow-implementation-20260728-plan.md` | 新增 | 本计划与审查修订记录。 |
| `docs/04-开发任务清单-Todo-List.md` | 修改 | 在 Phase 3 行动计划索引登记此计划的真实状态；不勾选 R1/R2 实现完成。 |

除上述文件外一律不改。特别是不得为了“接入验证”修改 R1/R2 现有文件；接入只能留给第 10 节的后续批准切片。

## 4. 接口契约

### 4.1 `AIStudyBuddy.TrustedApproval.cjs`

仅暴露以下内部 API（命名可等价调整，语义不得放宽）：

```js
verifyTrustedApproval({
  recordBytes,
  signatureBytes,
  expected: {
    policyId,
    purpose,
    fullCommit,
    contractVersion,
    nowEpochMs,
    expectedScopeBinding,
    expectedArtifactContentIdentity,
  },
  verifierIntegrity,
})
```

- `recordBytes` 和 `signatureBytes` 只能由未来 R1/R2 接入层的 no-follow verified handle 提供；本切片测试只传内存字节，库本身不得按路径打开文件。
- 生产验证器的 key ID、算法 `Ed25519`、算法版本和**唯一固定公钥**必须为模块内固定常量；不得从 CLI、环境变量、record、配置、网络或调用参数替换。为测试动态生成的专用密钥只能经未文档化、非生产契约的 `__TEST_ONLY_*` factory 创建独立验证实例；生产 `verifyTrustedApproval` 绝不接受 resolver、key 或 factory 参数。所有非测试目录静态禁止导入该 factory。
- parser 必须拒绝重复字段、未知字段、非规范 UTF-8、超长值、非法标识符、非规范序列化、算法/key ID 不匹配及所有自由文本字段。签名覆盖规范化后的完整 payload；验证前后都不得回显原始值。
- R1 的 `artifactContentIdentity` 必须包含算法、canonicalization version、entry count 和 package fingerprint / canonical entry-list digest；本库仅比较已由同一 verified-handle 扫描流产生的值，绝不自行按路径 hash。
- 授权模型固定为短时窗、可重复、完全相同 scope 的只读授权；`approvalId` 仅作关联，不实现 nonce 消费、调用预算或可回滚本地状态。跨 purpose、commit、scope、contract 或时窗的复用一律拒绝。
- 成功只返回不可 JSON 序列化、冻结的 capability；失败只抛固定 `TRUSTED_APPROVAL_*` 代码，`message === code`。

### 4.2 `AIStudyBuddy.VerifierIntegrity.cjs`

```js
requireTrustedVerifierIntegrity({
  requiredContractVersion,
})
```

- 这是进入 `verifyTrustedApproval` 前的必经 gate。生产 API 没有 identity/provider 注入参数；它只接受未来受认证发布/启动边界在独立 adoption 切片中注册的、不可由普通调用者替换的 verifier identity（至少含 contract version 与完整性声明）。
- 本切片不实现代码签名、安装器、发布证明、自校验引导或注册入口；因此生产 `requireTrustedVerifierIntegrity` 必须固定抛 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`。
- 测试 provider 只能通过未文档化、非生产契约的 `__TEST_ONLY_*` factory 由精确列出的测试文件直接创建；所有非测试目录静态禁止导入该 factory。provider 返回的任何原始数据都不可进入错误或可观察输出。

### 4.3 `AIStudyBuddy.NoFollow.cjs`

```js
createNoFollowReader({
  platform,
})
```

返回的方法仅允许：

```js
openVerifiedPath({ locator, expectedObjectKind, expectedScopeBinding })
readVerifiedFile({ handle, maxBytes })
readVerifiedDirectorySecurityDescriptor({ handle })
closeVerifiedHandle({ handle })
```

- API 将路径视作不可信 locator；生产 API 没有 backend 注入参数，且不可在无 backend 时将 locator 交给 `fs.readFile`、`lstat`、`stat`、`realpath`、PowerShell 或其他路径 API。
- backend 必须逐组件从已验证的本地卷锚点 no-follow 打开，并从**同一 handle**返回对象种类、reparse 状态、卷类型/设备类别、对象 ID、父子关系、字节流或目录安全描述符及读后身份复核。facade 不得接受“先检查、后普通读取”的 backend 声明。
- Windows 策略对 UNC/扩展 UNC、remote/removable/CD-ROM/RAM/unknown、`SUBST`、目录挂载点、Mup/LanmanRedirector/WebDavRedirector/Rdbss 或任何无法证明的设备映射拒绝；任一中间/最终 reparse 也拒绝。只允许 backend 已证明为 local fixed volume 的结果。
- `readVerifiedFile` 必须在同一 handle 上读取受限字节并在关闭前复核 identity；任何替换、内容不稳定、读超限、锁定/共享不确定或 backend 能力不足均清空结果并失败。R1 同流 fingerprint 的实际 tee 由后续 R1 adoption 完成，本切片只暴露不可降级的 stream/identity contract。
- `readVerifiedDirectorySecurityDescriptor` 仅定义接口，不接入 `Get-Acl` 或真实目录；无 native backend 时固定 `NOFOLLOW_HANDLE_UNSUPPORTED`。
- 本切片的生产 backend 为明确 unsupported。测试仅通过未文档化、非生产契约的 `__TEST_ONLY_*` factory 创建内存合成 reader；所有非测试目录静态禁止导入该 factory，且它不允许 Node/PowerShell 文件系统 fallback。

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

所有夹具只在测试进程内或系统临时目录中创建；不触碰仓库未跟踪目录、实际部署包、真实 record、真实 manifest、运行数据或真实 ACL。每个失败用例都以随机哨兵验证错误、序列化结果和测试输出不含路径、文件名、测试私钥、record/signature 原文或哨兵。

| 类别 | 合成用例 | 必须断言 |
| --- | --- | --- |
| 固定公钥/签名 | 有效动态测试键；payload/signature 单字节篡改；错误 key ID/算法；试图通过 record/环境/调用参数替换 key，或由非测试文件导入 `__TEST_ONLY_*` factory | 仅精确测试文件可用；生产固定 key 不可替换；无敏感回显 |
| 严格 record schema | 重复/未知字段、非法 UTF-8、非规范编码、超长/换行 alias、错误 policy/purpose/commit/contract | 固定 `TRUSTED_APPROVAL_*`，不回显原输入 |
| 时窗与重复语义 | 过期、未生效、不可证明的时间、R1→R2 复用、scope 不同；相同短时窗同 scope 的只读重复 | 前者拒绝；后者明确允许且不创建消费状态 |
| R1 内容身份 | 算法/version/entry-count/digest 不符；内容 ID 缺失；对象 ID 相同但合成流字节变动 | `TRUSTED_APPROVAL_CONTENT_IDENTITY_MISMATCH`，无部分成功 capability |
| verifier gate | 生产无注册能力、contract 不符、测试 provider 抛错/返回自由文本；仅 `__TEST_ONLY_*` 测试 factory 成功 | 生产默认 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`；非测试导入失败；无 provider 数据回显 |
| 本地卷策略 | UNC/扩展 UNC、mapped remote、`SUBST`、mount point、Mup/Lanman/WebDav/Rdbss、removable/unknown、local fixed | 非 local fixed 一律固定拒绝；不得输出路径/盘符/设备名 |
| no-follow 组件链 | 中间或最终 reparse、对象种类错、父子关系断裂、打开后替换、读后 ID 改变、超限、生产 backend 缺失、非测试导入 `__TEST_ONLY_*` factory | 清空缓存/结果、关闭合成 handle、固定 `NOFOLLOW_*`；没有普通路径 fallback |
| R2 只读接口 | 合成目录 descriptor 请求、无 backend、试图请求内容读取/递归/ACL 写操作 | 仅接口 contract；无 backend 拒绝；源码静态 denylist 不出现 `Get-Acl`/`Set-Acl`/`icacls`/服务/计划任务/备份恢复命令 |
| 范围与输出 | 静态 import/grep 检查不改 R1/R2/deployment/packaging 文件；所有错误含哨兵 | 改动集精确、输出无泄露、合成结果不表述为真实证据 |

最低验证命令：新的三组定向 Node 测试、`scripts/check-docs-governance.ps1`、`git diff --check`；若实现阶段新增 CJS 模块，再运行 `pnpm type-check`、backend build、frontend build，以及设置隔离 `APP_DATA_ROOT` 的 `pnpm test`。任何运行数据写入命令必须使用隔离根。通过仅构成合成接口证据。

## 7. 实施步骤与停止条件

1. 先新增严格 approval schema/签名模块与测试辅助夹具；在无 verifier identity 时保持拒绝，生产 API 不接受任何测试 key/resolver，测试只能通过静态限于测试目录的非契约 factory。
2. 新增 verifier integrity gate，先完成生产默认拒绝、非测试目录禁止导入测试 factory 与测试 direct injection，再接入 `verifyTrustedApproval` 的必经顺序。
3. 新增 no-follow facade、拒绝表和内存合成 backend；生产 API 不接受 backend，先验证路径 API 完全没有 fallback 和非测试目录不能导入测试 factory，再测试逐组件/同 handle 状态机。
4. 只运行合成测试；不得调用 R1/R2 入口或真实 PowerShell ACL API。
5. 完成定向测试、全量所需检查、文档治理与 diff 检查；更新 `docs/04` 仅登记“共同接口/合成测试完成（如实际完成）”，绝不勾选 R1/R2 或真实采证。
6. 若任何测试需要真实 Windows 目录、真实 record、真实 ACL、动态编译 native helper、代码签名、发布物、额外依赖或改动 R1/R2 文件，立即停止并另立计划；不得把阻塞用 mock 绕过后声称 backend 已实现。

## 8. P0 / P1 与残余阻塞

### P0（条件触发）

- 实现使生产路径接受可由 CLI、环境变量、配置或调用参数替换的公钥、测试 key、验证器 identity 或 backend，或让任一非测试文件导入/调用 `__TEST_ONLY_*` factory；
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

## 9. 独立审查重点

独立审查必须检查：

- 文件清单是否精确，且没有改动 R1/R2/deployment/manifest/T04/T05；
- 固定公钥、测试 key、authenticated identity provider、test backend 是否完全隔离，生产是否默认为 fail-closed；
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
