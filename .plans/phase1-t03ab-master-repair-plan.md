# Phase 1-T03A/T03B master 漂移修复计划

**状态**：已批准本轮修复；用于把已存在但未合入 `master` 的 T03A/T03B 分支实现拉回主线

**日期**：2026-07-16

**任务归属**：流程修复 / S3 PracticeRunner 集成修复

## 1. 修复范围

本轮只修复以下漂移：

- T03A 实现提交 `2d042e0 feat(s3): 建立限时练习数据库 Schema` 已存在于 `origin/Asteria-malf-pas/phase1-t03a-s3-schema`，但未进入 `master`。
- T03B 实现提交 `e9d69e9 feat(s3): 实现限时练习生成 API` 已存在于 `origin/codex/phase1-t03b-practice-generation-api-plan`，但未进入 `master`。
- `docs/04`、`docs/00`、S3 PRD、计划文件和代码状态需要以合入后的 `master` 为准重新对齐。
- 修复 `@ai-studybuddy/shared` 类型声明产物漂移：T03B 已新增 S3 DTO 源码类型，但旧 `dist/*.d.ts` 会让 backend project reference 在 `pnpm type-check` 中读取过期导出，导致不可重复验证。

## 2. 明确不修

- 不实现 T03C submit 批改 API。
- 不实现前端练习页面。
- 不创建 S4 PRD、S4 Schema、`mistakes`、`weak_points` 或 S5-S7 内容。
- 不接入真实外部 Provider smoke。
- 不引入 Worker。

## 3. 修复办法

1. 从最新 `master` 创建 `codex/phase1-t03ab-master-repair`。
2. 按顺序 cherry-pick：
   - `2d042e0`：T03A Schema；
   - `e9d69e9`：T03B 练习生成 API。
3. 处理冲突时保留当前 `master` 已有的 Git 工作流与任务收尾硬门禁，不允许回退 `AGENTS.md`、`CLAUDE.md`、`docs/12` 或删除 T03C 计划。
4. 对照 `.plans/phase1-t03a-s3-database-schema-plan.md`、T03B 分支计划、`docs/04` 和 S3 PRD 审查代码与文档。
5. 补齐 `packages/shared` 构建脚本，使 recursive type-check 先重建共享声明，再检查 backend/frontend。
6. 运行验证命令。
7. 更新 `docs/04`：T03A/T03B 标为完成并登记 master 收尾证据；T03C 保持待开始/计划已创建，不勾实现项。
8. 必要时更新 `docs/00` 和 S3 PRD 状态，使其描述 master 当前事实。
9. 提交并推送修复分支；快进合入 `master`；在 `master` 复验后推送 `origin/master`。

## 4. 验证命令

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/practice-schema.test.mjs
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/practice-generation-api.test.mjs
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

## 5. 完成判定

- `origin/master` 包含 T03A/T03B 实现与文档状态。
- `docs/04` 明确记录 T03A/T03B 完成证据。
- 当前工作区干净。
- T03C/S4/S5-S7 未越权实现。
