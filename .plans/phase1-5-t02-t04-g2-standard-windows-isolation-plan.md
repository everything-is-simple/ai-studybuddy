# Phase 1.5-T02/T04-G2：标准 Windows 离线/出站隔离实测补证计划

> **状态**：✅ 计划 fresh-pass `PASS`（仅计划质量）；执行必须等待用户再次明确批准
> **创建日期**：2026-07-23
> **任务分支**：`codex/phase1-5-g2-windows-isolation-plan`
> **计划性质**：仅冻结标准 Windows G2 实测动作、证据契约、停止条件和回滚要求；不是 G2 执行、模型下载、AuralConverter 装配或生产发布计划。

---

## 1. 单一责任与停止点

本计划唯一责任是：为后续一次**标准 Windows** 组合的 G2 可验证操作系统级离线隔离实测补证冻结执行方案，确保在用户再次明确批准后，执行者只需要按本计划逐项运行、记录和回滚。

本计划完成后立即停止。未经用户再次明确批准，不得：

- 创建 Windows Firewall 规则；
- 执行出站探测；
- 运行 ASR 矩阵或任意模型加载；
- 修改系统 Firewall profile、注册表、系统服务、全局 PATH 或永久网络策略；
- 创建、调用或装配 `AuralConverter`；
- 修改 `packages/`、Schema、migration、API、Worker、前端或 shared 类型；
- 启动 T05/T06、生产接入、生产发布或真实用户数据处理。

---

## 2. 当前 SoT 与不得重写的事实

| 项目 | 当前事实 | 本计划处理 |
| --- | --- | --- |
| G2 正式语义 | `docs/08`、`docs/09` 与 S7 PRD 已采用“可验证的操作系统级离线隔离门禁”。 | 只引用，不修改正式语义。 |
| 旧 Windows 结果 | 定制 Windows 10 的 Domain/Private/Public Firewall profile 均禁用，旧 G2=`BLOCKED`；新语义下可记为 `ENVIRONMENT_UNAVAILABLE`/`DEFERRED`，但不是 `PASS`。 | 不追溯改写。 |
| G1/G3 | 固定 revision 与 no-speech/正向/异常矩阵已 `PASS`。 | 执行时只复核本地路径/哈希，不重新下载、不重新选型。 |
| T02/T04 | 均保持 `PARTIAL`；T04 是能力验证而非 Adapter 装配。 | 不升级、不关闭。 |
| T05/T06 | 未启动。 | 不创建、不实现、不调用。 |
| 最近证据审查 | 任务分支 `codex/phase1-5-g2-isolation-evidence` 已推送，三个组合均未取得 `PASS`；该分支尚未合入 `master`。 | 作为后续环境准备背景，不把未合入分支写成 master 完成事实。 |

能力验证、G2 隔离证据、产品接入和生产发布资格始终是四个独立结论。

---

## 3. 目标组合冻结

本计划只覆盖以下一个组合，不覆盖 Docker、WSL/Linux、独立 VM 或其他平台：

| 字段 | 冻结值 |
| --- | --- |
| 平台 | 标准 Windows 桌面环境 |
| OS 版本 | 执行时记录 `Get-ComputerInfo` 中 `OsName`、`OsVersion`、`OsBuildNumber`、`WindowsVersion`、`OsArchitecture` |
| CPU 架构 | 执行时记录 `RuntimeInformation.OSArchitecture`、`ProcessArchitecture`、CPU 型号和逻辑核数 |
| ASR 运行时 | 既有 Windows Python/FunASR CPU runtime；执行时记录 Python 路径、Python 版本、FunASR/torch/torchaudio 版本 |
| 模型 | G1 固定快照：SenseVoiceSmall revision `7bf452403abd7353a300cd760f7adae7701c92c1`；FSMN-VAD revision `f9a8b8274674755d925277e27063869038d41515` |
| 输入 | 既有安全合成样例：静音、轻噪、清晰中文、中英混合、损坏 WAV、非音频文件；不得使用真实课堂录音或学生数据 |
| 隔离实现 | 任务专属临时 Windows Firewall 出站阻断规则，绑定明确目标 Python executable；不得改 profile 开关、默认策略或永久策略 |
| 执行次数 | 同一隔离窗口内完成既有 16 项矩阵一次；正向样例仍各 3 次，no-speech 样例各 3 次 |
| 结论范围 | 若通过，只能声明该 Windows/运行时/CPU/Firewall 组合 `PASS`，不得外推为跨平台 PASS、产品接入或生产发布资格 |

---

## 4. 前置环境门槛

执行前必须全部满足，否则立即记录为 `ENVIRONMENT_UNAVAILABLE` 或 `DEFERRED`，不得降级执行：

1. 至少一个适用 Windows Firewall profile 为 `Enabled=True`。
2. 当前会话具备创建和删除临时 Windows Firewall 规则的权限。
3. 能定位唯一目标 Python executable，且该 executable 与 ASR runtime 一致。
4. 目标 Python 进程在执行前无同名残留 ASR 任务占用；如存在无关进程，不得强杀，必须停止并记录为环境不可用或等待人工处理。
5. G1 固定模型目录存在，关键文件 SHA-256 与既有 manifest 一致。
6. 安全样例 manifest 存在且样例 SHA-256 与记录一致。
7. 隔离证据目录位于仓库外 `I:\ai-studybuddy-tmp\runs\phase1-5-g2-windows-isolation-<run-id>`。
8. 执行者确认不会修改永久 Firewall profile、默认出入站策略、注册表、系统服务、全局 PATH 或无关网络配置。

---

## 5. 出站探测冻结

隔离生效期间必须执行有限、无秘密、无业务数据的通用出站探测，用于证明阻断来自外部隔离层。

### 5.1 探测目标

冻结为以下公开测试目标之一或全部，执行时记录最终使用集合：

- `https://example.com/`
- `https://www.msftconnecttest.com/connecttest.txt`

不得使用真实 AI Provider、ModelScope、GitHub、QQ SMTP、飞书 Webhook、用户配置 URL 或任何含秘密的目标。

### 5.2 探测方法

使用与 ASR 相同的目标 Python executable 运行最小 HTTP/TCP 探测脚本：

- 隔离前：可记录一次 baseline，但 baseline 成功不是 G2 必要条件；若本机本来离线，应记录环境事实并谨慎判定。
- 隔离中：探测应被 Windows Firewall 阻断，记录错误类型、退出码、耗时和目标域名；不得记录响应正文中的无关内容。
- 清理后：可记录一次恢复探测；若网络环境本来不可达，不得因此判定清理失败，但必须结合规则残留为 0 说明。

探测不得包含密钥、Cookie、业务数据、完整 UUID 或真实用户信息。

---

## 6. 执行步骤冻结（未来获批后）

未来执行者必须按顺序执行，并把每一步输出保存到证据目录：

1. **运行上下文**：记录 Git 分支/commit、时间、操作者、证据目录、授权摘要。
2. **平台快照**：记录 OS、CPU、PowerShell、Python、FunASR/torch/torchaudio 版本。
3. **Firewall 前置快照**：记录 `Get-NetFirewallProfile`、目标规则名不存在、任务命名规则残留为 0。
4. **模型与样例复核**：复核 G1 模型目录、关键 SHA-256、样例 manifest；不下载、不联网获取模型。
5. **进程独占检查**：记录目标 Python executable、执行前相关 ASR 进程残留；发现无法区分的无关进程则停止。
6. **隔离前 baseline（辅助）**：用目标 Python 执行有限通用出站探测并记录结果；该结果不单独决定 G2。
7. **创建临时规则**：创建任务专属 Windows Firewall outbound block rule，绑定目标 Python executable，规则名必须包含 runId，例如 `AIStudyBuddy-G2-<run-id>-BlockPythonOutbound`。
8. **隔离生效快照**：记录规则详情、profile 状态、规则计数、目标 executable 绑定。
9. **隔离中阻断探测**：用同一目标 Python 执行第 5 节探测，预期被阻断。
10. **隔离中 ASR 矩阵**：在同一隔离窗口执行既有 16 项安全样例矩阵，要求正向样例结构化成功、no-speech 样例结构化 `NO_SPEECH`、异常/超时/清理符合预期。
11. **运行期状态快照**：在 ASR 运行期间或紧邻运行后记录 Firewall 规则仍存在且启用、目标规则计数为 1。
12. **finally 清理规则**：无论成功或失败，都删除任务专属规则。
13. **清理后快照**：确认任务命名 Firewall 规则残留为 0；记录 profile 未被修改。
14. **进程/临时文件残留检查**：确认目标 ASR 子进程、任务临时目录、命名规则残留均符合预期。
15. **结构化汇总**：生成组合级 JSON，总结状态为 `PASS`、`PARTIAL`、`ENVIRONMENT_UNAVAILABLE`、`DEFERRED` 或 `FAIL`，并列出证据文件短哈希。

---

## 7. PASS / 非 PASS 判定

### 7.1 `PASS` 必须全部满足

- Windows Firewall profile 至少一个适用且启用；
- 临时出站阻断规则成功创建，绑定明确目标 Python executable；
- 隔离生效期间通用出站探测被阻断；
- 同一隔离窗口内 ASR 16 项矩阵通过；
- 规则在 ASR 运行期间仍存在且启用；
- finally 删除规则成功，残留计数为 0；
- 未修改永久 profile、默认策略、注册表、服务、PATH 或无关网络配置；
- 未读取、输出或持久化真实录音、完整转写、秘密、Provider URL、正式运行数据或完整 UUID。

### 7.2 必须记录为 `ENVIRONMENT_UNAVAILABLE` / `DEFERRED`

- Firewall profile 仍全部禁用；
- 当前权限无法创建/删除临时规则；
- 目标 Python executable 不唯一或 ASR runtime 不可定位；
- 模型或样例 manifest 不存在或哈希不一致；
- 需要启用/修改永久 Firewall 策略、注册表、服务、PATH 或无关网络配置才能继续；
- 网络环境本身不可判定且无法提供外部强制阻断证据。

### 7.3 必须记录为 `FAIL`

- 隔离规则存在但出站探测仍可访问目标；
- ASR 运行期间规则被移除或不再适用；
- ASR 矩阵失败且不是环境前置不可用；
- 清理后命名规则、进程或临时文件残留无法解释或无法清理；
- 发生越权永久配置修改；
- 读取/输出真实用户数据、秘密或真实 Provider 信息。

---

## 8. 证据文件冻结

未来执行至少生成以下仓库外文件：

```text
I:\ai-studybuddy-tmp\runs\phase1-5-g2-windows-isolation-<run-id>\
  00-run-context.json
  01-platform-snapshot.txt
  02-firewall-before.json
  03-model-and-fixture-check.json
  04-process-precheck.json
  05-egress-baseline.json
  06-firewall-rule-create.json
  07-firewall-during.json
  08-egress-blocked.json
  09-asr-matrix\summary.json
  10-firewall-runtime-check.json
  11-firewall-cleanup.json
  12-residual-check.json
  13-g2-combination-summary.json
  evidence-inventory.json
```

提交到仓库的文档只能引用证据目录、文件名、短哈希、版本、状态和错误分类；不得提交原始完整日志、真实音频、完整转写或秘密。

---

## 9. 文件范围

本计划任务只允许修改：

```text
.plans/phase1-5-t02-t04-g2-standard-windows-isolation-plan.md
docs/04-开发任务清单-Todo-List.md
```

本计划任务禁止修改：

- `packages/`；
- Schema、migration、API、Worker、前端、shared 类型；
- `docs/08`、`docs/09`、S7 PRD 的正式 G2 语义；
- Composer 模型、样例、能力卡或既有证据；
- 系统 Firewall 配置或任何网络配置；
- T05/T06 相关计划或实现。

---

## 10. 本计划验证与 fresh-pass 清单

本计划任务只运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

fresh-pass 检查：

- [x] 只覆盖标准 Windows 一个组合，没有泛化为跨平台 PASS。
- [x] 明确冻结目标平台、OS/运行时/CPU 架构记录项和 Windows Firewall 隔离实现。
- [x] 明确冻结出站探测目标与方法，且不使用真实 Provider 或秘密。
- [x] 明确 ASR 运行次数与安全样例矩阵，不使用真实课堂录音或用户数据。
- [x] 明确 try/finally 清理、规则残留为 0、进程/临时文件残留检查。
- [x] 明确 `offline`/cache-only、baseline、无 TCP 轮询不能单独构成 G2 `PASS`。
- [x] 明确 `AuralConverter`、T04 装配、T05/T06 和业务代码均不启动。
- [x] 明确本计划完成后停止，执行需用户再次明确批准。

---

## 11. fresh-pass 结论

fresh-pass 结论为 `PASS（仅计划质量）`：本计划已把标准 Windows G2 补证所需的平台组合、隔离机制、出站探测、ASR 矩阵、回滚清理、零残留和非 PASS 分类全部冻结；同时没有授权任何系统配置修改、隔离执行、模型下载、产品装配或业务代码变更。下一步只能在用户再次明确批准后按本计划执行实测。
