# Phase 2-T03 模拟考前端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 T02 后端契约的前提下，提供学生端模拟考入口、计时作答、刷新恢复、提交批改与模块分析结果展示闭环。

**Architecture:** T03 只在 `packages/frontend` 增加一组以 T02 模拟考 REST API 为唯一数据源的页面、请求封装、会话草稿 Hook 和展示组件。入口从既有考试上下文导航进入，不新增 T06 的“冲刺”工作台区域；作答中的临时答案和计时数据仅保存于浏览器 `sessionStorage`，权威的试卷、尝试状态、成绩与解析始终由后端 DTO 决定。

**Tech Stack:** React、TypeScript、React Router、Vite、Vitest、既有 `api-client.ts`、`useApiRequest`、`PageState`、`FeedbackMessage`、`sessionStorage`。

---

## 1. 触发依据、门禁结论与停止规则

- 计划基线：执行审计时最新 `origin/master` 为 `769840ee71ada882c3bcec4fdde6224735272daf`；本计划任务分支从该提交创建。
- `docs/00-文档索引-Index.md` 已将 `docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md` 登记为有效 S5 PRD。
- `docs/04-开发任务清单-Todo-List.md` 已登记 T01 完成，且 T02 已 fast-forward 合入 `master` 并推送 `origin/master`；其主线完成证据记录了类型检查、两端构建、全量测试、文档治理和 diff 检查。
- T02 已提供模拟卷生成、模拟卷详情、尝试创建、尝试详情和提交批改能力，足以成为 T03 的唯一后端输入。
- 本轮仓库记录没有发现用户明确批准 T03 前端业务实现。

**门禁结论：**可以创建 Phase 2-T03 独立行动计划；当前未发现用户明确批准进入 T03 前端实现；在用户明确批准前，不得创建或修改任何 T03 前端业务代码。

**获批前停止规则：**本计划提交、推送和 `docs/04` 登记后立即停止。不得创建 T03 实现分支，不得新增或修改 `packages/frontend`、`packages/backend`、`packages/shared`、测试业务文件、数据库 Schema、migration、API、Service、Worker 或配置文件；不得以占位、样式、夹具或预验证名义提前实现。

## 2. 已验证的 T02 输入契约

所有端点以标准 envelope 返回：成功为 `{ success: true, data }`，失败为 `{ success: false, error: { code, message } }`。T03 必须复用 `packages/frontend/src/api/api-client.ts` 的 envelope/error 处理，不自行读取存储层。

| 端点 | 请求 | 成功数据 | T03 消费位置 |
| --- | --- | --- | --- |
| `POST /api/mock-exam-papers` | `CreateMockExamPaperRequest`：`semesterId`、`courseInstanceId`、`assessmentAttemptId`；`knowledgeModuleIds`、`questionCount`、`difficultyPreference`、`timeLimitSeconds` 可选 | `MockExamPaperDetailDto` | 入口生成模拟卷后跳转试卷页 |
| `GET /api/mock-exam-papers/:id?semesterId=...` | 路径 `id` 与查询 `semesterId` | `MockExamPaperDetailDto` | 试卷基本信息与开始尝试前复取 |
| `POST /api/mock-exam-papers/:id/attempts` | `StartMockExamAttemptRequest`：`{ semesterId }` | `MockExamAttemptDetailDto`，初始状态为 `in_progress` | 开始答题后跳转尝试页 |
| `GET /api/mock-exam-attempts/:id?semesterId=...` | 路径 `id` 与查询 `semesterId` | `MockExamAttemptDetailDto` | 刷新恢复、已提交状态判定与结果页重取 |
| `POST /api/mock-exam-attempts/:id/submit` | `SubmitMockExamAttemptRequest`：`semesterId`、`totalDurationSeconds`、`answers: [{ questionId, answer, timeSpentSeconds }]` | `SubmitMockExamAttemptResponse` | 提交后即时结果并缓存导航目标 |

必须严格使用以下已存在共享类型，类型从 `@ai-studybuddy/shared` 导入：

- `MockExamPaperDetailDto`：含 `title`、`questionCount`、`timeLimitSeconds`、`totalPoints`、`sourceSummary`、`questions`。
- `MockExamAttemptDetailDto`：含 `id`、`paperId`、`status`（`in_progress`、`submitted`、`graded`）、开始/提交/批改时间、总分字段、`overtime`、`totalDurationSeconds`、作答前题目数组。
- `MockExamQuestionForStudentDto`：只含题干、选项、难度、知识模块、题序和分值；**没有**正确答案或解析。
- `SubmitMockExamAttemptResponse`：只在提交成功且状态为 `graded` 后含 `totalScore`、`totalPoints`、`questionCount`、`correctRate`、`overtime`、`answers`、`moduleAnalyses`。
- `MockExamAnswerResultDto`：提交后的 `studentAnswer`、`correctAnswer`、`isCorrect`、`scoreAwarded`、`pointValue`、可选 `explanation`、`knowledgeModuleId`。
- `MockExamModuleAnalysisDto`：`knowledgeModuleId`、题数、答对数、得分、总分、正确率与 `weakSignal`。

T02 服务的实际语义必须成为实现约束：每次开始会新建一个 `in_progress` 尝试；只有 `in_progress` 可提交；重复提交或已提交/已批改尝试会返回 `409`、错误码 `MOCK_EXAM_ATTEMPT_STATE_INVALID`；后端在提交事务中计算超时、正确答案、解析和模块分析，并将状态更新为 `graded`。前端不得自行判分、计算正确答案、伪造模块分析或向 S4 写入错题/薄弱点。

## 3. 页面、路由和导航边界

### 3.1 路由

后续获批实现时，修改 `packages/frontend/src/app.tsx`，以既有 `renderSemesterRoute`、懒加载和 `PageState` fallback 注册以下路由：

| 路由 | 页面 | 责任 |
| --- | --- | --- |
| `/exams/:examId/mock-exam` | `MockExamStartPage` | 读取既有 `getExam(semesterId, examId)` 考试上下文，要求考试状态已确认；以该 DTO 的 `courseInstanceId` 与 `examId` 调用生成模拟卷。生成成功后导航到试卷路径。 |
| `/mock-exam-papers/:paperId` | `MockExamPaperPage` | 请求模拟卷详情，展示标题、题数、限时、总分与来源摘要；由用户明确点击后创建尝试。 |
| `/mock-exam-attempts/:attemptId` | `MockExamSessionPage` | 请求尝试、恢复草稿、计时、答题、确认提交与提交状态处理。 |
| `/mock-exam-attempts/:attemptId/result` | `MockExamResultPage` | 从提交草稿中读取刚提交结果，或按尝试详情复取；只在已批改结果可用时显示解析与模块分析。 |

路由不新增 `/exams/:examId/sprint`、不在工作台增加倒计时冲刺卡、不增加 T04 速背入口或 T05 每日计划入口；这些分别归 T04、T05、T06。

### 3.2 导航

修改 `packages/frontend/src/components/exam-context-nav.tsx`：把 `ExamContextNavEntry` 扩展为包含 `mock_exam`，在既有“总览、资料、练习、错题、时间线”中新增“模拟考”，目标为 `/exams/:examId/mock-exam`。在 `MockExamStartPage` 与 `MockExamPaperPage` 使用该导航并把 `active` 设为 `mock_exam`。

这只是既有考试上下文内的 S5 独立入口，不是 T06 的“工作台冲刺区集成”。不得修改 `packages/frontend/src/pages/exam-workbench-page.tsx` 的倒计时、任务、时间线或布局来承担冲刺模式。

## 4. 未来实施的精确文件结构

| 文件 | 操作 | 单一责任 |
| --- | --- | --- |
| `packages/frontend/src/api/mock-exam-api.ts` | 新增 | 以现有 API 客户端封装五个 T02 端点；仅导出 `createMockExamPaper`、`getMockExamPaper`、`startMockExamAttempt`、`getMockExamAttempt`、`submitMockExamAttempt`。 |
| `packages/frontend/src/hooks/use-mock-exam-draft.ts` | 新增 | 定义、读取、校验、写入和删除一次模拟考尝试的 `sessionStorage` 草稿；损坏 JSON 安全降级为空草稿。 |
| `packages/frontend/src/components/mock-exam-question.tsx` | 新增 | 基于 `MockExamQuestionForStudentDto` 渲染单选、多选、填空、简答输入与题号/分值；作答期间绝不接收正确答案或解析 props。 |
| `packages/frontend/src/components/mock-exam-module-analysis.tsx` | 新增 | 仅基于 `MockExamModuleAnalysisDto[]` 渲染模块统计、正确率与 `weakSignal` 说明。 |
| `packages/frontend/src/pages/mock-exam-start-page.tsx` | 新增 | 考试上下文加载、确认状态提示、生成模拟卷请求、生成中和错误重试。 |
| `packages/frontend/src/pages/mock-exam-paper-page.tsx` | 新增 | 模拟卷详情、开始前确认、尝试创建中与创建失败状态。 |
| `packages/frontend/src/pages/mock-exam-session-page.tsx` | 新增 | 尝试加载、草稿恢复、`usePracticeTimer` 复用、题目切换、提交确认、提交中互斥与状态冲突恢复。 |
| `packages/frontend/src/pages/mock-exam-result-page.tsx` | 新增 | 已批改汇总、逐题结果、解析与模块分析；结果不可用时给出安全状态和回退入口。 |
| `packages/frontend/src/app.tsx` | 修改 | 懒加载以上四页并注册四条路由，保留当前学期守卫与统一 fallback。 |
| `packages/frontend/src/components/exam-context-nav.tsx` | 修改 | 新增模拟考导航项及其活跃状态。 |
| `packages/frontend/test/mock-exam-api.test.ts` | 新增 | 验证五个请求的 method、URL、semesterId/query/body、标准 envelope 成功/失败处理与 AbortSignal 传递。 |
| `packages/frontend/test/mock-exam-pages.test.tsx` | 新增 | 覆盖入口、试卷、答题、刷新恢复、提交、重复提交、已批改与结果/模块分析页面交互。 |
| `packages/frontend/test/exam-context-nav.test.tsx` | 修改 | 断言“模拟考”链接、URL、`aria-current` 与原有导航项不回归。 |
| `packages/frontend/test/app-semester.test.tsx` | 修改 | 断言四条模拟考路由仍经过当前学期恢复守卫与对应 loading fallback。 |

不新建后端、共享类型、数据库、migration、Worker、Provider、运行目录访问或外部服务文件。样式只在后续实现中按项目既有页面 className 和全局样式组织；若现有样式文件需要最小扩展，实施任务必须先确认实际样式入口并将它列入变更集和测试审查，不能在本计划阶段预写样式。

## 5. 请求层、状态流和答案可见性

### 5.1 API 客户端

`mock-exam-api.ts` 复用 `api-client.ts` 的请求函数与 `ApiRequestError`，不得直接调用 `fetch` 的第二套 envelope 解析。所有函数接收 `semesterId` 和可选 `AbortSignal` 的方式必须与 `practice-runner-api.ts` 和 `study-rhythm-api.ts` 一致。请求数据只使用共享 DTO；不读取 SQLite、`APP_DATA_ROOT`、上传目录、Provider 配置或任何本机秘密。

### 5.2 入口与试卷流程

1. `MockExamStartPage` 用现有 `getExam` 获取 `AssessmentAttemptDto`。加载中显示 `PageState loading`；考试不存在、当前学期失效或请求失败显示 `PageState error` 并保留重试。
2. 考试未处于 `confirmed` 时，不调用生成端点，显示不能生成的业务提示并提供返回考试总览的链接。
3. 确认考试时，用户点击“生成模拟卷”才调用 `createMockExamPaper({ semesterId, courseInstanceId: exam.courseInstanceId, assessmentAttemptId: exam.id })`。这使用 T02 的可选参数默认值，不发明题量、难度或知识模块选择 API。
4. 请求中禁用生成按钮，成功后立即导航 `/mock-exam-papers/:paperId`；失败保留当前考试上下文并显示服务返回的脱敏 message。
5. `MockExamPaperPage` 以 `getMockExamPaper` 取得权威基本信息。加载中、404、网络失败和无题目四种状态分别显示；无题目不允许创建尝试。
6. 用户确认开始后才调用 `startMockExamAttempt(paperId, { semesterId })`。请求中禁用重复点击；成功先写入空草稿再导航 `/mock-exam-attempts/:attemptId`；失败不导航。

### 5.3 草稿和刷新恢复

`use-mock-exam-draft.ts` 的 key 必须为 `ai-studybuddy:mock-exam:${semesterId}:${attemptId}`，版本为 `1`，并只保存：

```ts
{
  version: 1,
  attemptId: string,
  activeQuestionIndex: number,
  answers: Record<string, string>,
  questionSeconds: Record<string, number>,
  totalDurationSeconds: number,
  result?: SubmitMockExamAttemptResponse
}
```

- 读取时校验 `version` 和 `attemptId`；JSON 解析失败、形状非法、答案指向当前尝试题目之外或题号越界时，返回不含答案/计时/结果的空草稿，而不抛出页面错误。
- 每次选题、答案变更、题目切换和计时快照变化都覆盖写入同一 sessionStorage key；只保存答案字符串和秒数，不保存题干、选项、正确答案、解析、学生身份、完整 UUID 以外的持久化数据，也不写入服务端以外的数据库。
- 尝试页首次加载始终先 `getMockExamAttempt`。只有其 `status === 'in_progress'` 时才使用草稿答案和计时；刷新或跨标签恢复时继续计时，不能据草稿绕过后端状态。
- `status === 'submitted'` 或 `status === 'graded'` 时，不显示可编辑答题控件，不再写草稿，清除作答字段但可保留提交结果缓存供结果页导航；页面提供“查看结果”入口。若已批改结果尚不能由该尝试详情取得，结果页显示“结果暂不可用”，提供重新读取和返回试卷/考试入口，绝不显示推测的正确答案或解析。
- 成功提交后把完整 `SubmitMockExamAttemptResponse` 写入 `result` 并导航结果页；结果页以该缓存优先渲染。用户刷新后若缓存不存在，先读取尝试状态；当前 T02 `GET` 尝试 DTO 不含答案结果和模块分析，因此不能重新构造已提交结果，必须显示“本次结果需要从刚完成的页面查看；当前接口未提供结果明细重取能力”的不可用状态，并提供安全返回，不新增后端接口。

### 5.4 答题、计时与提交

- `MockExamSessionPage` 复用 `usePracticeTimer`，将尝试草稿的总计时、每题计时和 `paper.timeLimitSeconds` 作为初始值。计时到零只显示时间已到和超时状态；T02 的真实契约仍接受提交并以 `totalDurationSeconds > timeLimitSeconds` 判定 `overtime`，因此前端不得自行强制交卷或伪造时长。
- 每一题渲染 `MockExamQuestionForStudentDto`。单选保存一个选项值，多选按稳定字母顺序保存逗号分隔值；填空/简答按当前 S3 `PracticeQuestion` 组件同样的受控输入边界处理。提交答案数组必须按后端题目顺序映射，并附每题 `timeSpentSeconds` 与总秒数。
- 提交前显示确认状态：已答题数、未答题数、总用时、剩余或超时提示；不显示正确率、正确答案或解析。
- 提交请求开始后设置单一 `isSubmitting` 状态，禁用题目输入、上一题/下一题与提交按钮，防止并发重复提交；成功后清除可编辑草稿并缓存结果。
- 若提交返回 `409` 且错误码为 `MOCK_EXAM_ATTEMPT_STATE_INVALID`，立即重新调用 `getMockExamAttempt`：若为 `submitted` 或 `graded`，停止编辑并导航/提供结果入口；若仍为 `in_progress`，解除提交中状态并显示可重试错误；其它错误保留草稿、显示可重试错误且不丢答案。
- 404、当前学期不可用、网络失败、取消请求和未知 envelope 都走既有错误展示模式；取消请求不覆盖已有成功数据或草稿。

### 5.5 结果和模块分析

- `MockExamResultPage` 仅在 `SubmitMockExamAttemptResponse.status === 'graded'` 时展示分数、总分、题数、正确率、用时、超时标记、逐题的学生答案/正确答案/得分/解析和 `MockExamModuleAnalysisDto[]`。
- `MockExamModuleAnalysis` 按后端给出的数组顺序展示模块，不猜测知识模块标题；初版可展示模块 ID、题数、正确数、得分/总分、百分比与弱项信号。若未来需要模块标题，必须由独立契约审计确认现有公开 API，不得在 T03 偷加查询端点。
- 空 `answers` 或空 `moduleAnalyses` 作为“结果详情不可用”状态，而不是显示零分、全对或不存在的分析。逐题解析仅在提交响应实际含有 `correctAnswer`/`explanation` 时显示。
- 结果页只提供返回模拟考入口、考试总览或再次生成模拟卷的导航；不创建 S4 错题、不反写 S3 练习历史、不更新薄弱点，不生成 T04 卡片和 T05 计划。

## 6. 与既有子系统的边界、数据隔离与隐私

- **T02：**T03 只消费其 Schema、生成服务、五个 API 和共享 DTO；不得修改任何 T02 后端行为、数据库表、迁移、生成算法或成绩计算。
- **S3/S4：**仅复用已有作答控件、计时 Hook、草稿模式、统一请求/错误模式与考试上下文；模拟考不得反写练习会话、错题、薄弱点、复习统计或其业务事实。
- **T04–T06：**不做临考速背、冲刺计划、工作台“冲刺”区、倒计时模式或跨任务入口。
- **S7 与 S3 Worker：**不启动、不接入、不预留业务接口。
- **隐私：**前端只消费后端脱敏 DTO；不得把题干、答案、解析、完整 UUID、学生个人数据或正式运行数据写入日志、测试快照、URL 查询参数、localStorage 或提交内容。sessionStorage 草稿仅在当前浏览器会话内保存上述最小作答状态。
- **真实外部调用：**不运行真实 AI、QQ SMTP、飞书、中转站、Windows 计划任务或任何外部 smoke；实现验证使用隔离数据根、模拟 API 与本地浏览器。

## 7. 获批后的 TDD 实施顺序

### Task 1：API 封装与 API 契约测试

**Files:**
- Create: `packages/frontend/src/api/mock-exam-api.ts`
- Test: `packages/frontend/test/mock-exam-api.test.ts`

- [ ] 先为五个 API 函数写失败测试：断言 method、路径、`semesterId` query/body、DTO body、envelope data 解包、服务错误和 AbortSignal。
- [ ] 运行 `pnpm -r --filter @ai-studybuddy/frontend test -- mock-exam-api.test.ts`，确认新测试先因 API 模块不存在而失败。
- [ ] 仅实现五个 API 调用，复用 `api-client.ts`，不加入后端访问或自定义 transport。
- [ ] 再运行同一测试，确认所有 API 契约断言通过。

### Task 2：草稿 Hook、计时复用与单题组件

**Files:**
- Create: `packages/frontend/src/hooks/use-mock-exam-draft.ts`
- Create: `packages/frontend/src/components/mock-exam-question.tsx`
- Test: `packages/frontend/test/mock-exam-pages.test.tsx`

- [ ] 写失败测试覆盖版本/尝试 ID 校验、损坏 JSON 降级、答案与每题计时持久化、多选稳定顺序以及学生题 DTO 不接收答案/解析字段。
- [ ] 运行 `pnpm -r --filter @ai-studybuddy/frontend test -- mock-exam-pages.test.tsx`，确认测试因实现不存在而失败。
- [ ] 实现 sessionStorage 草稿 Hook 与题目组件；将 `usePracticeTimer` 作为唯一计时机制。
- [ ] 重跑测试，确认刷新恢复和不泄露答案/解析的断言通过。

### Task 3：入口、试卷和路由导航

**Files:**
- Create: `packages/frontend/src/pages/mock-exam-start-page.tsx`
- Create: `packages/frontend/src/pages/mock-exam-paper-page.tsx`
- Modify: `packages/frontend/src/components/exam-context-nav.tsx`
- Modify: `packages/frontend/src/app.tsx`
- Modify: `packages/frontend/test/exam-context-nav.test.tsx`
- Modify: `packages/frontend/test/app-semester.test.tsx`
- Test: `packages/frontend/test/mock-exam-pages.test.tsx`

- [ ] 写失败测试覆盖确认考试生成、未确认考试禁用生成、生成中禁用重复点击、生成失败重试、试卷详情 loading/error/empty 与开始尝试成功导航。
- [ ] 写失败测试覆盖“模拟考”导航链接、活跃语义与四条路由的当前学期守卫/fallback。
- [ ] 运行关联测试，确认它们在页面/路由未实现时失败。
- [ ] 实现入口和试卷页，以及仅限既有考试上下文的“模拟考”导航；不改变工作台冲刺区。
- [ ] 重跑关联测试，确认路由和入口状态通过。

### Task 4：答题、提交、并发冲突与结果页

**Files:**
- Create: `packages/frontend/src/pages/mock-exam-session-page.tsx`
- Create: `packages/frontend/src/pages/mock-exam-result-page.tsx`
- Create: `packages/frontend/src/components/mock-exam-module-analysis.tsx`
- Test: `packages/frontend/test/mock-exam-pages.test.tsx`

- [ ] 写失败测试覆盖正常答题/提交、确认摘要、提交中禁用、提交成功结果、刷新草稿恢复、`409 MOCK_EXAM_ATTEMPT_STATE_INVALID` 重取、已提交/已批改尝试不可编辑、结果/模块分析、结果缓存缺失的不可用状态、API 失败保留草稿。
- [ ] 运行该测试，确认会话/结果页未实现时失败。
- [ ] 仅按第 5 节状态流实现会话、提交、结果与模块分析；不实现重判分、S4 回流或新 API。
- [ ] 重跑该测试，确认所有上述状态通过。

### Task 5：回归、构建与人工浏览器验收

**Files:**
- Modify only when Task 1–4 的失败测试或既有项目样式入口证明有必要；任何额外文件必须先在任务执行报告中说明其与上述责任的直接关系。

- [ ] 运行 `pnpm type-check`。
- [ ] 运行 `pnpm -r --filter @ai-studybuddy/frontend run build`。
- [ ] 运行 `pnpm -r --filter @ai-studybuddy/frontend test`，再运行 `pnpm test`。
- [ ] 使用隔离 `APP_DATA_ROOT` 的本地后端和真实本地浏览器完成下节验收；不调用真实外部服务。
- [ ] 运行 `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`、`git diff --check` 与 `git diff --cached --check`。
- [ ] 完成独立实现审查后，更新 `docs/04` 的 T03 实施证据；只有合入并复验 `origin/master` 后才能勾选完成。

## 8. 获批后的浏览器验收矩阵

| 场景 | 操作 | 可观察验收 |
| --- | --- | --- |
| 首屏与未确认考试 | 进入 `/exams/:examId/mock-exam`，分别使用确认与未确认考试 | 显示考试上下文；未确认考试不发生成请求；确认考试显示生成入口。 |
| 正常生成、答题与提交 | 生成模拟卷、开始尝试、作答、确认提交 | 请求契约正确；计时和答案保存；提交后显示成绩、逐题结果与模块分析。 |
| 刷新恢复 | 在作答中刷新；在结果页刷新 | 作答答案/题号/计时从 sessionStorage 恢复并以 GET 尝试状态校验；无结果缓存的结果页显示结果不可用而不泄露内容。 |
| API 失败 | 分别使生成、详情、开始尝试、读取尝试、提交返回错误 | 显示可重试错误；未提交答案草稿不丢失；不显示伪造分数或解析。 |
| 重复提交 | 在提交中重复点击，并模拟 `409 MOCK_EXAM_ATTEMPT_STATE_INVALID` | 单一请求在途；409 后重取状态，已批改时停止编辑并提供结果入口。 |
| 已提交尝试 | 直接访问非 `in_progress` 尝试 URL | 不显示编辑控件；不写作答草稿；展示结果入口或结果不可用状态。 |
| 结果和模块分析 | 使用含答案结果、解析和多模块分析的提交响应 | 只有结果页显示正确答案/解析；模块题数、得分、正确率与弱项标志来自 DTO。 |
| 窄屏与宽屏 | 在窄屏和宽屏浏览器尺寸走完整答题与结果流程 | 导航、题目、题号控制、提交按钮和模块分析可操作、无横向遮挡和无不可达控件。 |

## 9. 独立复审检查表

- [x] 已核对 S5 PRD 已存在并登记，T01/T02 已进入 `origin/master`。
- [x] 已核对 T02 的五个端点、共享 DTO、状态机与 `409 MOCK_EXAM_ATTEMPT_STATE_INVALID` 语义。
- [x] 已确认生成入口只用既有 `getExam` 的 `courseInstanceId`、`examId` 和 T02 的可选默认输入，不假设模拟卷列表或模块标题 API。
- [x] 已将作答前题目限制为 `MockExamQuestionForStudentDto`，将答案、正确答案和解析限制到提交后结果。
- [x] 已覆盖 loading、empty、error、提交中、重复提交、已提交、刷新恢复与结果不可用。
- [x] 已明确 T02、T04–T06、S7、S3 Worker、S3/S4 写回、后端与真实外部调用均不属于 T03。
- [x] 已明确只使用 API DTO 和最小 sessionStorage 草稿，不访问 SQLite、Provider、上传/运行目录或秘密。
- [x] 已写明精确前端文件、测试路径、TDD 顺序、类型检查、构建、前端/全量测试和隔离浏览器验收。
- [x] 本计划没有占位接口、待定关键状态或模糊验收决定。

## 10. 明确非目标与后续分支建议

**非目标：**新建/修改数据库 Schema、migration、后端 API/Service、T02 生成算法、Worker、Provider、T04 临考速背、T05 冲刺计划、T06 工作台冲刺区、S7、S3 Worker、S3/S4 业务事实回写、真实 AI/QQ SMTP/飞书/中转站/Windows 计划任务 smoke、真实秘密或正式数据接入。

**实施分支建议：**用户明确批准后，从当时最新 `origin/master` 创建 `codex/phase2-t03-s5-mock-exam-frontend`。本计划任务不得创建该实现分支。