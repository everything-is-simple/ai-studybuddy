# Phase 1-T09D：全局导航与学生旅程 E2E 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 独立计划已创建、已独立复审、等待用户明确批准；实现未启动。
**任务：** `Phase 1-T09D：全局导航与学生旅程 E2E`
**计划分支：** `codex/phase1-t09d-global-navigation-student-journey-plan`（本文件所在分支）
**预定实施分支：** 仅在用户明确批准后，从届时最新的 `origin/master` 创建 `codex/phase1-t09d-global-navigation-student-journey`。
**基线：** `origin/master` @ `07a2b0fc880fcfeb48448565f4de8fd8ca4c29b5`（2026-07-18，已包含 T09C 主线实现、日期验收稳定修复、主线复验和远端状态确认）
**关联任务：** 复用 T09A current semester、T09B 每日学习首页与 stale 恢复、T09C 课程/完整周课表/考试目标、T11 考试确认与工作台，以及既有资料、笔记、练习、错题、时间线和设置能力；T09E 仍未创建计划、未启动。

**目标：** 在不扩张业务能力、不复制第二套学期状态的前提下，把现有学生端页面收拢到统一应用壳与可访问的响应式导航中，统一关键页面状态，并以真实后端、真实 SQLite 和隔离数据根完成“首次使用到日常学习”的稳定 Playwright 学生旅程验收。

**架构：** `App` 继续是唯一 current semester 恢复与路由保护边界；导航只消费 React Router 路径、当前学期只读摘要和临时 UI 开合状态。全局入口由应用壳统一渲染，考试工作台、练习、错题和时间线依赖考试上下文，使用课程/考试入口和考试上下文导航串联，不发明无上下文资源 ID。通过以 `semesterId` 为 key 的学期作用域路由树和请求卸载，阻止切换学期时短暂展示旧学期数据。统一页面状态采用小型共享组件和现有 `FeedbackMessage` 的渐进收敛，不进行设计系统重写。

**技术栈：** React 18、React Router 6、Vite、现有 TypeScript API 客户端和 `{ success, data, error }` 信封、Vitest/jsdom、Playwright、Express/真实 SQLite；不调用真实 AI、SMTP、飞书或其他外部渠道。

---

## 0. 门禁、事实来源与范围

### 0.1 当前门禁

1. `docs/04-开发任务清单-Todo-List.md` 已登记 T09D；本计划门禁只创建本文件、执行独立复审并同步 `docs/04`。
2. 用户明确批准前，禁止创建 `codex/phase1-t09d-global-navigation-student-journey`，禁止修改 `packages/`、`e2e/`、数据库或业务 API，禁止把计划分支推送表述为 T09D 功能完成。
3. 获批后必须先 `git fetch origin`，从届时最新 `origin/master` 创建实施分支；不得从计划分支继续写实现。
4. 产品事实以 `docs/01`、`docs/02` 和已触发的子系统 PRD 为准；工程边界以 `docs/08`、`docs/09`、`docs/10`、`docs/11`、`docs/12`、T09A/T09B/T09C 计划和主线交付记录为准。
5. 本计划未触发新的编号设计文档，不修改 `docs/00`。

### 0.2 已核对的当前实现事实

1. `packages/frontend/src/app.tsx` 已定义 `/`、`/semesters`、`/courses`、`/materials`、`/notes/:noteId`、`/exams/:examId`、练习、错题和 `/settings` 路由，并在应用壳恢复唯一 current semester。
2. `packages/frontend/src/components/app-navigation.tsx` 当前只有“课程与考试、学期、资料、设置”四个横向入口，使用 `pathname.startsWith` 高亮；部分页面还重复渲染 `AppNavigation`。
3. 时间线不是独立的全局资源页，而是考试工作台内 `data-testid="recent-study-activity"` 的当前课程近期活动区；限时练习和错题也需要考试上下文。因此 T09D 不新增无上下文时间线/练习/错题 API 或伪造固定 ID 链接。
4. T09A current semester 只保存于后端 `app_meta.current_semester_id`；导航不得把 current semester、密钥、Provider URL 或资料内容写入 `localStorage`。现有练习草稿的学期/会话隔离 `sessionStorage` 不属于本任务重写范围。
5. `useApiRequest` 在依赖改变时会开始新请求，但当前实现不会同步清空旧 `data`；实施时必须由学期作用域路由 key/卸载保证旧页面数据先消失，不能依赖导航组件自行维护第二套 semester 状态。
6. `playwright.config.ts` 已强制 `APP_DATA_ROOT`、单 worker、非并行、固定本机端口 `4311/4173` 且 `reuseExistingServer: false`；当前后端命令启动生产 `dist/server.js`，学期 UI 的 `/semesters/preview` 会依赖 RapidOCR。为同时满足“真实 Express/SQLite”和稳定 E2E，T09D 必须以 test-only `e2e-server.ts` 注入确定性 `TimetableRecognizer`，生产 `server.ts` 不读取测试开关。

### 0.3 本任务做与不做

| 范围       | T09D 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全局导航   | 在应用壳统一提供每日首页、课程/课表/考试、学期管理、资料与笔记、本机设置的稳定入口；移除页面内部重复全局导航。                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 上下文能力 | 从课程考试卡进入考试工作台；工作台内提供资料、限时练习、错题和当前课程时间线的上下文入口，不创建缺少 `examId`/`noteId` 的无效全局链接。                                                                                                                                                                                                                                                                                                                                                                                                            |
| 响应式     | 桌面使用持久侧边导航；窄屏收敛布局；移动端使用始终可达的底部主导航加“更多”面板，关键入口不因适配被隐藏。                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 页面状态   | 统一加载、无 current、stale、普通错误/重试、空状态、安全 404/跨学期失败；切换学期先卸载旧学期路由内容。                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 测试       | 新增导航/页面状态组件测试、T09D 导航响应式 E2E 和完整学生旅程 E2E，并回归 T09A/T09B/T09C。                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 数据/API   | **原则上不新增数据库 schema 或业务 API。** 仅允许新增 Task 4 明确列出的 test-only 文件：`packages/backend/test/e2e-server.ts`、`packages/backend/test/e2e-stale-current.ts`、`packages/backend/tsconfig.e2e.json` 与最小合成 PNG；其中 `e2e-server.ts` 只向现有 `createApp` 注入确定性 OCR 识别器，仍走真实 Express 路由、现有服务/事务/migration 和真实 SQLite；`e2e-stale-current.ts` 只能在本次隔离 `APP_DATA_ROOT` 中操作既有 schema 数据来制造 stale 前置条件，不得承担正常业务造数。生产 `server.ts`、业务接口与 schema 不得因测试注入改变。 |
| 明确不做   | 不做 T09E 练习历史/筛选/学期归档/归档只读；不做课程、考试或学期删除；不做跨学期汇总/仪表盘；不做 schema/migration；不做 S5/S7、家长 Web 面板、AI/Provider 扩张、真实渠道 smoke、Phase 2/3、大规模品牌/设计系统重写或无关 CSS 清理。                                                                                                                                                                                                                                                                                                                |

### 0.4 导航信息架构冻结

#### 全局主入口

| 入口       | 路由         | 当前学期要求 | 说明                                                                   |
| ---------- | ------------ | ------------ | ---------------------------------------------------------------------- |
| 今日学习   | `/`          | 是           | T09B 每日学习首页。                                                    |
| 课程与考试 | `/courses`   | 是           | T09C 课程、完整周课表、考试目标与倒计时。                              |
| 学期管理   | `/semesters` | 否           | T09A 创建、选择、切换 current semester。                               |
| 资料与笔记 | `/materials` | 是           | 资料列表/上传是稳定入口，具体笔记继续从资料结果进入 `/notes/:noteId`。 |
| 本机设置   | `/settings`  | 否           | T08 本机配置中心；导航不展示或持久化秘密值。                           |

#### 考试上下文入口

1. `/courses` 的具体考试继续进入 `/exams/:examId` 考试工作台。
2. 工作台上下文导航提供：工作台、资料、限时练习 `/exams/:examId/practice`、错题 `/exams/:examId/mistakes`、时间线 `#recent-study-activity`。
3. `/practice-sessions/:sessionId`、结果页和 `/mistakes/:mistakeId` 保持深层任务路由，并提供返回相应考试工作台/列表的可达路径；不把会话 ID 或错题 ID保存到全局导航。
4. 活动区增加稳定 `id="recent-study-activity"` 并保留既有 test id，使上下文导航和现有 T07 测试均可复用。

### 0.5 失败语义冻结

| 场景                      | 预期体验                                                                       | 安全边界                                                           |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| current semester 恢复中   | 应用壳显示统一加载状态；不渲染学期业务内容。                                   | 不显示上次学期页面缓存。                                           |
| 无 current semester       | 允许访问学期管理/设置；其他全局入口禁用或引导到 `/semesters`。                 | 不猜测或从浏览器存储恢复学期。                                     |
| stale current semester    | 复用 T09A/T09B 服务端清理结果，显示“失效已清理”和前往学期管理的明确下一步。    | 不循环重试、不回退另一学期。                                       |
| current semester 读取失败 | 留在统一壳错误状态，提供显式“重试”；不静默重定向。                             | 不把网络错误当作“无学期”。                                         |
| 普通页面 API 失败         | 在当前内容区显示安全错误和重试；保留可恢复的导航。                             | 不展示 stack、数据库路径、Provider URL、完整 UUID 或另一学期数据。 |
| 页面空数据                | 按领域给出下一步：建课程、维护课表、建/确认考试、上传资料或开始准备。          | 不为填满页面生成虚假数据。                                         |
| 学期切换                  | current 更新后立即卸载旧 `semesterId` 路由树，显示新学期加载态，再展示新数据。 | 任何一帧都不得显示上一学期课程、考试、资料或时间线。               |
| 路由不存在                | 显示安全 404 与“今日学习/课程/学期管理”入口。                                  | 不再静默跳到可能错误的 `/courses`。                                |
| 资源不存在或跨学期        | 使用既有安全 API 错误，显示返回相关列表/工作台入口。                           | 不泄露资源是否存在于另一学期。                                     |

---

## 1. 预期实施文件清单

### 1.1 应用壳、导航与共享状态

- Modify: `packages/frontend/src/app.tsx`
- Modify: `packages/frontend/src/components/app-navigation.tsx`
- Create: `packages/frontend/src/components/page-state.tsx`
- Modify: `packages/frontend/src/components/feedback-message.tsx`
- Modify: `packages/frontend/src/styles/global.css`

### 1.2 清理重复导航与接入统一状态的现有页面

- Modify: `packages/frontend/src/pages/course-page.tsx`
- Modify: `packages/frontend/src/pages/daily-study-home-page.tsx`
- Modify: `packages/frontend/src/pages/semester-page.tsx`
- Modify: `packages/frontend/src/pages/material-upload-page.tsx`
- Modify: `packages/frontend/src/pages/note-page.tsx`
- Modify: `packages/frontend/src/pages/exam-workbench-page.tsx`
- Modify: `packages/frontend/src/pages/practice-start-page.tsx`
- Modify: `packages/frontend/src/pages/practice-session-page.tsx`
- Modify: `packages/frontend/src/pages/practice-result-page.tsx`
- Modify: `packages/frontend/src/pages/mistake-list-page.tsx`
- Modify: `packages/frontend/src/pages/mistake-detail-page.tsx`
- Modify: `packages/frontend/src/pages/settings-page.tsx`

说明：只改页面壳、返回入口和状态呈现；不重写 T09B/T09C/T11/S2/S3/S4 业务逻辑。实施中若某页面已完全符合共享状态契约，可不改该文件，并在实施记录中说明，而不是制造无意义 diff。

### 1.3 前端组件测试

- Create: `packages/frontend/test/app-navigation.test.tsx`
- Create: `packages/frontend/test/page-state.test.tsx`
- Modify: `packages/frontend/test/app-semester.test.tsx`
- Modify: `packages/frontend/test/course-page.test.tsx`
- Modify: `packages/frontend/test/daily-study-home-page.test.tsx`
- Modify: `packages/frontend/test/material-upload-page.test.tsx`
- Modify: `packages/frontend/test/exam-workbench-page.test.tsx`
- Modify: `packages/frontend/test/practice-pages.test.tsx`
- Modify: `packages/frontend/test/mistake-pages.test.tsx`
- Modify only if shared-shell assertions require it: `packages/frontend/test/semester-page.test.tsx`
- Modify only if shared-shell assertions require it: `packages/frontend/test/settings-page.test.tsx`

### 1.4 Playwright

- Create: `packages/backend/test/e2e-server.ts`
- Create: `packages/backend/test/e2e-stale-current.ts`
- Create: `packages/backend/tsconfig.e2e.json`
- Create: `e2e/fixtures/synthetic-timetable.png`
- Create: `e2e/global-navigation-responsive.spec.ts`
- Create: `e2e/student-journey.spec.ts`
- Create: `e2e/helpers/browser-calendar.ts`
- Create: `e2e/helpers/student-journey-api.ts`
- Modify only when required to reuse the relative-date helper: `e2e/daily-study-home.spec.ts`
- Modify only when required to eliminate duplicated setup: `e2e/course-schedule-exam-goals.spec.ts`
- Modify: `playwright.config.ts`（将 backend `webServer` 切换到 test-only harness 是必需改动；harness 外的额外隔离配置才需先证明缺陷。）

`packages/backend/test/e2e-server.ts` 只由 Playwright `webServer` 启动：以现有 `bootstrapBackend`、`initializeRuntimeConfiguration`、`createApp` 和 worker 工厂启动真实 Express/SQLite，向 `createApp` 显式注入仅返回合成课程表文本的 `FakeTimetableRecognizer`。它不得成为生产入口、不得读取测试注入环境变量、不得新增 dev API/schema/migration。`e2e/fixtures/synthetic-timetable.png` 为最小合成 PNG，不含真实课程资料；上传、预览、确认创建、ready/promote/current 仍必须经真实 UI/路由/服务/事务执行。`student-journey-api.ts` 只封装现有 API 的合成测试数据创建/读取，不新增 dev 业务接口，不直接写正式数据目录。完整旅程的可见操作必须通过 UI 完成；API helper 仅用于读取断言或为“现有但没有 UI 创建入口”的只读活动准备最小合成 StudyEvent，且应优先用已有 `/api/study-events`。

### 1.5 文档收尾（实施完成时）

- Modify: `.plans/phase1-t09d-global-navigation-student-journey-plan.md`
- Modify: `docs/04-开发任务清单-Todo-List.md`

### 1.6 禁止变更文件类别

- 不修改 `packages/backend/src/db/**` 中的 schema、migration、connection、paths 或数据库初始化实现；Task 4 仅允许新增 `packages/backend/test/**` 的 test-only harness/fixture helper 与 `packages/backend/tsconfig.e2e.json`。
- 不新增/修改 T09D 范围外业务 API。
- 不修改 `packages/shared` DTO，除非后续重新进入计划门禁并证明现有 DTO 无法表达既有 API；当前调研未发现缺口。
- 不创建 T09E、S5、S7 或家长面板文件。

---

## 2. 可执行实施任务

### Task 1：先用失败测试冻结导航信息架构和页面状态契约

**Files:**

- Create: `packages/frontend/test/app-navigation.test.tsx`
- Create: `packages/frontend/test/page-state.test.tsx`
- Modify: `packages/frontend/test/app-semester.test.tsx`

- [ ] **Step 1: 为全局和上下文导航写失败测试。**

  覆盖桌面主入口、移动主入口和“更多”面板；`/` 精确高亮；`/courses` 及课程子流程归入课程与考试；`/materials`/`/notes/:noteId` 归入资料与笔记；`/semesters` 与 `/settings` 保持公共入口；考试工作台、练习、错题和时间线使用考试上下文导航而不是全局固定 ID。

- [ ] **Step 2: 冻结键盘和 ARIA。**

  断言 `<nav aria-label="学生端主导航">`、活动入口 `aria-current="page"` 或 `aria-current="location"`、移动“更多”按钮的 `aria-expanded`/`aria-controls`、Escape 关闭、关闭后焦点返回触发按钮、Tab 可达、装饰元素不冒充可交互控件。

- [ ] **Step 3: 冻结 current semester 状态边界。**

  在 `app-semester.test.tsx` 断言：恢复中不渲染学期业务页；无 current/stale/current 读取失败分别呈现不同语义；重试重新调用后端 current；切换学期后旧学期页面立刻卸载；刷新只从后端恢复 current；导航开合不写入 `localStorage`，且不会写入密钥、Provider URL、资料原文或完整 UUID。

- [ ] **Step 4: 为共享 `PageState` 写失败测试。**

  覆盖 `loading`、`empty`、`error`、`no-semester`、`stale-semester`、`not-found`；错误支持重试，空状态支持明确主操作；loading 使用 `aria-live`，错误使用合适 role，按钮文案不只依赖颜色/图标。

- [ ] **Step 5: 运行定向测试并确认先失败。**

  ```powershell
  pnpm --filter @ai-studybuddy/frontend test -- app-navigation.test.tsx page-state.test.tsx app-semester.test.tsx
  ```

  Expected: 因新壳、响应式导航、状态组件和学期 key 尚未实现而失败，且失败集中于本任务断言。

### Task 2：实现唯一应用壳、响应式全局导航和学期作用域路由

**Files:**

- Modify: `packages/frontend/src/app.tsx`
- Modify: `packages/frontend/src/components/app-navigation.tsx`
- Create: `packages/frontend/src/components/page-state.tsx`
- Modify: `packages/frontend/src/components/feedback-message.tsx`
- Modify: `packages/frontend/src/styles/global.css`

- [ ] **Step 1: 从 `App` 提取清晰但不过度抽象的壳层结构。**

  继续在 `App` 中持有唯一 `CurrentSemesterState` 和 `refreshCurrentSemester`。应用壳负责品牌标题、current semester 只读摘要、全局导航、配置提示和主内容区；导航只接收 `currentSemester` 是否存在/摘要以及可选考试上下文，不发起 semester API，也不保存 current ID。

- [ ] **Step 2: 用显式路由匹配替代简单 `startsWith`。**

  使用 React Router `matchPath` 或等价的静态匹配表，使 `/` 不误高亮所有路径，使 note 路由高亮“资料与笔记”，使考试/练习/错题深层路由高亮“课程与考试”。活动状态输出 `aria-current`，不依赖文本或 URL 偶然前缀。

- [ ] **Step 3: 实现桌面、窄屏和移动导航。**

  冻结三个视图档：桌面 `>= 960px` 为持久侧栏；窄屏 `721px–959px` 为紧凑壳/横向主入口；移动 `<= 720px` 为固定底部主导航加“更多”面板。移动端直接保留今日、课程、资料三个高频入口，并在“更多”中提供学期和设置；所有入口最小点击区域 44px，考虑 `env(safe-area-inset-bottom)`，内容底部不得被固定导航遮挡。不得通过 `display:none` 永久隐藏唯一入口。

- [ ] **Step 4: 处理移动面板可访问性和 UI 状态。**

  “更多”只保存组件内开合状态；路由变化、Escape 和选择入口时关闭；焦点返回触发按钮；不将开合状态、导航历史、current semester 或秘密写入浏览器持久化。

- [ ] **Step 5: 引入学期作用域路由 key。**

  将需要 semester 的路由置于以 `semesterId` 为 key 的小型路由边界中。current 从 A 切到 B 时先卸载 A 的页面组件和请求，再挂载 B 的 loading 状态；公共 `/semesters`、`/settings` 不随 semester key 丢失。不要在 `AppNavigation` 复制 `CurrentSemesterState`。

- [ ] **Step 6: 统一壳层失败和 404。**

  current 读取失败显示共享错误状态和重试，不静默跳转；none/stale 引导到学期管理；未知路由显示安全 404 和可用入口，不再通配静默重定向。

- [ ] **Step 7: 运行 Task 1 测试。**

  ```powershell
  pnpm --filter @ai-studybuddy/frontend test -- app-navigation.test.tsx page-state.test.tsx app-semester.test.tsx
  ```

  Expected: 全局/移动导航、ARIA、current 状态和旧学期数据卸载测试通过。

### Task 3：把既有页面接入统一壳、上下文导航和页面状态

**Files:**

- Modify: `packages/frontend/src/pages/course-page.tsx`
- Modify: `packages/frontend/src/pages/daily-study-home-page.tsx`
- Modify: `packages/frontend/src/pages/semester-page.tsx`
- Modify: `packages/frontend/src/pages/material-upload-page.tsx`
- Modify: `packages/frontend/src/pages/note-page.tsx`
- Modify: `packages/frontend/src/pages/exam-workbench-page.tsx`
- Modify: `packages/frontend/src/pages/practice-start-page.tsx`
- Modify: `packages/frontend/src/pages/practice-session-page.tsx`
- Modify: `packages/frontend/src/pages/practice-result-page.tsx`
- Modify: `packages/frontend/src/pages/mistake-list-page.tsx`
- Modify: `packages/frontend/src/pages/mistake-detail-page.tsx`
- Modify: `packages/frontend/src/pages/settings-page.tsx`
- Modify: `packages/frontend/src/styles/global.css`

- [ ] **Step 1: 删除页面内部重复全局导航。**

  每个路由只由应用壳渲染一次主导航；删除页面内 `AppNavigation` import/节点。保留真正的领域内返回链接和考试上下文导航，避免桌面/移动重复朗读或重复焦点顺序。

- [ ] **Step 2: 为考试上下文建立轻量导航。**

  在工作台和可推导 `examId` 的练习/错题页提供工作台、资料、练习、错题、时间线入口；活动区增加 `id="recent-study-activity"`。结果页/错题详情若现有 DTO 无 `examId`，只使用已有可证明的返回目标，不新增 API 或猜测 ID；必要时回到课程/考试列表。

- [ ] **Step 3: 渐进统一页面状态。**

  将整页 loading/error/empty 接入 `PageState`；局部卡片错误仍可复用 `FeedbackMessage`，避免为了统一而重写所有领域组件。每个空状态给出真实可执行下一步；服务错误保留重试；跨学期/资源不存在不显示原资源摘要。

- [ ] **Step 4: 保持已完成业务语义不变。**

  不改变 T09B 今日任务排序、T09C 课程/课表/考试编辑和倒计时、T11 确认/任务闭环、S2 资料笔记、S3 限时练习、S4 错题改错、T07 时间线或 T08 设置存储逻辑。仅修复阻塞导航/E2E 的明确 P0/P1 回归；若需要业务规则变更，停止实施并重新申请范围。

- [ ] **Step 5: 补齐页面回归组件测试。**

  更新相关测试的路由壳和断言，覆盖加载、空、错误/重试、上下文返回、跨学期安全失败、无重复导航。设置测试继续断言密钥不进入 `localStorage`；不得把现有安全断言改弱。

- [ ] **Step 6: 运行前端全量组件测试。**

  ```powershell
  pnpm --filter @ai-studybuddy/frontend test
  ```

  Expected: 新导航/页面状态测试和全部既有页面测试通过，无 T09A/T09B/T09C/T11/S2/S3/S4/T07/T08 回归。

### Task 4：建立确定性、真实后端的 Playwright server harness

**Files:**

- Create: `packages/backend/test/e2e-server.ts`
- Create: `packages/backend/test/e2e-stale-current.ts`
- Create: `packages/backend/tsconfig.e2e.json`
- Create: `e2e/fixtures/synthetic-timetable.png`
- Modify: `playwright.config.ts`

- [ ] **Step 1: 仅在 test-only 入口注入确定性 OCR。**

  `e2e-server.ts` 以现有 `bootstrapBackend` 创建真实后端，调用现有 `createApp({ configurationService, allowedOriginsRaw, timetableRecognizer })` 并注入固定文本的 `FakeTimetableRecognizer`。该 recognizer 只替代外部 OCR 边界，不替代 semester selector、Express router、SQLite、migration、ready/promote/current、课程/课表写入或 API 信封。生产 `src/server.ts` 不读取测试变量、不接受 recognizer 注入。

- [ ] **Step 2: 将 test-only harness 纳入严格 TypeScript 检查。**

  创建 `packages/backend/tsconfig.e2e.json`：继承现有后端编译选项、仅以 `noEmit` 覆盖 `src/**/*.ts`、`test/e2e-server.ts` 和 `test/e2e-stale-current.ts`，并把 test-only `rootDir` 调整为可包含 `test/` 的目录；不得把它们编入生产 `dist`。每次 E2E 前后运行：

  ```powershell
  pnpm --filter @ai-studybuddy/backend exec tsc -p tsconfig.e2e.json --noEmit
  ```

- [ ] **Step 3: 将 Playwright 后端 webServer 指向 test-only 入口。**

  `playwright.config.ts` 的 backend command 从仓库根目录执行 `pnpm --filter @ai-studybuddy/backend exec tsx test/e2e-server.ts`，继续传入 `APP_DATA_ROOT`、`BACKEND_HOST`、`BACKEND_PORT`、空 AI 配置和 `reuseExistingServer: false`。若现有启动/关闭逻辑需要最小 package script，必须只添加等价测试脚本，不能改生产启动命令。

- [ ] **Step 4: 冻结真实 UI 创建学期的夹具。**

  `synthetic-timetable.png` 只用于满足现有文件类型/魔数校验；fake recognizer 按每次预览对应的合成文本返回课程表。两个学期的教学日期由浏览器日历生成，课程名称使用每次测试生成的短可读后缀；不使用真实学生、课程表、资料或固定 UUID。学生旅程必须上传图片、预览、编辑并确认创建，不能 route/mock `/api/semesters/*`。

- [ ] **Step 5: 证明 harness 仍然是真实后端与 SQLite。**

  在 e2e 中通过现有 HTTP 读取 current/list/courses 并刷新 UI 验证写入；断言没有 Playwright route mock 覆盖 semester、course、exam、current 或 SQLite 路径。测试失败时 trace/report 仍只保存在仓库外隔离根。

- [ ] **Step 6: 运行现有 T09A selector E2E 作为 harness 回归。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\harness-t09a'
  pnpm exec playwright test e2e/semester-selector.spec.ts
  ```

  Expected: 现有 T09A 专项在 test-only OCR 边界下通过；若旧 spec 仍以 API mock 覆盖全部创建流程，可保留其回归目的，但必须由 Task 6 学生旅程补足真实 UI/SQLite 创建路径。

### Task 5：新增 T09D 导航与响应式 Playwright 专项验收

**Files:**

- Reuse: `packages/backend/test/e2e-server.ts`
- Reuse: `packages/backend/test/e2e-stale-current.ts`
- Create: `e2e/global-navigation-responsive.spec.ts`
- Create: `e2e/helpers/browser-calendar.ts`
- Modify only if required: `playwright.config.ts`

- [ ] **Step 1: 用现有 API 创建合成 ready/current semester。**

  使用 `/api/dev/init-semester` 或 T09A 现有 UI 流程准备隔离学期，不写固定 UUID。所有测试数据使用随机短后缀/测试返回 ID，并只写 `APP_DATA_ROOT`。

- [ ] **Step 2: 验收桌面导航。**

  使用 `1440x900`：侧栏持续可见；五个全局入口可达；当前入口高亮；从课程考试进入工作台后，上下文练习、错题、资料和时间线可达；页面内容不被侧栏遮挡；刷新保持 current semester。

- [ ] **Step 3: 验收窄屏与移动导航。**

  使用 `768x1024` 和 `390x844`：无横向溢出；底部导航不遮挡最后一个交互控件；“更多”可用键盘打开/关闭并可到学期与设置；核心学习入口没有只在 hover 或隐藏菜单深处；方向切换/resize 后仍可用。

- [ ] **Step 4: 验收安全状态。**

  从无 current 首次进入、未知路由、真实 stale 恢复和刷新恢复场景验证统一状态。真实 stale 的前置条件只能由 `packages/backend/test/e2e-stale-current.ts` 在已通过真实 UI/API 创建并选择学期后构造：该 test-only helper 使用现有 `getGlobalDbPath()` 与 `openExistingDbAtPath()`，仅对本次 `APP_DATA_ROOT` 的 `app_meta.current_semester_id` 写入每次生成的无效 UUID；随后必须通过真实 `GET /api/semesters/current` 与页面刷新触发服务端清理和恢复。该直接 SQLite 操作只用于制造损坏/stale 前置条件，不用于正常业务写入、断言或生产数据，且不得新增 dev API/schema/migration。current 读取失败/重试的组件语义由 `app-semester.test.tsx` 确定性覆盖；若专项 E2E 仅拦截一次 `GET /api/semesters/current` 以制造浏览器传输失败，必须立即取消拦截后通过真实后端重试，且不得把该单点前端传输测试描述为真实后端错误集成测试。UI 文本、截图、提交文件、文档和交付摘要不得输出完整 UUID、密钥、Provider URL 或资料原文；原始 trace/report 只留隔离根且不共享。

- [ ] **Step 5: 以隔离根运行专项。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\navigation-responsive'
  pnpm exec playwright test e2e/global-navigation-responsive.spec.ts
  ```

  Expected: 桌面、窄屏、移动、键盘/ARIA、404 和刷新恢复场景全部通过；输出只进入隔离根。

### Task 6：新增首次使用到日常学习的完整学生旅程 E2E

**Files:**

- Reuse: `packages/backend/test/e2e-server.ts`
- Reuse: `e2e/fixtures/synthetic-timetable.png`
- Create: `e2e/student-journey.spec.ts`
- Create: `e2e/helpers/student-journey-api.ts`
- Reuse/Create: `e2e/helpers/browser-calendar.ts`
- Modify only when helper复用确有必要: `e2e/daily-study-home.spec.ts`
- Modify only when helper复用确有必要: `e2e/course-schedule-exam-goals.spec.ts`

- [ ] **Step 1: 冻结完全隔离、顺序自足的旅程。**

  单个 spec 不依赖其他 spec 的数据或执行顺序；从空隔离根开始，使用 Task 4 test-only OCR 边界但真实 Express/SQLite，通过 UI 上传最小合成图片、预览、编辑并确认创建/选择学期 A。不得 route/mock `/api/semesters/*`，不得使用固定 UUID，不读取其他测试留下的数据。

- [ ] **Step 2: 用浏览器日历生成相对日期。**

  在页面上下文读取 `new Date()` 的本地年/月/日，以 Playwright 配置的 `Asia/Shanghai` 日历生成教学周、考试和课表日期：教学开始覆盖当前周，考试设置为浏览器今日之后稳定天数。不得用代码仓库提交日附近的硬编码“今天”；不得用 Node 主机 UTC 日期替代浏览器日历。

- [ ] **Step 3: 通过 UI 完成核心创建和编辑。**

  创建并选择学期 A；创建课程；新增和编辑完整周课表条目；创建考试；编辑考试名称/日期/目标；确认考试；断言正式倒计时；返回今日学习并看到当前学期上下文。

- [ ] **Step 4: 访问现有学习能力。**

  从课程考试进入 T11 工作台；访问资料与笔记入口；访问限时练习和错题入口并接受真实的空状态/下一步；通过现有 `/api/study-events` 写入不含资料原文的合成事件后，刷新工作台并验证时间线。不要为“有内容”新增 note/practice/mistake 创建 API；已有能力为空时验收真实空状态即可。

- [ ] **Step 5: 切换学期并验证隔离。**

  通过同一真实 UI/preview/confirm 流程创建并切换到学期 B；确认导航摘要立即更新，A 的课程、考试、课表、资料和时间线文本不出现；为 B 创建最小不同课程；切回 A 并确认 A 数据恢复、B 数据不混入。任何等待都使用可见状态/响应条件，不使用固定长 sleep。

- [ ] **Step 6: 刷新并恢复 current semester。**

  在 A 或 B 当前状态执行真实 page reload；断言 current 从后端恢复、导航与页面内容属于同一学期，且 `localStorage` 不含 current semester、密钥、Provider URL 或资料原文。动态完整 UUID 不得渲染在 UI、截图、提交文件、文档或交付摘要；原始 trace/HTML report/test-results 只留在仓库外 `APP_DATA_ROOT`，不得暂存、提交、上传或作为共享附件。

- [ ] **Step 7: 隔离运行完整旅程。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\student-journey'
  pnpm exec playwright test e2e/student-journey.spec.ts
  ```

  Expected: 首次使用、学期/课程/课表/考试/目标/确认、今日首页、工作台、资料/练习/错题/时间线、双学期隔离和刷新恢复全程通过。

### Task 7：完成类型、构建、单元/集成和专项回归

**Files:**

- No new production scope; fix only regressions caused by Tasks 1–6.

- [ ] **Step 1: 运行静态与构建验证。**

  ```powershell
  pnpm type-check
  pnpm --filter @ai-studybuddy/backend exec tsc -p tsconfig.e2e.json --noEmit
  pnpm -r --filter backend run build
  pnpm -r --filter @ai-studybuddy/frontend run build
  ```

- [ ] **Step 2: 运行全量单元/集成测试。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\unit-integration'
  pnpm test
  ```

  Expected: 前端组件测试、后端真实 SQLite 集成测试全部通过；无数据库或业务 API 新增。

- [ ] **Step 3: 运行 T09A/T09B/T09C 关键回归。**

  每条命令使用独立子目录，避免 SQLite 和 Playwright 附件互相污染：

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\regression-t09a'
  pnpm exec playwright test e2e/semester-selector.spec.ts

  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\regression-t09b'
  pnpm exec playwright test e2e/daily-study-home.spec.ts

  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\regression-t09c'
  pnpm exec playwright test e2e/course-schedule-exam-goals.spec.ts
  ```

- [ ] **Step 4: 运行两个 T09D 专项。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\t09d-specialized'
  pnpm exec playwright test e2e/global-navigation-responsive.spec.ts e2e/student-journey.spec.ts
  ```

- [ ] **Step 5: 控制端口和顺序波动。**

  每次 Playwright 运行前确认 `4311/4173` 无上一轮残留进程；若端口占用，先定位并终止本任务启动的残留服务，不修改配置为 `reuseExistingServer: true`。保留 `workers: 1`、`fullyParallel: false`，同时要求每个 spec 自建数据，不能依赖当前顺序。

### Task 8：独立代码复审、修复和全量 E2E

**Files:**

- Review all T09D implementation/test diffs; no unrelated changes.

- [ ] **Step 1: 请求独立 fresh-pass 代码复审。**

  审查范围至少包括：第二套 semester 状态、旧学期数据闪现、移动入口隐藏、ARIA/键盘、跨学期资源泄露、localStorage 敏感信息、无必要 API/schema、E2E 日期/UUID/顺序/端口波动和范围越权。

- [ ] **Step 2: 修复全部 P0/P1 和任务范围内 P2，重跑受影响测试。**

  不以“后续处理”绕过影响验收或数据隔离的缺陷；范围外建议登记但不顺手实现 T09E/未来阶段。

- [ ] **Step 3: 运行全量 Playwright。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\full-e2e'
  pnpm test:e2e
  ```

  Expected: 既有和新增全部 E2E 通过；每个 spec 无固定 UUID/今日日期或前序数据依赖。

- [ ] **Step 4: 重新运行完整静态、构建和测试矩阵。**

  ```powershell
  pnpm type-check
  pnpm --filter @ai-studybuddy/backend exec tsc -p tsconfig.e2e.json --noEmit
  pnpm -r --filter backend run build
  pnpm -r --filter @ai-studybuddy/frontend run build
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\final-test'
  pnpm test
  ```

### Task 9：登记实施证据并完成实现分支交付

**Files:**

- Modify: `.plans/phase1-t09d-global-navigation-student-journey-plan.md`
- Modify: `docs/04-开发任务清单-Todo-List.md`

- [ ] **Step 1: 更新任务状态与证据。**

  只有 Tasks 1–8 全部完成，且独立代码复审提出的全部 P0/P1 和任务范围内 P2 已关闭并完成回归后，才在 `docs/04` 勾选 T09D 实现项并登记：实施分支、提交哈希、type-check/后端 E2E harness 类型检查/build/test 数量、两个专项 E2E、T09A/B/C 回归、全量 E2E、隔离根、独立代码复审结论。T09E 继续“尚未创建计划、尚未启动”。

- [ ] **Step 2: 运行治理和 diff 检查。**

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
  git diff --check
  git status --short
  ```

  Expected: 治理通过、无空白错误、无越权文件、无真实秘密/资料/正式运行数据。

- [ ] **Step 3: 提交并推送实施分支。**

  使用显式路径暂存 T09D 文件，提交信息遵循 `type(scope): 中文描述`；推送 `codex/phase1-t09d-global-navigation-student-journey` 仅代表审查/集成候选，不代表完成。

### Task 10：rebase、fast-forward 合入并在主线重新验证

- [ ] **Step 1: 同步并 rebase。**

  ```powershell
  git fetch origin
  git rebase origin/master
  ```

  rebase 后重新运行至少 `pnpm type-check`、`pnpm --filter @ai-studybuddy/backend exec tsc -p tsconfig.e2e.json --noEmit`、前后端 build、`pnpm test`、两个 T09D 专项、T09A/B/C 回归、`pnpm test:e2e`、治理和 diff 检查；冲突或失败立即停止，不强行合并。

- [ ] **Step 2: fast-forward 合入最新本地主线。**

  ```powershell
  git checkout master
  git pull --ff-only origin master
  git merge --ff-only codex/phase1-t09d-global-navigation-student-journey
  ```

- [ ] **Step 3: 在 `master` 使用新的隔离子目录重跑完整验证。**

  ```powershell
  pnpm type-check
  pnpm --filter @ai-studybuddy/backend exec tsc -p tsconfig.e2e.json --noEmit
  pnpm -r --filter backend run build
  pnpm -r --filter @ai-studybuddy/frontend run build
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\master-final-test'
  pnpm test
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\master-t09d'
  pnpm exec playwright test e2e/global-navigation-responsive.spec.ts e2e/student-journey.spec.ts
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\master-regression-t09a'
  pnpm exec playwright test e2e/semester-selector.spec.ts
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\master-regression-t09b'
  pnpm exec playwright test e2e/daily-study-home.spec.ts
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\master-regression-t09c'
  pnpm exec playwright test e2e/course-schedule-exam-goals.spec.ts
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09d-global-navigation-student-journey\master-full-e2e'
  pnpm test:e2e
  powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
  git diff --check
  ```

- [ ] **Step 4: 推送远端主线后才报告完成。**

  ```powershell
  git push origin master
  ```

  只有 `origin/master` 包含 T09D 实现和 `docs/04` 证据提交，且主线验证全部通过，才可报告“T09D 完成”。交付说明必须写清实施分支名、提交哈希、是否已合并 `master`、是否已推送 `origin/master` 和 `docs/04` 证据位置。

---

## 3. 验收标准

1. 全局主导航在桌面、窄屏和移动端均清晰可达，不出现重复主导航，移动固定导航不遮挡内容。
2. 当前路由高亮正确；键盘、焦点、ARIA、44px 点击区域和 safe-area 处理通过测试。
3. 每日首页、课程/课表/考试、学期、资料/笔记、设置存在全局入口；工作台、练习、错题和时间线通过真实考试上下文可达。
4. `App` 保持唯一 current semester 状态；刷新从后端恢复，导航不创建第二套 current 状态或浏览器持久化。
5. loading、none、stale、普通错误/重试、empty、404 和跨学期资源失败具有一致且领域明确的体验。
6. 学期切换时旧页面立即卸载，不出现上一学期课程、考试、资料或时间线闪现。
7. 原则上无生产 backend/shared/schema/migration/业务 API diff；仅允许 Task 4 的 test-only `packages/backend/test/e2e-server.ts`、`packages/backend/test/e2e-stale-current.ts`、`packages/backend/tsconfig.e2e.json` 与最小合成 PNG。若出现除此之外的后端/API/schema 变更即视为范围异常并停止重新规划。
8. 浏览器存储、UI、截图、提交文件、文档和交付摘要不包含密钥、Provider URL、资料原文、完整 UUID 或正式运行数据；Playwright 原始 trace/HTML report/test-results 只可留在仓库外隔离根，不得暂存、提交、上传或共享。
9. `global-navigation-responsive.spec.ts` 和 `student-journey.spec.ts` 使用 Task 4 的 test-only OCR 边界、真实 Express 路由/服务/事务/migration、真实 SQLite、隔离根和合成数据通过。
10. 日期由 Playwright 浏览器日历相对生成；UUID 来自 API 返回或每次生成；spec 不依赖测试顺序；残留端口不被复用。
11. type-check、前后端 build、全量单元/集成测试、T09A/B/C 回归、T09D 专项、全量 E2E、文档治理和 diff 检查均通过。
12. 完成后 T09E 仍未创建计划、未启动；只有 `origin/master` 包含提交后才可报告 T09D 完成。

---

## 4. 计划门禁交付记录（本轮）

- [x] 从最新 `origin/master` @ `07a2b0fc880fcfeb48448565f4de8fd8ca4c29b5` 创建独立计划分支。
- [x] 核对 `docs/00`、`docs/04`、`docs/01`、`docs/02`、`docs/08`–`docs/12`、`docs/15`、T09A/T09B/T09C 计划和当前前端/E2E 实现。
- [x] 创建本独立实施计划；未修改业务代码。
- [x] 初次独立 fresh-pass 复审发现稳定真实 E2E harness、证据边界和错误注入表达缺口，已按复审意见修订。
- [x] 第二次独立 fresh-pass 复审发现 harness 类型检查、真实 stale 造数、实施收尾门禁与禁止路径表达缺口，已按复审意见修订。
- [x] 第三次独立 fresh-pass 复审发现 test-only 允许文件清单和 `docs/04` 复审历史表达不一致，已按复审意见修订。
- [x] 第四次独立 fresh-pass 计划复审通过，12 项检查均无 P0/P1/P2。
- [x] 已将 `docs/04` 的 T09D 状态同步为等待用户明确批准，T09E 保持未启动。
- [x] 已运行文档治理和工作区 diff 检查；staged diff 检查在显式暂存后执行。
- [ ] 仅提交并推送本计划文件与 `docs/04`。

---

## 5. 独立 fresh-pass 计划复审记录

> 初稿完成后由独立审查者填写；如结论不通过，先修订计划再重新复审，未通过前不得把 `docs/04` 登记为等待批准。

### 5.1 初次 fresh-pass（2026-07-18）

**审查者：** 独立只读审查。

**发现与修订：**

1. 原计划未给出“真实 UI 学期创建 + 真实 Express/SQLite + 稳定 OCR”的可重复路径；已新增 Task 4，冻结 `packages/backend/test/e2e-server.ts` test-only `FakeTimetableRecognizer`、`playwright.config.ts` 启动入口及最小合成图片夹具，明确生产入口/业务 API/schema 不变。
2. 原“Playwright 附件不含完整 UUID”没有区分 UI/共享证据和原始 trace；已改为 UI、截图、提交文件、文档和交付摘要禁止完整 UUID，而 trace/report 只留仓库外隔离根、不得共享或提交。
3. 原 current 读取失败/重试的 E2E 注入方式不清；已明确组件测试承担语义覆盖，E2E 如有一次性浏览器传输层故障只验证前端重试并立即回到真实后端。
4. `docs/04` 在复审未通过时不得声称已复审通过；已先回退为待第二次复审状态。

**结论：** 不通过，需要修订。

### 5.2 第二次 fresh-pass（2026-07-18）

**审查者：** 独立只读审查。

**发现与修订：**

1. test-only `e2e-server.ts` 不在现有生产 `tsconfig.json` 的 `include/rootDir` 中；已增加 `packages/backend/tsconfig.e2e.json`，在 Tasks 4、7、8、10 明确执行 `tsc -p tsconfig.e2e.json --noEmit`，且不写入生产 `dist`。
2. `playwright.config.ts` 切换 backend `webServer` 本就是 harness 必需改动，不再错误标记为“仅证明缺陷后才修改”；额外隔离配置仍需先证明。
3. 真实 stale 恢复缺少确定性前置条件；已增加 test-only `packages/backend/test/e2e-stale-current.ts`，只用既有 `getGlobalDbPath()` 与 `openExistingDbAtPath()` 在本次隔离根写入无效 current ID，随后由真实服务读取/清理；不新增 dev API、schema 或 migration。
4. 实施收尾必须在 Tasks 1–8（含独立代码复审）全部完成后才登记 `docs/04` 证据；已修正 Task 9 门禁。
5. 禁止数据库变更的路径由不存在的 `src/database/**` 更正为实际 `src/db/**`，并明确 Task 4 test-only 例外边界。

**结论：** 不通过，需要修订。

### 5.3 第三次 fresh-pass（2026-07-18）

**审查者：** 独立只读审查。

**发现与修订：**

1. Task 4 允许新增的 test-only 文件在范围表和验收标准中只列出 `e2e-server.ts` 与合成 PNG，遗漏 `e2e-stale-current.ts`、`tsconfig.e2e.json`；已在范围表和验收标准统一列出四项，并再次限定 stale helper 只可操作隔离根的既有 schema 数据、不得新增 dev API/schema/migration。
2. `docs/04` 的门禁标题已写“待第三次复审”，正文却仍写“等待第二次复审”；已将本轮历史表达同步为初次/第二次缺口已修订、第三次发现两项 P2，等待第四次复审。

**结论：** 不通过，需要修订。

### 5.4 第四次 fresh-pass（2026-07-18）

**审查者：** 独立只读审查。

| #   | 检查项                                                                                | 结果 |
| --- | ------------------------------------------------------------------------------------- | ---- |
| 1   | 严格限于 T09D，排除 T09E/删除/跨学期汇总/S5/S7/未来阶段                               | 通过 |
| 2   | 复用 T09A/T09B/T09C/T11，不重做既有业务能力                                           | 通过 |
| 3   | `App` 保持唯一 current semester，导航不创建第二套状态或持久化                         | 通过 |
| 4   | 切换、刷新与真实 stale 恢复不会展示旧学期数据                                         | 通过 |
| 5   | 桌面、窄屏、移动端关键入口均可达                                                      | 通过 |
| 6   | `PageState` 仅做最小渐进统一，不触发设计系统重构                                      | 通过 |
| 7   | test-only harness 仍走真实 Express/SQLite/隔离根，OCR 仅替换外部边界                  | 通过 |
| 8   | 日期由 Playwright 浏览器 `Asia/Shanghai` 日历相对生成                                 | 通过 |
| 9   | 无生产业务 API/shared DTO/schema/migration 计划；四项 test-only 例外清单一致          | 通过 |
| 10  | UI/截图/提交文件/文档不泄露密钥、Provider URL、资料原文、完整 UUID 或正式数据         | 通过 |
| 11  | 验证矩阵覆盖 E2E harness 类型检查、构建、回归、全量 E2E、独立代码复审、治理和主线复验 | 通过 |
| 12  | T09E 仍未创建计划、未启动                                                             | 通过 |

**结论：** 通过，等待用户明确批准
