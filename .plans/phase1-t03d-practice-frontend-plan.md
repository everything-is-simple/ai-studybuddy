# Phase 1-T03D：S3 练习前端闭环实施计划

**版本**：v0.1
**日期**：2026-07-16
**状态**：已获批准、实施并完成验证
**任务归属**：Phase 1-T03D / S3 PracticeRunner
**建议实施分支**：`codex/phase1-t03d-practice-frontend`

## 1. 目标与完成边界

在已合入 `master` 的 T03A/T03B/T03C 基础上，为学生提供完整的浏览器练习路径：

```text
已确认考试工作台「练习」区
  → 选择当前课程的知识模块与练习参数
  → 创建练习
  → 逐题作答与可选限时倒计时
  → 提交并即时查看批改结果
```

本任务只修改前端及其测试、浏览器验收和计划/收尾文档。前端只通过已有本机 API 消费数据，不读取 SQLite、运行数据目录、资料原文、Provider 配置或绝对文件路径。

### 本次包含

- 前端 `PracticeRunner` API 封装：创建练习、读取作答前详情、提交作答。
- 工作台「练习」区入口，以及练习发起、作答、结果三个路由页面。
- 选择 1–10 个当前课程知识模块、题量（5–20）、难度偏好和可选限时。
- 单选、多选、填空的可访问作答控件；前端计时、超时提示但不阻止提交；逐题用时与总用时提交。
- 提交后展示总分、正确率、超时状态、逐题对错、学生答案、正确答案、解析和关联模块标题。
- 前端单元/组件测试与不访问真实 Provider 的 Playwright 浏览器 smoke。

### 明确不包含

- 任何后端路由、Service、SQLite Schema/migration、shared API DTO 或 Worker 改动。
- `GET /api/practice-sessions`、`GET /api/practice-sessions/:id/result`、练习历史/趋势或跨会话结果查询。
- 错题归档、`mistakes`、`weak_points`、薄弱点、复习排程，或 S4 PRD/Schema/代码。
- S5–S7、主观题、AI 批改、真实外部 Provider smoke、题目生成 Worker。
- 课程/考试/资料/知识模块的既有业务语义变更。

## 2. 已确认事实与接口约束

已核对当前 `master`（`c0076a2`）的实现：

- `POST /api/practice-sessions` 已返回 `PracticeSessionDetailDto`；作答前题目不含答案、解析或 AI 元数据。
- `GET /api/practice-sessions/:id?semesterId=...` 可重新读取作答前题目详情。
- `POST /api/practice-sessions/:id/submit` 已返回 `SubmitPracticeSessionResponse`，含得分、正确率、超时和逐题批改结果。
- `GET /api/knowledge-modules` 已能按 `semesterId` 与 `courseInstanceId` 读取当前课程模块；考试工作台已有当前考试、课程和确认状态上下文。
- 当前没有练习列表 API，也没有结果读取 API。这两项不在本任务范围内，不能为了前端页面顺手扩展后端。

结果页面的来源因此限定为本次提交响应：跳转时传递内存状态，并将必要的结果 DTO 写入按 `semesterId + sessionId` 隔离的 `sessionStorage`，以支持同一浏览器会话内刷新恢复。缓存仅用于展示，不是新的业务事实源；若直接打开结果 URL 或关闭浏览器会话后缓存不存在，页面应显示可理解的中文说明并提供回到工作台的入口，不能伪造结果。跨会话历史和直达结果页读回需在后续独立、获批的后端 API 任务中解决。

## 3. 预计文件范围

### 新增

- `packages/frontend/src/api/practice-runner-api.ts`
  - 只封装现有三条 API，并复用 `request()`、共享 DTO、`AbortSignal` 与统一错误信封处理。
  - `createPracticeSession()`、`getPracticeSession()`、`submitPracticeSession()` 集中 URL 编码、query 参数和 JSON body；页面/组件不得自行 `fetch` 或解析信封。
- `packages/frontend/src/hooks/use-practice-timer.ts`
  - 以浏览器性能时钟维护总用时、当前题累计用时、限时剩余秒数及 `overtime` 展示状态。
  - 在题目切换、页面隐藏和卸载时结算当前题片段；不自动提交、不阻止超时后作答。
- `packages/frontend/src/hooks/use-practice-draft.ts`
  - 保存当前题号、答案草稿、已累计逐题用时、计时快照和提交结果展示缓存；storage key 必须带学期与 session，读取异常/过期数据须安全降级。
- `packages/frontend/src/components/practice-question.tsx`
  - 按 `PracticeQuestionForStudentDto.type` 渲染单选 radio、多选 checkbox、填空 input/textarea；所有控件有可见中文标签和题号。
  - 多选在前端规范为稳定排序、逗号连接的选项标签；不包含任何正确答案判断。
- `packages/frontend/src/components/practice-result-item.tsx`
  - 只展示已从提交响应取得的结果，结合练习详情与模块映射显示题干、学生答案、正确答案、解析、对错和模块标题。
- `packages/frontend/src/pages/practice-start-page.tsx`
- `packages/frontend/src/pages/practice-session-page.tsx`
- `packages/frontend/src/pages/practice-result-page.tsx`
- `packages/frontend/test/practice-runner-api.test.ts`
- `packages/frontend/test/practice-pages.test.tsx`
- `e2e/practice-runner.spec.ts`

### 修改

- `packages/frontend/src/app.tsx`
  - 懒加载并挂载 `/exams/:examId/practice`、`/practice-sessions/:sessionId`、`/practice-sessions/:sessionId/result`；延续全局 `semesterId` 与缺学期空状态处理。
- `packages/frontend/src/pages/exam-workbench-page.tsx`
  - 仅在已确认考试的既有工作台中增加「练习」区和明确入口，链接带当前 `examId`，不改变计划区、考试确认或任务状态逻辑。
- `packages/frontend/src/types/view-models.ts`
  - 如需要，增加仅限页面展示的答案草稿/缓存组合类型；不得复制或替代 shared DTO。
- `packages/frontend/src/styles/global.css`
  - 为模块选择、题目导航、倒计时/超时、题目卡和结果状态补最小样式，并沿用已有变量、窄屏规则与可读文字反馈。
- `packages/frontend/test/exam-workbench-page.test.tsx`
  - 断言已确认考试出现练习入口，待确认考试不出现可发起练习的入口。
- `.plans/phase1-t03d-practice-frontend-plan.md`
  - 获批后登记批准；实施完成后记录实际改动、验证与边界。
- `docs/04-开发任务清单-Todo-List.md`
  - **仅在实现和所有验证通过后**勾选 T03D 子项并登记日期、命令、浏览器证据与未实现边界。
- `docs/00-文档索引-Index.md`
  - **仅在 T03D 完成后**更新 S3 状态和下一门禁；不创建 S4 文档。

## 4. 页面与状态设计

### 4.1 工作台「练习」区

- 位置：已确认考试工作台的资料区后、计划区前。
- 文案说明仅面向当前考试/课程；入口为「开始练习」。
- pending/rejected/superseded 考试继续沿用当前的确认门槛，不展示绕开确认的练习入口。

### 4.2 发起页：`/exams/:examId/practice`

1. 并行读取当前考试与该考试课程的知识模块；考试不存在、学期无效、课程无模块、加载失败分别展示可重试中文反馈。
2. 展示模块标题、重要度、难度与简短摘要，checkbox 允许选 1–10 个；提交前在前端阻止空选、超过上限和无学期/考试上下文。
3. 表单默认题量 10、难度 `mixed`、不限时；题量只允许 5–20 的整数，限时只允许正整数秒或不限时（传 `null`）。服务端仍是最终校验者。
4. 「生成练习」请求中禁用表单并显示等待提示；失败显示服务端已脱敏中文错误，保留用户选择和参数供重试。
5. 成功后仅使用服务端返回的 session ID 跳转作答页；不在前端生成题目、ID、状态或答案。

### 4.3 作答页：`/practice-sessions/:sessionId`

1. 使用 `getPracticeSession(semesterId, sessionId)` 读取并按服务端 `questionOrder` 作答；缺学期、非法/不存在 session、请求失败或非 `in_progress` 状态都有可理解的降级与返回入口。
2. 一次显示一题，提供「上一题」「下一题」和题号导航；同时显示已答/未答状态。题目切换不丢失草稿。
3. `single_choice` 使用 radio，`multiple_choice` 使用 checkbox 并稳定序列化为 `A,C`，`fill_blank` 使用普通文本输入。空题允许提交，后端按未作答批改。
4. 使用 `usePracticeTimer` 以 `performance.now()` 计算本页会话的显示倒计时与逐题用时；快照在同一 `sessionStorage` 草稿中恢复。有限时时显示剩余时间，达到零后显示「已超时，仍可继续并提交」，绝不锁屏、清空或自动提交。
5. 点击提交时冻结交互、防止重复提交，并构造现有 `SubmitPracticeSessionRequest`：`semesterId`、每题 `questionId/answer/timeSpentSeconds`、`totalDurationSeconds`。成功后缓存结果和练习详情，并跳转结果页；失败时保留草稿、恢复可编辑状态、显示错误。

### 4.4 结果页：`/practice-sessions/:sessionId/result`

1. 从路由状态或 `sessionStorage` 恢复提交结果；再读取作答前详情与当前课程知识模块，以安全映射题干和模块标题，不请求不存在的 result API。
2. 展示总分 `totalScore/questionCount`、百分比正确率、总用时与「是否超时」；逐题展示对错、学生答案（未答明确标示）、正确答案、可选解析和模块标题。
3. 错题只在此处作为「答错」展示，不产生归档、薄弱点、任务、模块状态改变或 S4 跳转。
4. 缓存缺失、详情读取失败或 session ID 不匹配时不显示猜测结果；显示中文空/错误状态、重试（仅详情读取可重试）和返回当前考试工作台链接。

## 5. 实施步骤

- [ ] **Step 1：获批后的分支与前置核查**
  - 确认工作区干净，`git fetch origin`、更新 `master`，从最新 `origin/master` 创建 `codex/phase1-t03d-practice-frontend`。
  - 复查 T03B/T03C 三条 API、shared DTO、知识模块读取 API、工作台路由和 Playwright 基座存在；若后端契约发生漂移，先停止并报告，不在 T03D 补后端。

- [ ] **Step 2：先写前端 API 与纯交互测试（RED）**
  - 对 API 封装验证请求 URL、method、body、URL 编码、成功解包和服务端/网络失败。
  - 对计时/草稿纯逻辑验证选项序列化、题目切换累计、限时到零仍可提交、storage 恢复和损坏缓存降级。

- [ ] **Step 3：实现发起页及工作台入口**
  - 复用 `getExam`、`getKnowledgeModules` 与 `useApiRequest`；实现模块选择和参数校验。
  - 成功创建后只以 API 响应转场，错误可重试且保留表单。

- [ ] **Step 4：实现作答与提交**
  - 实现题型组件、导航、计时、草稿和提交防重；确保答案/题目顺序由 DTO 驱动。
  - 任何异常不在浏览器日志或页面暴露完整答案批量、资料正文、Provider 信息或内部堆栈。

- [ ] **Step 5：实现结果读取与展示**
  - 严格以刚提交结果/会话缓存为结果数据源，以 API 详情补题干，以知识模块 API 补模块标题。
  - 实现同会话刷新恢复和缓存缺失的安全空状态；不伪造结果、历史记录或新后端接口。

- [ ] **Step 6：组件、工作台与窄屏回归**
  - 补最小 CSS、可见标签、键盘可操作选项、焦点/禁用状态和错误反馈。
  - 回归确认考试、任务计划、资料入口和既有导航，不让 T03D 改变非练习流程。

- [ ] **Step 7：浏览器 smoke**
  - 新增 Playwright 用例：通过现有本机后端创建隔离学期/课程/已确认考试，浏览器进入工作台练习区，选择模块、生成、作答、超时提示、提交、结果查看、刷新读回结果缓存与错误反馈。
  - 练习生成/读取/提交响应在浏览器测试中由本地 Playwright route fixture 提供，或使用本地 mock；不得调用真实外部 Provider，也不得把真实资料、答案、UUID 或截图提交入仓库。截图/HTML 报告仅保留在隔离 `APP_DATA_ROOT` 证据目录。

- [ ] **Step 8：收尾、审查与文档同步**
  - 独立复审范围、答案泄露、计时边界、路由刷新、重复提交、旧工作台回归和非目标。
  - 仅在实现完成后更新 `docs/04`、必要时更新 `docs/00`；运行治理与 diff 检查，再提交批准范围内文件。

## 6. 验证计划

实现后使用隔离目录（示例实际 task-id：`phase1-t03d-frontend`）运行：

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm -r --filter @ai-studybuddy/frontend run test -- practice-runner-api.test.ts practice-pages.test.tsx exam-workbench-page.test.tsx
pnpm test
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t03d-frontend'
pnpm test:e2e -- practice-runner.spec.ts
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

浏览器验收至少记录以下结论（证据保存在仓库外隔离目录）：

1. 已确认考试可从工作台进入练习；未确认考试不提供可绕过确认的入口。
2. 无模块、加载失败、生成失败、缺学期和非法 session 都显示中文反馈且不白屏。
3. 选择模块、参数、创建、三类题作答、题目切换、倒计时和超时后提交均可用。
4. 提交后结果中的总分、正确率、超时和逐题答案/解析与 mock 提交响应一致；刷新结果页可在同一浏览器会话恢复。
5. 既有工作台任务、资料链接和考试切换回归通过；无真实 Provider/Worker 被启动。

## 7. 文档与交付规则

- 当前仅创建本 `.plans/` 文件，`docs/04` 仍保持 T03D 未完成状态，`docs/00` 仍保持下一门禁为 T03D。
- 用户明确批准后才创建实施分支、改动前端代码、测试、任务清单或其他正式文档。
- 完成实现后，先在 `docs/04-开发任务清单-Todo-List.md` 勾选实际完成子项并登记验证证据；只有合入并推送 `origin/master` 后才报告 T03D 主系统完成。
- 交付需说明任务分支、提交哈希、是否推送任务分支、是否合入 `master`、是否推送 `origin/master`、`docs/04` 更新位置及仍未触发的 S4–S7。

## 8. 独立自审

### 门禁与范围

- T03C 已在当前 `master/origin/master` 的 `c0076a2` 中收尾，T03D 是当前唯一下一实现门禁；计划不创建 S4 PRD/Schema。
- 前端范围严格使用已有三条 S3 API；未把 PRD 中尚不存在的列表/result API、历史、趋势或后端改造混入任务。
- Worker、真实 Provider smoke、AI 批改、错题归档、`mistakes`、`weak_points`、S5–S7 全部排除。

### 数据与状态一致性

- 创建、题目和结果都以服务端 DTO 为准；前端不生成正确答案或批改结论。
- 提交按钮防重，失败保留草稿，成功后只展示服务端提交响应；已提交 session 不尝试再次提交。
- `sessionStorage` 只用于同会话展示恢复，缺失时安全降级；不会冒充后端练习历史或跨会话持久化。

### 计时与可访问性

- 限时是展示与提交用时输入，后端仍负责最终 overtime 标记；超时不锁定或自动提交，符合 S3 PRD。
- 一次一题能明确归集 `timeSpentSeconds`；题目导航、radio、checkbox、填空、按钮和错误信息均有中文可访问标签与可见文字反馈。

### 隐私与验证

- 前端不接触 SQLite、文件、Provider 配置或资料原文；错误提示不回显内部异常、题目批量、答案批量或 Provider 信息。
- 自动化分层覆盖 API、交互/缓存与真实浏览器；浏览器成功流使用本地 mock/route fixture，不访问真实外部 Provider。
- 按前端和跨端验证矩阵执行 type-check、build、测试、隔离浏览器验收、文档治理及 diff 检查。

**自审结论**：计划与当前 API 能力一致，T03D 可在不新增后端能力的条件下完成“本次练习”的前端闭环。其有意限制是结果只能由本次提交响应在同一浏览器会话中恢复；持久历史和结果直达读取需另行获批，不能在本任务越权实现。

## 9. 批准记录

用户已于 2026-07-16 明确批准实施。

实际分支：`codex/phase1-t03d-practice-frontend`。

完成范围：

- 新增三条既有 S3 API 的前端封装、练习发起/作答/结果路由页、题型控件、浏览器性能时钟计时、会话草稿与结果缓存。
- 已确认考试工作台新增“练习”区；pending 考试不能绕开既有确认门槛。
- 结果只来自提交响应，刷新在同一浏览器会话内恢复；缓存缺失时安全降级。未增加后端 result/list API。
- 新增 API/页面单测和 Playwright 浏览器 smoke；浏览器 S3 fixture 为本地 route mock，不访问真实 Provider。

验证通过：

- `pnpm type-check`
- `pnpm -r --filter @ai-studybuddy/frontend run build`
- `pnpm -r --filter @ai-studybuddy/frontend run test`（37/37）
- `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-t03d-frontend pnpm test:e2e -- practice-runner.spec.ts`（2/2）

仍未实现：练习历史、跨会话结果读取、后端 result/list API、错题归档、S4 PRD/Schema、S5-S7、真实 Provider smoke 与 Worker。
