# Phase 1.5-T03：S7 FFmpeg 音频预处理行动计划

**版本**：v1.1
**日期**：2026-07-22
**任务分支**：`codex/phase1-5-t03-s7-ffmpeg-preprocess-plan`
**任务 worktree**：`I:\ai-studybuddy-worktrees\phase1-5-t03-s7-ffmpeg-preprocess-plan`
**任务类型**：行动计划、fresh-pass 审查与获批后的 Composer 试炼执行回填
**批准状态**：✅ 用户已于 2026-07-22 明确批准 T03；执行已完成且结论为 `PASS`（仅 Composer 本机预处理 smoke，未合入 `master`）。

---

## 1. 单一目标、依据与停止点

Phase 1.5-T03 的单一责任是在独立 Composer 试炼场验证 **Windows 本地 FFmpeg 音频预处理能力**：格式识别、受控转换、采样率/声道规范化、长音频切片和脱敏可观测证据。该能力仅为未来 ASR 输入准备事实；不装配 `AuralConverter`，不接入后端。

本计划以 `origin/master` / `f54f8fc6a8c2fcf62bda98d4282b6a6ff5b4e438` 为唯一基线。T02 已完成且最终结论为 `PARTIAL`：FunASR 1.3.22 + `iic/SenseVoiceSmall` 在 Windows CPU 的本地技术可行，但静音/轻噪声 false positive、模型 immutable revision 缺失、离线隔离证据不足，以及首次 pip 安装默认用户缓存偏差均未关闭。

```text
合成且非敏感的音频样例
  → Composer 中受控的 ffprobe / ffmpeg
  → 16 kHz 单声道 PCM WAV、切片与脱敏证据
  → 未来 T04 的独立评估输入（不是 Adapter、不是 ASR 调用）
```

**预批准计划阶段停止点（已完成）**：只创建、审查、提交并推送本计划及 `docs/04` 回填；当时未下载、安装、解压、运行或 smoke FFmpeg，直至用户于 2026-07-22 明确批准。

**获批执行后的停止点（已遵守）**：仅在本文件的 Composer 白名单内记录预处理能力和 `COMPONENT-CARD.md`；不自动进入 T04、T05 或 T06。T04 仍须独立计划、独立审查和用户明确批准。

---

## 2. 范围与不可越过的边界

未来实际 T03 只可在以下绝对路径写入，且每次执行只写其需要的子目录：

```text
I:\ai-studybuddy-composer\asr\FFmpeg\
├─ bin\
├─ samples\
├─ output\
├─ .cache\
├─ smoke-test\
└─ shared\
```

本轮和未来 T03 均禁止：

- 修改 `packages/`、业务代码、S7 PRD、共享类型、Schema、migration、API、Job/Worker、前端或 S2 管道。
- 创建、装配、调用或承诺 `AuralConverter`、`ConverterResult` 产品实现、FunASR 或任何真实 ASR 推理。
- 进入 T04–T06，或把 T03 描述为“ASR 已完成”“S7 已完成”“可直接生产接入”。
- 使用真实课堂录音、学生/教师数据、资料原文、考试内容、正式运行数据、Provider URL、密钥、完整 UUID 或外部试炼场依赖。
- 不得写系统 PATH、注册表、服务、全局配置、`%LocalAppData%`、既有用户缓存或 Composer 白名单外的文件；不得执行未知全局缓存清理。
- 将 GPL/LGPL 许可、二进制来源、编译配置、再分发责任或动态/静态链接责任未经证据即判定为安全。

T03 只改善和规范化 ASR 输入；它**不得承诺**修复 T02 静音/轻噪声 false positive，也不会自动关闭 T02 的 immutable revision、离线隔离或 no-speech 门禁。

---

## 3. Windows 二进制候选、来源与固定决策

执行前必须把候选来源、下载 URL、获取日期、release/tag、架构、许可证/NOTICE、SHA-256、`ffmpeg -version`、`ffmpeg -buildconf` 和依赖摘要写入 Composer `shared/` 的脱敏证据；任何一项不可复核即停止该候选。

| 候选 | 用途与优点 | 风险/结论 |
| --- | --- | --- |
| 已存在系统 FFmpeg 的只读检测 | 仅确认系统是否已有命令及基础版本信息 | 只作环境输入；若来源、版本、许可证、哈希与 Composer 隔离无法同时证明，绝不作为实际 smoke 二进制，不复制、不调用其进行转换。 |
| **Gyan 固定 release essentials ZIP（推荐且唯一可执行路径）** | 便携、带 release 版本和 sidecar SHA-256；可仅把必要的 `ffmpeg.exe`、`ffprobe.exe` 与许可证材料放在 Composer | 固定使用 `ffmpeg-8.1.2-essentials_build.zip`，预期 SHA-256 为 `db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec`。只能在发布页、sidecar、本地重算和 build configuration 全部一致时执行；不得改用浮动 `latest`/git master。 |
| BtbN 固定 release 的 `lgpl` 构建 | 有明确 `gpl`/`lgpl` 变体，可作为替代调研输入 | 不在本计划中启用。若推荐候选被阻断，必须另建计划，固定 release asset 与 SHA-256，并重新审查依赖、架构、NOTICE、`-version/-buildconf`。 |
| Chocolatey、Scoop、Winget 等包管理器 | 可比较可用性 | 只分析系统写入、缓存、PATH 与来源风险；本计划下不得安装或采用。 |

来源依据仅记录为复核入口，而不构成分发授权：[FFmpeg 下载页](https://www.ffmpeg.org/download.html)、[Gyan Windows builds](https://www.gyan.dev/ffmpeg/builds/) 与 [BtbN FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)。FFmpeg 代码库主要为 LGPL，且可选组件可能使构建落入 GPL；必须以所选二进制的实际 build configuration、许可证和 NOTICE 判断本机研究、未来集成与再分发责任，不能凭候选名称推断。

未来实际执行的来源控制顺序：

1. 在 `.cache/` 保存固定 ZIP、发布方 SHA-256 sidecar 和来源元数据；不写系统下载目录。
2. 使用本地 `Get-FileHash -Algorithm SHA256` 复算 ZIP；不一致或空值立即 `FAIL`，不解压。
3. 仅解压 `ffmpeg.exe`、`ffprobe.exe`、许可证/NOTICE 与版本记录至 `bin/`；文件清单和各文件 SHA-256 写入 `shared/`。
4. 以 Composer 绝对路径调用二进制，单次进程环境只临时设置 `PATH`，不得写回用户或系统环境变量。
5. 在读取 `-version`、`-buildconf`、`-L` 的证据后，仍将“产品分发许可”保留为未决；T03 的本机研究不等于取得任何再分发授权。

---

## 4. 隔离、记录、异常中止与最小回滚

### 4.1 执行前基线

未来 T03 在首次写入前必须记录：白名单六个子目录及其文件清单/短哈希、各目录总大小、可用磁盘、当前 `ffmpeg`/`ffprobe` 进程列表、计划使用的环境变量，以及当前系统/用户 PATH 的只读摘要（不记录用户目录）。缓存变量只允许指向 `I:\ai-studybuddy-composer\asr\FFmpeg\.cache\`；不得继承写入默认包管理器缓存的行为。

### 4.2 文件名、日志与证据规则

- 样例、输出与日志仅使用预定义 case ID，例如 `wav-baseline`、`compressed-input`、`invalid-file`；禁止姓名、学校、课程、完整文本、完整 UUID、真实路径或秘密进入文件名。
- `shared/` 与 `smoke-test/` 只保存相对路径、短 SHA-256、尺寸、时长、版本、资源、退出码、脱敏错误码和执行摘要；不保存真实音频、完整命令中可能包含的敏感路径或任何转写文本。
- 运行日志写 stderr；结构化结果仅写一行 UTF-8 JSON。证据目录不进入主仓库 Git。

### 4.3 异常与回滚

超时、非零退出、无法写入白名单、哈希/许可证不一致、资源越限或意外输出时：停止启动后续 case、终止本轮可识别子进程、再次列出 `ffmpeg`/`ffprobe` 残留并记录结果。回滚只能删除**本轮前后清单差集且位于上述白名单内**的文件；不得递归删除 Composer 根目录、`%LocalAppData%`、系统文件、注册表、系统 PATH、既有用户缓存或未知文件。无法证明安全回滚时保留残留并判定 `FAIL`/`PARTIAL`，不得强制清理。

---

## 5. 未来 smoke 设计（本轮不生成、不运行）

所有样例均在获得 T03 明确批准后创建，必须是可再生、合成、非敏感内容；不允许真实课堂录音或可识别语音。成功预处理输出的唯一目标形态是 **PCM WAV、16 kHz、单声道、明确样本格式**，作为未来 ASR 输入评估边界，不是产品 API/Adapter 契约。

| Case | 安全输入 | 预期与记录 |
| --- | --- | --- |
| `wav-baseline` | 标准 WAV | 识别元数据并复制/规范化；记录 codec、采样率、声道、位深、时长和输入/输出哈希。 |
| `compressed-input` | 合成的常见压缩音频 | 受控转换为目标 WAV；不承诺所有编码器均支持，未支持应受控拒绝。 |
| `nonstandard-layout` | 非 16 kHz、非单声道合成样例 | 验证重采样与声道规范化，结果严格符合目标形态。 |
| `silence` | 标准静音音频 | 只验证预处理的元数据、转换、切片和可观测性；不得把输出存在解释为 no-speech 或 ASR 质量结论。 |
| `light-noise` | 可再生轻噪声样例 | 记录转换与资源边界；不得宣称处理或修复 T02 false positive。 |
| `corrupt-file` | 固定无效字节/截断音频 | 预期受控解码失败，不产出伪成功 WAV。 |
| `unsupported-format` | 明确非音频小文件或不支持容器 | 预期格式拒绝、无异常输出。 |
| `timeout-resource-output` | 可控合成长样例或故障注入 | 验证超时、CPU/内存/磁盘上限、写入失败/异常输出时的错误码、清理和残留检查。 |
| `long-slice` | 合成长音频 | 验证固定切片时长、相邻片段重叠、首尾边界、排序和总时长覆盖；记录每片哈希及可重复性。 |

切片规则在执行前固定到 `shared/`：切片时长、重叠时长、最后一片最小时长、时间戳格式和命名序号。不得在运行中修改规则或用人工拼接掩盖边界错误。每个 case 至少重复两次；同一二进制、同一输入、同一参数的输出格式、元数据和 SHA-256 必须一致，否则记录为不可重复。

---

## 6. 输出契约与 `COMPONENT-CARD.md`

每个 case 产生一行 UTF-8 JSON，普通日志写 stderr。最小契约如下，字段只含脱敏摘要和相对证据路径：

```json
{
  "case_id": "wav-baseline",
  "status": "PASS",
  "input_summary": { "format": "wav", "duration_ms": 0, "sha256_short": "..." },
  "output_summary": { "format": "pcm_s16le_wav", "sample_rate_hz": 16000, "channels": 1, "duration_ms": 0, "sha256_short": "..." },
  "ffmpeg_version": "...",
  "source_ref": "gyan-release-8.1.2",
  "license_review": "RECORDED_NOT_REDISTRIBUTION_APPROVED",
  "timing_ms": 0,
  "peak_memory_mb": 0,
  "disk_delta_bytes": 0,
  "process_cleanup": "NO_RESIDUAL_PROCESS",
  "hashes": { "binary_sha256_short": "...", "input_sha256_short": "...", "output_sha256_short": "..." },
  "error_code": null,
  "evidence_path": "shared/results/wav-baseline.json"
}
```

`COMPONENT-CARD.md` 必须包含：组件/二进制来源、固定版本、架构、ZIP/二进制 SHA-256、许可证与 NOTICE、实际 `-version/-buildconf` 摘要、支持与拒绝的格式、目标规范化参数、切片与重叠策略、性能/内存/磁盘/残留进程记录、可重复性、已知限制、最小回滚步骤、T04 可使用的证据，以及 T04 不可据此假定的事项。

T04 可使用的只有“受控 FFmpeg 在本机将指定安全样例规范化为目标 WAV、能够受控切片、对特定异常安全失败、资源/来源/许可证记录齐全”的证据。T04 不可据此假定 ASR 质量、静音/噪声 no-speech 能力、模型 immutable revision、离线隔离、正式 MIME 白名单、API 形状、`AuralConverter` 契约或生产分发许可。

---

## 7. 结论门槛

- **PASS**：来源、许可证/NOTICE、固定版本、架构和所有哈希可追溯且一致；二进制与缓存仅在白名单；全部正常 case 输出符合目标形态并可重复；损坏/不支持/超时/资源/输出异常均以预期失败受控结束；切片边界和重叠证据完整；性能、内存、磁盘、日志脱敏和无残留进程均已记录。
- **PARTIAL**：转换技术可行且隔离未违规，但许可证结论、资源/性能预算、格式覆盖、可重复性、异常覆盖或证据完整性仍有明确缺口。不得因此进入 T04。
- **FAIL**：来源、版本、架构、哈希或许可证不可复核；发生白名单外写入、PATH/注册表/系统配置污染、无法受控终止的进程、关键目标形态不符、非预期伪成功，或无法安全回滚。

无论结论为何，禁止把 T03 视为 T02 `PARTIAL` 的自动修复或解除 T04 门禁。只有未来独立的 T04 计划、审查和用户明确批准才可讨论 Adapter。

---

## 8. 未来执行顺序与本轮交付

未来获批后按以下顺序执行：先重审来源/许可证和白名单基线，再获取并校验固定 ZIP，随后最小解压、版本/构建配置记录、单 case 冒烟、全矩阵、重复性/资源/残留检查、能力卡和结论。任一硬门槛失败立即停止，不切换候选、不扩大范围、不进入 T04。

本轮计划任务只允许：

1. 新增本计划，完成 fresh-pass 审查记录。
2. 在 `docs/04-开发任务清单-Todo-List.md` 将 T03 登记为 `📝 计划待批`，不勾选任何实现项，不改变 T02 `PARTIAL`。
3. 运行文档治理、工作树与缓存区 diff 检查；显式暂存这两份文件，提交并推送任务分支。
4. 报告分支、提交、推送状态、未合并 `master`、`docs/04` 更新位置及“仍待用户明确批准”。

---

## 9. fresh-pass 审查记录

**审查范围**：以 `f54f8fc` 的 T02 `PARTIAL` 结论、S7 PRD、架构、测试、数据模型、接口契约、开发规范和本计划为准；审查只检查计划与文档，不执行 FFmpeg/Composer/业务操作。

| 检查项 | 结论 | 处理 |
| --- | --- | --- |
| T02 结论与后续门禁 | PASS | 保留 `PARTIAL`，明确不修复 false positive、immutable revision、离线隔离或 no-speech 门禁。 |
| T03 单一责任与 T04–T06 隔离 | PASS | 只计划预处理证据；禁止 `AuralConverter`、ASR、后端、Worker 和前端。 |
| Composer 白名单与回滚 | PASS | 固定六个可写子目录、差集回滚和禁止全局/未知清理。 |
| 来源、版本、哈希与许可证 | PASS | 固定 Gyan 8.1.2 ZIP + SHA-256；BtbN/包管理器不作为本计划执行路径；许可证结论不越权。 |
| smoke 矩阵、资源与结构化证据 | PASS | 覆盖正常、异常、长切片、重复性、资源、残留与脱敏 JSON/能力卡。 |
| 文档/Git 边界 | PASS | 仅本计划与 `docs/04` 可变；只推任务分支，禁止合入/推送 `master`。 |

**fresh-pass 结论（预批准历史记录）**：计划覆盖 T03 所需的前处理能力、隔离、来源、回滚、验收与 T04 证据边界；当时该审查仅确认“计划已审查”，不自行授权实际执行。用户随后已于 2026-07-22 明确批准，执行结果见第 10 节。


---

## 10. 获批后的 Composer 执行记录（2026-07-22）

### 10.1 批准、范围与隔离结果

用户已于 2026-07-22 明确批准执行本计划。执行只在 `I:\ai-studybuddy-composer\asr\FFmpeg\{bin,samples,output,.cache,smoke-test,shared}` 内写入。执行前/后基线分别在 Composer `shared/baseline-before.json` 与 `shared/baseline-after.json`；执行后没有白名单外的直接子目录，且无 `ffmpeg`/`ffprobe` 残留进程。没有写系统 PATH、注册表、服务、全局配置、`%LocalAppData%` 或既有用户缓存。未修改 `packages/`、S7 PRD、Schema、migration、API、Job/Worker、前端或任何产品接口，未创建/装配/调用 `AuralConverter` 或 FunASR，未进入 T04–T06。

样例均为本机脚本生成的非敏感正弦波、静音、确定性轻噪声、无效字节或文本；不含语音、真实课堂录音、学生/教师数据、资料原文、Provider 信息或秘密。清单与哈希见 Composer `shared/sample-manifest.json`。

### 10.2 固定来源、版本与许可证事实

- 唯一下载并验证的归档为 Gyan `ffmpeg-8.1.2-essentials_build.zip`，109,728,040 字节。计划固定 SHA-256、发布方 sidecar 和本地 SHA-256 均为 `db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec`，见 `shared/source-manifest.json`。
- 仅提取 `ffmpeg.exe`、`ffprobe.exe`、`LICENSE` 和 `README` 至 Composer `bin/`/`shared/`；条目、二进制 SHA-256 和文件大小在 `shared/archive-selection.json`、`shared/extracted-artifacts.json`。
- `ffmpeg -version` 为 `8.1.2-essentials_build-www.gyan.dev`；`-buildconf` 实测含 `--enable-gpl --enable-version3 --enable-static`。版本、构建配置、`-L` 许可证文本和随包 LICENSE/README 分别在 `shared/ffmpeg-version.txt`、`shared/ffmpeg-buildconf.txt`、`shared/ffmpeg-license.txt`、`shared/LICENSE.txt`、`shared/README.txt`。
- 这只记录 GPLv3-enabled 静态构建的本机试炼事实，不是产品依赖准入、动态链接结论、再分发授权或履约结论。未来产品采用或 BtbN LGPL 变体仍须独立计划、固定 asset/SHA-256 和许可证审查；未使用 `latest`、包管理器或系统 FFmpeg。

### 10.3 smoke 矩阵、可重复性与资源证据

完整 smoke 共 19 个 JSONL 用例：15 个正常路径 `PASS`（WAV、MP3、M4A、11,025 Hz 双声道、静音、轻噪、8 个长音频切片），4 个边界 `EXPECTED_FAIL`（损坏 WAV、非音频文本、输出目标为目录、500 ms 受控超时），无非预期失败。成功输出均经 `ffprobe` 验证为 PCM WAV / `pcm_s16le`、16 kHz、单声道；两次独立基线转换 SHA-256 一致。31 秒合成长样例采用 6 秒切片、2 秒重叠，起点 `[0,4,8,12,16,20,24,28]` 秒、末片 3 秒，覆盖 `[0,31]`。

逐例输入/输出摘要、退出码、耗时、峰值工作集、磁盘增量、进程清理和哈希见 `shared/results/smoke-results.jsonl`；汇总见 `shared/smoke-summary.json`，重复性见 `shared/reproducibility.json`，切片见 `shared/slice-strategy-evidence.json`，脱敏 stdout/stderr 在 `shared/logs/`。`shared/COMPONENT-CARD.md` 已记录来源、版本、架构、哈希、许可证/NOTICE、支持/拒绝格式、规范化/切片、资源、限制、最小回滚与 T04 证据边界。

执行中仅修正 Composer 内 smoke harness 的 Windows PowerShell 兼容性（不支持 `ProcessStartInfo.ArgumentList`、避免保留 `$Error` 变量）；修正后从头重跑完整矩阵，未把中断尝试计入结论。

### 10.4 结论与后续门禁

**T03 Composer 预处理 smoke 结论：`PASS`。** 此结论仅表示固定、隔离的 Windows 本机 FFmpeg 二进制在非敏感合成样例上具备可追溯的格式识别、受控转换、16 kHz 单声道 PCM WAV 规范化、切片、异常受控失败、资源记录和无残留进程证据。

它**不**修复或关闭 T02 的 `PARTIAL`：静音/轻噪声 false positive、模型 immutable revision、离线防火墙隔离和 no-speech 门禁仍未关闭；也不构成 ASR/S7 完成、生产接入、`AuralConverter` 契约、正式 API/MIME 白名单或产品许可证/再分发结论。T04 是否可启动仍必须有独立计划、fresh-pass 审查和用户明确批准。本分支尚未合入 `master`。
### 10.5 执行后 fresh-pass 审查

独立执行后审查逐项复核并通过：计划固定值、发布方 sidecar 与本地归档 SHA-256 三者一致；19 条 JSONL 结果完整（15 `PASS`、4 `EXPECTED_FAIL`、0 `FAIL`），所有正常输出均为 `pcm_s16le` / 16 kHz / 单声道 WAV，峰值内存字段完整且基线输出哈希可重复；Composer 顶层仅有六个白名单目录、日志不含 Composer 原始绝对路径、无 `ffmpeg`/`ffprobe` 残留 PID；Git 工作树仅修改本计划与 `docs/04-开发任务清单-Todo-List.md`。审查再次确认 T02 仍为 `PARTIAL`，许可证/再分发结论未越权，T04–T06 未被触发，且本分支未合入 `master`。
