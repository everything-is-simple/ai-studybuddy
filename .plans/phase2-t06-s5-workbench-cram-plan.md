# Phase 2-T06 S5 工作台冲刺区集成行动计划

**任务**：Phase 2-T06「工作台冲刺区集成」
**计划状态**：已创建并完成 fresh-pass 审查，等待用户明确批准；未实施
**计划分支**：`codex/phase2-t06-s5-workbench-cram-plan`
**基线**：`origin/master` @ `366893b40133da2e02e5f19895b73bd6d0052bac`（`docs(phase2): 同步 T05 主线完成状态`）
**日期**：2026-07-21

## 1. 门禁审计结论

- 已读取并以 `AGENTS.md`、`CLAUDE.md`、`docs/00`、`docs/01`、`docs/02`、`docs/04`、S5 PRD、`docs/08`、`docs/09`、`docs/10`、`docs/11`、`docs/12`，以及 T04/T05 与考试工作台当前实现为准。
- T05 已完成 fast-forward 主线合入、主线复验并推送 `origin/master`；当前实际基线为 `366893b40133da2e02e5f19895b73bd6d0052bac`。
- 当前主线已有 T04 `GET /assessment-attempts/:id/cram-cards?semesterId=...`、T05 `GET /assessment-attempts/:id/cram-plan?semesterId=...`、独立页面 `/exams/:examId/cram` 与 `/exams/:examId/cram-plan`，以及 `ExamContextNav` 的“临考速背/冲刺计划”入口。
- `packages/frontend/src/pages/exam-workbench-page.tsx` 尚未集成 T06 工作台“冲刺”区域；本轮只登记计划，不实施任何业务代码或验证。

## 2. T06 单一责任与复用边界

- T04 是确定性只读速背卡；T05 是确定性、即时、只读冲刺计划；T06 只把这两项既有能力聚合到考试工作台内的“冲刺”区域，展示状态摘要、主要入口与降级提示。
- T06 默认不新增后端接口、不修改 shared DTO、不修改 T04/T05 Service、不新增 Schema/migration；工作台直接复用既有 T05 `cram-plan` GET API 判断窗口、空建议、失败与摘要数量，并以链接导航到 T04/T05 独立页面。
- 工作台展示摘要而不是复制完整独立页面：可展示考试倒计时、冲刺窗口状态、建议天数/建议数量、最高优先级建议的脱敏原因摘要、临考速背入口和完整冲刺计划入口。
- 所有交互原则上只导航，不写入任务、错题、薄弱点、练习结果或计划完成状态。

## 3. 后续实施文件范围

- 前端主改：`packages/frontend/src/pages/exam-workbench-page.tsx`，新增工作台冲刺区的数据加载状态、摘要渲染、入口、重试与跨考试清理。
- 可能配套调整：`packages/frontend/src/api/cram-plan-api.ts` 的复用导入、`packages/frontend/src/styles/global.css` 的工作台冲刺区样式、`packages/frontend/test/exam-workbench-page.test.tsx` 和必要的 Playwright 工作台验收。
- 一般不需要修改 `packages/frontend/src/components/exam-context-nav.tsx`、路由、后端、shared、数据库、T04/T05 Service；若实现时发现既有 API 无法满足摘要展示，必须先停下修订计划并复审。
- 不在 DTO、组件状态、日志或浏览器存储中新增或暴露题干、正确答案、学生作答、错因正文、资料原文、Provider URL、API Key、完整敏感摘要或真实运行数据；不得把 T04/T05 正文复制进 `localStorage`。

## 4. 后续测试与验收计划

- 工作台单元/页面测试覆盖：进入冲刺窗口后显示摘要与入口、未进入窗口、考试未确认、考试已结束、空建议、API 请求失败和重试、跨考试切换时旧数据清空、深链导航和窄屏可操作性。
- 只读性测试覆盖：工作台冲刺区交互不调用写请求，不自动标记任务完成、不自动标记错题已掌握、不修改薄弱点、不写回练习结果、不创建建议完成反馈。
- 回归覆盖：不影响工作台既有考试上下文、倒计时、S1 时间线、模拟考入口、资料/练习/错题入口和响应式布局。
- 获得用户明确实施批准后，才允许运行 `pnpm type-check`、`pnpm -r --filter backend run build`、`pnpm -r --filter @ai-studybuddy/frontend run build`、`pnpm test`，以及使用新隔离 `APP_DATA_ROOT` 的浏览器验收。

## 5. 明确非目标

T06 不设计或实现：新的冲刺计划生成后端、持久化 CramPlan、建议完成反馈、StudyEvent、自动触发 AI/Provider、Worker、S3 Worker、S7、Schema/migration、自动标记任务完成、自动标记错题已掌握、自动修改薄弱点、自动写回练习结果、真实外部 smoke 或任何 T04/T05 生成规则变更。

## 6. Fresh-pass 审查结论

- [x] 未越权修改 T04/T05 生成规则，T06 仅计划工作台聚合展示。
- [x] 未错误新增后端接口；默认复用既有 `cram-plan` 与 `cram-cards` 能力。
- [x] 无 Schema/migration、持久化、StudyEvent、AI/Provider、Worker 或 S3/S4 反写设计。
- [x] 未扩展为 S7 或新的每日计划系统；S7 与 S3 Worker 仍未启动。
- [x] 保持已确认考试、当前学期隔离和课程隔离；跨考试切换必须清理旧数据。
- [x] 敏感字段边界明确，不展示或持久化题干、答案、学生作答、错因正文、资料原文、Provider 信息或秘密。
- [x] 不覆盖工作台既有时间线、模拟考、考试上下文或其他区域职责。
- [x] 测试计划覆盖窗口状态、失败恢复、考试切换、窄屏和只读性。
- [x] 本轮未实施业务代码、未运行实现验证、未运行浏览器验收、未合入或推送 `master`。
