# Phase 1-M02：错题详情一级标题语义回归修复计划

**状态**：已完成：实现、隔离验证、独立审查、任务分支提交、主线集成、主线复验与 `origin/master` 推送均已完成

**任务登记**：`docs/04-开发任务清单-Todo-List.md` 的 Phase 1-M02。

**基线**：`origin/master` @ `60f03f8ea1f29d556b3bbf29c63bbd39d061b298`。

## 一、问题与目标

2026-07-19 的隔离全量验收中，`pnpm test:e2e` 的 14 条 Playwright 用例有 13 条通过、1 条失败。失败位于 `e2e/student-journey.spec.ts:259`：用例按可访问性角色要求存在 `heading` level 1 的“错题详情”，但实际页面把该文本渲染为 `<p className="workbench-eyebrow">`。页面、数据、错因确认控件和路由均已加载，不是后端、SQLite、导航或白屏故障。

目标是在不改变 S4 领域行为、路由、API、数据模型或现有 E2E 验收语义的前提下，将错题详情的页面主标题恢复为语义化一级标题，并以组件测试和现有真实 Express/SQLite Playwright 学生旅程防止回归。

## 二、范围与非目标

### 范围

1. 将 `packages/frontend/src/pages/mistake-detail-page.tsx` 中“错题详情”由普通段落改为 `<h1>`，保留既有 `workbench-eyebrow` class。
2. 在 `packages/frontend/test/mistake-pages.test.tsx` 增加页面主标题的 `h1`/文案回归断言。
3. 保留 `e2e/student-journey.spec.ts` 的严格 `heading level=1` 断言，使用它验证真实本地 Express/SQLite 全链路。
4. 仅在真实浏览器或现有样式测试表明元素默认样式导致可见布局回归时，才对相关 CSS 做最小、定点修正。
5. 更新本计划和 `docs/04` 的实际验证证据。

### 非目标

- 不修改后端、SQLite schema/migration、共享 DTO、错题 API、错因确认、重做或掌握业务规则。
- 不放宽或改写 E2E 的页面语义契约为普通文本匹配。
- 不新增页面、路由、依赖、Provider、外部渠道或浏览器存储。
- 不运行真实 AI、QQ SMTP、飞书 Webhook、个人中转站、CC Switch、日抛或 CPA smoke。

## 三、文件清单

- Modify: `packages/frontend/src/pages/mistake-detail-page.tsx`
- Modify: `packages/frontend/test/mistake-pages.test.tsx`
- Modify: `docs/04-开发任务清单-Todo-List.md`
- Create/Modify: `.plans/phase1-m02-mistake-detail-heading-regression-plan.md`
- Modify CSS only if the focused browser validation demonstrates a real visual regression: `packages/frontend/src/styles/global.css`

禁止修改：`packages/backend/**`、`packages/shared/**`、数据库 schema/migration、`e2e/student-journey.spec.ts` 的该标题断言、生产密钥配置和任何 `.env.local`。

## 四、实施步骤

1. **冻结语义契约**：阅读现有错题页面组件测试，先加入失败断言，确认“错题详情”为 level 1 heading；不以 class 或文本存在替代语义断言。
2. **最小页面修复**：将详情页 header 中的 `<p className="workbench-eyebrow">错题详情</p>` 改为 `<h1 className="workbench-eyebrow">错题详情</h1>`；不改变文本、数据读取、控件或导航。
3. **样式检查**：先保持 class 不变；若 h1 的默认 margin 或字号突破既有 visual contract，才在 `global.css` 添加最小 reset，不能把标题重新隐藏或降低其语义。
4. **定向回归**：运行前端错题页单测、frontend type-check/build，以及失败的 `student-journey` Playwright 用例。
5. **全量验证**：在隔离 `APP_DATA_ROOT` 中重跑 root tests 和完整 Playwright E2E，确认从 13/14 变为 14/14；检查控制台和不触发外部渠道。
6. **审查与收尾**：审查 diff 是否仅为计划、任务登记、标题语义及对应防回归测试；更新 `docs/04` 真实结果；执行文档治理、diff 检查、提交、rebase/fast-forward 主线集成、主线复验与推送。

## 五、验证矩阵

所有运行数据必须设置在 `I:\ai-studybuddy-tmp\runs\phase1-m02-mistake-detail-heading-regression` 或其新的隔离子目录；每次完整 Playwright 套件须使用未被先前 Playwright 命令写入过的目录，不得使用主仓库或正式运行数据。

```powershell
# 定向与全量单元/集成验证：可使用本任务隔离目录。
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-m02-mistake-detail-heading-regression'
pnpm --filter @ai-studybuddy/frontend exec vitest run test/mistake-pages.test.tsx
pnpm type-check
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
pnpm exec playwright test e2e/student-journey.spec.ts

# 完整 Playwright 套件必须切换到此前未被任何 Playwright 命令写入的新目录。
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-m02-mistake-detail-heading-regression-full-e2e'
pnpm test:e2e

powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

验收条件：

- 页面主标题在无障碍树中是 `heading`，名称“错题详情”，等级 1。
- 错题详情仍显示原题、选项、学生答案、正确答案、解析、错因确认、原题重做和证据时间线。
- `e2e/student-journey.spec.ts` 通过，完整 E2E 为 14/14；不得因放宽该断言通过。
- 不产生真实外部请求、秘密输出或仓库内运行数据。

## 六、计划自审

- **边界**：根因是 DOM 语义失配，前端单页修复足够；没有证据支持更改 API、数据层或 Playwright 断言。
- **可访问性**：方案 A 用可见的 `<h1>` 取代仅视觉的 `<p>`，比隐式标题、隐藏标题或降低测试断言更符合页面结构。
- **样式风险**：保留 class，且将视觉回归限制为必要的最小 CSS 调整；不预先扩大样式改动。
- **验证**：组件断言覆盖语义；现有真实 Express/SQLite 学生旅程覆盖错题归档、详情、错因确认及后续学期隔离；全量套件验证不影响其他系统。
- **安全与隔离**：只用合成测试数据和隔离 APP_DATA_ROOT；不读取 `.env.local`，不执行真实渠道 smoke。

审查结论：方案 A 的实现范围、测试策略和非目标清晰，可进入实施。

## 七、实施与验证结果（2026-07-19）

- **实现**：`packages/frontend/src/pages/mistake-detail-page.tsx` 仅将“错题详情”从 `<p className="workbench-eyebrow">` 改为 `<h1 className="workbench-eyebrow">`；未改 CSS、API、路由、SQLite、领域规则或 Playwright 标题断言。
- **防回归**：`packages/frontend/test/mistake-pages.test.tsx` 在既有详情流断言该元素为 `h1.workbench-eyebrow` 且文本为“错题详情”；定向 Vitest 4/4 通过。
- **定向验证**：`pnpm type-check` 通过；`pnpm -r --filter @ai-studybuddy/frontend run build` 通过，唯一非阻塞 warning 为既有 KaTeX 535.51 kB chunk；真实 Express/SQLite `pnpm exec playwright test e2e/student-journey.spec.ts` 通过（1/1）。
- **全量验证**：`pnpm test` 通过（后端 225/225、前端 93/93）；在新的隔离 `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-m02-mistake-detail-heading-regression-full-e2e` 执行 `pnpm test:e2e` 通过（14/14）。先前一次全量 E2E 使用了已经执行过定向 Playwright 的同一数据目录，T09C 在已有 current semester 条件下预期空系统重定向而失败（13/14）；新目录复跑通过，说明这是验证数据目录复用导致的前置条件污染，不是本次语义修复导致的产品回归。
- **安全与隔离**：所有数据与 Playwright 产物均在 `I:\ai-studybuddy-tmp\runs\...`；未读取 `.env.local`、未输出或持久化真实秘密、未执行真实 AI、QQ SMTP、飞书或其他外部渠道 smoke。

独立审查已完成并发现一个 P2 文档可复现性问题：验证矩阵原先在同一目录先跑定向 Playwright、再跑完整 Playwright，可能重现既有数据污染；现已拆分为两个明确的隔离目录。治理/diff 收尾检查已重新通过；任务分支实现提交为 `80ea2ab`（`fix(frontend): 修复错题详情一级标题语义`），验证证据提交为 `e6c5df0`，主线复验登记为 `6aa088e`。该分支已 rebase `origin/master` @ `60f03f8` 并 fast-forward 到新的干净本地 `master` worktree；主线复验重新通过 type-check、后端/前端 build、`pnpm test`（225/225、93/93）与隔离 `pnpm test:e2e`（14/14）。已成功将 `origin/master` 从 `60f03f8` 推进至 `6aa088e`；本任务已成为远端主线完成事实。
