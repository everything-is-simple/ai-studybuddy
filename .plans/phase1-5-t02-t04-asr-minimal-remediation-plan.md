# Phase 1.5-T02/T04-R2 ASR 当前候选最小化修正计划

> **状态**：✅ 计划已完成 fresh-pass；任何执行仍须用户再次明确批准
> **日期**：2026-07-22
> **计划分支**：`codex/phase1-5-t02-t04-asr-minimal-remediation-plan`
> **基线**：`origin/master` `bd7cf7c996f3ad82fa627d43d28e0f9740ba9dbd`

## 1. 目标与单一责任

本任务是原 T02/T04 三门禁补证 `BLOCKED` 后的独立修正计划，单一责任是：

> 只针对当前 `FunASR 1.3.22 + iic/SenseVoiceSmall` 候选，允许未来获批执行时重新取得一个固定 revision 的 SenseVoiceSmall 快照和一个固定 revision 的 FSMN-VAD 快照，在可回滚 Windows Firewall 隔离下运行一套最小矩阵，关闭或如实判定 immutable revision、防火墙离线隔离和 no-speech 三个门禁。

本计划不预设“缺少 VAD”是静音/轻噪误转写的唯一根因。VAD 是当前最小、最明显的修正假设；语言检测、推理参数、音频预处理和模型默认行为仍可能导致失败，必须由统一矩阵验证。

本阶段只创建、审查和提交计划，不下载模型、不创建 Firewall 规则、不运行 ASR/FFmpeg、不修改产品代码。

## 2. 当前事实与历史边界

| 项目 | 当前事实 | 本任务边界 |
|---|---|---|
| T02 | 原 composer smoke 已执行，结论 `PARTIAL`；清晰中文和中英混合可运行，但旧模型来自可变 `master`，静音/轻噪有非空误转写，防火墙隔离未证明。 | 不篡改旧证据，不将旧 `master` 反向写成 immutable revision。 |
| T03 | FFmpeg Composer smoke 已为 `PASS`；19 个场景中 15 个正常场景通过、4 个预期失败场景得到预期错误。 | 仅引用标准 WAV、异常和清理能力，不重开或扩展 T03。 |
| T04 | ASR 后续能力验证为 `PARTIAL`；正向短样例、异常、超时和清理已有证据。 | 只补三个门禁，不创建/装配 `AuralConverter`。 |
| 原三门禁补证 | G1/G2/G3 总体 `BLOCKED`，无新增 `FAIL`；没有可信 immutable revision，当前进程无管理员权限且 Firewall profiles 禁用，G3 按停止条件未运行。 | 新任务通过改变受控授权重新取得新证据，不伪造或覆盖历史。 |
| T05/T06 | `NOT_STARTED`。 | 本任务不授权 T05/T06。 |

即使本任务未来执行结果为 `PASS`，也只代表当前机器和指定快照下的三个门禁关闭，不等于 ASR/S7 完成、生产 SLA 达标、模型可再分发或 T05/T06 获批。

## 3. 合理工程量上限

未来获批执行的工程量固定为：

```text
1 个现有 ASR 候选
+ 1 个 VAD
+ 2 个固定模型快照
+ 3 个门禁
+ 16 个核心运行
+ 1 次 Firewall 规则生命周期
+ 1 份结构化报告与 1 次 COMPONENT-CARD 更新
```

### 3.1 唯一候选

- ASR：`iic/SenseVoiceSmall`；
- VAD：与当前 FunASR 路线兼容的 `FSMN-VAD`；
- 推理框架：既有 FunASR 1.3.22；
- 运行方式：既有隔离 Python/PyTorch CPU 试炼环境；
- 音频输入：仅使用既有安全合成、非敏感样例。

### 3.2 明确不比较

本任务不下载、安装、转换或比较：

- Paraformer-zh；
- ct-punc；
- faster-whisper；
- Silero VAD；
- whisper.cpp；
- sherpa-onnx；
- 其他 ASR/VAD/说话人模型；
- 云端 ASR 或真实 Provider。

若当前候选因质量、资源、版本、许可证或分发条件失败，另建候选 benchmark 计划；不得在本任务临时扩大范围。

## 4. 允许和禁止的写入范围

### 4.1 未来获批后的允许写入

- `I:\ai-studybuddy-composer\asr\T04-next-capability\metrics\minimal-remediation\`；
- `I:\ai-studybuddy-composer\asr\T04-next-capability\runs\minimal-remediation-<run-id>\`；
- 现有 T04 能力目录内明确用于本任务的试炼脚本、配置和 `shared\COMPONENT-CARD.md`；
- 执行任务分支中的本计划文件；
- 执行任务分支中的 `docs/04-开发任务清单-Todo-List.md`。

`<run-id>` 必须替换为实际的 UTC 或本地时间戳加短随机标识，不得原样使用。

### 4.2 明确禁止

- 不修改 `packages/`、Schema、migration、API、Job/Worker、前端或 shared 产品类型；
- 不创建、装配或调用 `AuralConverter`；
- 不修改 `ConverterResult` 产品契约；
- 不启动 T05/T06；
- 不修改系统 PATH、注册表、系统服务、永久 Firewall 策略或其他任务 worktree；
- 不使用真实课堂录音、真实学生资料、真实 Provider、真实 API Key 或云端 ASR；
- 不提交模型、虚拟环境、缓存、原始音频、运行日志或仓库外试炼产物；
- 不用关键词过滤、固定文本、样例特判或业务代码修改伪造 `NO_SPEECH`；
- 不把能力结果宣称为生产接入资格。

任何越权写入立即停止并判定 `FAIL`，优先清理临时进程和 Firewall 规则。

## 5. 执行前置条件与明确授权变化

原补证任务禁止模型下载且执行环境没有管理员权限，因此只能确认阻断。未来执行本计划必须由用户再次明确批准以下新增授权。

### 5.1 两个固定快照的一次性获取

仅允许获取：

1. `iic/SenseVoiceSmall` 的一个明确 immutable revision；
2. `FSMN-VAD` 的一个明确 immutable revision。

要求：

- 下载前从可信官方来源解析并记录精确 revision/commit hash；
- 下载调用必须显式指定该 revision，不得使用 `master`、`main`、`latest`、可变 tag 或默认分支；
- 下载到新的隔离目录，不覆盖、迁移或清理旧 `master` 缓存；
- 下载完成后记录来源、模型 ID、revision、FunASR/ModelScope/Python/PyTorch 版本、平台架构、许可证、文件清单、字节数和逐文件 SHA-256；
- manifest、revision 和 hash 不一致时立即 `FAIL`；
- 无法获得可信 immutable revision 时立即 `BLOCKED`，不得猜测或增加第三个模型。

受控下载阶段可以访问模型官方来源；完成两个快照和清单后进入离线试炼阶段，后续核心矩阵不得联网。

### 5.2 Firewall 环境前置条件

执行任务本身不负责启用 Windows Firewall profiles。开始执行前必须由用户或管理员提供：

- 已提升的管理员 PowerShell；
- 至少一个已启用的 Firewall profile；
- 独立试炼虚拟环境的精确 Python 可执行文件路径；
- 没有其他任务正在使用该 Python 可执行文件。

前置条件不满足时 `G2=BLOCKED`，停止，不启用永久策略，也不用 offline/cache-only 环境变量替代。

## 6. 三个门禁的执行设计

### 6.1 G1：immutable model revision

**单一责任**：证明新 SenseVoiceSmall 和 FSMN-VAD 快照对应明确、不可变、可复核的 revision。

**步骤**：

1. 记录下载前模型 ID、可信来源和精确 revision；
2. 显式以 revision 下载到新隔离目录；
3. 枚举全部文件、相对路径、字节数和 SHA-256；
4. 记录许可证文件或官方许可证元数据；
5. 在运行前再次核对 manifest 和 hash；
6. 所有 JSON 证据不得包含本机用户名、密钥、完整内部路径以外的敏感信息。

**成功标准**：两个模型均能以同一 immutable revision 重复核对，manifest/hash 一致且来源和许可证可追溯。

**停止条件**：任一模型只能取得可变引用、来源不可追溯、许可证无法记录、revision/manifest/hash 不一致时，立即 `BLOCKED` 或 `FAIL`，不进入 G2/G3。

### 6.2 G2：Windows Firewall 离线隔离

**单一责任**：证明核心矩阵运行期间，指定试炼 Python 进程被真实 Firewall 出站规则隔离，且规则完整回滚。

**规则要求**：

- 规则名包含固定前缀 `AIStudyBuddy-T04-ASR-Minimal-` 和本次 run ID；
- 只绑定隔离虚拟环境的精确 Python executable；
- 只创建本任务需要的临时出站阻断规则；
- 创建前、创建后、运行中、finally 删除后均保存脱敏快照；
- 记录管理员状态、Firewall profiles、规则名、目标程序、开始/结束时间、创建结果和删除结果；
- 使用 `try/finally`，无论模型加载、矩阵或报告生成是否失败都先删除规则；
- 删除后再次查询，残留数必须为 0。

**成功标准**：规则创建成功并处于有效 profile，核心矩阵在规则存在期间完成本地加载/推理，finally 删除成功且无残留。

**停止条件**：权限不足、profile 未启用、规则无法确认生效、规则范围越界、删除失败或出现残留时，立即 `BLOCKED/FAIL`，不使用弱化方案继续。

### 6.3 G3：no-speech 与正向回归

**单一责任**：验证一个预先固定配置的 FSMN-VAD 能否在调用 SenseVoiceSmall 前稳定区分 no-speech，同时不破坏正向短语音。

**配置约束**：

- 运行前固定并记录 VAD/ASR 参数、语言设置、音频预处理参数和阈值；
- 核心矩阵开始后不得针对单个样例调参、增加关键词过滤或样例特判；
- 如果需要第二组阈值或重新设计后处理，停止并另建修正计划，不在本轮迭代到通过；
- `NO_SPEECH` 由 VAD/试炼协议产生，结构化结果的 `text` 必须为空。

**16 个核心运行**：

| 类别 | 样例 | 次数 | 预期 |
|---|---|---:|---|
| no-speech | 静音 | 3 | 3/3 `NO_SPEECH`，`text=""` |
| no-speech | 轻噪 | 3 | 3/3 `NO_SPEECH`，`text=""` |
| 正向 | 清晰中文安全合成语音 | 3 | 3/3 成功，文本非空且重复稳定 |
| 正向 | 中英混合安全合成语音 | 3 | 3/3 成功，文本非空且重复稳定 |
| 异常 | 损坏 WAV | 1 | `AUDIO_DECODE_FAILED` |
| 异常 | 非音频文件 | 1 | `AUDIO_FORMAT_UNSUPPORTED` |
| 异常 | 受控超时 | 1 | `PROCESS_TIMEOUT` |
| 清理 | 超时后的进程/临时文件检查 | 1 | 无残留候选进程和未清理临时文件 |

**成功标准**：16 个运行全部符合预期；正向样例结果稳定；静音/轻噪无任何非空转写；异常分类、超时和清理通过。

**停止条件**：静音/轻噪任一次产生非空文本、正向样例任一次失败或明显退化、配置需要样例特判、超时失控、进程残留或只有修改业务实现才能通过时，G3 不关闭，不增加候选或扩大矩阵。

## 7. 固定执行顺序与回滚

未来执行顺序固定为：

1. 确认执行分支、允许写入目录和仓库/试炼场初始状态；
2. 检查管理员权限和 Firewall profile 前置条件，但暂不创建规则；
3. 执行 G1：仅获取两个固定快照并生成 manifest/hash/许可证证据；
4. G1 成功后，确认不再需要网络下载；
5. 创建临时 Firewall 出站阻断规则并保存快照；
6. 在规则存在期间加载本地 ASR/VAD 并执行 16 个核心运行；
7. 在 `finally` 中终止本任务子进程、删除临时规则并复查残留；
8. 生成结构化汇总、脱敏日志和 COMPONENT-CARD 更新；
9. 检查写入白名单和 Git 状态；
10. 只更新实际证据对应的任务状态，不自动启动后续任务。

G1 失败时不创建 Firewall 规则；G2 创建后发生任何错误时，清理优先于报告生成。

## 8. 产物与脱敏

未来产物至少包含：

- `model-manifest.json`：两个模型的 ID、immutable revision、来源、版本、架构、许可证、文件清单和 SHA-256；
- `firewall-lifecycle.json`：管理员状态、profiles、规则名、目标程序、前后快照、创建和删除结果；
- `results.jsonl`：16 个运行的结构化结果，不记录真实音频正文或敏感路径；
- `summary.json`：G1/G2/G3 和总体判定、重复性、资源、超时与清理摘要；
- `audit.log`：脱敏操作日志；
- 更新后的 `shared\COMPONENT-CARD.md`；
- `README.md` 或等价报告：明确 `PASS/PARTIAL/FAIL/BLOCKED` 及未关闭门禁。

允许记录模型输出的短摘要或 hash；不得提交音频、完整真实转写、本机用户名、密钥、Provider URL、完整 UUID 或系统无关网络信息。

## 9. 判定与任务状态

### 9.1 本修正任务判定

- **PASS**：G1、G2、G3 全部满足成功标准，16 个运行符合预期，Firewall 完整回滚，无越权写入或残留进程。
- **PARTIAL**：部分门禁关闭，但存在 no-speech、正向稳定性、资源、异常、覆盖或证据缺口。
- **BLOCKED**：可信 immutable revision 无法取得，或执行环境没有管理员权限/有效 Firewall profile，因前置条件无法继续。
- **FAIL**：来源或 hash 不一致、隔离不生效、Firewall 无法回滚、越权写入、失控进程、敏感数据泄露或关键矩阵失败。

### 9.2 T02/T03/T04/T05/T06 边界

- T02：原 smoke 的历史结论继续为 `PARTIAL`，不得把旧 `master` 下载改写为固定 revision；新任务证据单独登记。
- T03：继续为 `PASS`，不重开。
- T04：当前继续为能力验证 `PARTIAL`；本计划创建和 fresh-pass 不改变状态。
- 修正任务未来若 `PASS`：仅表示三个当前候选门禁关闭，可由用户决定是否创建目标机适用性或 T05 计划；不自动升级 T02/T04，也不自动授权产品装配。
- T05/T06：继续为 `NOT_STARTED`，必须分别创建计划、审查并获得用户明确批准。

## 10. 门禁后才允许考虑的工作

以下内容不属于本计划，只有当前候选在三门禁或后续目标机适用性上失败时才可另行规划：

- Paraformer 或其他 FunASR 内部候选；
- faster-whisper、whisper.cpp、sherpa-onnx 等外部基准；
- 5–10 分钟课堂型音频；
- 双人交替说话、说话人分离；
- 真实课堂录音；
- 最终 Windows 打包、模型再分发和安装器；
- `AuralConverter`、API、Schema、Job/Worker 或前端实现。

候选 benchmark 第一轮最多允许一个 FunASR 内部候选和一个外部候选，不得自动扩展为多框架研究。

## 11. 本计划阶段验证

本轮只运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

本轮不运行：

- `pnpm type-check`；
- backend/frontend build；
- `pnpm test` 或 Playwright；
- Composer ASR/FFmpeg；
- 模型下载或联网查询；
- Firewall 创建、删除或配置变更；
- T05/T06 或产品实现。

## 12. fresh-pass 审查清单

计划创建后必须从头独立复读，至少确认：

1. 单一责任只有当前 SenseVoiceSmall + FSMN-VAD 的三个门禁；
2. 工程量严格为一个 ASR、一个 VAD、两个快照、三个门禁、16 个运行、一次 Firewall 生命周期和一份报告；
3. 没有预设 VAD 是唯一根因，也没有允许矩阵中逐样例调参；
4. 旧 `master` 模型证据没有被篡改，G1 只使用新固定快照；
5. Firewall profiles 必须由管理员预先提供，任务不修改永久策略；
6. 规则只绑定隔离 Python executable，且 `finally` 删除和残留复查完整；
7. no-speech、正向、异常、超时和清理合计严格为 16 个运行；
8. 没有 Paraformer/faster-whisper/whisper.cpp/sherpa-onnx 或长音频范围；
9. 没有 `packages/`、AuralConverter、API、Schema、Worker、前端或 T05/T06；
10. 所有结论均声明能力验证不等于生产接入资格；
11. 本计划本身不构成执行批准，未来模型获取、管理员 Firewall 和核心矩阵仍需用户再次明确批准。

## 13. fresh-pass 记录

### 13.1 审查结果

2026-07-22 已从头复读计划并完成 fresh-pass：

- **单一责任**：通过。只处理 SenseVoiceSmall + FSMN-VAD 当前候选的 G1/G2/G3，不承担最终产品选型或装配。
- **工程量**：通过。严格限制为一个 ASR、一个 VAD、两个快照、三个门禁、16 个核心运行、一次 Firewall 生命周期和一组收口报告；候选名称只在“明确不比较”或未来触发条件中出现。
- **历史证据**：通过。旧 `iic/SenseVoiceSmall@master` 保持历史 `PARTIAL`，没有用当前 commit 反向补写旧 revision。
- **根因表述**：通过。VAD 仅作为最小修正假设，不宣称唯一根因；矩阵开始后禁止逐样例调参或特判。
- **Firewall**：通过。管理员权限和至少一个已启用 profile 是外部前置条件；规则只绑定隔离 Python executable，使用 `try/finally` 删除并要求残留为 0；任务不启用永久策略。
- **矩阵与停止条件**：通过。静音、轻噪、清晰中文、中英混合各 3 次，加损坏 WAV、非音频、受控超时和清理各 1 次，共 16 次；任一关键失败即不关闭对应门禁，也不扩大候选范围。
- **产品边界**：通过。没有 `packages/`、AuralConverter、ConverterResult、API、Schema、Worker、前端、真实数据或 T05/T06。
- **批准边界**：通过。本计划的 fresh-pass 只允许提交计划；两个模型快照、管理员 Firewall 和 ASR 核心矩阵仍待用户再次明确批准。

### 13.2 fresh-pass 结论

**PASS（计划质量）**。计划具备可执行的单一责任、前置条件、成功标准、停止条件、回滚和脱敏边界；未发现需要在本任务加入 Paraformer、faster-whisper、whisper.cpp、sherpa-onnx、长音频或产品实现的理由。

该 PASS 只表示计划审查通过，不表示 G1/G2/G3 已关闭，也不改变 T02 `PARTIAL`、T03 `PASS`、T04 `PARTIAL`、T05/T06 `NOT_STARTED`。

## 14. 执行顺序调整授权（2026-07-22）

用户在管理员会话复核后明确批准以下有限调整：

- 当前定制版 Windows 10 无可用的 Firewall profile；
- 允许先执行 G1 固定模型 revision 和 G3 no-speech 16 项矩阵；
- G2 保持 `BLOCKED`，不得使用 offline/cache-only 环境变量或其他弱化证据冒充 Firewall 隔离 `PASS`；
- 不修改永久 Firewall 策略，不启用或改造系统 Firewall profile；
- 不扩大候选范围，不进入 T05/T06；
- 完成 G1/G3 后停止并报告，不宣称三个门禁全部关闭。

该调整只改变 G1/G3 的执行顺序和 G2 停止条件对后续试炼的阻断关系，不改变 G1、G3 的成功标准、固定矩阵、写入白名单、产品代码禁区或最终判定规则。即使 G1/G3 均通过，本次总体结论最高仍为 `PARTIAL`，因为 G2 明确保留为 `BLOCKED`。

## 15. G1/G3 执行结果（2026-07-22）

在第 14 节有限调整授权下完成运行 `minimal-remediation-20260722-220554-e937e8`：

- G1=`PASS`：从 ModelScope 官方 Git 获取并核对两个完整 commit hash，使用完整 hash 显式下载新隔离快照；SenseVoiceSmall revision 为 `7bf452403abd7353a300cd760f7adae7701c92c1`，FSMN-VAD revision 为 `f9a8b8274674755d925277e27063869038d41515`，逐文件 SHA-256 清单已生成；
- G2=`BLOCKED`：管理员会话下 Domain/Private/Public profile 仍全部禁用；未创建 Firewall 规则，未修改永久策略，offline/cache-only 不计作隔离证据；
- G3=`PASS`：固定参数矩阵 16/16 符合预期。静音与轻噪各 3/3 均为结构化 `NO_SPEECH`、VAD 段数 0、文本长度 0；清晰中文与中英混合各 3/3 非空且短哈希稳定；损坏 WAV、非音频、受控超时和清理检查均得到预期分类；
- 后置清理：目标 Python 残留 0、任务命名 Firewall 规则残留 0、运行临时目录清空；
- 总体=`PARTIAL`：只关闭 G1/G3，G2 仍未关闭；不宣称三个门禁全部关闭。

结构化证据位于 `I:\ai-studybuddy-composer\asr\T04-next-capability\metrics\minimal-remediation\minimal-remediation-20260722-220554-e937e8\`。本轮不修改产品代码，不创建或调用 `AuralConverter`，不进入 T05/T06。能力验证结果不等于生产接入资格。
