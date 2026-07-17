# Phase 1-T07 S1 时间线扩展实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增数据库结构的前提下，让 S1 时间线稳定读取并筛选既有 S1/S2/S3/S4 `StudyEvent`，并在考试工作台展示当前考试所属课程的近期学习活动。

**Architecture:** 保留既有 `study_events` 表和各子系统事务内写事件的方式，只扩展 `GET /api/timeline` 查询契约，支持重复的 `eventType` 参数与既有课程过滤组合。前端修正现有时间线 API 类型，在考试工作台独立读取当前课程最近事件，由独立展示组件负责固定事件文案、来源、时间、工作量和质量状态呈现；所有事件都不直接渲染数据库 `title`、`evidenceRef`、完整 UUID 或隐私正文。

**Tech Stack:** TypeScript、Express、better-sqlite3、React 18、Vite、现有 `useApiRequest`、`node:test` 后端集成测试、Vitest + jsdom 前端测试、Playwright 浏览器验收。

---

## 0. 当前事实、门禁与方案选择

### 0.1 门禁结论

- T07 门禁要求“至少一个新增 S3/S4 事件生产者已验收”。当前 S3 `practice_completed`、S4 `mistake_reviewed` 及 T05 的 `feedback_review_required` / `feedback_review_mastered` 均已在 `master` 实现并通过测试，门禁已满足。
- S1 基础已提供 `POST /api/study-events` 与 `GET /api/timeline`；时间线已支持学期隔离、课程过滤、倒序和 `limit=1..200`，但尚不支持事件类型过滤。
- S2、S3、S4 已直接在各自业务事务中写入 `study_events`，T07 不需要新增事件总线、队列、Worker 或跨服务 HTTP 回调。
- 当前前端已有 `getTimeline()`，但返回类型仍为 `ApiPage<unknown>`，与后端实际返回的 `StudyEventDto[]` 不一致；考试工作台尚未消费时间线。

### 0.2 本计划接入的 StudyEvent

T07 展示和回归测试覆盖当前已存在的正式事件：

| 来源 | 事件类型 | 当前生产位置 | T07 展示语义 |
| --- | --- | --- | --- |
| S1 | `assessment_attempt_confirmed` | `StudyRhythmService.confirmAssessmentAttempt()` | 考试日期已确认 |
| S1 | `study_task_completed` | `StudyRhythmService.updateTaskStatus()` | 学习任务已完成 |
| S2 | `material_note_completed` | `MaterialJobWorker` | 资料笔记已生成 |
| S2 | `knowledge_module_status_changed` | `NoteBuilderService` | 知识模块状态已更新 |
| S3 | `practice_completed` | `PracticeRunnerService` | 限时练习已完成 |
| S4 | `mistake_reviewed` | `PracticeRunnerService` 的错题重做分支 | 错题重做结果 |
| S4 | `feedback_review_required` | `FeedbackRulesService` | 知识模块需要复习 |
| S4 | `feedback_review_mastered` | `FeedbackRulesService` | 错题复习已掌握 |

`POST /api/study-events` 仍允许调用方写入任意合法来源、非空事件类型和不超过 200 字符的标题，不能据此证明某条“已知类型”事件一定来自受控生产者。因此前端对已知类型只显示固定中文文案，对未知类型显示通用“未分类学习活动”，任何类型都不渲染数据库 `title`；上表不做成数据库约束或封闭枚举。

### 0.3 方案比较与选择

1. **推荐：扩展现有时间线 API，并嵌入考试工作台。** 改动集中，复用现有数据和路由，满足 `docs/04` 的三项责任，不引入新页面或迁移。
2. **不采用：新增独立时间线路由或每日首页。** `docs/15` 只把它们列为候选，当前没有独立页面门禁；本轮新增路由会把 T07 扩大为信息架构重构。
3. **不采用：新增事件分类表、事件目录服务或 Schema migration。** 当前事件类型数量有限，查询可直接使用参数化 `IN`；新增持久化分类没有解决当前必要问题。

---

## 1. 产品与展示边界

### 1.1 时间线范围

- 时间线是学生本人查看的学习证据流，读取当前学期库中的事件；`parentVisible` 继续作为 S6 报告边界，不用于隐藏学生自己的事件。
- 考试工作台只展示“当前考试所属课程”的近期事件，不声称事件全部属于当前考试。原因是 `StudyEvent` 只有课程、任务和 `evidenceRef`，没有统一的 `assessmentAttemptId` 字段。
- 工作台默认读取最近 8 条，按后端既有 `occurred_at DESC, created_at DESC, id DESC` 顺序展示；不做分页、无限滚动、历史搜索或跨学期聚合。
- 展示事件来源、按 `eventType` 映射的固定中文文案、发生时间、可选工作量和可选质量状态。`sourceConfidence` 不作为学生主界面指标；`evidenceRef` 只用于内部证据关联，本轮不直接显示，也不据此拼接深链。
- 所有事件都不显示数据库 `title`。已知事件显示稳定固定文案，未知事件只显示来源系统、通用“未分类学习活动”和发生时间，避免开放写入接口伪装已知类型后把私密正文或完整 UUID 带入工作台。

### 1.2 API 过滤契约

- `GET /api/timeline` 新增可重复查询参数：`eventType=practice_completed&eventType=mistake_reviewed`。
- 单个或多个 `eventType` 与 `courseInstanceId` 使用 AND 组合；多个事件类型内部使用 OR/SQL `IN`。
- 每个 `eventType` 必须是 trim 后非空的字符串，但查询值保留原字符串并做精确匹配，以兼容既有 `POST /api/study-events` 会原样保存合法非空事件类型的事实。最多接收 20 个不同的精确值，完全相同的重复值去重后再计算上限；空值、纯空白、对象形态或超过上限统一返回 `TIMELINE_QUERY_INVALID`。
- 不接受逗号拼接语义，避免事件名中逗号和客户端编码产生歧义；前端使用 `URLSearchParams.append()` 逐个添加。
- 未传 `eventType` 时保持现有行为，避免破坏已有调用方。

### 1.3 与其他子系统的关系

- **S2/S3/S4：** 保持现有事务内事件写入，不改标题、证据、幂等和业务状态机；T07 只读取和展示这些事实。
- **S1：** 继续作为时间线查询和学生工作台的所有者；不把其他子系统服务依赖反向改成调用 S1 HTTP API。
- **S6：** 继续读取脱敏聚合和 `parent_visible=1` 事件生成异步报告；不修改报告生成、冻结快照、SMTP/飞书投递，也不新增家长页面。
- **S5/S7：** 保留 `sourceSystem` 既有兼容值，但未触发的子系统不新增事件生产者、不新增映射和页面。

### 1.4 明确非目标

- 不新增或修改数据库 Schema、migration、索引、触发器或事件表约束。
- 不新增 StudyEvent 生产者，不重写 S2/S3/S4/T05 已有事件写入逻辑。
- 不新增独立时间线页、每日首页、学期向导、练习历史或全局导航入口。
- 不重构考试工作台现有任务、练习、错题和考试切换结构。
- 不实现 T08 配置中心、S5、S7、Phase 3、家长面板或真实 Provider/SMTP/飞书 smoke。

---

## 2. 文件结构与职责

### 后端

- Modify: `packages/backend/src/services/study-rhythm-service.ts`
  - 解析、验证和去重 `eventType` 查询值。
  - 使用参数化 SQL 组合课程条件与事件类型 `IN` 条件。
- Modify: `packages/backend/src/api/study-rhythm.ts`
  - 将 Express 的 `req.query.eventType` 传给服务，不在路由层重复业务校验。
- Modify: `packages/backend/test/study-rhythm-api.test.mjs`
  - 覆盖单类型/多类型过滤、课程组合过滤、非法输入、顺序和学期隔离。
- Modify: `packages/backend/test/note-builder-api.test.mjs`
  - 通过 S2 正式 Worker 写入 `material_note_completed` 后，用 `/api/timeline` 读回。
- Modify: `packages/backend/test/practice-submit-api.test.mjs`
  - 通过 S3 正式提交批改写入 `practice_completed` 后，用 `/api/timeline` 读回。
- Modify: `packages/backend/test/error-fixer-t04b-api.test.mjs`
  - 通过 S4 正式错题重做写入 `mistake_reviewed` 后，用 `/api/timeline` 读回。

### 前端

- Modify: `packages/frontend/src/api/study-rhythm-api.ts`
  - 将 `getTimeline()` 返回值改为 `Promise<StudyEventDto[]>`。
  - 支持 `eventTypes?: string[]`，用重复查询参数编码。
- Create: `packages/frontend/src/components/study-event-list.tsx`
  - 负责已知事件固定文案、来源标签、时间/工作量/质量状态和空状态展示。
  - 对未知事件做通用降级；所有事件均不显示数据库标题或内部证据标识。
- Modify: `packages/frontend/src/pages/exam-workbench-page.tsx`
  - 保持既有考试/课程/任务主请求不变，再用独立 `useApiRequest` 按当前考试的 `courseInstanceId` 读取最近 8 条时间线。
  - 在工作台总览区域新增“近期学习活动”，提供局部 loading、empty、error 和 retry 状态。
  - 时间线失败不得隐藏考试、任务、练习和错题入口，也不得静默伪装为空数据。
  - 时间线请求结果携带请求时的 `courseInstanceId`；仅当它与当前考试课程一致时才渲染，切换期间隐藏旧课程事件。
- Modify: `packages/frontend/test/exam-workbench-page.test.tsx`
  - Mock `getTimeline()`，验证请求使用当前考试课程、近期活动渲染、未知事件降级、空状态和切换考试后的课程隔离。
- Modify: `packages/frontend/src/styles/global.css`
  - 为紧凑事件列表增加与现有工作台一致的列表、元信息和窄屏样式；不做全局视觉重构。

### 文档

- Modify: `docs/04-开发任务清单-Todo-List.md`
  - 实现阶段通过全部验证并合入 `master` 前，勾选 T07 三项功能和一项测试责任，登记完成证据与未实现边界。
  - 当前计划分支只登记“计划已创建并待用户批准”，不得勾选实现项。

---

## 3. 实施任务

### Task 1：先补后端失败测试

**Files:**

- Modify: `packages/backend/test/study-rhythm-api.test.mjs`
- Modify: `packages/backend/test/note-builder-api.test.mjs`
- Modify: `packages/backend/test/practice-submit-api.test.mjs`
- Modify: `packages/backend/test/error-fixer-t04b-api.test.mjs`

- [ ] **Step 1: 写单类型与多类型过滤失败测试**

在 S1 时间线测试中使用两个课程和两个学期，并写入不同来源/类型的最小事件夹具，确保过滤不是只靠标题断言。

验证：

```text
eventType=practice_completed
eventType=material_note_completed&eventType=mistake_reviewed
courseInstanceId=<course-a>&eventType=practice_completed&eventType=mistake_reviewed
```

返回值只包含请求类型，仍保持倒序，且不泄漏另一课程或另一学期事件。

- [ ] **Step 2: 写兼容、重复值与非法查询失败测试**

覆盖：

- 带首尾空格和超过 64 字符的既有合法事件类型仍可按原值精确过滤；
- 完全相同的重复参数被去重，结果不重复，且上限按去重后数量计算；
- 空字符串、纯空白、21 个不同精确值和对象形态返回 HTTP 400 与 `TIMELINE_QUERY_INVALID`。

- [ ] **Step 3: 补正式生产路径的读回断言**

- S2 Worker 完成笔记生成后，先加入另一类型干扰事件，再以 `eventType=material_note_completed` 请求 `/api/timeline`，断言只读到 S2 正式事件、`sourceSystem=S2`、正确课程和 `material:<id>` 证据。
- S3 普通练习提交批改后，先加入另一类型干扰事件，再以 `eventType=practice_completed` 请求 `/api/timeline`，断言只读到正式练习事件、工作量和 `practice_session:<id>` 证据。
- S4 错题重做提交后，先加入另一类型干扰事件，再以 `eventType=mistake_reviewed` 请求 `/api/timeline`，断言只读到正式改错事件、正确课程和 `mistake:<id>` 证据，且标题不含题干正文。

这些测试必须使用各自既有正式 API/Worker 路径产生事件，不在测试中直接伪造对应事件。

- [ ] **Step 4: 运行专项测试确认失败**

Run:

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t07-backend-red'
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/study-rhythm-api.test.mjs test/note-builder-api.test.mjs test/practice-submit-api.test.mjs test/error-fixer-t04b-api.test.mjs
```

Expected: 新增事件类型过滤断言失败；S2/S3/S4 正式生产者的既有写入断言通过，新增 `/api/timeline` 读回断言在契约尚未完成处暴露失败。

### Task 2：实现时间线事件类型过滤

**Files:**

- Modify: `packages/backend/src/services/study-rhythm-service.ts`
- Modify: `packages/backend/src/api/study-rhythm.ts`
- Test: `packages/backend/test/study-rhythm-api.test.mjs`
- Test: `packages/backend/test/note-builder-api.test.mjs`
- Test: `packages/backend/test/practice-submit-api.test.mjs`
- Test: `packages/backend/test/error-fixer-t04b-api.test.mjs`

- [ ] **Step 1: 扩展服务签名与验证**

将 `getTimeline()` 扩展为接收 `eventTypeInput?: unknown`。规范化 `string | string[]`，用 trim 只判断是否非空，保留原字符串做精确匹配；按完全相同值去重后限制最多 20 个，其他形态抛出 `TIMELINE_QUERY_INVALID`。不要在 T07 顺带修改既有事件写入端或历史事件值。

- [ ] **Step 2: 参数化组合 SQL**

用条件数组生成 `WHERE`：课程条件与 `event_type IN (?, ...)` 同时存在时使用 `AND`；不得拼接事件值本身。保留既有排序和 limit 行为。

- [ ] **Step 3: 路由透传参数**

`GET /api/timeline` 调用服务时传入 `req.query.eventType`；继续返回统一 `{ success, data, error }` 信封。

- [ ] **Step 4: 运行后端专项回归**

Run:

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t07-backend-green'
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/study-rhythm-api.test.mjs test/note-builder-api.test.mjs test/practice-submit-api.test.mjs test/error-fixer-t04b-api.test.mjs
```

Expected: T07 新增过滤测试、S2/S3/S4 正式事件写入后通过时间线读回的断言，以及全部既有专项测试通过。

- [ ] **Step 5: 提交后端契约**

```powershell
git add packages/backend/src/services/study-rhythm-service.ts packages/backend/src/api/study-rhythm.ts packages/backend/test/study-rhythm-api.test.mjs packages/backend/test/note-builder-api.test.mjs packages/backend/test/practice-submit-api.test.mjs packages/backend/test/error-fixer-t04b-api.test.mjs
git diff --cached --check
git commit -m "feat(phase1): 扩展 S1 时间线查询"
```

### Task 3：先补前端失败测试

**Files:**

- Modify: `packages/frontend/test/exam-workbench-page.test.tsx`

- [ ] **Step 1: 为时间线请求增加 Mock**

返回包含 S2 `material_note_completed`、S3 `practice_completed`、S4 `mistake_reviewed`、S1 `study_task_completed` 和一个未知事件类型的 `StudyEventDto[]`；为已知和未知事件都放入包含聊天正文、资料正文和完整 UUID 的恶意 `title`，验证组件不会渲染它们。

- [ ] **Step 2: 写工作台展示失败测试**

验证工作台：

- 以当前考试的 `courseInstanceId` 和 `limit: 8` 调用 `getTimeline()`；
- 展示来源、类型固定文案、时间、可选工作量与质量状态；
- 不展示 `evidenceRef` 或完整 UUID；
- 已知和未知事件均不渲染数据库 `title`；未知事件显示通用“未分类学习活动”而不崩溃；
- 空数组显示“暂无近期学习活动”。
- 时间线请求失败只在活动区显示错误和重试按钮，考试标题、任务和学习入口继续可用。

- [ ] **Step 3: 写考试切换隔离失败测试**

切换到另一考试路由后，断言重新按新考试课程请求时间线；在新请求完成前活动区显示 loading 或空占位，不渲染旧课程事件，完成后只显示新课程事件。

- [ ] **Step 4: 运行前端专项测试确认失败**

Run:

```powershell
pnpm --filter @ai-studybuddy/frontend exec vitest run test/exam-workbench-page.test.tsx
```

Expected: 新增近期活动断言失败，既有考试工作台断言仍通过。

### Task 4：实现前端近期学习活动

**Files:**

- Modify: `packages/frontend/src/api/study-rhythm-api.ts`
- Create: `packages/frontend/src/components/study-event-list.tsx`
- Modify: `packages/frontend/src/pages/exam-workbench-page.tsx`
- Modify: `packages/frontend/src/styles/global.css`
- Test: `packages/frontend/test/exam-workbench-page.test.tsx`

- [ ] **Step 1: 修正 API 类型与查询编码**

从 shared 导入 `StudyEventDto`；`getTimeline()` 改用 `request<StudyEventDto[]>()`，选项增加 `eventTypes?: string[]`，逐个 `params.append('eventType', value)`。

- [ ] **Step 2: 实现纯展示组件**

`StudyEventList` 接收 `events: StudyEventDto[]`。已知事件固定文案按本计划 §0.2 映射；来源显示 S1“学习节奏”、S2“资料笔记”、S3“限时练习”、S4“错题改错”，S5/S7 保留通用子系统名。时间用本地日期时间格式，工作量仅在存在时显示，质量状态只显示“已通过/待检查/未通过”。组件不得读取或渲染任何事件的 `title`；未知事件统一显示“未分类学习活动”。

- [ ] **Step 3: 接入考试工作台数据流**

保持考试、课程、考试列表和任务的主 `useApiRequest` 不变；增加第二个时间线 `useApiRequest`，其 fetcher 在当前考试不存在时返回 `{ courseInstanceId: null, events: [] }`，存在时返回请求课程 ID 和最近 8 条事件。时间线区独立处理 loading/error/refetch；只有结果中的课程 ID 与当前考试课程一致时才渲染，否则显示 loading/空占位。切换 `examId` 或课程时取消旧请求并重取，不能让次要请求失败覆盖主工作台数据。

- [ ] **Step 4: 增加紧凑响应式样式**

事件列表使用稳定的时间列/内容列约束；窄屏改为纵向元信息，不让较长固定文案、状态或时间与相邻内容重叠。保持现有卡片半径、颜色和排版 token。

- [ ] **Step 5: 运行前端专项测试**

Run:

```powershell
pnpm --filter @ai-studybuddy/frontend exec vitest run test/exam-workbench-page.test.tsx
```

Expected: 考试工作台既有测试和 T07 近期活动测试全部通过。

- [ ] **Step 6: 提交前端展示**

```powershell
git add packages/frontend/src/api/study-rhythm-api.ts packages/frontend/src/components/study-event-list.tsx packages/frontend/src/pages/exam-workbench-page.tsx packages/frontend/src/styles/global.css packages/frontend/test/exam-workbench-page.test.tsx
git diff --cached --check
git commit -m "feat(phase1): 展示课程近期学习活动"
```

### Task 5：跨子系统回归与浏览器验收

**Files:** none

- [ ] **Step 1: 运行类型、构建与全量测试**

Run:

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t07-full'
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

Expected: TypeScript 零错误，前后端构建通过，全部后端与前端测试通过；记录实际测试数量。既存 Vite chunk 大小警告可记录，但不得出现新增 build error。

- [ ] **Step 2: 执行隔离浏览器验收**

使用隔离 `APP_DATA_ROOT` 启动后端和前端，在真实 Chromium/Edge 中完成：

1. 创建课程和已确认考试，进入考试工作台；
2. 使用隔离 HTTP 夹具通过既有 `POST /api/study-events` 写入受控的 S2/S3/S4 展示事件；生产者真实写入与过滤读回由 Task 1 的后端正式路径测试负责，不依赖真实 Provider，也不新增 seed 工具；
3. 刷新工作台，确认活动按时间倒序、仅显示当前课程、各来源标签可读；
4. 切换另一门课程的考试，确认旧课程事件不出现；
5. 验证空状态、时间线 API 失败时主工作台仍可用、局部重试恢复、宽屏与窄屏无文本重叠。

截图和运行数据只保存到 `I:\ai-studybuddy-tmp\runs\phase1-t07-browser`，不得提交仓库。

### Task 6：文档同步、审查和交付

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`

- [ ] **Step 1: 独立代码与文档审查**

重点检查：事件过滤 SQL 参数化、查询值上限、课程/学期隔离、未知事件降级、隐私字段不展示、工作台错误状态、窄屏布局和未越权触发未来任务。修复后重跑受影响测试。

- [ ] **Step 2: 更新 T07 完成状态**

仅当实现、验证、审查均通过并准备按规则合入 `master` 时，勾选 `docs/04` T07 四项，并登记日期、任务分支、提交、验证数量、浏览器证据摘要和未实现边界。

- [ ] **Step 3: 运行治理与 diff 检查**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

Expected: 文档治理通过，两个 diff 检查无输出。

- [ ] **Step 4: 提交文档收尾**

```powershell
git add docs/04-开发任务清单-Todo-List.md
git diff --cached --check
git commit -m "docs(phase1): 登记 T07 时间线扩展证据"
```

- [ ] **Step 5: 按仓库规则快进合并并在 master 复验**

实现分支必须先 rebase 最新 `origin/master`，再由主 checkout 快进合并；合并后在 `master` 重跑 Task 5 的验证与文档治理，通过后才推送 `origin/master`。不能快进、出现冲突或验证失败时立即停止，不强行合并。

---

## 4. 计划分支、审批与提交边界

- 计划分支：`codex/phase1-t07-timeline-plan`。
- 本计划任务只允许提交：
  - `.plans/phase1-t07-timeline-plan.md`
  - `docs/04-开发任务清单-Todo-List.md` 中的 T07 计划待批证据
- 当前计划分支不得修改 `packages/backend/*`、`packages/frontend/*`、`packages/shared/*`、数据库 Schema、migration、依赖或锁文件。
- 计划提交信息：`docs(phase1): 制定 T07 时间线扩展计划`。
- 计划可推送任务分支用于备份和审查，但不合入 `master`，也不代表 T07 已实现。
- 用户明确批准后，从最新 `master` 创建独立实现分支：`codex/phase1-t07-timeline`。实施前必须重新核对 `master` 和本计划是否有新变更。

---

## 5. 计划自审清单

- [x] 门禁已满足：S3/S4 正式事件生产者已验收。
- [x] 覆盖 S1/S2/S3/S4 当前正式 StudyEvent，并为未知事件保留降级路径。
- [x] API 事件类型过滤定义了重复参数、组合语义、验证上限和参数化 SQL 边界。
- [x] 过滤保留既有写入端的原值语义，覆盖空白边界、长事件类型和重复参数兼容。
- [x] 时间线明确为当前考试所属课程活动，不虚构统一考试归属。
- [x] 所有事件都不渲染数据库标题，未知事件使用固定降级文案；考试切换期间不显示旧课程事件。
- [x] 明确学生时间线与 S6 `parentVisible` 的职责差异，不修改家长报告或渠道。
- [x] 明确不新增 Schema、生产者、独立页面、全局导航或未来子系统。
- [x] 包含后端集成测试、前端组件测试、全量验证、真实浏览器验收、文档治理和 diff 检查。
- [x] 当前分支只写计划和计划待批证据，不写业务代码。
