# Phase 0.8 T05 SoT 回填行动计划

**日期**：2026-07-12
**目标**：将已实现并验证的 AI Provider Router 与后端测试稳定性治理同步回有效系统文档，避免代码、任务清单与架构/验收/规范漂移。

## 范围与依据

- 已完成事实：`0.8-T05` 已在主仓库实现；`AiProviderRouter` 支持 OpenAI-compatible Provider、按 priority 轮询 fallback、遗留单 Provider 配置兼容、超时、脱敏日志和 Dev API。
- 验证事实：`pnpm type-check`、`pnpm build`、`pnpm test` 77/77、文档治理、`git diff --check` 已通过。
- 稳定性事实：后端 API 测试的端口区间已隔离，健康检查预算为 10 秒；连续三次全量测试 77/77。
- 不改变：产品边界、七子系统地图、目录治理、文档分层；不创建新设计文档。

## 文件与修改

1. `docs/00-文档索引-Index.md`
   - 更新版本历史，登记 T05 正式接入和 SoT 回填。
2. `docs/05-开源组件装配-Open-Source-Foundation.md`
   - 登记 OpenAI SDK 已从试炼场能力进入主仓库正式装配，注明无真实网络依赖的测试边界。
3. `docs/08-共同底座架构-Architecture.md`
   - 更新 Phase 0.8 当前状态；增加 AI Router 的实装边界、错误语义、日志与 Dev API 说明；登记测试稳定性治理。
4. `docs/09-测试验收计划-Test-Plan.md`
   - 增加 T05 验收项目与 77/77 证据；记录 API 测试端口区间/健康检查稳定性措施。
5. `docs/10-后端开发规范-Backend-Guidelines.md`
   - 补全 `AI_PROVIDERS`、`AI_TIMEOUT_MS`；明确 legacy 单 Provider 变量；增加 AI Provider Adapter/API/日志约定。

## 验证策略

1. 运行 `powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1`。
2. 运行 `git diff --check`。
3. 因文档记录的是已验证实现，复跑 `pnpm type-check`、`pnpm build`、`pnpm test`，确认文档更新没有掩盖当前状态。
4. 审阅 `git diff`，确保仅包含计划中的五份 SoT 文档和本计划文件。

## 收尾

- 更新任务计划状态。
- 按仓库提交规范提交为 `docs: record Phase 0.8 T05 integration`。
- 推送当前 `t04a-docs-update` 分支。
