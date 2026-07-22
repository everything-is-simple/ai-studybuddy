# Phase 1.5-T02/T04-G2：跨平台离线/出站隔离实测证据审查结果

> **状态**：证据审查完成，G2 仍为 `PARTIAL`；本轮无任何平台组合取得 `PASS`。
> **日期**：2026-07-23
> **任务分支**：`codex/phase1-5-g2-isolation-evidence`
> **基线**：`origin/master` / `a6d632ce0c26caa1db9358951eecb40120362107`
> **证据目录（仓库外，不提交运行数据）**：`I:\ai-studybuddy-tmp\runs\phase1-5-g2-isolation-evidence`

---

## 1. 授权与边界复核

本轮按用户明确批准，仅执行已合并到 `master` 的 G2 SoT 与已批准计划定义的验证动作：读取 AGENTS、`docs/04`、`docs/08`、`docs/09`、S7 PRD、G2 计划与 `docs/12`；从最新 `origin/master` 创建独立分支；使用隔离运行数据目录保存脱敏证据；按平台/运行时/架构/隔离实现组合分别记录结果。

本轮未执行且不授权：`AuralConverter` 创建或调用、T04 Adapter/产品装配、`packages/` 业务代码、Schema、migration、API、Worker、前端、shared 类型、T05/T06、生产发布、真实用户数据或真实 Provider。

---

## 2. SoT 判定标准

依据 `docs/08` 与 `docs/09`，G2 `PASS` 必须同时满足：

1. 由 ASR 进程外部的 OS、容器或虚拟化层强制出站隔离；
2. 记录隔离前、隔离生效期间、ASR 运行期间、清理后的状态与回滚证据；
3. 在同一隔离窗口使用显式本地模型路径取得结构化本地 ASR 正向结果；
4. 证据精确到平台、OS/运行时版本、CPU 架构和隔离实现；
5. `PASS` 只覆盖该组合，不能外推为跨平台、产品接入或生产发布资格。

`offline`/cache-only、DNS、hosts、代理、人工断网或无 TCP 轮询不能单独构成 G2 `PASS`。

---

## 3. 本轮组合结果

| 组合 ID | 平台 / OS / 运行时 / 架构 | 隔离实现 | 状态 | 证据结论 |
| --- | --- | --- | --- | --- |
| `win10-22h2-x64-python31019-windows-firewall` | Windows 10 Pro 22H2 build 19045；Python 3.10.19 / FunASR 1.3.22 / torch CPU；x64 / AMD Ryzen 7 5800H | 临时 Windows Firewall 出站规则 | `ENVIRONMENT_UNAVAILABLE` | Domain/Private/Public Firewall profile 均禁用；未创建规则，未修改永久策略。执行了本地缓存/模型加载/安全样例矩阵辅助运行，16/16 通过，但该运行没有外部隔离层，明确不计为 G2 证据。 |
| `windows-host-docker-desktop-linux-network-none` | Windows 10 宿主上的 Docker Desktop Linux context；Docker client 29.6.1；容器架构不可得 | Docker `--network none` | `ENVIRONMENT_UNAVAILABLE` | Docker daemon pipe 不可用，无法创建容器、固定镜像、只读挂载模型或记录容器网络状态；未创建容器。 |
| `wsl2-centos-stream-10-x86_64-netns-nftables` | WSL2 CentOS Stream 10；kernel 6.6.114.1；Python 3.12.12；x86_64 | Linux network namespace / nftables 候选 | `ENVIRONMENT_UNAVAILABLE` | `unshare`/`ip`/`nft` 存在且本地模型路径可见，但 WSL 中无 pip、无 FunASR runtime；安装/下载运行时超出本轮证据动作，无法在该组合内取得隔离窗口下 ASR 正向结果。WSL 探测后已终止，残留状态为 stopped。 |

---

## 4. 辅助 ASR 运行（不计 G2）

Windows 本机执行了固定模型与安全合成样例的本地辅助矩阵：

- runId：`g2-evidence-20260723-windows-python-local-cache-aux`
- 输出目录：`I:\ai-studybuddy-tmp\runs\phase1-5-g2-isolation-evidence\windows-python-local-cache-asr-aux`
- 结果：16/16 通过；G3 矩阵保持 `PASS`；整体仍 `PARTIAL`
- 模型加载：VAD 57ms，ASR 2511ms，总 2569ms
- 峰值工作集：3,288,342,528 bytes
- 明确字段：`offlineEnvironmentCountsAsIsolationEvidence=false`、`productionIntegrationEligible=false`、`auralConverterCreatedOrCalled=false`

该运行只证明固定本地缓存和受控样例仍可加载/运行；由于没有 OS/容器/虚拟化层外部隔离，不关闭 G2。

---

## 5. 脱敏证据清单

证据文件均位于仓库外：`I:\ai-studybuddy-tmp\runs\phase1-5-g2-isolation-evidence`。

| 文件 | 用途 | SHA-256 短哈希 |
| --- | --- | --- |
| `g2-evidence-summary.json` | 结构化组合状态总表 | `1AF4D8D64E4D` |
| `evidence-inventory.json` | 证据文件清单和 SHA-256 | `470824AEF454` |
| `00-environment-probe.txt` | Windows / Docker / WSL / Firewall / Git 初始探测 | 见 inventory |
| `01-wsl-linux-probe.txt` | WSL2 CentOS 工具链与模型路径探测 | 见 inventory |
| `02-wsl-cleanup.txt` | WSL 终止与 stopped 残留证明 | 见 inventory |
| `03-residual-check.txt` | Firewall / Docker / WSL / Git 最终残留检查 | 见 inventory |
| `windows-python-local-cache-asr-aux/summary.json` | 本地 ASR 辅助矩阵摘要 | 见 inventory |

未提交完整运行日志、真实录音、完整转写、秘密、Provider URL、正式运行数据或完整 UUID。

---

## 6. 审查结论

- 本轮没有任何组合满足 G2 强证据下限，不能宣称 G2 `PASS`。
- 当前 G2 总体仍为 `PARTIAL`；三个实测/探测组合均为 `ENVIRONMENT_UNAVAILABLE`。
- Windows 本地 ASR 辅助运行可作为缓存/加载/受控样例复核事实，但不能替代外部出站隔离。
- 未创建 `AuralConverter`，未修改业务代码，未启动 T05/T06，未进行生产接入或发布。
- 下一步若要取得 G2 `PASS`，需要一个具备可回滚外部隔离和已安装固定 ASR runtime 的标准 Windows、Linux、容器或 VM 环境，并为具体出站探测方法、运行次数、回滚命令和零残留判定另获明确批准。
