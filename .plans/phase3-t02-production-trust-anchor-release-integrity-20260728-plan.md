# Phase 3 T02 生产 Trust Anchor 与发布完整性认证最小计划

**计划 ID**：`PHASE3-T02-PRODUCTION-TRUST-ANCHOR-RELEASE-INTEGRITY-PLAN-20260728`
**日期**：2026-07-28
**状态**：✅ 用户已单项批准的最小共同接口与合成验证已完成；独立源码复审通过（P0=0、P1=0），已在此前提交进入 `origin/master`；截至 `28aa2931`，`origin/master` 已包含该实现及其验证记录。production 未配置 trust anchor，仍固定 fail-closed；不授权真实 R1/R2 操作
**前置事实**：`PHASE3-T02-COMMON-TRUSTED-APPROVAL-NOFOLLOW-IMPLEMENTATION-20260728` 已进入 `origin/master`。生产 `verifyTrustedApproval` 和 production no-follow API 均固定 fail-closed；没有 production trust anchor、发布完整性认证、真实 R1/R2 接入或真实操作。

---

## 1. 决策与范围

### 1.1 本计划的唯一目标

为未来可能单独批准的 T02-R1/T02-R2 接入，定义两个不可相互替代的 production 前提：

1. **审批记录信任锚**：批准记录使用固定 **Ed25519 detached signature**；逻辑信任锚是 `keyId`、Ed25519 SPKI DER Base64 与该 DER 的小写 SHA-256 fingerprint 三元组。
2. **发布/验证器完整性**：只有经认证的发布/安装边界证明 verifier 身份、契约版本和信任锚版本后，production verifier 才可从固定拒绝演进为受限验证路径。

推荐方案是“固定 Ed25519 公钥 detached-signature + 独立的 release/verifier integrity 认证”。两者必须同时成立；只拥有公钥文件、目录 ACL、哈希清单或环境变量都不足以建立 production 信任。

### 1.2 本轮允许的工作

本轮只允许：

- 创建本计划并在 `docs/04` 登记为“待独立审查”；
- 对计划进行独立、只读审查；
- 明确未来实施的接口、失败码、证据边界、文件范围、测试矩阵和批准切片。

### 1.3 严格非目标与禁止项

本计划及其审查绝不允许：

- 修改业务代码、测试代码、构建脚本、部署 manifest 或任何 production 配置；
- 写入、生成、猜测、选择、替代、提交或展示 production trust-anchor 三元组；
- 将 placeholder、测试 key、动态生成 key、环境变量、未认证配置文件或本地目录 ACL 当作 production trust anchor；
- 读取真实审批记录、真实候选部署包、真实 manifest、用户数据或未跟踪目录；
- 执行真实 T02-R1 秘密扫描、真实 T02-R2 ACL 读取、ACL 修复、备份/恢复、服务或计划任务操作；
- 修改 `scripts/build-deployment-package.ps1`、部署包 metadata/manifest 契约、R1/R2 入口或 T04/T05；
- 把计划、合成测试、CI 验证或审查表述为“production anchor 已配置”“发布完整性已证明”或“真实机器证据”。

---

## 2. 推荐方案与被拒绝方案

### 2.1 推荐：固定 Ed25519 public-key detached signature

未来批准记录继续采用共同切片定义的 canonical record bytes 和 Ed25519 detached signature。production anchor 的语义仅为：

```text
keyId
SPKI_DER_BASE64
SHA256_FINGERPRINT = sha256(decoded SPKI DER), lowercase hex
```

未来实施必须先验证三元组内部一致性：DER 严格 Base64 解码、DER 解析为 Ed25519 SPKI public key、导出结果与输入 DER 字节一致、fingerprint 精确匹配。任何解析、算法、长度、编码、keyId、版本或 fingerprint 异常都固定 fail-closed。

**为什么推荐**：审批记录可离线验证、签名覆盖 canonical record 全文、私钥不进入仓库/客户端/日志、并与已合入的共同 verifier 契约一致。

### 2.2 拒绝：仅受控批准目录 + 文件身份校验

目录、ACL、文件 ID 或 no-follow 读取只能降低路径替换与 TOCTOU 风险；它们不能证明“谁授权了 anchor”，也不能证明 application/release 未被替换。因此它们最多是 future descriptor transport 的附加防护，不是根信任。

### 2.3 拒绝：仅预登记摘要

预登记摘要只将“可信来源”后移到摘要的保存位置。若摘要没有一个独立、不可替换的认证发布根，同样可被替换或降级。它只能作为 release descriptor 的绑定字段或审计证据，不得单独授权 verifier。

### 2.4 不可省略的发布完整性前提

应用进程自行读取可写文件、普通环境变量、用户目录配置或普通 registry 值，不能自证自身和 anchor 的完整性。未来 adoption 必须先定义一个**进程外或安装/发布边界认证的 verifier identity**；该身份至少绑定：

```text
release identity
verifier contract version
trust-anchor keyId
trust-anchor fingerprint
anchor metadata version
```

若目标安装/发布渠道无法提供可独立验证的 identity，必须保持 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`，不得以“自校验”“文件哈希”“目录 ACL”降级放行。此限制是 P0 安全边界，不是可选优化。

---

## 3. 责任边界与受控交付

### 3.1 三元组责任

| 事项 | 责任方 | 允许的动作 | 禁止的动作 |
| --- | --- | --- | --- |
| 生成 Ed25519 私钥与公钥 | 指定的安全/发布所有者 | 在仓库外、受控密钥系统中生成；私钥永不交付给本仓库或客户端 | 由开发代理、CI、测试夹具或用户目录生成 production key |
| 提供 public 三元组 | 安全/发布所有者 | 通过受控渠道提供 `keyId`、SPKI DER Base64、fingerprint | 提供截断值、placeholder、口头不带校验的值或私钥 |
| 独立核验 | 第二位指定核验者 | 在独立设备/渠道计算 DER fingerprint，并核对 keyId/算法 | 仅复制同一消息或由同一人单点确认 |
| 写入 production 安装/发布边界 | 后续单独批准的实施者 | 仅在认证发布路径中写入，留最小审计证据 | 写入 Git、`.env`、APP_DATA_ROOT、用户数据目录、日志或测试 fixture |
| 轮换/撤销 | 安全/发布所有者 + 第二核验者 | 使用明确版本、overlap 和撤销窗口；旧 key 仅按已批准策略保留 | 静默替换、keyId 复用、回滚到已撤销 anchor |

### 3.2 受控交付的最小流程

未来实施前，必须获得真实且完整的三元组；缺少任一项即停止实施，不得自行补全。流程必须至少为：

1. 安全/发布所有者在仓库外提供 public 三元组；私钥不出现；
2. 第二核验者通过独立渠道确认 fingerprint、算法为 Ed25519、keyId 和版本；
3. 后续已批准的实施切片将三元组只交给经认证的 release/install provisioning 边界；
4. 安装后只记录固定结果码、anchor version/keyId 的受限标识和不可逆短关联 ID；不记录 DER、完整路径、record、签名、候选包或环境变量；
5. 任一步缺证、冲突、无法认证或无法审计，production 继续固定拒绝。

“公钥不等于私钥”不代表其替换风险可以忽略：公开三元组仍是授权边界，必须防止被替换、降级或冒用。

---

## 4. future verifier/release integrity 契约

### 4.1 未来受认证 provider 的逻辑输出

未来 implementation 不接受调用者注入 provider，也不接受普通配置声明。经认证的 release/integrity provider 仅可向内部 gate 提供一个不可由普通调用者替换的 opaque assertion，其最小逻辑字段为：

```text
contractVersion
releaseIdentityVersion
verifierIdentity
anchorKeyId
anchorFingerprint
anchorMetadataVersion
issuedAt / validity evidence
```

成功时只向 `requireTrustedVerifierIntegrity` 提供不可序列化、最小化的内部 capability；不向调用方、CLI、日志、测试失败信息或 R1/R2 返回 assertion 原文。

### 4.2 固定失败码（拟议，未来实施须逐项确认）

| 情形 | 固定失败码 |
| --- | --- |
| 未有经认证的 release/verifier assertion | `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN` |
| assertion 契约版本不兼容 | `TRUSTED_VERIFIER_CONTRACT_MISMATCH` |
| anchor descriptor 缺失或不可认证 | `TRUSTED_ANCHOR_UNAVAILABLE` |
| keyId、SPKI、算法或 fingerprint 不一致 | `TRUSTED_ANCHOR_INVALID` |
| release identity 与已批准 anchor binding 不一致 | `TRUSTED_ANCHOR_BINDING_MISMATCH` |
| anchor 已撤销、降级或版本回退 | `TRUSTED_ANCHOR_REVOKED_OR_ROLLBACK` |
| descriptor / assertion 读取或 no-follow 证据不足 | `TRUSTED_RELEASE_EVIDENCE_UNPROVEN` |

所有错误必须继续满足：`message === code`、无 caller-controlled message/stack、无 key DER、路径、记录、签名、环境变量、原始 release evidence 或用户数据回显。

### 4.3 不允许的成功条件

以下任何条件都不能让 production gate 成功：

- 仅 `keyId` 匹配；
- 仅 fingerprint 匹配但 DER/算法未验证；
- 环境变量、普通 JSON、普通 Registry、APP_DATA_ROOT 或用户目录中有一个看似正确的值；
- 仅通过本进程 hash、普通文件 ACL、可写目录或测试 factory；
- release provider 抛错后 fallback 到测试 key、旧 key、空 assertion 或 caller input。

---

## 5. TOCTOU、替换、轮换与回滚

### 5.1 TOCTOU 与 descriptor transport

若 future implementation 需要从安装/发布边界读取 descriptor，它必须使用后续独立批准的 native no-follow backend，并满足：

- 从预先认证的本地 fixed-volume 锚点逐组件 no-follow 打开；
- 同一 handle 私有完整读取；
- 读取前后复核 object ID、父关系、content version、对象类型、reparse 状态及卷/设备类别；
- 任何 UNC、映射盘、SUBST、remote/removable/CD-ROM/RAM/unknown volume、mount-point、reparse、身份变化或能力不足，都固定失败；
- 未交付 assertion/anchor/capability 前清空私有 buffer、关闭 handle；不使用 `fs.readFile`、`Get-Acl`、`Set-Acl`、`icacls`、普通 path API 或普通目录枚举 fallback。

目前 production no-follow module 仍固定 `NOFOLLOW_HANDLE_UNSUPPORTED`；本计划不实施 native backend，也不把合成 reader 误称为 native 证据。

### 5.2 防替换与降级

- 绑定 `keyId + fingerprint + metadata version + verifier contract + release identity`；只比对其中一项一律失败；
- anchor version 必须单调，撤销集合必须优先于旧版本 overlap；
- 不允许隐式“latest”、未知 keyId、未知 release identity 或未来版本自动接受；
- 轮换期间只能接受显式列入、各自被认证的版本集合；过期/撤销版本必须 fail-closed；
- 回滚必须使用被审批的 recovery release identity，并保留最小不可伪造的审计关联，而非覆盖当前 state；
- 任意中断、并发替换、时间不确定或缓存状态不一致都回到固定拒绝。

### 5.3 时钟与撤销的限制

若真实撤销依赖在线时间、联网状态或可变系统时钟，必须在后续计划中明确离线语义；不得在本计划中假设联网可用。无法证明时钟/撤销状态时，production verifier 必须拒绝，而不是延长旧 key 信任。

---

## 6. 文件范围

### 6.1 本轮实际可写范围（计划任务）

| 文件 | 动作 |
| --- | --- |
| `.plans/phase3-t02-production-trust-anchor-release-integrity-20260728-plan.md` | 新增本计划 |
| `docs/04-开发任务清单-Todo-List.md` | 登记计划待独立审查；不得勾选实现完成 |

### 6.2 本轮禁止修改

- `scripts/build-deployment-package.ps1`；
- 部署包 manifest/metadata 契约及其生成逻辑；
- `scripts/lib/AIStudyBuddy.TrustedApproval.cjs`；
- `scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs`；
- `scripts/lib/AIStudyBuddy.NoFollow.cjs`；
- R1/R2 入口、任何 backend/frontend 业务文件、T04/T05、backup/restore、ACL、服务、计划任务；
- 所有真实 anchor、真实 descriptor、真实 record、候选包与用户数据。

### 6.3 future implementation 的候选最小文件范围（不构成当前授权）

后续实施计划必须重新核验并明确批准，预计只能讨论：

```text
scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs
scripts/lib/AIStudyBuddy.TrustedApproval.cjs
scripts/lib/AIStudyBuddy.TrustAnchor.cjs              (候选新增)
packages/backend/test/trust-anchor-*.test.mjs         (候选新增)
packages/backend/test/helpers/trust-anchor-*.mjs      (候选新增)
```

若实现需要修改 packaging、installer、deployment manifest、native no-follow helper、release signing 或 Windows installation policy，则它们属于**额外的独立计划与批准切片**，不得被本计划或后续 anchor provider implementation 隐含带入。

---

## 7. 测试、审计与证据矩阵

| 层级 | 可做事项 | 不能证明 / 不得声称 |
| --- | --- | --- |
| 本计划 | 文档一致性、范围/禁止项检查、独立计划审查 | 真实 anchor、真实发布、真实 Windows identity、真实 R1/R2 |
| future 合成测试 | 动态 test key、DER/fingerprint mismatch、撤销/降级、异常脱敏、替换竞争、gate fail-closed | production key 已配置、release/installer 已认证、真实机器 no-follow 或真实 ACL |
| future CI | 已跟踪源码的静态隔离、测试 key 不泄漏、构建/测试通过 | 生产发布签名、用户机器安装状态、真实审批记录有效性 |
| future 受控环境验收 | 只在用户单独批准后，以最小公开 metadata 验证 release identity 与 anchor binding | T02-R1/R2 已完成，除非另有各自批准和证据 |

审计输出只允许固定错误码、布尔结果、计数、版本类最小标识和不可逆关联 ID；不得输出完整 key DER、fingerprint 以外的原始 anchor 内容、文件名、路径、record 内容、signature、候选包信息、环境变量、用户数据或原始 provider 输出。

---

## 8. P0/P1 风险与最小缓解

| 优先级 | 风险 | 最小缓解 / gate |
| --- | --- | --- |
| P0 | 把可替换的本地 config/环境变量/目录 ACL 当作根信任 | 无独立认证 release identity 时固定 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN` |
| P0 | 将测试 key、placeholder 或自动生成 key 进入 production | production 不接受 test factory；真实三元组缺失即停止；静态测试缝隔离 |
| P0 | anchor 替换、keyId 复用或版本降级 | 绑定 keyId+DER fingerprint+metadata version+release identity；撤销优先、未知即拒绝 |
| P0 | 读取 descriptor 时受路径/reparse/TOCTOU 攻击 | 未来仅 native same-handle no-follow；当前 backend 不存在则固定拒绝 |
| P0 | 把本计划或合成结果误报为真实发布/真实机器证据 | 文档和交付中强制分层声明；独立审查检查措辞 |
| P1 | public fingerprint 日志形成可关联元数据 | 默认只记录短不可逆关联 ID；完整 fingerprint 仅在受控核验流程外部使用 |
| P1 | 轮换时间窗、离线撤销语义不明确 | future implementation 之前另行明确 time source、overlap、recovery 与撤销证据 |
| P1 | release identity 的 OS/installer 技术方案未选定 | 先进行独立 release/install identity 设计；选不出可验证方案则不实施 anchor provider |

---

## 9. 后续必须逐项批准的切片

本计划通过审查并不自动授权以下任何一项：

1. `PHASE3-T02-PRODUCTION-TRUST-ANCHOR-RELEASE-INTEGRITY-20260728` 的 implementation；
2. release/install identity 的 OS、installer、code-signing 或 deployment metadata 设计/实施；
3. native Windows no-follow backend；
4. `PHASE3-T02-R1-REAL-SECRET-SCAN-...` 的接入、真实扫描或真实候选包读取；
5. `PHASE3-T02-R2-WINDOWS-ACL-EVIDENCE-...` 的接入、真实 ACL 读取或真实目录采证；
6. key rotation、撤销、recovery release、真实受控环境验收；
7. T04/T05、ACL 修复、backup/restore、服务或计划任务。

未来只有在独立审查 P0=0、P1=0 且用户明确回复下列文字后，才能进入第 1 项实施：

```text
批准按 PHASE3-T02-PRODUCTION-TRUST-ANCHOR-RELEASE-INTEGRITY-20260728 实施
```

即使该实施完成，R1 与 R2 仍必须分别计划、审查和逐项批准。

---

## 10. 独立审查清单

独立审查者必须确认：

1. 计划只覆盖 anchor/release integrity 前提，没有隐含 R1/R2 接入或真实操作；
2. 推荐固定 Ed25519 detached-signature，不把目录、ACL、hash 或环境变量伪装为根信任；
3. 真实三元组不出现在 Git、计划、日志、测试、placeholder 或聊天转录中；
4. 受认证 release/verifier identity 在锚点读取/使用前是不可绕过的成功条件；
5. 无可验证 release identity 时是否明确保持 production fail-closed；
6. descriptor transport 是否明确要求 native same-handle no-follow，且没有普通路径/API fallback；
7. 是否防替换、降级、撤销、轮换与时间不确定，而非只检查 `keyId`；
8. future 文件范围是否没有偷带 build/package/manifest、native helper、installer 或 R1/R2；
9. 合成、CI、受控环境三类证据是否未被混淆为真实机器/production 证据；
10. P0/P1 风险是否完整，且 docs/04 没有把实现项误标完成。

审查结论格式必须是“通过 / 有条件通过 / 不通过”，列出 P0/P1、文件位置和最小修复；仅 P0=0、P1=0 才可回复：

```text
批准按 PHASE3-T02-PRODUCTION-TRUST-ANCHOR-RELEASE-INTEGRITY-20260728 实施
```

---

## 11. 已批准最小实施记录（最终独立源码审查已完成）

- **用户实施批准**：用户已明确批准 `PHASE3-T02-PRODUCTION-TRUST-ANCHOR-RELEASE-INTEGRITY-20260728`。本记录只覆盖下列共同接口与仓库内合成测试，不代表 production trust anchor、经认证 release/install identity、release descriptor transport、native Windows no-follow、真实 R1/R2 接入或任何真实操作已完成。
- **实际代码范围**：新增 `scripts/lib/AIStudyBuddy.TrustAnchor.cjs`；最小修改 `scripts/lib/AIStudyBuddy.TrustedApproval.cjs` 与 `scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs`；新增 `packages/backend/test/trust-anchor-contract.test.mjs`，并最小更新既有共同接口夹具、合同测试与 test-only seam 隔离测试。未修改 `scripts/build-deployment-package.ps1`、部署 manifest/metadata、`AIStudyBuddy.NoFollow.cjs`、R1/R2 入口、业务/前端文件、T04/T05、ACL、备份/恢复、服务或计划任务。
- **production fail-closed 事实**：production `requireTrustedApprovalAnchor` 在读取任何调用方字段前固定返回 `TRUSTED_ANCHOR_UNAVAILABLE`；production `verifyTrustedApproval` 仍先要求 `TRUSTED_VERIFIER_INTEGRITY_UNPROVEN`，没有 caller/provider/config/environment/ACL/hash fallback。没有 production 三元组或经认证 release identity 被写入、生成、读取或提交。
- **合成覆盖**：测试专用的进程内 Ed25519 key 仅用于验证严格 SPKI DER 导出、SHA-256 小写 fingerprint、Ed25519 算法、anchor metadata/release identity/integrity binding、签名篡改、指纹篡改、错误脱敏、Proxy/getter、动态 provider 失败和 test-only factory 隔离。合成结果不证明真实 key、真实 release、真实 Windows identity 或真实 R1/R2。
- **首轮独立源码审查与最小修复**：独立只读审查结论为“有条件通过”（P0=0、P1=1）；唯一 P1 是合成 verifier 未将记录 `keyId` 与实际合成 anchor `keyId` 显式绑定。已仅在 test-only 合成路径修复为验签前固定比较二者，并把夹具默认记录标识改为 `asb-test-*`；新增“签名有效、其余 binding 正确但 `keyId` 不匹配”固定拒绝用例。production `verifyTrustedApproval` 继续在读取 caller input 前固定拒绝。
- **当前验证**：P1 修复后的定向共同接口合同测试 15/15 通过；此前 `pnpm type-check`、backend build、frontend build 以及设置隔离 `APP_DATA_ROOT` 的全量 `pnpm test` 已通过（backend 311/311）。修复后的第二次独立只读源码复审已通过（P0=0、P1=0）；已完成提交、推送和主线集成收口；`origin/master` 已包含提交，但这不改变 production 仍固定 fail-closed、未配置真实三元组、未接入 R1/R2 的事实。
