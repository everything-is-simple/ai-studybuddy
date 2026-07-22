# Phase 1.5-T02/T04 G2 WSL/Linux 隔离实测证据审查

**日期**：2026-07-23
**任务分支**：`codex/phase1-5-g2-wsl-isolation-exec`
**基线**：`origin/master` @ `a6d632ce0c26caa1db9358951eecb40120362107`
**运行数据目录**：`I:\ai-studybuddy-tmp\runs\phase1-5-g2-wsl-isolation-20260723-022923`
**审查结论**：`PASS`，但仅限本文列出的一个 WSL/Linux 组合；不得泛化为所有 Windows、Docker、Linux、VM 或跨平台 `PASS`。

## 1. 授权与范围

本次执行来自用户对“最后试试一次 WSL/Linux”的明确授权，且仍受既有 G2 SoT 与批准计划约束：

- 只允许执行 OS/虚拟化层可验证出站隔离、必要本地模型缓存/加载检查、受控 ASR 运行、脱敏证据与状态草案记录。
- 不授权 `AuralConverter` 或任何 Adapter/产品装配。
- 不授权 `packages/` 业务实现、Schema、migration、API、Worker、前端或 shared 类型修改。
- 不授权 T05/T06、生产接入、生产发布或真实用户数据处理。
- 不允许把单个平台结果泛化为跨平台 `PASS`。

## 2. 被测组合

| 维度 | 记录 |
| ---- | ---- |
| Host | Windows 主机上的 WSL2 |
| WSL distro | `CentOSStream-10-Alt` |
| OS | CentOS Stream 10 (Coughlan) |
| Kernel | `6.6.114.1-microsoft-standard-WSL2` |
| CPU 架构 | `x86_64` |
| Python | `3.12.12` venv，位于运行数据目录内 |
| ASR 运行时 | FunASR `1.3.22`，torch `2.13.0+cu130`，torchaudio `2.11.0+cu130`，ModelScope `1.38.1` |
| 隔离实现 | root `unshare -n` 临时 Linux network namespace；命名空间内仅 loopback，且随进程退出释放 |
| 本地模型 | 复用 G1 固定 revision 快照：SenseVoiceSmall `7bf452403abd7353a300cd760f7adae7701c92c1`、FSMN-VAD `f9a8b8274674755d925277e27063869038d41515` |

## 3. 强证据摘要

结构化证据保存在运行数据目录，提交仓库的仅为脱敏审查摘要，不提交原始音频、完整日志、venv、pip cache 或大模型文件。

| 证据文件 | 结论 |
| -------- | ---- |
| `01-windows-wsl-probe.txt` | 发现 `CentOSStream-10-Alt` WSL2；`docker-desktop` 未用于本次 ASR。 |
| `02-wsl-linux-probe.txt` | 记录 OS、kernel、arch、工具链、普通命名空间权限与外部基线；普通 namespace 不可用，root `unshare -n` 可用。 |
| `03-wsl-root-netns-probe.txt` | root 临时 netns 内 `ip addr` 仅 loopback，`curl https://example.com/` 因解析失败退出，证明隔离态与外部基线可区分。 |
| `06-wsl-runtime-check.txt` | venv 内 FunASR/torch/torchaudio/ModelScope/numpy/soundfile 导入与版本记录完成。 |
| `07-composer-assets-inspect.txt` | 本地模型与安全样例存在，记录模型 `model.pt` SHA-256。 |
| `08-wsl-g2-isolated-run.txt` | 隔离执行包装器先确认外部基线可访问，再在 `unshare -n` 内运行 ASR 矩阵；退出码 0。 |
| `09-asr-matrix/summary.json` | `status=PASS`，`caseCount=16`，`passedCount=16`，`modelLoadMs=6824`；隔离内 `curl` 对 example.com 与 msftconnecttest 均退出 6。 |
| `09-asr-matrix/results.jsonl` | 静音/轻噪各 3 次 `NO_SPEECH`，正向样例各 3 次非空且短哈希稳定，损坏 WAV/非音频/受控超时/清理检查均符合预期。 |
| `10-wsl-runtime-residual-check.json` | Windows 与 WSL 进程残留检查均无匹配，`result=PASS`。 |
| `11-wsl-cleanup-and-zero-residual.json` | 未做破坏性清理；未修改 Firewall/nft/iptables/routing/sysctl；证据目录、venv、pip cache 为复核保留。 |
| `12-wsl-g2-combination-summary.json` | 对本文单一组合汇总为 `status=PASS`。 |
| `evidence-inventory.json` | 对脱敏文本/JSON/脚本证据建立文件清单和 SHA-256；排除大体积 venv/pip cache/offline cache 内部文件。 |

## 4. 判定

本组合满足 G2 正式 SoT 的强证据要求：

1. **外部强制隔离**：ASR 子进程运行于 root `unshare -n` 临时 network namespace，隔离由进程外 OS/虚拟化层机制施加，不依赖 `offline`/cache-only、DNS、hosts、代理或人工断网。
2. **可区分出站探测**：外部基线可访问 `https://example.com/`；隔离命名空间内对 `https://example.com/` 和 `https://www.msftconnecttest.com/connecttest.txt` 的 `curl -I -L` 均退出 6，且 `ip addr` 仅 loopback。
3. **隔离下本地 ASR 正向证据**：16 项受控矩阵全部符合预期，且模型加载、正向转写、no-speech、异常输入、超时和清理检查都发生在隔离命名空间内。
4. **审计与零残留**：未创建永久网络规则，未修改 Firewall/nft/iptables/routing/sysctl；命名空间随进程退出；目标 ASR/runner 进程残留为 0。
5. **隐私与越权边界**：未提交原始音频、完整日志、模型文件、venv 或缓存；未处理真实用户数据；未修改 `packages/`；未创建/装配 `AuralConverter`；未启动 T05/T06。

因此：

- `CentOSStream-10-Alt / WSL2 / x86_64 / Python 3.12.12 venv / root unshare -n` 这一组合：`G2=PASS`。
- 既有标准 Windows 尝试：仍为 `ENVIRONMENT_UNAVAILABLE`（Firewall profiles 全部禁用），不是 `PASS`。
- Docker、独立 VM、其他 Linux 发行版、其他 CPU 架构、其他 Python/torch 运行时：`NOT_TESTED`。
- T02/T04 的产品装配、`AuralConverter`、Job/Worker/API/前端接入：仍需用户再次明确批准后才能开始。

## 5. 后续建议

1. 用户若接受本审查结论，可批准将“WSL/Linux 单组合 G2 PASS”作为 Phase 1.5-T02/T04 后续能力门禁的有效证据之一。
2. 若要宣称更广义跨平台结论，必须分别补测标准 Windows、Docker `--network none`、独立 VM 或其他目标组合；不得复用本 WSL 结果泛化。
3. 只有在用户再次明确批准后，才可进入 `AuralConverter`/T04 装配计划或实现；本文件本身不构成装配授权。
