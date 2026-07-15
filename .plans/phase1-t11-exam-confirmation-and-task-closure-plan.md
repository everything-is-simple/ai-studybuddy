# Phase 1-T11：考试确认与任务创建浏览器闭环计划

**状态**：待批准（仅完成调研与计划，尚未开始业务实现）
**日期**：2026-07-15
**任务归属**：S1 学习节奏（StudyRhythm）；与 S2 资料入口建立最小导航衔接

## 1. 目标

把已经存在的 S1 后端数据能力接成学生可实际完成的浏览器闭环：

1. 在课程下创建一个**待确认**考试；
2. 明确确认考试日期，使其成为正式考试项目；
3. 进入以该考试为中心的工作台，看到课程、考试日期、倒计时和任务总体进度；
4. 在该工作台手工创建关联考试且带截止时间的学习任务；
5. 把任务从待办更新为进行中/已完成，刷新后状态、进度和完成事件仍正确；
6. 从工作台进入已带课程上下文的资料页。

本任务吸收“考试项目工作台”的产品组织方式，但不复制 KaoBuddy 或任何无明确许可证项目的源码、视觉、文案或资产。

## 2. 已确认事实与缺口

### 2.1 已有能力

- `StudyRhythmService` 已有课程、考试、学习任务、任务状态和时间线能力；现有 API 包含：
  - `POST/GET /api/courses`
  - `POST/GET /api/exams`
  - `POST/GET /api/study-tasks`
  - `PATCH /api/study-tasks/:id/status`
  - `GET /api/timeline`
- `assessment_attempts` 已有 `confirmation_status` 与 `confirmed_at` 字段；`StudyTaskDto` 已有 `assessmentAttemptId`、状态、截止时间、`derivedOverdue`、优先级和完成时间。
- 后端已保证仅确认考试日期影响任务优先级；任务完成会在同一事务内写入一条 `study_task_completed` 的 S1 事件。
- 前端已有 `/courses` 页面，可创建课程和考试；`/materials` 页面可上传资料；`CoursePage` 已读取任务，但未使用任务数据。
- Playwright `@playwright/test` 和 Chromium/Firefox/WebKit 已安装；仓库尚没有 Playwright 配置或 e2e 用例。

### 2.2 当前缺口

- 浏览器只能创建考试，无法把已有 `pending` 考试受控地确认成 `confirmed`。
- 前端缺少 `createStudyTask()` 和 `updateStudyTaskStatus()` API 封装及对应表单/状态动作。
- 没有稳定的单考试 URL，页面仍以课程/数据库对象列表为主，不会展示正式倒计时或总体进度。
- 即使一个学期已有多场考试，当前也没有工作台内考试切换、近期考试概览或跨考试日期附近任务提示；学生需要自己在分散课程卡间比对时间安排。
- 资料页的所选课程仅存于页面 state；从考试项目进入或刷新 URL 时无法保持课程上下文。
- 现有前端测试只覆盖考试创建表单受控值，未覆盖确认、任务创建、状态更新、刷新保持和真实浏览器闭环。

## 3. 范围、非范围与产品决定

### 3.1 本期范围

- 保持 `/courses` 作为课程与待确认考试的入口；由它进入单考试工作台。
- 新建稳定路由 `/exams/:examId`，作为最小“考试项目工作台”。
- 工作台顶区长期显示课程名称、考试名称、确认后的考试时间、倒计时和 `已完成任务 / 全部任务` 进度。
- 工作台顶区提供本学期**已确认考试**切换器，按 `examAt` 升序展示；切换必须更新 URL 为 `/exams/:examId`，刷新、前进和后退后仍以 URL 为准。
- 工作台总览提供近期考试概览：最多展示未来最近 5 场已确认考试的日期、倒计时和各自关联任务进度；同时列出本学期待确认考试，但只显示“待确认”，不得显示正式倒计时或纳入正式优先级。
- 当前考试项目仍只展示 `assessmentAttemptId === 当前 examId` 的任务；另以只读提示标出当前考试日期前后 7 天内的其他已确认考试，以及这些考试关联任务中截止时间落在同一 14 天窗口内的项目。
- 工作台内先提供三个实际入口/区域：总览、资料、计划；练习/查漏补缺/冲刺只保留后续信息架构边界，不渲染假功能、不创建 S3/S4/S5 数据。
- 学习任务为学生手工创建：标题、类型、预计分钟数（可选）、截止时间（本 UI 必填），并自动绑定当前课程和当前考试。
- 学生可执行已有后端允许的最小状态路径：`todo → doing → done`；更新失败时保留可恢复错误并从服务端重新加载。
- 资料页接受并验证 `courseInstanceId` 查询参数，首次加载与刷新可恢复选择；学生仍可改选其他课程。

### 3.2 明确非范围

- 不实现 AI 自动排程、根据资料自动“生成”任务、跨考试工作量自动平衡、任务自动改期、日历排程、任务拖拽、批量任务、任务编辑/删除或番茄钟。
- 不实现考试日期编辑、日期变更历史 UI、拒绝流程 UI、补考/重修流程扩展；既有数据字段保持兼容。
- 不实现 Provider 健康熔断（T02）、S3 限时练习、S4 错题、S5 模拟考/临考速背、S6 家长报告。
- 不创建 S3/S4 PRD，不做数据库迁移，不把运行数据、截图或真实资料加入 Git。
- 不把考试/任务/资料业务数据持久化到 localStorage 或 IndexedDB；现有学期 ID 本地便利输入保持原有边界，不扩展其用途。

### 3.3 关键产品决定

- 前端创建考试时不传 `confirmationStatus`，后端默认写入 `pending`；学生必须显式确认后，才进入正式倒计时和项目工作台主路径。
- 已确认考试可从课程页直接进入工作台；手动访问一个未确认考试的工作台 URL 时，页面只显示确认提示和“确认日期”动作，不显示正式倒计时/任务计划。
- 考试切换器只包含本学期已确认考试，按最早 `examAt` 在前排序；没有第二场已确认考试时不显示不可用的伪切换控件。
- 近期考试概览最多显示未来最近 5 场 confirmed 考试；每项进度按该考试关联任务中的 `done / 全部` 计算。pending 考试单独显示名称、课程和“待确认”，不显示倒计时、任务进度或冲刺提示。
- “日期附近”固定为当前考试 `examAt` 前后各 7 个自然日；提示只列其他 confirmed 考试及其关联任务中 `deadlineAt` 落入该窗口的任务标题/截止时间，不计算总工时、不改变优先级、不自动建议改期。
- 本期“总体进度”定义为当前考试关联任务中 `done` 的数量除以总数；没有任务时显示 `0 / 0`，并给出“先创建第一项任务”的下一步。
- 任务页面只展示 `assessmentAttemptId === 当前 examId` 的任务，避免同一课程其他考试或日常任务污染项目视图。
- 资料入口使用 `/materials?courseInstanceId=<当前课程 UUID>`；参数仅是导航上下文，不是权限或数据来源。资料页加载课程列表后必须验证该 UUID 确属当前学期课程，非法/过期参数回退到未选择状态并显示可恢复提示。

## 4. 后端 API 与状态设计

### 4.1 新增最小端点

| 端点 | 请求 | 行为 | 结果 |
| --- | --- | --- | --- |
| `GET /api/exams/:id?semesterId=...` | path `id`、query `semesterId` | 获取该学期内的单一考试，用于可刷新的工作台 URL | 标准 `{ success, data }` 考试 DTO；跨学期或不存在不泄露数据 |
| `PATCH /api/exams/:id/confirmation` | `{ semesterId }` | 只执行“确认当前待确认日期”命令 | 返回更新后的考试 DTO |

保留现有 `POST /api/exams` 的兼容契约，不重写 Router，不更改已有任务 API 路径。

### 4.2 确认状态矩阵

| 当前状态 | `PATCH .../confirmation` | 数据变化 |
| --- | --- | --- |
| `pending` | 成功 | 原子更新为 `confirmed`，写入 `confirmed_at` / `updated_at`，并写入一条受限 S1 确认证据事件 |
| `confirmed` | 幂等成功 | 返回现有 DTO，不重复改确认时间、不重复插入事件 |
| `rejected` / `superseded` | 409 `EXAM_CONFIRMATION_INVALID` | 不修改记录；日期修订和重新确认留给后续明确任务 |
| 缺失、跨学期或非法 UUID | 404/400 标准错误信封 | 不泄露另一学期考试数据 |

确认操作不得修改 `exam_at`，也不得伪造 `assessment_date_changes` 历史；本期不增加数据表或迁移。

### 4.3 服务层职责

- 在 `StudyRhythmService` 增加单考试读取和确认方法，所有学期/课程归属检查均在服务层执行。
- 确认操作使用数据库事务：更新考试与插入一次 S1 事件必须同时成功或同时回滚。
- 使用现有 DTO、错误信封和路径治理；不从前端接受任意确认时间、课程 ID 或事件标题作为可信数据。
- 保持现有 `createTask()` 与 `updateTaskStatus()` 的兼容性；工作台 UI 只在已确认考试下创建带 `assessmentAttemptId` 的任务，不把此 UI 规则误改为所有系统任务的全局 DB 限制。

## 5. 前端页面与文件实施顺序

### 5.1 API、DTO 与路由

1. 更新 `packages/frontend/src/api/study-rhythm-api.ts`：增加单考试获取、确认考试、创建任务、更新任务状态四个受类型约束的函数；并让既有考试/任务列表函数可按当前学期读取全部项目数据，供近期考试概览使用。沿用 `request()`、标准错误处理和 `AbortSignal`。
2. 如确认输入/事件类型需要公共表达，最小化更新 `packages/shared/src/types.ts`；不为纯前端表单创建重复数据库 DTO。
3. 更新 `packages/backend/src/api/study-rhythm.ts`、`packages/backend/src/services/study-rhythm-service.ts`，实现第 4 节端点和服务语义。
4. 更新 `packages/frontend/src/app.tsx`：注册 `/exams/:examId`；保留 `/courses`、`/materials` 和笔记路由兼容。

### 5.2 课程入口

5. 改造 `packages/frontend/src/pages/course-page.tsx`，但保留其课程创建职责：
   - 考试创建成功后显示“待确认”的直接下一步；
   - 每个 pending 考试提供明确的“确认考试日期”按钮，提交期间禁用重复操作，成功后刷新并导航/提供进入工作台；
   - 每个 confirmed 考试提供“进入考试项目”链接；
   - 继续保留无学期、无课程、无考试、请求失败与重试提示；不再把原始枚举值作为唯一状态文案。

### 5.3 新建考试项目工作台

6. 新建 `packages/frontend/src/pages/exam-workbench-page.tsx`（可拆分只服务本页的轻量组件；不得形成新的单体 `App.tsx`）：
   - 用 URL `examId` + 当前 semesterId 拉取当前考试、课程、全学期考试列表与全学期任务列表；服务端先验证当前考试归属，页面再按 `assessmentAttemptId` 精确过滤当前项目任务；
   - 顶区显示考试项目上下文与已确认考试切换器。切换器按 `examAt` 升序，使用可访问链接/选择控件导航到对应 `/exams/:examId`，不以仅内存 state 代替 URL；
   - 仅 confirmed 状态计算倒计时；过去日期使用清晰的已到期提示，不生成负数倒计时。手动访问 pending URL 时显示确认提示，不显示正式计划；
   - 总览同时展示近期考试概览（最近 5 场 confirmed 的日期、倒计时、任务进度；pending 仅为待确认）和当前考试前后 7 天的只读日期附近提示；没有相邻项目时明确说明暂无日期冲突提示；
   - 当前考试区给出任务进度、最近/逾期任务与直接下一步；空任务时引导创建第一项任务，空资料时链接到本课程资料页；
   - 资料入口是带 `courseInstanceId` 的链接；计划区提供任务创建表单，标题/类型/截止时间校验，默认截止时间可参考考试时间但由学生确认；
   - 任务卡按后端返回的截止时间顺序展示；根据当前状态显示“开始学习”或“标记完成”，不在前端伪造非法状态迁移；成功后刷新当前项目、近期概览和日期提示，错误在当前操作附近可见且可重试；
   - 处理加载、404/跨学期、未确认、空任务、网络错误及刷新后状态保持；使用语义化 label、button、`aria-live` 反馈和键盘可访问控件。
7. 更新 `packages/frontend/src/components/app-navigation.tsx` 和 `packages/frontend/src/styles/global.css`：导航命名逐步偏向“考试项目”，但保持简洁；新增紧凑的工作台 header、进度、任务卡和响应式布局。避免大面积浅绿色、过多空白或照搬参考项目 token。
8. 更新 `packages/frontend/src/pages/material-upload-page.tsx`：用 React Router 查询参数读取/同步 `courseInstanceId`，在课程列表加载后验证并预选；用户手动切换时更新 URL，错误参数不触发资料请求。

## 6. 测试与验收

### 6.1 后端集成测试（真实 SQLite，不 mock DB）

扩展 `packages/backend/test/study-rhythm-api.test.mjs`：

- 单考试查询仅返回同一 ready 学期考试；缺失/跨学期被拒绝。
- pending 考试确认后：状态为 confirmed、`confirmedAt` 存在、时间不被改写、确认事件只写一条。
- 重复确认幂等，不重复覆盖确认时间或新增事件。
- rejected/superseded、非法 semesterId、错误考试 ID 和跨学期确认均按标准错误信封失败。
- 已确认考试创建的任务依旧获得既有 priority 规则；任务完成仍只写一条完成事件，避免确认事件影响此不变量。

### 6.2 前端单元/组件测试

- 扩展 `packages/frontend/test/study-rhythm-api.test.ts`：断言新端点、HTTP 方法、URL 编码和请求 payload。
- 扩展 `packages/frontend/test/course-page.test.tsx`：待确认考试的确认动作、提交禁用、成功后的工作台入口和 API 失败提示。
- 新建 `packages/frontend/test/exam-workbench-page.test.tsx`：确认态倒计时/进度、按日期排序的已确认考试切换与 URL 目标、近期 5 场概览、pending 不显示倒计时、前后 7 天日期提示、未确认拦截、空任务下一步、创建任务 payload、状态更新、错误提示、刷新后重新拉取。
- 扩展 `packages/frontend/test/material-upload-page.test.tsx`：合法 `courseInstanceId` 预选、无效参数安全回退、手动切换后 URL 同步；不得让查询参数绕过课程归属验证。

### 6.3 Playwright 真实浏览器验收

新建仓库级 `playwright.config.ts` 和 `e2e/exam-workbench.spec.ts`：

- 配置两个受 Playwright 管理的本地 web server：后端运行在固定测试端口，前端 Vite 运行在另一固定测试端口并通过 `VITE_API_BASE_URL` 代理到后端；不依赖真实 Provider。
- 测试开始前通过已有 `POST /api/dev/init-semester` 建立合成的 ready 学期；每次执行命令前设置独立 `APP_DATA_ROOT`，并只使用合成课程、考试和任务标题。
- 在 Chromium 中完成：设置学期 ID → 创建课程 → 创建两场日期不同的 pending 考试与一场待确认考试 → 分别确认前两场 → 进入工作台 → 验证按日期排序的考试切换和 URL 更新、近期概览与 pending 的非倒计时展示 → 为当前考试创建带截止时间任务 → 开始学习 → 标记完成 → 页面刷新 → 验证日期/倒计时、当前项目进度、日期附近提示、状态和课程上下文资料链接。
- 额外覆盖至少一个失败/空状态：无任务引导、确认接口失败提示，或非法工作台 URL；截图写入仓库外 `APP_DATA_ROOT` 证据目录，不提交图片。
- 首次实现优先保证 Chromium 稳定；Firefox/WebKit 保持已安装可单独扩展，不把三浏览器矩阵作为阻塞性范围。

### 6.4 必跑命令

```powershell
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t11-full-test'
pnpm test
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t11-e2e'
pnpm test:e2e
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

## 7. 文档、治理与提交

- 本次计划获批后才创建 T11 实施分支/隔离 worktree；创建前复查主 checkout 干净、目标目录和分支不存在。
- 实现完成且全部验证通过后，更新：
  - `docs/04-开发任务清单-Todo-List.md`：将 T11 标为完成，记录真实范围、证据和明确未做项；
  - `docs/09-测试验收计划-Test-Plan.md`：回填浏览器闭环命令和脱敏证据摘要；
  - 如 API 契约发生长期变化，再最小化同步 `docs/08-共同底座架构-Architecture.md` / S1 PRD；不为实现日志创建新的设计文档。
- 计划期间仅新增本 `.plans/` 文件；未经批准不修改业务代码、正式任务状态或 S3/S4 文档。
- 实施提交按职责拆分（后端/API、前端/Playwright、文档收尾），每个提交只含批准范围；建议最终用户可见功能提交为 `feat(s1): 完成考试确认与任务闭环`。
- 默认不推送；只有得到用户明确授权后才合并回 master 或删除 worktree。

## 8. 风险审查

| 风险 | 处理 |
| --- | --- |
| 把 pending 考试当正式日期，误导倒计时 | 工作台只在 confirmed 后显示正式倒计时和计划；后端确认操作受状态矩阵保护 |
| 重复点击确认产生多份证据 | confirmed 重复调用幂等，不更改 `confirmedAt`，不重复写事件 |
| 跨学期 URL 或查询参数泄露/混用数据 | 服务层验证 semester 归属；资料页对 URL 课程 ID 做当前学期白名单验证 |
| 课程任务混入另一个考试项目 | 工作台按 `assessmentAttemptId` 精确过滤；创建时自动传当前 examId |
| 多场考试日期过近但学生看不到全局关系 | 顶部切换器和近期概览按日期排序；当前考试前后 7 天只读提示列出相邻考试及关联截止任务，但不自动改期 |
| pending 考试被误展示为确定安排 | 切换器只显示 confirmed；近期概览中的 pending 仅标“待确认”，没有倒计时、进度或正式优先级 |
| 前端绕过服务端状态规则 | UI 只展示已允许动作；后端仍执行状态迁移校验，失败后重新请求 |
| e2e 写入真实数据或访问真实 Provider | Playwright 通过 `APP_DATA_ROOT` 隔离，使用开发初始化接口和合成数据，不配置 Provider |
| scope 膨胀为自动计划/练习/错题 | 自动排程、T02、S3、S4、S5、S6 明确留在后续任务 |

## 9. 批准后执行记录

- 待用户明确回复“批准 Phase 1-T11 计划”后填写。
