# T04-3 受控恢复写入实现 + 隔离根合成演练（Wave 1）

**计划编号**：PHASE3-WAVE1-T043-20260806
**状态**：📝 已创建；用户已于 2026-08-06 指示"继续 Wave 1（T04 备份/恢复，先在隔离数据根做合成演练）"并授予全权
**日期**：2026-08-06
**上游**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728` Wave 1；`.plans/phase3-t04-data-durability-plan.md`（T04-3 设计）

## 1. 目标

Wave 1 在**合成/隔离数据根**完成 T04-3 的受控恢复写入实现与演练，不触碰真实数据（`H:\AIStudyBuddy` 与 `H:\ai-studybuddy-data` 保持只读）。

- **T04-1**（自动备份）与 **T04-2**（完整性检查）已在主线实现（Day 0），本轮仅复验不重做。
- **T04-3**：将 `restore-data.ps1` 的 fail-closed 段替换为受控恢复写入实现，遵循计划 §2.3 的 7 步流程与 §5.3 状态序列，并在隔离根完成备份→恢复→完整性验证的合成演练。

## 2. T04-3 实现设计

### 2.1 restore-data.ps1 受控写入（替换 fail-closed 段）

保留现有前置校验（备份有效、目标无 reparse、备份不在目标内、`-WhatIf` 只验证）。新增 `-EnableWrite` 下的受控写入：

```
1. WRITERS_QUIESCED 门禁：检查服务 PID/端口监听，运行中则拒绝（RESTORE_WRITERS_ACTIVE）
2. 停止自动备份计划任务（AIStudyBuddy-AutoBackup，如存在）
3. RECOVERY_POINT：复制当前 data 到 backups/recovery-points/recovery-<timestamp>
4. PRECHECK：manifest 全部文件 hash 验证通过
5. 复制 payload 到目标 data（逐文件 hash 校验）
6. POST_RESTORE：全局库 + 学期库 PRAGMA integrity_check
7. 输出 RESTORE_COMPLETED 摘要（脱敏）
8. 恢复后重新注册自动备份任务（如原先存在）
```

### 2.2 状态序列（按上游计划 §5.3）

`RESTORE_WRITE_DISABLED`（默认/未批准）→ `PREWRITE_APPROVED`（-EnableWrite）→ `WRITERS_QUIESCED` → `PRECHECK_PASSED` → `RECOVERY_POINT_VERIFIED` → `STAGING_WRITTEN_AND_VERIFIED` → `POST_RESTORE_VERIFICATION` → `RESTORE_COMPLETED`。状态只输出脱敏摘要。

## 3. 隔离根合成演练步骤

1. 创建隔离数据根 `H:\ai-studybuddy-tmp\runs\phase3-wave1-t043-<ts>\`，构造合成数据（studybuddy.db + 一个学期库 + 资料文件）。
2. `backup-data.ps1` 备份到隔离输出根 → 验证 manifest/hash。
3. 篡改隔离根的学期库（写入垃圾）→ 启动完整性检查应拒绝。
4. `restore-data.ps1 -EnableWrite` 从备份恢复 → 验证 RESTORE_COMPLETED、完整性检查通过、数据 hash 与备份一致。
5. 负向：不传 `-EnableWrite` → 仍 `RESTORE_WRITE_DISABLED`；服务运行中（模拟 PID）→ 拒绝。
6. 全部退出码 0，证据脱敏（无绝对路径、无资料名、无秘密）。

## 4. 非目标

- 不触碰真实 `H:\AIStudyBuddy`、`H:\ai-studybuddy-data`（只读）。
- 不在目标 Windows 机器做真实恢复写入（需 R3-prewrite 签收，Wave 2）。
- 不修改 Schema/API/前端；不新增 npm 依赖。
- 不注册真实 Windows 计划任务（仅脚本逻辑验证或隔离环境）。

## 5. 验证

- PowerShell 合成演练退出码 0；负向用例返回预期错误码。
- `pnpm type-check`（若改 TS）、文档治理、`git diff --check`。
- docs/04 更新 T04-3 状态；T04-1/2 标记为已复验。

## 6. 交付

- 实现提交 + 演练证据（`.plans/evidence/phase3-wave1-t043-<ts>.md`）+ docs/04 登记 → 合入 master → 推送 origin/master。
- 交付说明明确：真实恢复写入仍待 Wave 2 R3-prewrite 门禁。
