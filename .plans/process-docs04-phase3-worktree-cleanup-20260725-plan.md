# PROCESS：docs/04 状态收口、Phase 3 启动登记与历史 worktree 清理计划

**日期**：2026-07-25
**分支**：`codex/process-docs04-phase3-worktree-cleanup-20260725`
**worktree**：`H:\ai-studybuddy-worktrees\process-docs04-phase3-worktree-cleanup-20260725`
**基线**：`origin/master` @ `b72e8b0 fix(deploy): 修复 PowerShell 兼容与恢复可写性`

## 目标

1. 修正 `docs/04` 顶部 `PROCESS-DIRTY-20260725` 对 `9ed5bc1` 的过期表述：该候选已通过 `b72e8b0` 等价审计收口并进入 `origin/master`。
2. 将 Phase 3 从“暂缓”更新为“2026-07-25 用户要求今日启动治理/计划阶段”，但不直接实施 Phase 3 业务改造。
3. 继续历史 worktree / 暂停计划归档清理：先审计、分类、登记，再仅移除干净且已有事实归属的 worktree。

## 范围

- 只修改文档和流程状态：`docs/04-开发任务清单-Todo-List.md`、必要时同步 `docs/00-文档索引-Index.md`。
- 新增本计划文件到 `.plans/`。
- 可执行 `git worktree remove` 的对象仅限：干净、无未提交/未跟踪内容，且 HEAD 已合入主线或已由 `b72e8b0` 等价替代并保留分支引用的历史 worktree。

## 非范围

- 不修改业务代码、部署脚本、Schema、API、Worker 或前端。
- 不执行用户电脑安装与学生核心流程验收。
- 不扩展完整 S7，不处理 G2/外部 ASR 主线，不恢复 S3 Worker。
- 不执行 Phase 3 安全、性能、备份、日志等实现任务；这些需要独立计划。
- 不使用 `git reset --hard`、`git clean`、覆盖 checkout 或批量删除。

## Worktree 审计与处置规则

- 保留：存在独有提交、未跟踪计划/证据、未提交改动或暂停事项的 worktree。
- 移除：干净且已合入/已替代的旧工作副本；移除 worktree 不删除对应分支。
- 本次预期可移除：
  - `H:\ai-studybuddy-worktrees\phase1-5-s7-mvp-docs-plan`（S7-MVP 已进入 `origin/master`，工作副本干净）
  - `H:\ai-studybuddy-worktrees\process-dirty-state-remediation-plan`（已进入 `origin/master`，工作副本干净）
  - `H:\ai-studybuddy-worktrees\process-post-s7-docs-deploy-candidate-fix`（`b72e8b0` 已在 `origin/master`，工作副本干净）
  - `H:\ai-studybuddy-worktrees\process-runtime-deploy-compatibility-20260724`（`9ed5bc1` 候选已由 `b72e8b0` 等价收口，工作副本干净，分支引用保留）

## 验证

- `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`
- `git diff --check`
- `git status --short --branch`
- `git worktree list`

## 执行结果

- 已修正 `docs/04` 顶部 `PROCESS-DIRTY-20260725` 关于 `9ed5bc1` 的旧说法，改为由 `b72e8b0` 收口进入 `origin/master`。
- 已将 Phase 3 登记为 2026-07-25 启动治理/计划阶段，未实施 Phase 3 业务改造。
- 已安全移除 4 个干净旧 worktree：`phase1-5-s7-mvp-docs-plan`、`process-dirty-state-remediation-plan`、`process-post-s7-docs-deploy-candidate-fix`、`process-runtime-deploy-compatibility-20260724`。
- 已保留含独有提交、未跟踪计划/证据或未提交候选内容的 worktree 待后续归属审计。

## 自审结论

- 本计划只修正事实口径和治理状态，不改变 S7-MVP 边界，不提前宣称用户电脑验收完成。
- Phase 3 仅登记为启动计划阶段，不包含业务实现授权。
- worktree 清理采用先审计后处置，保留有独有内容或暂停计划的工作副本，避免丢失未归属内容。
