# 实现代码与设计文档偏差核查计划（AUDIT-20260806）

**日期**：2026-08-06
**任务分支**：`claude/audit-20260806-doc-code-deviation`
**状态**：计划已创建，等待独立审查与用户确认（用户已授予全权执行，按 16 步流程推进）

## 目标

当前系统是快速构建的原型。本任务按 `docs/04` 的 Phase 划分，逐一核查**实现代码与设计文档**之间的偏差，发现问题、逐项解决，最终收敛为"文档与代码一致"的状态。

## 范围划分（一个 Phase 一个子任务）

| Phase | 设计文档基线 | 代码范围 | 核查重点 |
|---|---|---|---|
| Phase 0.8（S1 基础 + S2 核心） | S1/S2 PRD、docs/08、docs/10 | study-rhythm、note-builder、storage、converter、migrations v1-v3、前端三页 | API 契约、字段命名、状态机、资料格式边界 |
| Phase 1（完整学习闭环） | S3/S4/S6 PRD、docs/08/10/11 | practice-runner、error-fixer、feedback-rules、parent-report、config-center、semester-selector、daily-home、timeline、frontend 全部 | T02-T09E、M01-M03 每项承诺 vs 实现 |
| Phase 1.5（S7-MVP） | S7 PRD | class-capture、whispercpp-aural-converter、前端资料页 | 受控 WAV 边界、同步转写、S2 handoff |
| Phase 2（S5 期末冲刺） | S5 PRD | exam-crammer、cram-cards、cram-plan、mock-exam、工作台 | T01-T06 只读边界、确定性、无持久化计划 |
| Phase 2.5/3（部署与安全） | docs/13、T02A-G 计划 | bootstrap、deploy scripts、config、middleware、runtime-log-boundary | 回环监听、脱敏、fail-closed、备份恢复边界 |

## 核查方法

1. 对每个 Phase，先提取设计文档的**承诺点**（API 路径、字段、状态枚举、行为规则、边界声明）。
2. 对照代码实现逐条核实：存在性、签名一致性、行为一致性、边界是否兑现。
3. 偏差分为三类：
   - **代码缺实现**：文档承诺了，代码没有 → 补实现（独立小计划）。
   - **代码多实现**：代码有文档未承诺 → 判断是否越权，更新文档或标注。
   - **不一致**：字段/语义/枚举/状态不匹配 → 修代码或修文档，以产品意图为准。
4. 每个偏差修复走独立提交，验证通过后汇总。

## 非目标

- 不实现 Phase 3 未批准的业务任务（T04/T05 真实写入、T02-R1/R2 真实操作等）。
- 不运行真实 AI/SMTP/飞书/外部调用。
- 不修改用户正式数据。
- 不引入新功能，只收敛偏差。

## 验证策略

- 每个修复：`pnpm type-check`、相关包 build、相关测试。
- 全量收尾：`pnpm test`（隔离 APP_DATA_ROOT）、`scripts/check-docs-governance.ps1`、`git diff --check`。
- 文档修复：治理检查 + 索引同步。

## 交付

- 每个 Phase 一个汇总（偏差清单 + 处置结果），登记 docs/04。
- 全部完成后再总交付说明。
