# Phase 1-T09C：课程/课表与考试目标完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 计划已创建、已独立复审、等待用户明确批准；实现未启动。
**任务：** `Phase 1-T09C：课程课表与考试目标完善`
**计划分支：** `codex/phase1-t09c-course-schedule-exam-goals-plan`（本文件所在分支）
**预定实施分支：** 仅在获批后，从届时最新的 `origin/master` 创建 `codex/phase1-t09c-course-schedule-exam-goals`。
**基线：** `origin/master` @ `1da776f`（2026-07-18，已包含 T09B 主线收尾）
**关联任务：** 复用已完成的 T09A 学期 current/隔离能力、T09B 当前学期读取模型和 T11 考试确认/工作台语义；T09D、T09E 与后续阶段均未启动。

**目标：** 在既有 `/courses` 页面内完成当前已创建学期的课程名称编辑、完整周课表查看和条目人工维护、考试名称/日期/目标编辑，以及仅对已确认考试显示的正式倒计时。

**架构：** 所有业务读写继续由应用壳提供的显式 `semesterId` 驱动，后端先打开 ready 学期库并校验课程、课表条目或考试归属，再执行操作。`schedule_entries` 继续是唯一课表事实源，使用既有 v8 约束和 `student_confirmed` 来源语义；不新增课表 schema 或第二张课表表。已确认考试发生日期变化时，在同一事务记录既有日期变更历史并恢复为待确认，只有重新确认后才重新进入正式倒计时；仅编辑目标文本不得改变确认状态。

**技术栈：** Express 4、better-sqlite3、既有学期数据库 migration v8、React/Vite/React Router、共享 TypeScript DTO、Node `node:test` 真实 SQLite API 集成测试、Vitest 组件测试、Playwright；不调用真实 AI、SMTP、飞书或其他外部渠道。

---

## 0. 门禁、事实来源与范围

### 0.1 当前门禁

1. `docs/04-开发任务清单-Todo-List.md` 已登记 T09C；本文件仅完成计划登记与独立复审，尚未获得用户实施批准。
2. 在用户明确批准前，禁止创建预定实施分支，禁止改动任何 `packages/`、`e2e/` 或业务数据库代码，禁止把计划分支推送表述为功能完成。
3. 获批时必须先执行：`git fetch origin`，确认届时 `origin/master`，再从该最新基线创建 `codex/phase1-t09c-course-schedule-exam-goals`；不得从本计划分支继续写实现。
4. 产品事实以 `docs/01-总PRD-产品需求-Product-Requirements.md`、`docs/02-七子系统地图-Scenario-Systems.md` 和 S1 PRD 为准；工程边界以 `docs/08`、`docs/10`、`docs/11`、`docs/12` 为准。

### 0.2 本任务做与不做

| 范围       | T09C 结论                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 课程       | 在当前 `/courses` 体验中读取当前学期课程并允许编辑**课程名称**；不删除课程、不变更重修关联。                                                                                 |
| 周课表     | 使用已有 `schedule_entries` 展示完整周（`weekday: 0..6`）课表；支持新增、编辑、移除单个课表条目。                                                                            |
| 考试       | 编辑已有考试的名称、日期和目标文本；展示已确认考试的倒计时；日期改动按 T11 确认语义重新进入待确认。                                                                          |
| 学期与隔离 | 复用 T09A current semester 恢复、应用壳的显式 `semesterId` 和 ready 学期校验；不新增学期选择器、浏览器持久化或跨学期读取。                                                   |
| API        | 扩展课程编辑、课表条目读写和考试编辑 API，所有响应保持 `{ success, data, error }`。                                                                                          |
| 不做       | 不做课程或考试删除、学期归档、历史列表、跨学期汇总、全局导航或响应式收尾（T09D）、练习历史或归档（T09E）、S5/S7、家长 Web 面板、云同步/多用户、复杂排程、AI 或真实渠道验证。 |

### 0.3 不变量和失败语义

1. 每一个读写入口先通过既有 ready/current 学期边界打开 `semesterId` 对应库；任何无效、不可选择、非 ready 或 stale 的学期都不得回退到另一学期。
2. 所有资源操作均验证路径资源属于该 `semesterId`：课程、考试及课表条目 ID 不能跨学期读写。未找到或归属不符必须返回既有安全的资源不存在/不可操作错误，不泄露另一学期名称、日期、路径或完整 UUID。
3. `schedule_entries` 是唯一课表事实源，遵循 migration v8 的 `weekday`、时间、来源和唯一性校验；不得新建 schema、视图表或并行缓存。学生的新增与编辑写入既有 `source='student_confirmed'` 语义。
4. API 对缺少字段、空白课程名/考试名、非法日期、`weekday` 非 `0..6`、非法或倒置时间、无效地点、违反既有课表唯一约束的重复时段返回可展示的 4xx 错误；数据库唯一冲突必须转换为稳定的业务错误，不得暴露 SQLite 原文。
5. 更新考试时，若 `examAt` 的实际值变化且该考试原为 `confirmed`：同一事务写入 `assessment_date_changes` 的既有日期变更历史，将确认状态设回 `pending`，清空 `confirmedAt`；任何正式倒计时立即消失，直至复用 T11 既有确认 API 重新确认。仅编辑 `goal`（或不改变日期的名称编辑）不得改变 `confirmationStatus` 或 `confirmedAt`。
6. 前端切换学期、刷新恢复、请求中止或响应晚到时必须取消/忽略旧 `semesterId` 响应并重置表单与局部成功/错误状态，不能短暂显示旧学期课程、课表或考试。
7. 页面、测试截图、日志和文档不得保存真实考试名称、课程资料原文、完整 UUID、绝对数据路径、API Key 或渠道地址；验证数据根必须隔离在仓库外。

### 0.4 预定 API 与共享 DTO 契约

实现时沿用 `packages/backend/src/api/study-rhythm.ts` 的路由挂载和统一错误处理，所有成功与失败均使用标准信封。以下为必须实现/扩展的契约；准确错误码沿用现有 API 错误体系，但语义不得弱于本表。

| 方法与路径                                        | 成功 `data`                                                                  | 输入与失败语义                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/courses/:id`                          | 更新后的 `CourseInstanceDto`                                                 | JSON `{ semesterId, name }`；仅更新名称。空白名称为 400；课程不存在或不属于该学期为安全的 404/不可操作错误。                                                  |
| `GET /api/schedule-entries?semesterId=...`        | 按 `weekday`、`startTime`、稳定次序返回 `ScheduleEntryDto[]`，含课程展示名称 | 无当前/非 ready 学期失败；结果绝不混入其他学期。                                                                                                              |
| `POST /api/schedule-entries`                      | 新建的 `ScheduleEntryDto`                                                    | `{ semesterId, courseInstanceId, weekday, startTime, endTime, location }`；服务端校验课程归属、时间/地点、v8 约束和重复时段，手工来源为 `student_confirmed`。 |
| `PATCH /api/schedule-entries/:id`                 | 更新后的 `ScheduleEntryDto`                                                  | 请求显式包含 `semesterId` 和可编辑字段；先验证条目及目标课程归属，再校验规则；不能借 ID 跨学期移动/读取条目。                                                 |
| `DELETE /api/schedule-entries/:id?semesterId=...` | 被移除条目的最小确认 DTO 或 `{ id }`                                         | 只删除该当前学期中的单个课表条目；不存在/跨学期失败，不删除课程或考试。                                                                                       |
| `PATCH /api/exams/:id`                            | 更新后的 `AssessmentAttemptDto`                                              | JSON `{ semesterId, name?, examAt?, goal? }`；至少有一个允许字段。日期变化按本节第 5 条写历史并重新变为 `pending`；仅目标文本变化保持原确认状态。             |

预定共享类型扩展（字段名在实施前后必须保持一致）：

```ts
export interface ScheduleEntryDto {
  id: string;
  semesterId: string;
  courseInstanceId: string;
  courseName: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  location?: string;
  source?: string; // 新增或人工编辑后必须由服务端写为 'student_confirmed'
  sourceConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCourseRequest {
  semesterId: string;
  name: string;
}

export interface UpsertScheduleEntryRequest {
  semesterId: string;
  courseInstanceId: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface UpdateExamRequest {
  semesterId: string;
  name?: string;
  examAt?: string;
  goal?: string;
}
```

---

## 1. 获批后的实施任务清单

### Task 1：定义共享 DTO 与 API 客户端边界

**Files:**

- Modify: `packages/shared/src/types.ts`
- Modify: `packages/frontend/src/api/study-rhythm-api.ts`
- Test: `packages/frontend/test/course-page.test.tsx`

- [ ] **Step 1: 先写共享类型和前端 API 客户端的失败测试。**

  在现有 mock 模块中增加 `updateCourse`、`getScheduleEntries`、`createScheduleEntry`、`updateScheduleEntry`、`deleteScheduleEntry`、`updateExam`。断言每个请求把 `semesterId` 放在约定的 query/body 位置、以 JSON 发送写请求，并由既有 `request()` 解包 `{ success, data, error }`；服务端失败时 Promise 拒绝并能在页面留出重试入口。

  Run:

  ```powershell
  pnpm --filter @ai-studybuddy/frontend test -- course-page.test.tsx
  ```

  Expected: 新断言在 API 函数和页面行为未实现前失败。

- [ ] **Step 2: 在 `packages/shared/src/types.ts` 增加 `ScheduleEntryDto` 和四个请求 DTO。**

  使用本计划 0.4 的字段；`AssessmentAttemptDto` 继续承载更新后考试，不复制考试 DTO。不要新增 migration 类型或第二套课表模型。

- [ ] **Step 3: 在 `packages/frontend/src/api/study-rhythm-api.ts` 增加精确的 API 函数。**

  函数签名固定为：

  ```ts
  updateCourse(semesterId: string, courseId: string, data: { name: string }, signal?: AbortSignal)
  getScheduleEntries(semesterId: string, signal?: AbortSignal)
  createScheduleEntry(data: UpsertScheduleEntryRequest, signal?: AbortSignal)
  updateScheduleEntry(semesterId: string, entryId: string, data: Omit<UpsertScheduleEntryRequest, 'semesterId'>, signal?: AbortSignal)
  deleteScheduleEntry(semesterId: string, entryId: string, signal?: AbortSignal)
  updateExam(semesterId: string, examId: string, data: Omit<UpdateExamRequest, 'semesterId'>, signal?: AbortSignal)
  ```

  所有 URL 参数经 `encodeURIComponent` 或 `URLSearchParams` 编码，调用既有 `request<T>()`，不让组件自行拼接 API 信封。

- [ ] **Step 4: 重跑前端定向测试并确认成功。**

  Run:

  ```powershell
  pnpm --filter @ai-studybuddy/frontend test -- course-page.test.tsx
  ```

  Expected: API 调用约定和失败传播断言通过；不访问真实后端。

### Task 2：在既有服务和路由中实现受学期约束的写入 API

**Files:**

- Modify: `packages/backend/src/services/study-rhythm-service.ts`
- Modify: `packages/backend/src/api/study-rhythm.ts`
- Test: `packages/backend/test/study-rhythm-api.test.mjs`

- [ ] **Step 1: 为课程编辑、课表读写与考试编辑增加真实 SQLite API 失败测试。**

  在既有测试 harness 中创建两个 ready 学期、各自课程/考试/课表数据。先断言：课程、考试、课表 ID 传给另一学期会失败；非法 `weekday`、时间、地点与重复时段失败；确认考试日期变化前历史为空，变化后历史新增、考试变为 `pending`、`confirmedAt` 为空；只改目标保持 `confirmed` 与原 `confirmedAt`。

  Run:

  ```powershell
  pnpm --filter @ai-studybuddy/backend test -- study-rhythm-api.test.mjs
  ```

  Expected: 新 API 尚未注册或服务方法不存在时失败。

- [ ] **Step 2: 在 `StudyRhythmService` 实现显式 `semesterId` 的领域方法。**

  在复用 `openReadySemesterDb`、`requireCourse`、`requireExam` 和现有 DTO 映射的前提下实现：`updateCourse`、`listScheduleEntries`、`createScheduleEntry`、`updateScheduleEntry`、`deleteScheduleEntry`、`updateExam`。每个方法先做输入校验和归属校验；读课表时 join 课程仅为展示名称，写入仍只写 `schedule_entries`。

  考试日期变更必须使用一个 SQLite transaction，按以下顺序执行：读取原考试 → 比较规范化后的日期值 → 对确认考试插入既有 `assessment_date_changes` 记录 → 更新考试日期、名称/目标 → 在日期确有变化时写入 `confirmation_status='pending'` 与 `confirmed_at=NULL` → 返回 `AssessmentAttemptDto`。若任何步骤失败，历史和考试状态必须一起回滚。

- [ ] **Step 3: 注册路由并保持统一错误信封。**

  在 `packages/backend/src/api/study-rhythm.ts` 加入 Task 0.4 六个路由；调用服务方法而不在路由复制 SQL。成功使用既有 `res.json({ success: true, data })` 形状；校验/归属/唯一性错误交给既有错误转换器输出安全 4xx 信封。不得返回 `semester.db` 路径、SQLite 语句、stack、OCR 原文或其他学期内容。

- [ ] **Step 4: 通过真实 SQLite 定向测试。**

  Run:

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09c-course-schedule-exam-goals-api'
  pnpm --filter @ai-studybuddy/backend test -- study-rhythm-api.test.mjs
  ```

  Expected: 双学期隔离、全部读写、无效输入、重复时段、确认日期变更历史和目标编辑确认态测试通过。

### Task 3：扩展 `/courses` 的当前学期课程、课表和考试编辑体验

**Files:**

- Modify: `packages/frontend/src/pages/course-page.tsx`
- Modify: `packages/frontend/src/styles/global.css`
- Modify: `packages/frontend/test/course-page.test.tsx`

- [ ] **Step 1: 为页面状态写失败组件测试。**

  覆盖：课程名编辑成功和失败重试；完整周课表加载、空课表、条目新增/编辑/移除成功和失败重试；无考试；考试名称/日期/目标编辑；已确认考试显示倒计时；确认考试日期改动后显示“等待重新确认”而非正式倒计时；只改目标不误改已确认状态；无当前学期、加载和 semester 切换时旧数据不残留。

- [ ] **Step 2: 用单一、取消安全的加载流程读取当前学期数据。**

  继续由现有应用壳传入 `semesterId`；页面同时获取课程、考试和课表。每次 `semesterId` 变化时创建新的 `AbortController`，清空旧课程/课表/表单/成功反馈/局部错误；清理函数 abort 前一请求。没有 `semesterId` 时只显示既有当前学期引导，不调用业务 API。

- [ ] **Step 3: 实现课程编辑和完整周课表 UI。**

  课程项提供名称编辑、保存、取消、提交中和就地失败/重试。周课表固定展示周日到周六七个栏目或等价的完整列表，空日和全空课表都有清楚引导；条目表单只接受课程、星期、开始/结束时间和地点。新增/编辑/移除都调用 Task 1 API，服务端失败显示在对应条目/表单旁并保留可修正输入；移除只针对单个条目，不显示课程/考试删除能力。

- [ ] **Step 4: 实现考试编辑、确认边界和倒计时。**

  每个考试可编辑名称、日期、目标。更新成功后采用服务端返回 DTO 刷新该考试；日期变化导致 `pending` 时，明确提示需要再次使用既有“确认考试日期”操作，且不显示正式倒计时；`confirmed` 考试才显示以本机日期计算的倒计时。仅改变目标文本后，依据服务端返回状态继续显示原确认态及倒计时。复用现有考试工作台链接和确认 API，不重写 T11 工作台。

- [ ] **Step 5: 运行定向组件测试。**

  Run:

  ```powershell
  pnpm --filter @ai-studybuddy/frontend test -- course-page.test.tsx
  ```

  Expected: 加载、空、成功、错误/重试、确认态、倒计时与跨学期清屏断言全部通过。

### Task 4：补齐后端真实 SQLite 隔离和回归测试

**Files:**

- Modify: `packages/backend/test/study-rhythm-api.test.mjs`

- [ ] **Step 1: 以两个独立 ready 学期构造回归夹具。**

  每个学期各有课程、考试和一个 `schedule_entries` 条目；夹具仅使用合成名称和测试 UUID，不写入真实学生资料。测试调用 public HTTP API，而非 mock 服务或 mock DB。

- [ ] **Step 2: 覆盖资源归属与非法输入矩阵。**

  对课程编辑、课表 GET/POST/PATCH/DELETE、考试 PATCH 分别使用另一学期 ID；断言失败信封和另一学期数据库未变。对 `weekday=-1/7`、无效时间格式、结束早于开始、空/超规则地点、重复时段、空课程/考试名称、无效考试日期断言失败且无部分写入。

- [ ] **Step 3: 覆盖考试确认重置的事务性。**

  确认一个考试，改变日期，断言 `assessment_date_changes` 有一次正确的旧/新日期记录、返回 DTO 为 `pending` 且无 `confirmedAt`；调用现有确认 API 后断言重新为 `confirmed`。随后仅改 `goal`，断言日期历史不增加、确认状态和确认时间不变。

- [ ] **Step 4: 运行后端整个测试集。**

  Run:

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09c-course-schedule-exam-goals-test'
  pnpm --filter @ai-studybuddy/backend test
  ```

  Expected: 现有 S1/S2/S3/S4/S6、T07、T09A、T09B 与新增 T09C 后端用例一起通过。

### Task 5：执行隔离 Playwright E2E 并进行浏览器验收

**Files:**

- Create: `e2e/course-schedule-exam-goals.spec.ts`
- Modify only if required by existing test convention: `playwright.config.ts`

- [ ] **Step 1: 新增专项 E2E。**

  以 UI/API 建立两个可选择学期，选中第一个学期后：创建或使用合成课程，编辑课程名；新增、编辑、移除课表条目；创建/编辑考试目标；确认考试并验证倒计时；改变确认后的日期并验证待重新确认与无正式倒计时；重新确认后恢复倒计时。切换到第二学期并刷新，断言第一个学期的课程、课表和考试名称都不可见；用第一个学期 ID 的 API 请求断言失败。

- [ ] **Step 2: 覆盖用户可见的非成功状态。**

  E2E 或组件层至少证明：无当前学期跳转/引导、空课表、无考试、加载反馈、服务端失败的可见错误与重试、表单校验错误。截图、trace、HTML report 只写入隔离数据根，不提交仓库。

- [ ] **Step 3: 使用指定隔离目录运行专项 E2E。**

  Run:

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09c-course-schedule-exam-goals'
  pnpm exec playwright test e2e/course-schedule-exam-goals.spec.ts
  ```

  Expected: 专项 Playwright 通过；没有外部 Provider、SMTP 或飞书请求。

### Task 6：实施收尾、独立代码复审与主线复验（仅获批后）

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify only when证据状态确有变化: `docs/00-文档索引-Index.md`
- Modify: `.plans/phase1-t09c-course-schedule-exam-goals-plan.md`

- [ ] **Step 1: 在任务分支完成独立代码复审。**

  重点逐项检查：T09C 没有带入 T09D 全局导航/响应式收尾或 T09E 历史归档；无新课表 schema；所有路由都有 ready/归属检查；日期变更历史与确认重置是事务；`student_confirmed` 来源正确；页面不泄漏 stale semester；错误与日志不泄露隐私；测试不是 mock DB 替代真实 SQLite。

- [ ] **Step 2: 在隔离数据根运行完整验证。**

  Run:

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09c-course-schedule-exam-goals'
  pnpm type-check
  pnpm -r --filter @ai-studybuddy/backend run build
  pnpm -r --filter @ai-studybuddy/frontend run build
  pnpm test
  pnpm exec playwright test e2e/course-schedule-exam-goals.spec.ts
  pnpm test:e2e
  powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
  git diff --check
  ```

  Expected: 全部通过；既有 KaTeX 体积 warning 如仍存在，仅如实记录为独立遗留，不在 T09C 顺带处理。

- [ ] **Step 3: 真实浏览器验收。**

  在隔离根启动本机应用，人工覆盖当前学期恢复、加载、空课表、无考试、成功反馈、失败/重试、刷新、两学期切换隔离、已确认倒计时和日期变更后的重新确认。证据保存到 `I:\ai-studybuddy-tmp\runs\phase1-t09c-course-schedule-exam-goals\playwright` 或相邻仓库外目录，并仅在 `docs/04` 记录脱敏命令/摘要。

- [ ] **Step 4: 同步任务清单并执行固定主线流程。**

  仅在任务范围、验证和复审均通过后，更新 `docs/04` 勾选 T09C 实际完成项、验证命令/结果、任务分支提交和未实现边界；需要时才同步 `docs/00`。随后严格执行：

  ```powershell
  git fetch origin
  git checkout codex/phase1-t09c-course-schedule-exam-goals
  git rebase origin/master
  git checkout master
  git pull --ff-only origin master
  git merge --ff-only codex/phase1-t09c-course-schedule-exam-goals
  ```

  若 rebase、快进合并或复验任一失败立即停止；不得强推、`reset --hard` 或跳过冲突。

- [ ] **Step 5: 在 `master` 重新运行 Task 6 Step 2 适用验证后推送。**

  只有 `git push origin master` 成功且 `origin/master` 包含合并提交，才能报告 T09C 功能完成。任务分支推送、局部测试或计划提交均不构成功能完成。

---

## 2. 预定验收矩阵

| 场景           | 必须证明的结果                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 两学期隔离     | 两个学期的课程、课表和考试互斥；任一另一学期资源 ID 的读写都安全失败，切换或刷新不显示旧内容。                        |
| 课程编辑       | 当前学期课程名称可保存、失败可重试；空白名称失败；没有课程删除入口。                                                  |
| 课表维护       | 显示完整七日；可新增、编辑、移除一个条目；非法星期/时间/地点和 migration v8 的重复时段失败，失败不产生部分数据。      |
| 考试编辑       | 可编辑名称、日期、目标；目标文本可为空或按现有规则处理；无考试时有下一步引导。                                        |
| 确认与倒计时   | 仅 `confirmed` 显示正式倒计时；确认后改日期写历史、变 `pending`、清除确认时间、要求重新确认；仅改目标不改变确认状态。 |
| 页面状态       | 覆盖加载、无当前学期、空课表、无考试、保存成功、服务端失败和重试；所有反馈就近可见且不会因切换学期遗留。              |
| 自动化验证     | 真实 SQLite API 集成测试、前端组件测试、指定 `APP_DATA_ROOT` 专项 E2E 和合入 `master` 后的全量 E2E 均通过。           |
| 隐私与外部依赖 | 合成测试数据、仓库外证据目录；无真实 AI/SMTP/飞书调用、无秘密或资料原文进入响应/日志/提交。                           |

---

## 3. 实施提交、文档和交付规则（获批后）

1. 计划分支只承载本文件和本次 `docs/04` 计划状态；绝不在其上写业务代码或作为实现分支。
2. 实现分支每次提交使用 `type(scope): 中文描述`，采用显式路径暂存，提交前运行 `git diff --cached --check`；不使用 `git add -A` 吸纳无关文件。
3. 实施完成前，`docs/04` 只允许表述实际事实。未验证、仅在分支、已推分支、已合入本地 `master`、已推 `origin/master` 必须分开记录。
4. 最终交付必须写清：任务分支、每个关键提交哈希、是否已推任务分支、是否已 fast-forward 合入 `master`、是否已推 `origin/master`、`docs/04` 更新位置、验证结果与明确未实现边界。

---

## 4. 计划完成判定（本文件阶段）

本计划门禁仅在以下事项全部成立时结束：

- 本文件覆盖 T09C 范围、API/DTO、后端、前端、真实 SQLite、组件测试、隔离 E2E、隐私、文档收尾和主线复验；
- 独立复审确认没有混入 T09D、T09E 或其他阶段；
- `docs/04` 的 T09C 任务行和“Phase 1 行动计划索引”登记为“独立计划已创建、已独立复审、等待用户明确批准；实现未启动”；
- 文档治理、工作区 `git diff --check` 和暂存区 `git diff --cached --check` 通过；
- 仅本文件和 `docs/04` 已在计划分支提交并推送；
- 完成后立即停止，等待用户明确批准；尚未创建实施分支、尚未修改业务代码、尚未合入 `master`。

---

## 5. 独立计划复审记录（2026-07-18）

**复审方式：** 在完成计划初稿后，按 `docs/01`、`docs/02`、S1 PRD、`docs/08`、`docs/10`、`docs/11`、`docs/12`、T09A/T09B 计划和 T11 现有 API/DTO进行 fresh-pass 自审；不把实现方案的原始假设视为已验证事实。

**结论：** 通过。计划可登记为“等待用户明确批准”；用户批准前不得实施。

| 复审项         | 复审结论                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| T09C 单一责任  | 仅涵盖 `/courses` 中课程名称、周课表条目和考试目标/日期/倒计时；已明确排除 T09D 全局导航/响应式、T09E 历史/归档及其余阶段。                    |
| T09A/T09B 复用 | 复用 T09A current semester 恢复、ready 学期和显式 `semesterId`；复用 T09B 的当前学期应用壳读取和 stale 响应处理，不新建选择器或浏览器存储。    |
| T11 语义       | 保留既有考试确认和工作台；确认考试日期变动被明确规定为历史记录 + `pending` + 清空 `confirmedAt` + 重新确认，目标文本单独编辑不影响确认态。     |
| 课表事实源     | 只读写 `schedule_entries`，遵循现有 v8 校验；不新增 migration/schema/第二课表表，手工修改保持 `student_confirmed` 来源语义。                   |
| 隔离与状态     | 每个读写方法和 UI 状态都要求 ready/current/归属校验；计划覆盖切换、刷新、abort、空状态、服务端失败和重试，防止旧学期残留。                     |
| API/测试覆盖   | 已列出准确文件、接口、失败语义、真实 SQLite API 集成测试、前端组件测试、指定隔离目录 Playwright E2E、全量 E2E 和 fast-forward 后主线复验命令。 |
| 文档与主线治理 | 计划阶段只更新 `docs/04`；实施完成才按事实更新完成证据。已纳入文档治理、双 diff 检查、显式暂存和 `master` 后复验要求。                         |
| 隐私与外部依赖 | 不新增真实 Provider/渠道测试；测试使用隔离根与合成数据，响应、日志、截图和提交不含敏感资料或秘密。                                             |

**复审后的停点：** 本计划已通过独立复审，但未获用户明确实施批准。因此不创建 `codex/phase1-t09c-course-schedule-exam-goals`，不执行任何业务实现步骤。
---

## 6. 实施批准与启动记录（2026-07-18）

用户已于 **2026-07-18** 在本任务对话中明确回复“批准”。因此计划门禁解除；已从 `origin/master@1da776ff2b0e6bb025559130893ec78414327131` 创建隔离实现分支 `codex/phase1-t09c-course-schedule-exam-goals`（worktree：`I:\ai-studybuddy\.worktrees\phase1-t09c-course-schedule-exam-goals`）。实施现已启动，但尚未完成、尚未合入 `master`、尚未推送 `origin/master`。后续仍严格受本计划范围、TDD、独立复审和主线复验约束。
