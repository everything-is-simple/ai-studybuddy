# T02-R3 R3-prewrite 独立安全审查材料包

**准备日期**：2026-08-06
**准备人**：T04 实现者（Claude）
**审查人**：待定（必须为非 T04 实现者的独立审查角色）
**门禁依据**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728` §2 第 5 条、§Wave 2 T04-3/T02-R3；`docs/04` T02-R3 定义

---

## ⚠️ 审查人须知

- 本材料包由 T04 实现者整理，**仅供独立审查**。R3-prewrite 签收必须由你（非 T04 实现者）独立完成，不得由实现者自证。
- 签收意味着：任何目标 Windows 机器非 `-WhatIf` backup/restore 写入前，你已复核以下全部检查项并确认无 P1 未闭合。
- 未签收则 T04-3 必须保持 `RESTORE_WRITE_DISABLED`。
- 本材料包不含真实秘密、完整 UUID、绝对宿主路径、资料原文、ACL 原文或完整 SID（均按脱敏契约）。

---

## 1. 审查对象清单

| # | 对象 | 位置 |
|---|---|---|
| 1 | T04-3 独立实施计划 | `.plans/phase3-wave2-t043-target-20260806-plan.md` |
| 2 | 受控恢复写入实现 | `scripts/restore-data.ps1`（`-EnableWrite` 路径） |
| 3 | 数据边界库（备份/恢复辅助） | `scripts/lib/AIStudyBuddy.Deployment.psm1` |
| 4 | Wave 1 隔离根合成演练证据 | `.plans/evidence/phase3-wave1-t043-20260806.md` |
| 5 | Wave 2 持久化状态机证据 | `.plans/evidence/phase3-wave2-t043-real-sim-20260806.md`（选项 C 真实模拟） |
| 6 | T02-R1 秘密扫描签收证据 | `.plans/evidence/phase3-wave0-r1-summary.json` |
| 7 | T02-R2 ACL 只读采证证据 | `.plans/evidence/phase3-wave0-r2-summary.json` |
| 8 | 日志脱敏实现与规范 | `packages/backend/src/utils/ai-logger.ts`、`runtime-log-boundary.ts`、`docs/10` §7 |

## 2. 精确目标机批准（须用户/审查确认后填写）

| 字段 | 值 | 状态 |
|---|---|---|
| 目标机器 | （待用户指定：如本开发机或部署机） | ⬜ 待填 |
| 安装实例路径 | （待指定） | ⬜ 待填 |
| 逻辑 data 根 | （待指定） | ⬜ 待填 |
| 时间窗口 | （待指定：精确开始-结束时间） | ⬜ 待填 |
| 用户批准记录 | （用户明确批准的文字/截图位置） | ⬜ 待填 |

**前提**：目标机真实写入前必须用户对上述 5 项**再次明确批准**（非实现者推断）。

## 3. Gate B 检查清单（须审查人逐项确认）

| # | Gate B 条件 | 证据位置 | 审查结论 |
|---|---|---|---|
| G1 | T02-R2 ACL 采证无宽泛/继承异常/未知主体/reparse 阻断 | `.plans/evidence/phase3-wave0-r2-summary.json`（Users 全权继承为 P1 候选，须先修复或确认不阻断） | ⬜ |
| G2 | 相关 P1 已修复或已有批准的最小修复计划 | T02-R2 发现 Users 全权继承 → 最小 ACL 修复任务 | ⬜ |
| G3 | Alpha D1 安装/检查/启动/健康/停止证据通过 | （目标机验收记录，待填） | ⬜ |

## 4. 停止证据模板（真实写入前必须采集）

- [ ] 服务 PID 文件不存在或进程已停止（`stop-production.ps1` 输出）
- [ ] 端口监听已释放（`Get-NetTCPConnection` 无实例端口监听）
- [ ] 自动备份计划任务已停止（`Get-ScheduledTask AIStudyBuddy-AutoBackup` Disabled）
- [ ] 无其他写入者（无锁定文件、无运行中 OCR/报告进程）

## 5. 持久化状态机契约（实现已含，供审查）

状态序列：`RESTORE_WRITE_DISABLED → PREWRITE_APPROVED → WRITERS_QUIESCED → PRECHECK_PASSED → RECOVERY_POINT_VERIFIED → STAGING_WRITTEN_AND_VERIFIED → CUTOVER_IN_PROGRESS → POST_RESTORE_VERIFICATION → RESTORE_COMPLETED`

- 状态文件：安装根 `runtime/state/restore-state.json`（脱敏：状态名 + 时间戳）
- 中断标记：每不可原子阶段前写 `runtime/state/interrupt-marker.json`
- 重启默认：非终态（非 `RESTORE_COMPLETED`/`ROLLBACK_VERIFIED`）→ `RESTORE_RECOVERY_REQUIRED` 拒绝继续
- 失败出口：trap → `RESTORE_RECOVERY_REQUIRED` + 保留中断标记
- 完整性：恢复后 `PRAGMA integrity_check`（全局库 + 学期库）
- 回滚声明：`ROLLBACK_IN_PROGRESS → ROLLBACK_VERIFIED → RESTORE_MANUAL_ESCALATION`（目标机阶段完整实现）

## 6. 日志允许字段契约（供审查）

- AI 事件：`event, level, taskType, provider, model, tokenUsed, latencyMs, fallbackUsed, attemptedProviderCount, attemptedProviders, cooldownStartedAt, cooldownEndsAt, cooldownEndedAt, errorCode, timestamp`
- 禁止：请求正文、模型输出、资料原文、完整 UUID、绝对路径、外部原始响应、密钥
- 错误码：大写蛇形 `^[A-Z][A-Z0-9_]{1,63}$`；字符串 ≤128

## 7. 审查结论（由独立审查人填写）

```
审查人：
审查日期：
R3-prewrite 结论：□ 签收（无 P1 未闭合） / □ 拒签（列出 P1）
拒签原因：
签收后授权范围（精确机器/时间窗口）：
审查人签名：
```

---

**未签收前**：T04-3 目标机真实写入不得发生，保持 `RESTORE_WRITE_DISABLED`。
