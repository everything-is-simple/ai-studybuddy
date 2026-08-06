# T02-R2 后续：ACL 最小修复计划（Gate B 前置）

**计划编号**：PHASE3-R2-ACL-MIN-FIX-20260806
**状态**：⛔ 已撤销（2026-08-06）——初版误报 Users 全权继承，经 icacls 权威核对确认为采证脚本归类/位掩码 bug；真实 ACL 为 Windows 标准默认（Users 仅 Read），无需 ACL 修复。

**撤销原因**：T02-R2 采证脚本 Classify-Account 未识别 AuthenticatedUsers(S-1-5-11) 且 rights 位掩码误判（Modify 被误判为 FullControl），导致误报。脚本已修复，真实 ACL 无过度授权。
**日期**：2026-08-06
**上游**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728` Wave 0 T02-R2（发现 P1 候选）；Gate B（R2 发现 ACL 宽泛须阻断真实写入）

## 1. 背景

T02-R2 只读采证（`.plans/evidence/phase3-wave0-r2-summary.json`）发现：开发机 `H:\AIStudyBuddy` 的 config/data/logs/backups/tmp/models 六目录继承 ACL 含 **`Users: allow FullControl`**（所有本地用户完全控制）——属过度授权 P1 候选。

计划门禁：任何 ACL 修复须**另建最小修复任务**，取得精确目标机器/逻辑目录的额外批准，并先具备当前 ACL 脱敏证据、最小授权矩阵、回滚和复验。

## 2. 修复范围（最小化）

- **目标**：`H:\AIStudyBuddy`（开发机 0.8.0 运行实例）的 `config`、`data` 两个**最敏感**目录（含加密配置与数据库）。
- **不触碰**：logs/backups/tmp/models（低敏感或可再生）；`H:\ai-studybuddy-data`、主仓库、系统目录。
- **修复方式**：**仅移除 `Users` 的写权限**，保留继承的 Administrators/SYSTEM/当前用户读取；**不改 owner、不改继承链**（保持父目录默认继承），最小侵入。

## 3. 最小授权矩阵（修复后目标）

| 主体 | config | data | 方式 |
|---|---|---|---|
| Administrators | 完全控制 | 完全控制 | 保留继承 |
| SYSTEM | 完全控制 | 完全控制 | 保留继承 |
| 当前交互用户 | 完全控制 | 完全控制 | 保留继承 |
| Users（所有本地用户） | **只读** | **只读** | 移除 Write/Modify/FullControl，仅留 Read |

## 4. 实施步骤（获批后）

1. **回滚基线**：保存当前 ACL 脱敏证据（已有 `.plans/evidence/phase3-wave0-r2-summary.json`）+ 完整 ACL 快照到隔离位置。
2. **执行**：对 `config`、`data` 用 `icacls` 精确移除 Users 写权限（`*S-1-5-32-545:(OI)(CI)(RX)` 替换），保留 Read。
3. **复验**：重跑 T02-R2 采证脚本，确认 Users 仅 Read；Administrators/SYSTEM/当前用户不受影响；reparse=0。
4. **回滚**：若异常，从快照恢复（`icacls /restore`）。
5. **验证**：服务启停正常、数据库读写正常（真实 SQLite 打开/写入测试在隔离副本进行）。

## 5. 非目标

- 不改 owner、SACL、继承链、注册表、组策略或 Firewall。
- 不动 logs/backups/tmp/models 与真实数据内容。
- 不在目标用户电脑执行（那是未来单独批准）。
- 不宣称 T02-R2 或 Phase 3 完成。

## 6. 验证

- 复验采证脚本：Users 无 Write/Modify/FullControl。
- 服务 health 通过；数据库读写在隔离副本验证。
- 回滚测试（快照恢复）在批准后演练。

## 7. 交付

- 实施 + 复验证据 + docs/04 登记 T02-R2 状态更新（P1 候选已处置）→ 合入 master → 推送。
- 交付说明明确：ACL 修复完成不等于 T02/Phase 3 完成；Gate B 后续判定由 R3-prewrite 审查确认。
