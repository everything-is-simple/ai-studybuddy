# Wave 2：T05-1/T05-2 全链路日志脱敏与等级/事件规范

**计划编号**：PHASE3-WAVE2-T05-20260806
**状态**：📝 已创建；用户已于 2026-08-06 指示"继续 Wave 2（T05-1/T05-2 日志脱敏）"并授予全权
**日期**：2026-08-06
**上游**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728` Wave 1 后半段（T05-1/T05-2 可与 T04 并行，已按顺序实施）；T02F 日志安全底座

## 1. 目标

在 T02F 已实现的日志安全底座（`runtime-log-boundary.ts` 字段 allowlist + JSONL 文件）基础上，完成：

- **T05-1 全链路日志脱敏**：把 AI Router 日志、维护/操作日志**实际接入** runtime-log-boundary 的 JSONL 文件写入，取代裸 `console.log`；核查后端/Adapter/渠道失败日志无秘密、无资料原文、无完整 UUID、无绝对路径、无外部原始响应。
- **T05-2 日志等级、事件与允许字段规范**：统一 `level`（DEBUG/INFO/WARN/ERROR）、`event` 命名、允许字段清单，明确面向用户/内部诊断边界，回填 `docs/10` 日志规范章节。

## 2. 现状差距

| 项 | 现状 | 差距 |
|---|---|---|
| 日志边界机制 | `runtime-log-boundary.ts` 已实现（LOG_FILES 三文件、字段 allowlist、错误码安全化、轮转） | ✅ 有 |
| AI 日志 | `ai-logger.ts` 用 `console.log` 直接输出 JSON（字段已脱敏） | ⚠️ 未落盘、未过 allowlist 校验 |
| 维护日志 | `semester-initializer.ts` 已调用 logBoundary.append | ✅ 有 |
| 操作日志 | 无业务调用点 | ⚠️ 缺 |
| 等级/事件规范 | docs/10 有部分（token/耗时/failback） | ⚠️ 需统一到 LOG_ENTRY_FIELDS 与事件名约定 |

## 3. 实施内容

### T05-1：日志调用点收敛
1. `ai-logger.ts`：注入 `RuntimeLogBoundary`，`recordSuccess/recordFailure/recordCircuitOpened/recordCircuitClosed` 改为 `append('ai', entry)`，字段对齐 `LOG_ENTRY_FIELDS.ai`（event/level/taskType/provider/model/tokenUsed/latencyMs/fallbackUsed/errorCode/timestamp）。
2. 新增 `operations` 日志调用点：bootstrap 启动/停止、健康检查关键事件（可选最小）。
3. 核查全部 console.* 调用点（bootstrap/server）字段均脱敏；确认无完整 UUID/绝对路径/资料原文。
4. 渠道失败日志（SMTP/飞书）核实：若走 console 需收敛；若已脱敏则登记验证。

### T05-2：等级/事件规范
1. 统一事件名格式：`DOMAIN_ACTION_STATE`（如 `AI_REQUEST_SUCCESS`、`MAINTENANCE_CLEANUP_COMPLETED`）。
2. 明确 level 语义：DEBUG=诊断、INFO=正常事件、WARN=降级/重试、ERROR=失败。
3. 回填 `docs/10` 日志规范章节：允许字段表、禁止字段表、等级约定。

## 4. 非目标

- 不实现 T05-3 轮转/容量（T02F 已有轮转机制，本轮不扩展）与 T05-4 保留/清理。
- 不做真实 backup/restore 日志验收（Wave 2 后半段 T04-3 目标机写入需 R3-prewrite）。
- 不运行真实外部服务。

## 5. 验证

- `pnpm type-check`、后端 build。
- 新增/更新测试：ai-logger 通过 logBoundary 写入 ai JSONL 且字段符合 allowlist（负向：非法字段拒绝）。
- 全量 `pnpm test`（隔离 APP_DATA_ROOT）。
- 文档治理、`git diff --check`。
- docs/04 更新 T05-1/T05-2 状态。

## 6. 交付

- 实现提交 + docs/10 规范回填 + docs/04 登记 → 合入 master → 推送 origin/master。
- 交付说明明确：T05-3 轮转/容量、T05-4 保留/清理、目标机真实写入仍为后续。
