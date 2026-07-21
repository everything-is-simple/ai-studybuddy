# Phase 1.5-T02：S7 ASR Composer Smoke 行动计划

**版本**：v1.3
**日期**：2026-07-21
**任务分支**：`codex/phase1-5-t02-s7-asr-composer-plan`
**任务 worktree**：`I:\ai-studybuddy-tmp\worktrees\phase1-5-t02-s7-asr-composer-plan`
**任务类型**：已批准计划 + T02 composer smoke 证据回填
**批准状态**：用户已于 2026-07-21 明确批准；T02 已按白名单执行完毕，最终判定 `PARTIAL`。该结论只证明 Windows CPU 本地 ASR 技术可行，不授权 T03–T06 或产品业务代码。

---

## 1. 单一目标与停止点

Phase 1.5-T02 的单一目标是在独立试炼场 `I:\ai-studybuddy-composer` 规划一套可执行、可复现、可验收、可回滚的本地离线 ASR smoke，用于验证 Windows 本地 CPU 环境中的安装、模型加载、推理、失败处理、资源占用、离线复跑和稳定性，并形成可供未来 T04 `AuralConverter` 设计使用的能力事实与能力卡。

本计划只授权未来验证技术可行性，不把 composer 变成产品依赖：

```text
安全标准音频样例
  → composer 中的本地 ASR 候选
  → 脱敏 smoke 结果与资源证据
  → 可映射 ConverterResult 的能力事实
  → T04 独立计划决定正式 AuralConverter 契约
```

**计划阶段停止点已解除并完成执行**：计划已创建、审查、提交、推送并于 2026-07-21 获用户明确批准；T02 已完成 composer smoke、能力卡和证据回填，最终结论为 `PARTIAL`。本任务在主线复验与推送后停止，不自动进入 T03–T06。

---

## 2. 开工门禁审计

### 2.1 Git 与任务事实

计划创建前已现场核验：

- 持有 `master` 的 worktree 干净；`git fetch origin` 与 `git pull --ff-only origin master` 成功。
- `master` 与 `origin/master` 均为 `df55dfef6b658a7dbef68472916ddae82ce645ed`。
- Phase 1.5-T01 提交 `df55dfe` 是当前主线提交，已包含 S7 PRD 与 T01 收尾事实。
- 本计划创建前目标文件不存在。
- `docs/04` 中 T02 为待开始，T03–T06 未启动，下一门禁明确为 T02 独立计划。
- 本任务从最新、干净的 `master` 创建独立任务分支与 worktree，未在旧任务分支上继续工作。

### 2.2 必读依据

已按仓库要求核对：

1. `AGENTS.md`
2. `docs/00-文档索引-Index.md`
3. `docs/04-开发任务清单-Todo-List.md`
4. `docs/01-总PRD-产品需求-Product-Requirements.md`
5. `docs/02-七子系统地图-Scenario-Systems.md`
6. `docs/subsystems/07-S7-课堂录音子系统PRD-ClassCapture.md`
7. `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`
8. `docs/08-共同底座架构-Architecture.md`
9. `docs/09-测试验收计划-Test-Plan.md`
10. `docs/10-后端开发规范-Backend-Guidelines.md`
11. `docs/11-前端开发规范-Frontend-Guidelines.md`
12. `docs/12-开发规范-Dev-Rules.md`
13. `.plans/phase1-5-t01-s7-prd-plan.md`
14. `I:\ai-studybuddy-composer` 中现有 README、Python smoke、`COMPONENT-CARD.md`、converter 输出契约与 ASR 占位目录。

### 2.3 Composer 现状与证据等级

只读扫描确认：

- `I:\ai-studybuddy-composer` 不是 Git 仓库，未来不能依赖 `git status` 判断 composer 是否越权或清理完成。
- `asr\FunASR` 与 `asr\SenseVoice` 已有 README、能力卡、空 `samples/` 与 `output/` 占位，但没有真实 smoke 脚本、锁定依赖、模型或已测结果。
- 现有 ASR README/能力卡属于旧占位，其中安装方式、运行形态、许可证、Windows 二进制、硬件、Adapter 名称和 Worker 技术栈等陈述不能视为当前证据。
- composer 根目录存在与本任务无关的既有本机资产；未来执行必须把所有写操作限定在明确的 `asr` 子路径，禁止扫描、移动、清理或提交其他目录内容。
- 现有 `converter/shared/converter-result.js` 可作为输出映射参考，但 T02 不修改该文件，也不冻结主系统共享类型。

### 2.4 官方资料的计划期发现

2026-07-21 仅做了官方资料与软件包元数据核验，没有下载或安装：

| 项目 | 计划期发现 | 执行时要求 |
| --- | --- | --- |
| FunASR 工具包 | 官方仓库源码与 PyPI 包声明 MIT；PyPI 当前列出 Windows 分类和 Python 兼容范围 | 执行当天重新核对版本、Python、依赖树与安装说明并锁定版本 |
| FunASR 模型 | 官方仓库明确模型权重与工具包源码分开授权 | 必须对实际下载的每个模型/VAD/标点权重逐一保存模型卡、许可证与可追踪标识 |
| SenseVoice Python 路径 | 官方 SenseVoice/FunASR 文档提供 `AutoModel` 调用方向 | 以 CPU、本地文件、最小 ASR 输出为准，不启用说话人、情绪、事件或服务化扩展 |
| SenseVoice GGUF/本地运行路径 | FunASR 官方资料与官方模型卡列出了 Windows CPU 的 llama.cpp/GGUF 本地运行路径；这与 composer 旧占位的“无 Windows 预编译路径”说法冲突，但计划期尚未验证具体 release 资产 | 不采信旧占位；执行时核对当前 release、资产哈希、运行参数和模型许可证 |
| 第三方 `SenseVoice.cpp` | 独立仓库仍可作为编译/运行对照，但不能自动等同于官方产品选择 | 只有在官方路径不可用或比较价值明确时才进入可选对照，不复制其源码到主仓库 |

计划期来源清单：

- `https://github.com/modelscope/FunASR`
- `https://pypi.org/project/funasr/`
- `https://github.com/FunAudioLLM/SenseVoice`
- `https://huggingface.co/FunAudioLLM/SenseVoiceSmall`
- `https://huggingface.co/FunAudioLLM/SenseVoiceSmall-GGUF`
- `https://github.com/lovemefan/SenseVoice.cpp`

这些只形成“候选与核验方法”，不构成 smoke 通过、产品选型或再分发许可结论。执行时必须记录检索日期、版本/tag/commit、模型文件标识、许可证文件和下载来源。

### 2.5 门禁结论

**可以创建并审查 T02 行动计划。**

当前只允许提交计划，不允许执行 T02。T02 smoke、能力卡和验收项仍全部未完成。

---

## 3. 范围与非目标

### 3.1 T02 范围

T02 未来执行只验证：

- Windows 原生、本地 CPU 环境的 ASR 候选可安装或可部署性。
- 标准本地音频文件的模型加载与非流式推理。
- 安全中文样例能否产生可读、非空纯文本。
- 结果能否规范化为未来 `ConverterResult` 所需的核心事实。
- 静音、损坏文件、不支持格式、空文本和推理异常是否可稳定分类。
- 首次联网取得依赖/模型后，是否能从显式本地缓存离线复跑。
- 冷启动、热启动、单样例推理、重复执行、CPU/内存/磁盘和残留进程事实。
- 软件包、仓库、模型和转换产物的许可证及未来再分发风险。
- composer 能力卡、执行说明和脱敏证据是否完整。

### 3.2 T02 明确不包含

- 不修改 `packages/`、共享类型、Schema、migration、API、Job、Worker、环境变量或前端。
- 不实现 `AuralConverter`，不决定最终 Adapter 类名、MIME 白名单或正式错误枚举。
- 不把 composer 的代码、命令、绝对路径、虚拟环境或缓存当作正式产品接口。
- 正式产品代码不得 import、执行或复制 composer 文件。
- 不把 ASR 文本送入 S2 笔记生成服务，不生成笔记、导图或知识模块。
- 不执行视频抽音轨、重采样、声道转换、格式转换、降噪、切片或 FFmpeg 产品接入。
- 不验证实时字幕、流式识别、浏览器录音、说话人分离、声纹、情绪识别或课堂监控。
- 不调用云 ASR，不上传录音或转写全文到外部服务。
- 不开始 T03、T04、T05 或 T06。
- 不证明“课堂录音功能已完成”。

---

## 4. 候选组件与选择协议

### 4.1 候选分层

| 优先级 | 候选 | 调用形态 | 目的 |
| --- | --- | --- | --- |
| A | FunASR Python + 官方 SenseVoiceSmall 模型 | 独立 Python CLI；本地文件输入；JSON 输出；显式 CPU | 验证最直接的 Python 安装、模型加载、推理、输出字段和离线缓存路径 |
| B | FunASR 官方资料列出的 llama.cpp/GGUF SenseVoice Windows CPU 路径（执行日核验资产） | 独立本地 CLI；Node/产品接入不在本任务 | 验证无 Python 运行时的本地 CPU 备选、部署体积和 CLI 稳定性 |
| C | FunASR Python + 官方 Paraformer 中文模型 | 与 A 相同，仅作必要比较 | 当 A 的文本/时间戳/空音频行为不能满足基本 smoke 时，判断问题来自模型还是 Python 工具链 |
| D | 独立 `SenseVoice.cpp` 仓库 | 可选源码构建或 release CLI | 只在 A/B 不可用且官方许可证、Windows 构建价值与时间预算清晰时执行 |

A 为必测主候选；B 为本地 CPU 运行形态对照。C/D 不是自动必跑项，只有在前序结论不足以形成 T04 输入时才进入，并在能力卡中说明触发原因。

### 4.2 执行前必须重新核验

对每个实际进入 smoke 的候选，先记录：

1. 官方仓库、包索引、release/model card URL。
2. 包版本、release tag、commit 或模型 revision。
3. Python 版本与支持范围；若是本地二进制则记录架构、编译器/runtime 要求。
4. CPU/Windows 支持是否来自官方文档、包元数据还是仅社区说明。
5. 依赖是否需要 PyTorch、torchaudio、ModelScope、Hugging Face、ONNX、CMake、Build Tools 或原生扩展。
6. wheel/二进制是否匹配本机 Python 与 Windows 架构；无匹配产物时不得盲目编译或降级版本。
7. 工具包源码许可证、第三方依赖许可证、模型权重许可证、量化/转换产物许可证分别是什么。
8. 模型文件大小、总下载估算、解包后占用、缓存目录和最低安全空闲空间；空闲空间至少应为官方估算的两倍。
9. 首次下载是否必须联网；离线参数、缓存变量或本地模型路径是否有官方支持。
10. 未来随产品分发时是否需要保留 NOTICE、模型名、来源、许可证或禁止某类用途。

任一许可证、来源或再分发条件不清楚时，允许做本机研究 smoke，但结论必须标为 `LICENSE_BLOCKED`，不得建议直接进入产品再分发。

### 4.3 选择判定

- 优先选择能在 Windows CPU、本地文件、独立进程、明确许可证和显式本地缓存下完成最小 ASR 的候选。
- 服务端、Docker、GPU、云 API、流式协议和说话人扩展不进入 T02 主路径。
- 不采用官方宣传性能作为本机结论；所有速度、内存和准确性只记录本机实测。
- 不因某一候选失败就静默切换；每次切换必须记录失败分类和触发理由。

---

## 5. 与 T03 FFmpeg 的边界

T02 只接受候选能够直接读取的标准样例，优先使用 WAV/PCM；最终采样率、位深、声道与最长片段要求由 smoke 记录，不在计划阶段假定。

以下属于 T03，不得在 T02 实现：

- 视频抽音轨。
- MP3/M4A/WebM 等格式统一转换。
- 重采样、位深转换、单/双声道转换。
- 长音频切片、拼接、降噪、响度归一化。
- FFmpeg 安装、命令封装、产品 Adapter 或正式预处理管道。

如果候选只接受例如 16 kHz 单声道 WAV，T02 只把它记录为 T03/T04 输入约束；T02 的样例直接按该标准生成，不把“生成标准测试样例”描述成正式音频预处理实现。

---

## 6. 安全样例与隐私策略

### 6.1 样例原则

- 不使用真实学生、教师或课堂录音。
- 不包含真实姓名、课程、学校、资料原文、考试内容、正式 UUID 或运行数据。
- 优先使用本机生成的短时合成中文语音；生成方式与声音来源条款必须记录。
- 若本机无可用中文合成声音，只能使用许可证明确、来源可追踪的公开短样例；许可证不清楚则停止，不下载或提交。
- 音频、模型、缓存、完整转写和运行输出均为本机可再生资产，不进入主仓库 Git。
- 能力卡只保留脱敏摘要、字符数、关键词命中、短哈希、耗时和路径说明，不保留完整转写。

### 6.2 样例矩阵

| ID | 样例 | 生成/准备方式 | 预期用途 |
| --- | --- | --- | --- |
| `clear-zh` | 清晰短中文，约 5–15 秒 | 本机合成或自制无隐私语句 | 验证非空、UTF-8、可读文本与基本关键词 |
| `mixed-terms` | 中文 + 英文 + 数字/专业术语 | 本机合成安全语句，例如线性代数、chapter two、三道例题 | 记录中英数混合表现，不设产品准确率阈值 |
| `silence` | 标准 WAV 静音 | Python 标准库直接生成 | 验证空文本或明确 `NO_SPEECH`，不得伪成功 |
| `corrupt` | 损坏 WAV | 写入固定无效字节 | 验证受控解码失败 |
| `unsupported` | 非音频或不支持扩展名 | 固定小文本文件 | 验证格式拒绝 |
| `light-noise` | 可选轻噪短样例 | 仅在不引入 FFmpeg/正式预处理时生成 | 记录质量警告；不是 T02 通过硬门槛 |

### 6.3 忽略与清理

未来执行必须先创建 ASR 专用忽略规则，至少覆盖：

```text
.venv*/
.cache/
models/
build/
source/
output/*
samples/*.wav
samples/*.mp3
samples/*.m4a
samples/*.bin
samples/*.invalid
__pycache__/
*.pyc
```

由于 composer 根目录不是 Git 仓库，忽略文件是安全约定而非 Git 状态保证。执行前后必须分别保存 `asr` 子树文件清单；清理命令只能对本计划列出的绝对 `asr` 子路径执行，不能递归删除 composer 根目录或其他组件目录。

---

## 7. Smoke 输出契约与 S2 边界

T02 smoke 的标准输出为一行 UTF-8 JSON；普通日志写 stderr，且不得包含完整转写、模型下载 URL 中的令牌、绝对用户目录或秘密。

建议证据结构：

```json
{
  "ok": true,
  "sourceType": "audio",
  "converter": "funasr-sensevoice-smoke",
  "text": "<仅在本机 output 中保存，能力卡不得全文复制>",
  "metadata": {
    "audioDurationMs": 8000,
    "sampleRateHz": 16000,
    "channels": 1,
    "language": "zh",
    "segmentsAvailable": false,
    "timestampsAvailable": false,
    "confidenceAvailable": false
  },
  "warnings": []
}
```

失败结构：

```json
{
  "ok": false,
  "sourceType": "audio",
  "converter": "funasr-sensevoice-smoke",
  "metadata": {},
  "error": {
    "code": "AUDIO_DECODE_FAILED",
    "message": "固定、可归类、无隐私摘要"
  }
}
```

至少验证：

- 纯文本是否存在、是否 UTF-8、空白归一化是否稳定。
- 来源类型与候选标识。
- 音频时长、采样率、声道等非敏感元数据能否取得。
- warning 数组能否表达质量、截断或能力缺失。
- 错误是否固定分类，且不暴露堆栈、绝对路径或完整命令。
- 时间戳、分段、语言识别、置信度是否实际存在；不存在时必须明确 `false`/`null`，不得伪造。
- SenseVoice 的情绪/事件标签即使存在，也不进入 T02 未来 `ConverterResult` 核心映射。

T02 只证明映射可行性，不修改 `packages/shared` 或正式 `ConverterResult`。是否扩展共享类型、音频 MIME 白名单、错误枚举或元数据字段，留到 T04/T05 独立计划。ASR 结果只进入未来 S2 的纯文本入口，不直接生成笔记、导图或知识模块。

---

## 8. 分阶段执行步骤（获批后才允许执行）

### 阶段 A：只读预检

1. 再次确认主仓库分支、worktree、`docs/04` 批准状态和文件白名单。
2. 记录 Windows 版本、CPU、逻辑核数、总内存、可用内存和 `asr` 所在磁盘空闲空间。
3. 记录 `py -0p`、候选 Python 版本、PowerShell 版本；不复用主仓库或 `windows-native` 的虚拟环境。
4. 保存 `I:\ai-studybuddy-composer\asr` 的执行前文件清单和哈希摘要。
5. 确认没有 ASR、Python 或模型相关残留进程；不结束无法确认归属的进程。

### 阶段 B：官方元数据与许可证冻结

1. 重新查询第 2.4 节官方来源。
2. 为实际候选固定版本/tag/revision 与下载资产哈希。
3. 分开保存工具包、runtime、模型、VAD/标点模型及量化产物的许可证结论。
4. 写出依赖清单和预估下载/解包体积。
5. 许可证不清、来源非官方、资产哈希不可追踪或磁盘空间不足时停止，不进入安装/下载。

### 阶段 C：创建隔离运行环境

1. FunASR Python 使用候选目录内独立 `.venv` 与显式 `.cache`；不改全局 Python、不写系统环境变量。
2. 先安装与本机 Windows/Python 匹配的 CPU 依赖，再安装已锁定的 FunASR 包；实际命令和解析后的完整版本写入 README/能力卡。
3. GGUF/本地二进制使用候选目录内独立 `runtime`/`models`，记录压缩包和二进制 SHA-256；不加入 PATH，不注册服务。
4. 任何需要管理员权限、系统级 Build Tools、全局 CMake、驱动或防火墙修改的步骤必须停止并单独报告，不能在 T02 中静默改变系统。

### 阶段 D：准备安全样例

1. 生成/取得第 6.2 节样例。
2. 使用 Python 标准库读取 WAV header，记录采样率、声道、位深、帧数和时长。
3. 不使用 FFmpeg 转换；若样例不满足候选输入要求，重新直接生成符合要求的标准 WAV。
4. 为样例保存 SHA-256 和安全文本清单；不保存个人身份信息。

### 阶段 E：最小正向 smoke

1. 先运行 A：FunASR Python + SenseVoiceSmall，显式指定 CPU、本地音频和独立缓存。
2. 分开计时模型首次加载、首个样例推理和进程总时长。
3. 对 `clear-zh` 验证进程退出码、JSON 结构、非空 UTF-8 文本和安全关键词；记录 CER/关键词命中等事实，但不把它们冒充产品准确率 SLA。
4. 对 `mixed-terms` 记录中英数文本、语言标签、分段/时间戳/置信度实际可用性。
5. 不打印完整转写到普通日志；本机 output 可保存完整结果，能力卡只写脱敏摘要和短哈希。

### 阶段 F：负向与失败 smoke

依次运行 `silence`、`corrupt`、`unsupported`，验证：

- 不出现未捕获堆栈或无限等待。
- 静音明确返回空文本/无语音，不记为成功转写。
- 损坏音频与不支持格式返回稳定错误码。
- stderr、JSON 和能力卡均不包含完整绝对路径、音频内容或秘密。

### 阶段 G：热启动、重复性与离线复跑

1. 在不重新下载的前提下重复运行 `clear-zh` 至少 3 次。
2. 记录每次文本规范化后的短哈希、耗时、CPU 时间和内存；差异必须可解释。
3. 使用候选官方支持的 cache-only/offline 参数与显式本地模型路径复跑。
4. 轮询候选进程的 TCP 连接作为辅助证据；如果不能在不修改系统防火墙的情况下严格证明离线，则结论标为 `OFFLINE_EVIDENCE_PARTIAL`，不得擅自新增防火墙规则。
5. 进程退出后检查候选 Python/CLI 子进程、文件锁和临时文件是否残留。

### 阶段 H：候选 B 与必要对照

1. 对 FunASR 官方资料列出的 Windows CPU GGUF/本地运行候选复用同一批标准 WAV 与同一证据格式；先核验执行日 release 资产、哈希、参数与许可证。
2. 只有 A/B 仍无法形成明确结论时才触发 C 或 D；先记录触发原因、额外下载和构建风险。
3. 不要求所有候选都通过；必须保留每个候选的 PASS/PARTIAL/FAIL 与理由，不得只保留胜者。

### 阶段 I：能力卡、回填与清理

1. 完成候选 README、能力卡、依赖锁、运行说明和证据 manifest。
2. 对能力卡做脱敏扫描，删除完整转写、真实路径中的用户名、完整 UUID、下载令牌与秘密。
3. 对比执行前后 `asr` 文件清单；确认没有修改 composer 其他目录。
4. 模型、缓存、虚拟环境和可再生 output 默认可保留在白名单路径用于离线复跑；若需清理，只清理精确路径并先打印解析后的绝对路径。
5. 回填主仓库 `docs/04`、`docs/08`、`docs/09` 的实际证据；不修改业务代码。
6. T02 只有在用户确认执行证据、任务分支合入 `master` 并推送 `origin/master` 后才可标记完成。

---

## 9. 性能、资源与稳定性证据

每个实际候选至少记录：

- 冷启动模型加载时间。
- 同进程热推理时间；若候选只能单次 CLI，则明确记录“无独立热加载模式”。
- 每个样例的音频时长、处理时长和 RTF（处理时长 / 音频时长）。
- 进程总耗时与退出码。
- 峰值 Working Set 或可重复的近似峰值内存。
- CPU 总时间、平均/峰值采样值和使用线程数（能取得时）。
- 模型、runtime、虚拟环境和缓存占用。
- 首次下载字节数/时长与后续离线复跑差异（能可靠取得时）。
- 连续三次规范化输出哈希的一致性。
- 退出后残留进程、文件锁和临时文件。

本计划不虚构性能或内存硬阈值。能力卡将结果分为：

1. **已测事实**：命令、样例、机器和版本下的实际数据。
2. **建议阈值**：基于实测向 T04 提出的工程建议，明确不是当前 PRD 承诺。
3. **待产品确认**：课堂长音频耗时、最大文件、资源上限与体验 SLA。

短样例若不能在预先声明的安全超时内完成，视为 `PERFORMANCE_UNUSABLE`，但安全超时只用于防止进程失控，不冒充产品 SLA；执行前在 run manifest 中记录具体值。

---

## 10. 失败分类与停止规则

| 分类 | 固定代码 | 最少证据 | 处理/停止规则 |
| --- | --- | --- | --- |
| Python 不兼容 | `PYTHON_UNSUPPORTED` | Python 路径、版本、官方支持范围 | 不降级全局 Python；尝试另一隔离版本前先记录理由 |
| 包安装失败 | `PACKAGE_INSTALL_FAILED` | 锁定包、pip 退出码、脱敏末尾摘要 | 不无限换镜像/版本；确认 wheel/原生扩展后停止或切换 B |
| 模型下载/缓存失败 | `MODEL_FETCH_FAILED` | 来源、revision、目标缓存、状态摘要 | 不改用非官方来源；可重试一次后停止 |
| 许可证不清 | `LICENSE_BLOCKED` | 缺失或冲突的许可证项 | 可保留研究事实，不建议产品再分发 |
| 模型加载失败 | `MODEL_LOAD_FAILED` | 版本、CPU 参数、异常分类、峰值资源 | 不切 GPU/云；可切换已计划候选 |
| 格式不支持 | `AUDIO_FORMAT_UNSUPPORTED` | 样例 header/扩展名、固定错误 | 记录为 T03/T04 输入约束 |
| 解码失败 | `AUDIO_DECODE_FAILED` | 损坏样例哈希、退出码 | 负向样例应受控失败；未捕获崩溃则候选失败 |
| 推理异常 | `ASR_INFERENCE_FAILED` | 脱敏异常类型、退出码、资源 | 同版本可复现一次后停止 |
| 空文本/静音 | `ASR_EMPTY_TEXT` / `NO_SPEECH` | 文本长度、样例类型 | 静音应为受控结果；清晰样例空文本则候选失败 |
| 质量不可用 | `ASR_LOW_QUALITY` | 脱敏关键词/CER/人工摘要 | 记录事实，不虚构产品阈值；必要时触发对照候选 |
| 资源不可接受 | `RESOURCE_EXHAUSTED` | 内存、CPU、磁盘、OS 终止事实 | 停止当前候选，不通过扩大分页文件或系统调优掩盖 |
| 离线复跑失败 | `OFFLINE_REPLAY_FAILED` | 缓存路径、离线参数、网络辅助证据 | 不宣称本地离线可用 |
| 残留进程/锁 | `PROCESS_CLEANUP_FAILED` | PID、进程名、文件锁路径摘要 | 不结束无关进程；记录并停止候选 |

所有失败证据只保留固定错误码、版本、阶段、退出码、耗时、资源和脱敏短摘要。

---

## 11. T02 执行验收标准

T02 执行阶段只有同时满足以下条件，才可建议标记 smoke 通过：

- Windows 本机能够在隔离环境完成至少一个主候选的依赖/runtime 准备。
- CPU 模式能够加载明确版本与许可证的目标模型。
- `clear-zh` 产生非空、可读、UTF-8 的纯文本，且命中预先写入 fixture manifest 的安全语义锚点。
- `mixed-terms` 有可记录结果；准确率只作为事实，不作为未经产品确认的 SLA。
- smoke 输出可规范化为 `ok/sourceType/converter/text/metadata/warnings/error` 核心结构。
- 静音、损坏文件和不支持格式均得到稳定、可分类结果，且无未捕获崩溃。
- 首次取得依赖/模型后，可以从显式本地缓存复跑；若只能取得部分离线证据，T02 状态不得写成完整 PASS。
- 记录版本、revision/hash、软件许可证、模型许可证、下载来源、安装命令、smoke 命令、输入格式、资源与性能事实。
- 连续多次执行结果和退出清理行为可解释，无无法归属的残留进程或文件锁。
- 主仓库不依赖 composer，`packages/` 和业务代码保持不变。
- 形成能力卡、证据清单、失败结论、T03 输入约束和是否建议进入 T04 的结论。
- 主仓库治理与 diff 检查通过，只有白名单文件进入提交。

结论分级：

- `PASS`：至少一个可推荐候选满足全部硬验收，许可证与离线证据完整。
- `PARTIAL`：技术 smoke 可运行，但许可证、离线证明、资源或失败处理仍有明确缺口；不得直接进入 T04 产品装配。
- `FAIL`：没有候选完成基本 CPU 本地 ASR，或出现不可接受的崩溃/资源/来源问题。

> T02 计划获批不等于 T02 smoke 已通过；T02 smoke 通过也不等于 S7 产品接入完成。

---

## 12. 能力卡与证据清单

每个实际执行候选的能力卡至少包含：

- 组件名称、版本/tag/commit。
- 模型名称、revision、文件名与 SHA-256。
- 工具包、runtime、模型、量化转换和主要依赖许可证。
- 运行系统、CPU、内存和磁盘概要，不记录设备序列号或用户身份。
- Python/runtime/CMake/编译器版本（适用时）。
- 完整安装命令与实际退出结果。
- 完整 smoke 命令与工作目录。
- 输入格式、采样率、声道、位深与时长。
- 输出字段可用性：文本、语言、时间戳、分段、置信度、warning。
- 输出示例的脱敏摘要、字符数、关键词命中和短哈希，不包含完整转写。
- 冷/热加载、推理、RTF、CPU、内存和磁盘数据。
- 首次联网下载与后续离线复跑结论。
- 负向样例与失败分类结果。
- 已知限制、T03 输入约束、T04 契约建议。
- 是否建议进入 T04，以及 PASS/PARTIAL/FAIL 理由。
- 证据文件的 composer 相对路径。

建议机器可读证据：

```text
output/run-manifest.json
output/results.jsonl
output/metrics.json
output/dependency-freeze.txt
output/file-hashes.json
output/license-sources.json
output/process-cleanup.json
```

完整音频和完整转写不进入主仓库文档；主仓库只回填脱敏摘要、计数、短哈希、命令和相对证据位置。

---

## 13. 文件白名单

### 13.1 本轮计划阶段：主仓库

只允许修改：

```text
.plans/phase1-5-t02-s7-asr-composer-smoke-plan.md
docs/04-开发任务清单-Todo-List.md
```

`docs/00` 不需要更新：本轮没有新增设计/规范/PRD 文档，`.plans/` 计划不属于索引中的产品文档条目。除非治理脚本明确失败并要求索引同步，否则不得修改 `docs/00`。

禁止修改 `packages/`、S7 PRD、锁文件、环境模板、构建配置及任何 T03–T06 文件。

### 13.2 获批后的 T02 主仓库回填白名单

执行阶段若按本计划获批，主仓库只允许更新：

```text
.plans/phase1-5-t02-s7-asr-composer-smoke-plan.md
docs/04-开发任务清单-Todo-List.md
docs/08-共同底座架构-Architecture.md
docs/09-测试验收计划-Test-Plan.md
```

计划文件只可更新批准状态、实际执行偏差与最终证据；不得把执行中新增范围追认成既定计划。若事实需要修改 S7 PRD 或其他文档，必须停止并先做计划变更审查。

### 13.3 获批后的 composer 维护文件白名单

允许新建或更新：

```text
I:\ai-studybuddy-composer\asr\.gitignore
I:\ai-studybuddy-composer\asr\README.md
I:\ai-studybuddy-composer\asr\shared\generate-safe-fixtures.py
I:\ai-studybuddy-composer\asr\shared\measure-smoke.ps1
I:\ai-studybuddy-composer\asr\shared\result-contract.schema.json

I:\ai-studybuddy-composer\asr\FunASR\README.md
I:\ai-studybuddy-composer\asr\FunASR\COMPONENT-CARD.md
I:\ai-studybuddy-composer\asr\FunASR\requirements.lock.txt
I:\ai-studybuddy-composer\asr\FunASR\smoke-test\smoke-test.py

I:\ai-studybuddy-composer\asr\SenseVoice\README.md
I:\ai-studybuddy-composer\asr\SenseVoice\COMPONENT-CARD.md
I:\ai-studybuddy-composer\asr\SenseVoice\runtime-lock.json
I:\ai-studybuddy-composer\asr\SenseVoice\smoke-test\smoke-test.ps1
```

若触发 Paraformer 或第三方 `SenseVoice.cpp` 对照，必须先在计划文件中登记触发原因，并且只允许新增以下精确维护文件：

```text
I:\ai-studybuddy-composer\asr\FunASR\smoke-test\smoke-test-paraformer.py
I:\ai-studybuddy-composer\asr\SenseVoice\smoke-test\smoke-test-source-build.ps1
```

### 13.4 获批后的 composer 可再生运行目录

以下目录仅用于虚拟环境、官方源码/runtime、模型、样例、缓存、构建和输出，不得复制到主仓库：

```text
I:\ai-studybuddy-composer\asr\FunASR\.venv\**
I:\ai-studybuddy-composer\asr\FunASR\.cache\**
I:\ai-studybuddy-composer\asr\FunASR\models\**
I:\ai-studybuddy-composer\asr\FunASR\samples\**
I:\ai-studybuddy-composer\asr\FunASR\output\**

I:\ai-studybuddy-composer\asr\SenseVoice\runtime\**
I:\ai-studybuddy-composer\asr\SenseVoice\source\**
I:\ai-studybuddy-composer\asr\SenseVoice\build\**
I:\ai-studybuddy-composer\asr\SenseVoice\models\**
I:\ai-studybuddy-composer\asr\SenseVoice\samples\**
I:\ai-studybuddy-composer\asr\SenseVoice\output\**
```

任何其他路径都不在授权范围。发现必须写入白名单外路径时立即停止，不得用“整个 composer”或“整个 asr”作为模糊授权。

---

## 14. 回滚与清理

### 14.1 主仓库

- 计划阶段若验证失败，只修复白名单文件；不使用 `git reset --hard`，不清理他人变更。
- 暂存前用明确路径；发现白名单外文件立即 `git restore --staged -- <path>`，不删除工作树文件。

### 14.2 Composer

- 执行前记录所有计划创建的绝对路径与执行前清单。
- 每次安装/下载只使用候选目录内的显式 `.venv`、`runtime`、`models`、`.cache` 和 `output`。
- 清理前解析并打印绝对路径，确认其位于 `I:\ai-studybuddy-composer\asr\FunASR` 或 `...\SenseVoice`；禁止对变量为空、composer 根或上级目录执行递归删除。
- 默认不删除能力卡、README、锁文件与脱敏 manifest。
- 对系统级环境、PATH、注册表、服务、防火墙、全局 Python 或全局包不得做变更，因此不应产生系统级回滚动作。
- 无法确认归属的进程、文件或目录不清理，只报告阻塞。

---

## 15. Fresh-pass 审查清单

计划完成后必须从头重新审查：

- 与 S7 PRD 的“录音 → 本地 ASR → 纯文本 → S2”链路一致。
- 只验证 ASR，不把 composer、Python 或本地二进制变成产品依赖。
- 没有实现 T03 FFmpeg，也没有预先装配 T04–T06。
- 没有把 SenseVoice 情绪/事件/说话人能力纳入 MVP。
- 没有使用旧占位的未验证版本、许可证、Windows 二进制或性能结论。
- 源码许可证与模型权重许可证分开核验。
- 样例无真实学生/课堂隐私，日志与能力卡不含完整转写。
- 输出契约只做映射验证，不修改共享类型。
- 性能数据区分已测事实、建议阈值和待产品确认。
- 离线证据不足时允许 PARTIAL，不擅自修改系统防火墙。
- 主仓库与 composer 白名单精确、可回滚。
- `docs/04` 将 T02 标记为“计划待批准”，未勾选 smoke、能力卡或验收。

发现问题应先修复再重新审查；无法在计划范围内解决时停止，不扩大范围。

---

## 16. 计划创建阶段验证、提交与交付（历史检查点）

本轮仅运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check

git add -- ".plans/phase1-5-t02-s7-asr-composer-smoke-plan.md" `
  "docs/04-开发任务清单-Todo-List.md"
git diff --cached --check
git -c core.quotepath=false diff --cached --name-only
```

计划创建阶段不运行 type-check、build、业务测试、Python 脚本、ASR smoke、安装或模型下载；该历史检查点已于计划提交时完成，获批后的实际执行与验证见第 17 节。

验证通过后提交：

```text
docs(s7): 登记 ASR composer 调通行动计划
```

计划创建阶段只推送任务分支：

```text
codex/phase1-5-t02-s7-asr-composer-plan
```

计划创建阶段不得合入 `master`、不得推送 `origin/master`，也不得把“计划已推送”报告为“T02 已完成”；该门禁已在用户于 2026-07-21 明确批准后解除。获批后的执行结论必须按第 17 节回填，并在分支验证通过后遵循仓库固定 rebase、fast-forward、主线复验和推送流程。

## 17. 获批后实际执行记录（2026-07-21）

### 17.1 实际候选与环境

- 主候选：FunASR Python 1.3.22 + ModelScope 官方 `iic/SenseVoiceSmall`，本地文件、Windows CPU、`trust_remote_code=False`，未启用 VAD、流式、说话人、情绪或事件能力。
- 隔离环境：Python 3.10.19；torch/torchaudio 2.11.0+cpu；ModelScope 1.38.1；psutil 7.2.2；jsonschema 4.25.1。
- 开发机：Windows 10 Pro x64 build 19045；Ryzen 7 5800H，8 核 16 线程；约 29 GiB 内存。
- 模型资产：20 个文件、940,019,376 bytes。ModelScope API 与下载 README 均标记 Apache License 2.0；FunASR 包元数据为 MIT。下载只固定到 `master`，未取得不可变 revision，因此以逐文件 SHA-256 manifest 补充追踪。
- 候选 A 已形成明确结论，不触发 GGUF/SenseVoice.cpp、Paraformer 或第三候选，也未安装 FFmpeg。

### 17.2 实际 smoke 证据

- 首次加载被 harness 受控判为 `MODEL_LOAD_FAILED`：运行时缺少 `torchaudio`。安装与 torch 精确匹配的 CPU wheel 后恢复，保留失败日志。
- 本地成功批次覆盖合成中文、中英混合、静音、损坏 WAV 与非 WAV；后续加入轻噪声。
- 显式本地模型 + offline 环境变量三次复跑：模型加载 3,342 ms；总进程 28,056 ms；峰值工作集约 3,125.5 MiB；CPU 时间 64.109 s。
- 合成中文与中英混合样例均 3/3 返回非空文本且短哈希稳定，单次 RTF 分别约 0.146–0.161 与 0.167–0.188；但均存在可见识别替换，不代表真实课堂准确率。
- 静音与轻噪声均 3/3 产生同一短误识别，未满足 no-speech 硬验收；损坏 WAV 稳定返回 `AUDIO_DECODE_FAILED`，非 WAV 稳定返回 `AUDIO_FORMAT_UNSUPPORTED`。
- 离线批次 14/14 结果通过共享 Draft 2020-12 JSON Schema；完整转写只保留在 composer 本机忽略目录。
- 受监控离线复跑以 100 ms 轮询未观察到候选 Python TCP 连接，进程退出后无候选 `.venv` Python 残留；因未修改防火墙，离线证据仍按 `OFFLINE_EVIDENCE_PARTIAL` 处理。

### 17.3 执行偏差与处置

1. 首次依赖安装前未设置 `PIP_CACHE_DIR`，约 280.58 MiB 写入默认用户 pip cache。因无法安全区分历史缓存与本次缓存，未删除全局目录；后续 pip、ModelScope 与 Hugging Face cache 全部显式收口到 `FunASR/.cache`。
2. 首次写入前未持久化完整 ASR 树清单；最终保留白名单检查、当前清单、模型逐文件哈希、fixture manifest 和 smoke summary，但该证据缺口不得隐藏。
3. FunASR 原生日志会打印本机绝对路径；runner 已增加已知本机根路径替换，现有 stderr/jsonl 证据也完成脱敏。
4. 执行中仅修改本计划授权的 composer 维护文件和可再生目录；未修改 `packages/`、S7 PRD、FFmpeg、`AuralConverter`、Schema/migration、API、Job/Worker 或前端。

### 17.4 最终判定与下一门禁

**T02 最终判定：`PARTIAL`。** Windows CPU 本地安装、模型加载、短 WAV 推理、重复性、受控错误与显式离线复跑技术可行；但静音/轻噪声 false positive、模型 immutable revision 缺失、离线证明强度和一次性缓存/基线证据偏差不满足完整 `PASS`。

- 允许把本结果作为 T03 独立行动计划的输入，优先验证 FFmpeg 标准化、切片、静音/低能量过滤和噪声边界。
- 不允许直接进入 T04 产品装配；T04 前必须重新关闭 no-speech 契约、资源预算、模型 revision、许可证/再分发与更接近课堂的安全样例门禁。
- T03–T06 仍须分别创建计划、独立审查并获用户明确批准。
