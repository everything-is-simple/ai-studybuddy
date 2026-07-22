# Phase 1.5-T04：S7 ASR 后续能力行动计划

> 仅计划任务、fresh-pass 已审查、尚待用户明确批准；本轮未执行任何 ASR、FFmpeg、Composer、模型下载、业务实现或后续任务。

**版本**：v1.0
**日期**：2026-07-22
**任务分支**：`codex/phase1-5-t04-s7-next-asr-capability-plan`
**任务 worktree**：`I:\ai-studybuddy-worktrees\phase1-5-t04-s7-next-asr-capability-plan`
**任务类型**：仅行动计划、fresh-pass 审查与 `docs/04` 回填
**批准状态**：📝 计划待批；尚未获得用户对任何 ASR、FFmpeg、Composer、业务实现或后续任务的执行批准。

---

## 1. 单一责任、仓库事实与硬边界

### 1.1 仓库实际 T04 定义与本计划处理

`origin/master` 中 `docs/04-开发任务清单-Todo-List.md` 将 Phase 1.5-T04 登记为 **“ASR Adapter 装配”**，单一责任为“ASR 封装为 `AuralConverter`，输出 `ConverterResult`”。同时，T02 最终结论仍为 `PARTIAL`，T03 只给出 FFmpeg 预处理 Composer 能力事实，不构成 ASR 或正式 Adapter 生产接入。

因此，本计划将 T04 拆成一个必须先获批的“后续 ASR 能力补证与 Adapter 前置判定”计划：

- 本计划只定义未来如何安全核对 T02/T03 证据、补齐 ASR 后续能力门槛、形成可供后续 Adapter 决策使用的结构化证据与能力卡。
- 本计划不直接创建、装配、调用或承诺 `AuralConverter`。
- 若未来用户希望真正进入 `AuralConverter`/`ConverterResult` 产品实现，必须在本计划结论允许的前提下，再取得独立明确批准；如涉及 `packages/`、Schema、API、Job/Worker 或前端，必须另行变更或创建实现计划。

### 1.2 必读路径核对与差异记录

本计划依据以下主线文档与计划：

1. `AGENTS.md`
2. `docs/00-文档索引-Index.md`
3. `docs/04-开发任务清单-Todo-List.md`
4. `docs/subsystems/07-S7-课堂录音子系统PRD-ClassCapture.md`
5. `docs/08-共同底座架构-Architecture.md`
6. `docs/09-测试验收计划-Test-Plan.md`
7. `docs/10-后端开发规范-Backend-Guidelines.md`
8. `docs/11-前端开发规范-Frontend-Guidelines.md`
9. `docs/12-开发规范-Dev-Rules.md`
10. `.plans/phase1-5-t02-s7-asr-composer-smoke-plan.md`
11. `.plans/phase1-5-t03-s7-ffmpeg-preprocess-plan.md`

Prompt 中列出的 `docs/10-数据模型-Data-Model.md` 与 `docs/11-接口契约-API-Contracts.md` 在 `origin/master` 不存在；仓库实际 `docs/10`/`docs/11` 分别是后端/前端开发规范。本差异不授权新增 Schema、API 契约或共享类型，也不得据此补造数据模型/API 文档。

### 1.3 当前任务唯一允许产物

本轮只允许修改主仓库内两个文件：

```text
.plans/phase1-5-t04-s7-next-asr-capability-plan.md
docs/04-开发任务清单-Todo-List.md
```

`docs/04` 只登记 T04 “📝 计划待批”、计划路径、审查日期和“仅完成计划与审查”。不得标记 T04 实现完成，不得改变 T02 的 `PARTIAL`，不得把 T03 改回未完成，不得启动 T05/T06。

### 1.4 本计划与未来获批执行均不得越过的禁止事项

- 不修改 `packages/`、业务代码、Schema、migration、API、Job/Worker、前端、shared 类型或 S2 管道。
- 不创建、装配、调用或测试 `AuralConverter`；不把任何临时结果写成正式 `ConverterResult` 产品契约。
- 不把 T03 的 PCM WAV、16 kHz、单声道输出直接写成正式生产契约、MIME 白名单、上传限制或 SLA。
- 不调用真实 Provider，不运行真实外部 smoke。
- 不使用真实课堂录音、真实学生/教师数据、真实资料原文、考试内容、正式运行数据、Provider URL、API Key、SMTP/飞书秘密或完整 UUID。
- 不宣称“ASR 已完成”“S7 已完成”“可直接生产接入”或“可直接进入 T05”。
- 不关闭 T02 的 immutable revision、离线防火墙隔离或 no-speech 门禁；静音/轻噪 false positive 风险必须保持显式未关闭，除非未来获批执行以可信证据单独关闭。
- 不写系统 PATH、注册表、系统服务、全局配置、`%LocalAppData%`、未知用户缓存、其他任务 worktree 或 `master` 之外未授权分支内容。

---

## 2. 前置证据核对与阻断规则

### 2.1 T02 ASR Composer 证据核对

未来若用户明确批准执行 T04 后续能力验证，开始前必须只读核对 T02 证据：

| 核对项 | 必须确认的证据 | 缺失或冲突时处理 |
| --- | --- | --- |
| 工具链 | Python 3.10.19 独立 `.venv`、FunASR 1.3.22、torch/torchaudio 2.11.0+cpu、ModelScope 1.38.1 | 记录为 `PRECHECK_ASR_RUNTIME_MISSING`，停止执行 |
| 模型 | 官方 `iic/SenseVoiceSmall`，20 文件、940,019,376 bytes，逐文件 SHA-256 已在 Composer 本机忽略目录 | 记录为 `PRECHECK_MODEL_EVIDENCE_MISSING`，不得下载替代模型 |
| 许可 | ModelScope API 与下载 README 均标记 Apache License 2.0，FunASR MIT；模型权重与工具包许可分开记录 | 记录为 `PRECHECK_LICENSE_INCOMPLETE`，不得形成再分发结论 |
| 正向结果 | 中文与中英混合短样例 3/3 非空且哈希稳定；14/14 结果通过 JSON Schema | 缺失则停止，不得补跑 ASR |
| 负向结果 | 损坏 WAV → `AUDIO_DECODE_FAILED`，非 WAV → `AUDIO_FORMAT_UNSUPPORTED` | 缺失则停止，不得补造错误分类 |
| `PARTIAL` 缺口 | 静音/轻噪各 3/3 误识别；模型只有 `master` 非 immutable revision；未做防火墙隔离；首次 pip cache 曾误写默认用户 cache | 必须原样保留，不得升级为 PASS |
| 资源 | 模型加载约 3,342 ms、总进程约 28,056 ms、峰值工作集约 3,125.5 MiB | 仅作短音频开发机事实，未来长音频/16GB 目标机须重测 |

T02 的任何缺失、冲突或不可追溯证据均阻断未来执行；不得通过重新运行 ASR、下载模型或修改 Composer 在本计划任务内补救。

### 2.2 T03 FFmpeg Composer 证据核对

未来执行前必须只读核对 T03 证据：

| 核对项 | 必须确认的证据 | 缺失或冲突时处理 |
| --- | --- | --- |
| 主线状态 | 提交 `bb080efa304ad03211865bbc4d6a12718b7057d0` 已位于 `origin/master` | 若不在主线，停止并修正任务清单事实 |
| 来源 | Gyan `ffmpeg-8.1.2-essentials_build.zip`，109,728,040 bytes | 来源不可追溯则停止 |
| SHA-256 | 计划固定 SHA-256、发布方 sidecar、本地 SHA-256 均为 `db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec` | 任一不一致即 `FAIL` |
| 许可证/构建 | `8.1.2-essentials_build-www.gyan.dev`，含 `--enable-gpl --enable-version3 --enable-static` | 只记录本机试炼事实；不得推导产品再分发授权 |
| 提取范围 | 仅 `ffmpeg.exe`、`ffprobe.exe`、LICENSE、README | 发现额外二进制或系统 PATH 依赖则停止 |
| smoke 矩阵 | 19 个 JSONL 用例：15 `PASS`，4 `EXPECTED_FAIL`，0 非预期失败 | 缺失则停止，不得补跑 FFmpeg |
| 输出事实 | 成功输出均为 PCM WAV / `pcm_s16le`、16 kHz、单声道；长音频 6 秒切片、2 秒重叠 | 仅作为未来 ASR 输入能力事实，不是正式接口契约 |
| 隔离 | 未写 PATH/注册表/服务/`%LocalAppData%`/未知缓存；无 `ffmpeg`/`ffprobe` 残留 | 任一越权即 `FAIL` |

### 2.3 T02/T03 与 T04 的边界结论

- T02 `PARTIAL` 可作为 T04 后续能力计划输入，但不直接授权 Adapter 装配。
- T03 `PASS` 只表示固定隔离 FFmpeg 在非敏感合成样例上可规范化音频输入；不表示 ASR、S7、产品许可证、MIME 白名单、上传限制或生产接入完成。
- T04 不得承诺修复 T02 静音/轻噪 false positive；不得自动关闭 immutable revision、离线隔离或 no-speech 门禁；不得自动授权 T05。
- T05 是否可启动仍需独立计划、独立审查和用户明确批准。

---

## 3. 未来获批执行的隔离、数据边界与回滚

### 3.1 独立 Composer/试炼场目录

若未来用户明确批准执行 T04 后续能力验证，只允许在以下 T04 专属目录内写入：

```text
I:\ai-studybuddy-composer\asr\T04-next-capability\
├─ samples\
├─ output\
├─ logs\
├─ metrics\
├─ .cache\
└─ shared\
```

可写范围仅限：

```text
I:\ai-studybuddy-composer\asr\T04-next-capability\samples\**
I:\ai-studybuddy-composer\asr\T04-next-capability\output\**
I:\ai-studybuddy-composer\asr\T04-next-capability\logs\**
I:\ai-studybuddy-composer\asr\T04-next-capability\metrics\**
I:\ai-studybuddy-composer\asr\T04-next-capability\.cache\**
I:\ai-studybuddy-composer\asr\T04-next-capability\shared\**
```

未来执行不得写入 T02 `FunASR` 目录、T03 `FFmpeg` 目录或其他 Composer 子项目，除非只读引用其 `shared/` 证据文件。

### 3.2 环境变量与缓存收口

未来执行前必须在进程级设置并记录：

- `MODELSCOPE_CACHE=I:\ai-studybuddy-composer\asr\T04-next-capability\.cache\modelscope`
- `HF_HOME=I:\ai-studybuddy-composer\asr\T04-next-capability\.cache\hf`
- `TORCH_HOME=I:\ai-studybuddy-composer\asr\T04-next-capability\.cache\torch`
- `PIP_CACHE_DIR=I:\ai-studybuddy-composer\asr\T04-next-capability\.cache\pip`
- `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-5-t04-s7-next-asr-capability`

这些变量只允许在当前 PowerShell/子进程生命周期内设置，不得写系统环境变量、用户环境变量、PATH、注册表、profile 或 `.env.local`。

### 3.3 样例、日志和输出脱敏

- 样例只允许本机合成：短中文 SAPI、短中英混合 SAPI、程序生成静音、低能量噪声、短正弦提示音、损坏字节、文本伪音频；不得使用真实课堂录音或真实资料文本。
- `samples/manifest.json` 记录样例类型、生成脚本、采样率、声道、时长、SHA-256 和“非敏感”说明；不记录真实人名、学校、课程、考试名称或完整路径。
- `logs/` 只保存脱敏 stdout/stderr：替换绝对路径为 `<T04_ROOT>`，替换完整 UUID/长哈希为短哈希，删除完整转写文本、命令中的 secret、Provider URL 和用户名。
- `output/` 可保留完整机器可读结果供本机复验，但主仓库文档只回填计数、固定错误码、短哈希、耗时和相对证据路径。

### 3.4 进程、资源和磁盘边界

未来执行前后必须记录：

- Windows 版本、CPU、逻辑核数、总内存、可用内存、目标盘空闲空间。
- 执行前后 `T04-next-capability` 文件树摘要。
- 相关 Python/ASR/FFmpeg 子进程基线和退出后残留检查。
- 每例处理时长、进程总耗时、峰值 Working Set、CPU 时间、输出字节数和磁盘增量。

安全上限默认：单例 ASR 子进程超时不超过 120 秒；预处理/探测子进程超时不超过 30 秒；并发为 1；目标盘执行前空闲空间不少于本次预计写入量的 2 倍且至少 10 GiB。任一上限被突破时停止并记录为 `RESOURCE_LIMIT_EXCEEDED` 或 `PROCESS_TIMEOUT`。

### 3.5 异常中止与最小回滚

- 中止时只结束由本轮记录 PID 启动且命令行位于 `T04-next-capability` 的子进程；不得结束无法确认归属的系统进程。
- 只允许清理 `T04-next-capability\output\**`、`logs\**`、`metrics\**` 中本轮 run id 对应文件；不得清理 T02/T03 缓存或默认用户 cache。
- 如发生白名单外写入，记录路径、停止执行并判 `FAIL`；不得自动删除未知路径掩盖证据。

---

## 4. 未来 T04 验证矩阵与结果判定

### 4.1 输入前置条件

未来执行只有在以下条件全部满足时才能开始：

1. 用户明确批准执行本计划，不是仅批准创建计划。
2. `docs/04` T04 状态为计划待批或已批准，不是已实现完成。
3. T02 仍明确标记 `PARTIAL`，且缺口已逐项列出。
4. T03 已在 `origin/master`，提交与证据可核对。
5. T04 专属目录不存在或为空；若存在历史内容，先只读列出并要求人工确认，不得覆盖。
6. 不需要管理员权限、系统 PATH 修改、防火墙规则修改、系统服务或注册表写入。

### 4.2 安全合成验证矩阵

| 编号 | 输入/场景 | 目的 | 期望结果 | 结论边界 |
| --- | --- | --- | --- | --- |
| P1 | T03 已规范化的短中文合成 PCM WAV | 验证 ASR 对规范输入的基本可运行性 | 输出非空、JSON Schema 通过、记录短哈希与耗时 | 不代表课堂准确率 SLA |
| P2 | T03 已规范化的短中英混合合成 PCM WAV | 验证术语/数字混合文本可观测性 | 输出非空、记录语言/分段/时间戳字段是否可用 | 不承诺识别准确率 |
| P3 | 低采样率/双声道合成样例经 T03 证据路径规范化后的只读引用 | 验证预处理输出与 ASR 输入兼容性 | 输入被识别为 PCM WAV、16 kHz、单声道后再进入 ASR | 不冻结正式输入契约 |
| N1 | 静音 PCM WAV | 复验 T02 no-speech 风险 | 必须识别为无语音/空文本/固定 no-speech 分类；若仍误识别则 `PARTIAL` 或 `FAIL` | 可关闭 no-speech 门禁需另有明确证据 |
| N2 | 确定性轻噪声 PCM WAV | 复验轻噪 false positive | 不得把短误识别当成功；记录能量/VAD/阈值事实 | 不承诺修复所有噪声 |
| N3 | 损坏 WAV | 验证失败分类 | 稳定返回 `AUDIO_DECODE_FAILED`，无堆栈泄漏 | 仅能力错误码，不是 API 契约 |
| N4 | 非音频文本文件 | 验证格式拒绝 | 稳定返回 `AUDIO_FORMAT_UNSUPPORTED` | 不形成 MIME 白名单 |
| N5 | 受控超时样例或超短超时阈值 | 验证超时和进程清理 | 返回 `PROCESS_TIMEOUT`，无残留 PID | 不形成生产超时 SLA |
| R1 | P1/P2 连续 3 次复跑 | 验证可重复性 | 规范化输出短哈希稳定或差异有原因 | 不代表长课堂稳定性 |
| R2 | 显式本地模型路径 + offline/cache-only 环境 | 验证离线证据强度 | 无下载、无未知缓存写入；若未做防火墙隔离则保持 `OFFLINE_EVIDENCE_PARTIAL` | 不自动关闭离线门禁 |
| M1 | 资源记录全矩阵 | 验证内存/CPU/磁盘边界 | 每例有耗时、峰值内存、磁盘增量、退出码 | 仅开发机事实 |

本轮只设计矩阵，不生成、下载、运行或执行任何样例。

### 4.3 结构化 JSON 结果契约草案

未来机器可读结果必须至少包含以下字段；字段名只用于 Composer 能力证据，不是正式 `packages/shared` 类型：

```json
{
  "runId": "short-safe-id",
  "caseId": "P1",
  "input": {
    "kind": "synthetic_speech|silence|noise|corrupt|unsupported",
    "durationMs": 1000,
    "sampleRateHz": 16000,
    "channels": 1,
    "sha256": "..."
  },
  "preprocess": {
    "source": "t03_evidence|not_used",
    "format": "pcm_s16le_wav_16khz_mono",
    "warnings": []
  },
  "asr": {
    "runtime": "FunASR 1.3.22",
    "model": "iic/SenseVoiceSmall",
    "modelRevision": "master_or_immutable_revision",
    "offlineMode": "verified|partial|not_tested",
    "exitCode": 0,
    "textLength": 0,
    "textSha256Short": "",
    "noSpeechDecision": "speech|no_speech|unknown",
    "warnings": []
  },
  "metrics": {
    "elapsedMs": 0,
    "peakWorkingSetMiB": 0,
    "cpuMs": 0,
    "diskDeltaBytes": 0
  },
  "result": "PASS|EXPECTED_FAIL|PARTIAL|FAIL",
  "errorCode": null
}
```

完整转写文本、真实路径、完整 UUID、Provider 信息、密钥和真实资料内容不得进入主仓库文档。

### 4.4 PASS / PARTIAL / FAIL

- `PASS`：所有关键前置证据、隔离、版本/来源/哈希、许可证记录、结果契约、no-speech 判定、离线证据、资源记录、异常路径和进程清理均满足；仍只代表能力验证通过，不代表生产接入资格。
- `PARTIAL`：核心能力可验证，但存在明确未关闭缺口，例如 immutable revision 未固定、防火墙隔离未完成、静音/轻噪仍误识别、资源只覆盖短样例、长音频未测或异常处理覆盖不足；不得直接进入 T05。
- `FAIL`：来源不可追溯、哈希或版本不一致、许可证事实缺失或越权判断、白名单外写入、失控进程、关键矩阵失败、真实数据泄露或无法形成可信证据。

所有结论必须明确“能力验证结果”和“生产接入资格”是两件不同的事。

---

## 5. 能力卡与后续任务证据边界

未来 T04 若获批执行，应在 Composer T04 专属 `shared/COMPONENT-CARD.md` 中记录：

- 组件名称、运行方式、版本/tag/revision、架构与平台。
- FunASR、torch/torchaudio、ModelScope、模型权重、VAD/标点或其他实际依赖的来源、哈希和许可证。
- FFmpeg 输入证据来源：只引用 T03 `shared/` 证据，不复制或升级为生产契约。
- 安全样例清单、生成方法、哈希、音频元数据和非敏感说明。
- 每例结果摘要、固定错误分类、脱敏 stderr/stdout、资源记录和进程清理证据。
- no-speech/静音/轻噪判断结果，以及是否仍阻断 T04/T05。
- 离线证据强度：防火墙隔离、cache-only、显式本地路径、未知缓存扫描分别记录；没有完成的项目必须标为缺口。
- 已知限制、建议阈值、需产品确认事项和建议后续门禁。

可提供给后续 T05 的证据仅包括：

- 候选 ASR 能力是否可追溯、是否能处理 T03 规范化输入。
- 固定错误分类和资源/超时建议。
- no-speech、离线、版本、许可证是否满足或仍阻断。
- 结构化 JSON 结果和能力卡相对路径。

不可提供给后续 T05 的证据包括：

- 正式上传 MIME 白名单、文件大小/时长限制或前端 UX。
- 数据库 Schema、migration、Job 类型、API DTO、shared 类型或生产 SLA。
- 课堂长音频准确率、真实学生数据表现、云端 Provider 可用性或再分发授权。
- `AuralConverter` 已实现、S7 已完成或可直接进入生产接入的结论。

---

## 6. 文档、验证与 Git 收尾

本计划任务的执行范围：

1. 从最新 `origin/master` 创建隔离任务分支和 worktree。
2. 创建本计划文件。
3. 更新 `docs/04-开发任务清单-Todo-List.md`：T04 登记为“📝 计划待批”，记录计划路径、审查日期和仅完成计划与审查；同步 T03 已合入 `origin/master` 的事实。
4. 执行纯文档验证：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

5. 只暂存本计划文件与 `docs/04`，提交信息使用：

```text
docs(s7): 创建 T04 ASR 后续能力计划
```

不得运行 `pnpm type-check`、backend/frontend build、`pnpm test`、ASR/FFmpeg/Composer smoke、模型下载、Provider smoke 或浏览器验收。

---

## 7. fresh-pass 审查记录（2026-07-22）

### 7.1 审查发现

- `T02`：仍为 `PARTIAL`。FunASR 1.3.22 + `iic/SenseVoiceSmall` Windows CPU 技术可行，但静音/轻噪 false positive、immutable revision、离线防火墙隔离、no-speech 门禁与首次 pip cache 偏差均未关闭。
- `T03`：已通过 Composer FFmpeg 预处理 smoke，结论 `PASS`；提交 `bb080efa304ad03211865bbc4d6a12718b7057d0` 已位于本地 `origin/master`。计划中仍把 T03 限定为能力事实，不作为产品依赖、再分发授权或正式输入契约。
- `T04`：本计划没有跨入 `AuralConverter` 产品实现，没有修改 `packages/`、Schema、migration、API、Job/Worker、前端或 shared 类型。
- `T05/T06`：未启动，且计划明确后续仍需独立计划、审查和用户明确批准。
- 目录、缓存、环境变量与回滚边界：计划限定到 `I:\ai-studybuddy-composer\asr\T04-next-capability\`，明确禁止系统 PATH、注册表、服务、`%LocalAppData%`、未知用户缓存和其他 worktree 写入。
- 许可证与再分发：计划只记录 T02/T03 已有许可证事实，不作产品依赖准入、动态/静态链接、模型再分发或合规履约结论。
- 数据隐私：计划仅允许合成非敏感样例，禁止真实课堂录音、真实学生/教师数据、资料原文、Provider 信息和秘密。
- 验证矩阵、结果契约、能力卡和 PASS/PARTIAL/FAIL 门槛已覆盖，且均声明能力验证不等于生产接入。

### 7.2 修订内容

- 将 docs/04 原 T04 “ASR Adapter 装配”与本轮用户硬边界进行显式调和：计划阶段不创建或装配 `AuralConverter`，未来是否进入 Adapter 产品实现必须另获明确批准。
- 补充 Prompt 文档路径与仓库实际 `docs/10`/`docs/11` 命名差异，避免误造数据模型/API 契约。
- 将 T03 的 PCM WAV 输出限制为未来 ASR 输入能力事实，明确不得冻结为正式生产契约。
- 将 T02 未关闭缺口列入前置阻断矩阵和 PASS/PARTIAL/FAIL 判定。

### 7.3 最终处理结论

fresh-pass 结论：本计划满足“仅计划任务、fresh-pass 已审查、尚待用户明确批准”的本轮目标；未执行任何 ASR、FFmpeg、Composer、模型下载、业务实现或后续任务。T04 后续能力验证尚待用户明确批准，T05/T06 不得启动。
