# T04-3 目标机真实恢复演练独立实施计划（Wave 2 后半段）

**计划编号**：PHASE3-WAVE2-T043-TARGET-20260806
**状态**：📝 已创建；待独立审查与 R3-prewrite 签收；目标机真实写入前须用户对精确机器/时间窗口再次批准
**日期**：2026-08-06
**上游**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728` Wave 2（T04-3、T02-R3）；Wave 1 已完成隔离根受控写入演练

## 1. 目标

在 Wave 1 隔离根合成演练通过的基础上，**完成 T04-3 目标 Windows 机器真实恢复演练**所需的全部前置：持久化状态机、中断标记、回滚出口，并通过 **R3-prewrite 独立签收**后，在**经用户精确批准的机器/时间窗口**执行真实演练。

## 2. 前置事实（已具备）

- Wave 1：`restore-data.ps1` 受控写入实现（`-EnableWrite` 7 步状态序列）已在隔离根完成合成演练（`.plans/evidence/phase3-wave1-t043-20260806.md`）。
- Wave 0：R1 秘密扫描签收（0 真实秘密）、R2 ACL 只读采证完成。
- Wave 2 前半：T05-1/T05-2/T05-3 日志脱敏与轮转完成。
- 目标机候选：`H:\AIStudyBuddy`（0.8.0 运行实例，含真实数据）——**真实数据，须用户精确批准**。

## 3. 本计划范围（补齐目标机写入前的缺口）

### 3.1 持久化状态机（restore-data.ps1 增强）

Wave 1 的 7 步序列是内存态，不满足计划 §2.5"持久化、可审计的状态序列 + 中断标记"。本计划在受控恢复写入路径中增加：

- **状态文件**：写入非活动 data 根的 `state/restore-state.json`（脱敏：只含状态名、阶段时间戳、文件数，无路径/资料名/秘密）。
- **状态序列**（与上游一致）：`RESTORE_WRITE_DISABLED → PREWRITE_APPROVED → WRITERS_QUIESCED → PRECHECK_PASSED → RECOVERY_POINT_VERIFIED → STAGING_WRITTEN_AND_VERIFIED → CUTOVER_IN_PROGRESS → POST_RESTORE_VERIFICATION → RESTORE_COMPLETED`。
- **中断标记**：每个不可原子阶段前写入 `state/interrupt-marker`；重启/失败后读取标记。
- **重启默认行为**：检测到状态文件非终态（非 `RESTORE_COMPLETED`/`ROLLBACK_VERIFIED`）→ 转入 `RESTORE_RECOVERY_REQUIRED`，拒绝继续/重试/自动启动服务。
- **回滚出口**：`ROLLBACK_IN_PROGRESS → ROLLBACK_VERIFIED`（从 recovery point 恢复）；失败 → `RESTORE_MANUAL_ESCALATION`（保持服务停止）。

### 3.2 CUTOVER 阶段

payload 先写入新的受控 staging 区（`state/staging/`）并逐文件 hash 验证，随后按状态机允许顺序**切换**到活动 data 根；不边验证边覆盖活动数据。

### 3.3 目标机精确批准（用户门禁）

真实演练仅当：
1. 用户明确批准**精确机器**（如 `H:\AIStudyBuddy` 所在机器）、**安装实例**、**逻辑 data 根**、**时间窗口**。
2. 同一 artifact/构建/包的 Alpha D1 安装、检查、启动、健康、停止证据已通过。
3. 服务、自动备份任务、其他写入者停止证据（无 PID/无监听/无锁定）已采集。
4. Gate B、R3-prewrite、预检、recovery point 全部通过。

## 4. 非目标

- 不执行真实恢复写入（本计划只完成前置实现与 R3-prewrite 审查对象；真实演练须用户批准后另发）。
- 不触碰 `H:\AIStudyBuddy` 数据（真实数据只读，演练在其副本/隔离根进行或等批准）。
- 不做 T05-4 保留/清理、T02-R6 总体验收（后续 Wave）。

## 5. 验证

- 状态机专项：正常流、中断恢复、重启默认、回滚、手动升级出口（合成数据根）。
- `pnpm type-check`、后端 build、相关测试、文档治理、`git diff --check`。
- R3-prewrite 由**非 T04 实现者**（独立审查）签收；未签收则 `RESTORE_WRITE_DISABLED` 保持。

## 6. 交付

- 持久化状态机实现 + 专项测试 + docs/04 登记。
- 交付说明明确：真实目标机写入**仍未执行**，等待用户精确批准 + R3-prewrite 签收。
