# Phase 1.5-T02/T04-G2：标准 Windows 离线/出站隔离实测证据审查

> **状态**：`ENVIRONMENT_UNAVAILABLE`（非 PASS）
> **日期**：2026-07-23
> **执行分支**：`codex/phase1-5-g2-windows-isolation-exec`
> **基线**：`origin/master` `a6d632ce0c26caa1db9358951eecb40120362107`
> **批准计划**：`f49f739853ed8b6ba6282bf194749a6dfc83b949` / `.plans/phase1-5-t02-t04-g2-standard-windows-isolation-plan.md`
> **证据目录**：`I:\ai-studybuddy-tmp\runs\phase1-5-g2-windows-isolation-20260723-021826`

---

## 1. 组合范围

| 字段 | 记录 |
| --- | --- |
| 平台 | 标准 Windows 桌面环境 |
| OS | Microsoft Windows 10 专业版 10.0.19045 / 22H2 / x64 |
| CPU / 架构 | AMD Ryzen 7 5800H with Radeon Graphics；8 cores / 16 logical processors；PowerShell/.NET 进程 x64 |
| 隔离实现 | 计划使用任务专属临时 Windows Firewall outbound block rule 绑定目标 Python executable |
| ASR 运行时 | 因 Firewall 前置门槛失败，未定位/启动 ASR Python runtime，未运行 FunASR |
| 结论范围 | 仅适用于本 Windows/CPU/Firewall profile 组合；不是跨平台结论 |

---

## 2. 执行结果

本次在只读前置采集阶段停止：`Get-NetFirewallProfile` 与 `netsh advfirewall show allprofiles state` 均显示 Domain、Private、Public 三个 Windows Firewall profile 为禁用/关闭状态，`applicableEnabledProfileCount=0`。

按照已批准计划第 4 节和第 7.2 节，至少一个适用 Windows Firewall profile 必须为 `Enabled=True`；profile 全部禁用时必须记录为 `ENVIRONMENT_UNAVAILABLE` / `DEFERRED`，不得创建规则、不得修改永久 profile、不得降级为 offline/cache-only 或无 TCP 轮询证据。

因此本次结论为：

```text
G2 standard Windows combination = ENVIRONMENT_UNAVAILABLE（非 PASS）
```

---

## 3. 已执行 / 未执行

| 项目 | 结果 |
| --- | --- |
| 平台与 CPU/架构快照 | 已记录 |
| Firewall profile 状态读取 | 已记录 |
| 临时 Firewall 规则创建 | 未尝试 |
| 出站 baseline / blocked 探测 | 未执行 |
| ASR 16 项矩阵 | 未执行 |
| AuralConverter / T04 装配 | 未执行 |
| `packages/`、Schema、migration、API、Worker、前端、shared 类型修改 | 未执行 |
| T05/T06 | 未启动 |
| 永久 Firewall profile、默认策略、注册表、服务、PATH 或无关网络配置修改 | 未执行 |
| 任务命名 Firewall 规则残留 | 0 |

---

## 4. 证据清单（脱敏短哈希）

| 文件 | Bytes | SHA-256 短哈希 |
| --- | ---: | --- |
| `00-run-context.json` | 739 | `2C9B0C124868` |
| `01-platform-snapshot.txt` | 863 | `08759BF964A4` |
| `02-firewall-before.json` | 1760 | `677E8AAA9B49` |
| `03-model-and-fixture-check.json` | 426 | `CC7CC3095FF1` |
| `04-process-precheck.json` | 266 | `86D9F71A0BAB` |
| `05-egress-baseline.json` | 321 | `A0DD8BDF09BD` |
| `06-firewall-rule-create.json` | 309 | `14B2C9A78B6E` |
| `07-firewall-during.json` | 176 | `C0135EF9EC78` |
| `08-egress-blocked.json` | 199 | `57D7DC5C3986` |
| `09-asr-matrix\summary.json` | 325 | `E2ED663FC6AF` |
| `10-firewall-runtime-check.json` | 174 | `622E72576D00` |
| `11-firewall-cleanup.json` | 260 | `BD7C030FD9C7` |
| `12-residual-check.json` | 422 | `4C0C9724C946` |
| `13-g2-combination-summary.json` | 1598 | `C6D0B74E0325` |
| `docs04-g2-status-confirmation.txt` | 27614 | `E5323B338C61` |

仓库内只记录证据目录、文件名、短哈希和分类结论；不提交原始日志、真实音频、完整转写、Provider URL、秘密或完整 UUID。

---

## 5. 审查结论

- 本次严格按计划停止在前置门槛，未创建 Firewall 规则，未运行出站探测或 ASR。
- 由于没有外部强制隔离窗口和隔离下结构化本地 ASR 正向结果，本次不能构成 G2 `PASS`。
- 该结果不得泛化为跨平台结论，也不得用于 AuralConverter/T04 装配、生产接入或生产发布。
- 若后续要继续补证，必须另行准备一个至少一个 Windows Firewall profile 启用的标准 Windows 环境，或改走已批准语义中的 Docker/namespace/VM 等独立计划；执行前仍需用户明确批准。
