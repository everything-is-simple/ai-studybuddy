# DOCS-20260720 系统文档当前状态同步计划

**日期**：2026-07-20
**分支**：`codex/system-docs-current-status-sync`
**状态**：用户已明确要求实施

## 1. 目标

以最新 `origin/master` 与可验证 Git 历史为事实基线，清理系统入口、编号文档和子系统 PRD 中仍停留在 T09A/T09E 旧门禁、M03/Post-M03 待集成状态及旧前端路由数量的当前态表述。

## 2. 已确认事实

- 基线：`origin/master` @ `eac469b45fa603df8a2472a3fab55de73be6fc74`。
- T09E：实现提交 `de5c41e`，主线收尾提交 `af37bd5`。
- M03：实现提交 `2aa7ea4`，主线收尾提交 `6ddd9fa`。
- Post-M03：实现提交 `e08ab36`，主线收尾提交 `eac469b`。
- 前端当前为 14 个功能路由：13 个学习业务路由、1 个设置路由，外加应用壳。

## 3. 修改范围

1. 更新 `AGENTS.md`、`CLAUDE.md` 与 `docs/12` 的当前系统事实。
2. 更新 `docs/00`、`docs/04` 的占位提交、任务状态、行动计划索引和本任务登记。
3. 更新 `docs/02`、`docs/07`、`docs/08`、`docs/15` 与 S1/S4 PRD 的当前门禁和路由事实。
4. 保留历史变更记录中“当时尚未开始/尚未合入”的原始时点描述，只修正当前态和未替换占位符。

## 4. 验证与交付

- 运行定向一致性搜索，确认当前态不再误称 T09A/T09E 为下一门禁或未实施。
- 运行 `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`。
- 运行 `git diff --check` 与 `git diff --cached --check`。
- 提交并推送任务分支，按仓库规则 fast-forward 合入最新 `master`，在主线复验后推送 `origin/master`。

## 5. 非目标

- 不修改业务代码、API、Schema、测试或运行配置。
- 不创建或实施新的产品功能任务。
- 不读取、复制、输出或提交任何真实秘密、正式运行数据或仓库外材料。
