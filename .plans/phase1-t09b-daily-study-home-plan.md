# Phase 1-T09B：每日学习首页实施计划

**状态**：实施与独立复审已完成；待主线集成与主线复验（2026-07-18）
**任务**：`Phase 1-T09B：每日学习首页`
**计划分支**：`codex/phase1-t09b-daily-study-home-plan`（已推送）
**实施分支**：`codex/phase1-t09b-daily-study-home`
**基线**：`origin/master` @ `5e9ee57`（2026-07-18）
**关联任务**：T09A 已完成并已合入 `origin/master`；T09C–T09E 未启动。

## 0. 门禁、事实来源与范围

### 0.1 当前门禁

- `docs/04-开发任务清单-Todo-List.md` 的任务 21 已登记 T09B，行动计划索引已指向本文件；2026-07-18 已完成独立复审并获用户明确批准。
- 本文件的独立复审已通过，且用户已于 2026-07-18 明确批准实施；实现仅可在 `codex/phase1-t09b-daily-study-home` 分支内，仍须严格遵守本计划的范围与禁止项。
- T09A 已提供 `GET /api/semesters/current`、当前学期恢复、`semesterId` 显式传递和跨学期隔离。T09B 必须复用这些能力，不能重新设计学期创建、选择、切换或浏览器持久化。

### 0.2 产品依据

- `docs/01` 定义每日首页为证据驱动的每日闭环：只突出明日准备、今日到期、待修正质量问题、计划的错题复习和最合适下一步；它不是普通待办堆积，也不是 AI 强制排程。
- `docs/04` 将 T09B 限定为：今日待办任务、临近考试倒计时、待质检资料、错题复习提醒和下一步行动建议。
- `docs/15` 允许每日首页替代裸 `/courses` 的默认入口；全局导航、课表编辑、练习历史和家长面板仍各属 T09C、T09D、T09E 或后续门禁。

### 0.3 本任务做与不做

| 范围 | T09B 结论 |
| --- | --- |
| 每日首页读模型 | 新增按显式 `semesterId` 与本地日历日读取的只读聚合，返回有限、可解释的首页卡片和确定性下一步。 |
| 默认入口 | 当前学期恢复成功后，`/` 渲染每日首页；保留 `/courses` 现有页面和直达路由，不把课程页重写为首页。 |
| 当前学期复用 | 继续由应用壳请求/维护 T09A `currentSemester`；首页只接收该状态提供的 `semesterId`，不读写 `localStorage`，不新增学期选择接口。 |
| 状态与恢复 | 覆盖当前学期缺失、恢复加载、首页数据加载、无可显示事项、请求失败、刷新恢复和 stale semester。 |
| 允许的跳转 | 每张卡片只可链接到已经存在且与该学期匹配的课程、考试工作台、资料、错题或练习页面；首页不创建新的编辑/完成操作。 |
| 不做 | 不做 T09C 课表查看/编辑、考试目标完善；不做 T09D 全局侧栏/底栏或全局 IA 重构；不做 T09E 练习历史/学期归档；不做 S5、S7、家长 Web 面板、Phase 2/3、云同步或多用户。 |
| 明确禁止 | 不修改已完成 T09A/M01 业务逻辑；不修复或调整 KaTeX 535.51 kB 独立遗留 warning；不增加真实 Provider/SMTP/飞书调用。 |

### 0.4 不变量与边界

1. 所有业务读取必须以请求中的有效 `semesterId` 打开已 ready 的学期库；不得由每日首页 API 隐式读取或改变全局 current semester。
2. 一个首页响应只能包含该 `semesterId` 学期库中的数据。另一学期的任务、考试、资料、错题、弱项、事件和路径均不得泄漏到卡片、数量、推荐或错误文本。
3. `date` 表示孩子本机选定的本地日历日，使用严格 `YYYY-MM-DD`；前端每次加载/刷新显式传入当天值，后端校验后按日期比较，不以 UTC 时间戳跨日推断。
4. 首页是只读投影：不在加载时创建任务、改变任务状态、确认考试、生成练习、调用 AI、发送报告或写入 StudyEvent。
5. “下一步”必须是确定性、可解释的已有事实排序，不产生 AI 建议。优先级固定为：待修正质量问题 → 今日到期任务 → 明日准备 → 已计划错题复习 → 最近已确认考试准备；无候选时明确返回无建议。
6. 首页只展示完成闭环所需的简短标签、日期、倒计时、状态与受控内部目标；不回传资料原文、笔记正文、答案、Provider 配置、绝对路径、完整外部渠道地址或完整 UUID。
7. 虽然 `docs/01` 为未来产品保留“当前学期与处于 `FOLLOW_UP` 的学期可同时被每日首页读取”的能力，本 T09B 受当前门禁的显式 `semesterId`、当前学期恢复与跨学期隔离要求约束，固定只读取用户当前已选择的一个 ready 学期；跨 `FOLLOW_UP` 汇总、补考/迟交跨学期编排不在本任务，必须另行登记、计划、复审并获批。

## 1. 目标交互与状态矩阵

### 1.1 正常读模型

后端为一个当前学期生成 `DailyStudyHomeDto`。聚合项的来源和显示边界如下：

| 卡片 | 只读事实来源 | 首页展示 | 受控动作 |
| --- | --- | --- | --- |
| 今日待办 | `study_tasks` 中未闭合且到期日为 `date` 的任务 | 标题、所属课程短名、到期状态、预计时长（如已有） | 跳到既有任务所属考试/课程上下文，不在首页完成任务 |
| 明日准备 | 当前学期 `schedule_entries` 与未闭合准备事项的已存事实 | 明日课程及需要准备的简短提示；没有事实则不编造 | 跳到既有课程/考试上下文 |
| 临近考试 | 已确认、可计算倒计时且尚未结束的 `assessment_attempts` | 考试名称/课程短名/剩余天数；按最早日期有限展示 | 跳到既有 `/exams/:examId` |
| 待质检资料 | 已有资料/作业处理状态中明确为待质检、失败待修正或待人工处理的记录 | 类型、受控状态、简短下一步，不显示原文或文件路径 | 跳到既有资料或笔记上下文（仅在已有目标可用时） |
| 错题复习 | `mistakes`、`weak_points` 与既有回流规则可直接导出的未完成复习事实 | 课程短名、弱项/数量、复习状态 | 跳到既有错题列表/详情或练习入口 |
| 下一步 | 上述候选的确定性优先级排序 | 仅一项、显示“为什么现在做” | 复用该候选的内部目标 |

若现有持久化模型无法提供某类“已计划”或“待质检”事实，实施时只返回可由现有字段严格证明的项目；不得为填满首页而新增隐式规则、占位事项、迁移或 AI 推断。任何确有必要的新业务事实必须另行登记、计划、复审并获批，不属于 T09B。

### 1.2 前端状态

| 情形 | 行为 |
| --- | --- |
| 应用壳正在恢复 current semester | 沿用应用壳的“正在恢复当前学期…”保护态；不并发请求首页。 |
| 没有当前学期 | 沿用 T09A 保护规则跳转 `/semesters`，每日首页不提供创建/选择表单。 |
| current semester 可用、首页读取中 | 显示仅属于首页的 loading skeleton/文字，不显示旧学期残留卡片。 |
| 首页成功且有事项 | 显示有限卡片、明确的下一步和受控内部链接。 |
| 首页成功但无事项 | 显示积极的空状态，说明当前学期当天没有待闭合事项；不把空状态伪装成加载失败，也不跳转课程编辑。 |
| 网络/500/可恢复业务错误 | 显示脱敏错误和“重试”按钮；重试重新请求同一 `semesterId` + `date`，不改变当前学期。 |
| `SEMESTER_NOT_FOUND` / 学期不再 ready 等 stale current 错误 | 调用现有应用壳 `onSemesterError` 恢复 current semester；恢复失败后按 T09A 规则回到 `/semesters`，不得继续显示旧数据。 |
| 浏览器刷新 | 应用壳先恢复 T09A current semester，再重新请求首页；不得使用 `localStorage` 缓存首页或手输 UUID。 |
| 学期切换后回到首页 | 以 T09A 已保存并恢复的 current semester 为唯一来源重新读取；请求中不得复用上一学期 `semesterId` 或卡片。 |

## 2. 后端与共享契约实施步骤（获批后执行）

1. 在 `packages/shared/src/types.ts`（及现有共享导出位置）定义最小 `DailyStudyHomeDto`、卡片/行动枚举和受控内部目标 DTO。字段只保留前端所需的显示摘要、日期/倒计时、数量、理由和目标 ID；禁止把数据库行、绝对路径或敏感正文透传。
2. 新建 `packages/backend/src/services/daily-study-home-service.ts`。复用 `StudyRhythmService`/T09A 已有的 ready-semester 校验语义、参数绑定和受控数据库路径；以 `semesterId`、严格 `date` 为输入，拒绝缺失/非法 UUID、非法日期、非 ready 或不存在学期。
3. 在服务中为每种卡片使用参数化 SQL 从当前学期库读取已有事实，限定数量并稳定排序；将日期比较、倒计时和“下一步”排序集中于服务，保证可单测且不依赖真实当前时间。向服务注入/传入时钟或测试日期，避免测试在午夜漂移。
4. 新建 `packages/backend/src/api/daily-study-home.ts`，提供 `GET /api/daily-study-home?semesterId=<uuid>&date=<YYYY-MM-DD>`。沿用 `{ success, data, error }` 信封和既有 `StudyRhythmError` 风格的受控错误映射；未知错误只返回通用脱敏消息。
5. 在 `packages/backend/src/app.ts` 注册新 router；不改现有 T09A selector router 的接口、current 写入逻辑或任何已完成服务行为。
6. 除非第 2–5 步的现有字段证明无法表达已经承诺的 T09B 事实，否则不增加 migration。若发现数据模型缺口，停止在计划外扩展处并提交缺口说明，等待新的任务门禁。

## 3. 前端实施步骤（获批后执行）

1. 新建 `packages/frontend/src/api/daily-study-home-api.ts`，使用既有前端 API 封装风格，显式传递 `semesterId` 和本地 `YYYY-MM-DD`，解析标准信封并保留错误 code 供 stale-semester 处理。
2. 新建 `packages/frontend/src/pages/daily-study-home-page.tsx`，接收 `semesterId` 与 `onSemesterError`，在每个 `semesterId`/日期变化时清空旧视图再读取聚合。实现 1.2 的 loading、empty、error/retry、stale 与成功状态，卡片使用语义化标题和可访问链接/按钮。
3. 在 `packages/frontend/src/app.tsx` 中仅调整 `/` 与兜底默认入口：有 current semester 时渲染/重定向到每日首页；无 current semester 时仍到 `/semesters`。保留 `/courses`、`/semesters` 和所有既有深链，不加入全局侧栏、底栏或跨页面导航重构。
4. 在 `packages/frontend/src/styles/global.css` 追加局部、响应式首页布局和状态样式；不借机重写全局主题或已完成页面样式。若需要复用已有状态类，优先复用。
5. 不修改 `semester-page.tsx` 的学期创建/选择业务流程。学期切换后的当前值仍由 T09A 保存；每日首页通过应用壳再次加载该值证明隔离，不另设第二套选择器。

## 4. 自动化、浏览器验收与回归（获批后执行）

### 4.1 后端集成测试

新增 `packages/backend/test/daily-study-home-api.test.mjs`，使用隔离 `APP_DATA_ROOT` 和真实 SQLite（不 mock DB），至少覆盖：

1. 所有五类可由现有字段证明的首页项目能按稳定优先级聚合，`nextAction` 与第一优先候选一致；无事实时返回合法空 DTO。
2. 缺失/非法 `semesterId`、非法 `date`、学期不存在、未 ready 或 stale 记录返回标准信封、正确 HTTP 状态和不含绝对路径的消息。
3. 两个学期各写入不同任务、考试、资料/质量状态与错题数据后，请求 A 绝不包含 B 的标题、数量、目标或推荐；切换请求参数后只出现 B。
4. 日期边界：今日到期、明日准备、已结束考试、未来考试和完成任务的包含/排除规则固定；使用注入时钟/显式日期确保可重复。
5. API 只读：调用前后核对任务、考试、资料、错题、StudyEvent 与 current semester 未发生写入。

### 4.2 前端单测

遵循现有 Vitest/Testing Library 组织，在与页面相邻或既有前端 test 目录中新增每日首页测试，至少覆盖：

1. 接到 current semester 后请求带正确 `semesterId` 与本地日期，渲染有限卡片、倒计时、理由与安全内部链接。
2. 请求加载时不显示上一学期卡片；空 DTO 显示明确空状态；普通失败显示脱敏错误并可重试。
3. stale-semester 错误调用 `onSemesterError`，不继续渲染旧卡片。
4. 重新挂载/日期或学期变化时重新加载，不使用 `localStorage`，并确认 `/courses` 现有直达页面未被替换。

### 4.3 隔离 Playwright E2E

新增 `e2e/daily-study-home.spec.ts`，使用专用 `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-t09b-daily-study-home` 与受控测试数据，至少验证：

1. 新鲜启动无 current semester 时访问 `/` 自动到 `/semesters`；不出现第二套创建/选择器。
2. 已有 current semester 时访问 `/` 展示每日首页的成功路径；`/courses` 深链仍可用。
3. 选择/保存不同当前学期后重新访问或刷新 `/`，只显示新学期卡片，旧学期内容不残留。
4. 页面加载、无事项空状态、受控 500/retry 与 stale current 恢复分别可见、可操作且不会泄露 UUID/路径。
5. 截图只保存仓库外的脱敏证据目录；不提交学生姓名、资料原文、完整 UUID、真实渠道或 Provider 信息。

### 4.4 完整验证与主线复验

任务实现分支完成后依次运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09b-daily-study-home'
pnpm exec playwright test e2e/daily-study-home.spec.ts
```

再做真实浏览器验收，覆盖成功、加载、空、失败/重试、缺失当前学期、刷新恢复和双学期隔离。实现分支 rebase 到最新 `origin/master` 后，按 `docs/12` fast-forward 合入 `master`，在 `master` 重跑适用验证并推送 `origin/master`；只有完成此流程才可报告 T09B 实现完成。

## 5. 文档、提交与交付步骤（获批后执行）

1. 实施前：用户明确批准本计划后，才从最新 `origin/master` 创建 `codex/phase1-t09b-daily-study-home`；计划分支绝不作为实现分支。
2. 实施中：每个测试、验证和范围变化均如实记录；若数据模型缺口、范围扩大或失败，停止并另行登记，而不是顺带实施 T09C–T09E。
3. 实施完成且验证通过后：在 `docs/04` 勾选 T09B 实际完成项、登记任务分支、提交哈希、验证命令/结果、已知边界及合入/推送状态；同步 `docs/00` 仅在索引状态确有变化时进行。
4. 每次提交使用 `type(scope): 中文描述`，显式路径暂存，先运行 `git diff --cached --check`。计划文档提交不等于 T09B 完成；实现分支推送不等于已合入 `master`。
5. 交付必须区分：计划分支/实现分支、提交哈希、是否已推送、是否已 fast-forward 合入 `master`、是否已推送 `origin/master`，并指出 `docs/04` 的更新位置。

## 6. 计划完成判定（本文件阶段）

本计划阶段仅在以下事项全部成立时完成：

- 本计划通过独立复审，确认范围、T09A 复用、状态矩阵、隔离、验证与越权禁令均无遗漏；
- `docs/04` 的 T09B 行和“Phase 1 行动计划索引”已同步为“计划已创建、已独立复审、获用户明确批准、实施进行中”；
- 文档治理和 `git diff --check` 均通过；
- 计划文档按独立计划分支提交并推送（如用户允许/本轮提交）；
- 本计划阶段已结束；实施期间不得把分支实现、分支推送或局部验证表述为 T09B 已完成，只有合入并推送 `origin/master` 后才可更新完成状态。
## 7. 独立计划复审记录（2026-07-18）

**结论**：通过；用户已于 2026-07-18 明确批准实施。本复审记录保留为实施范围与越权检查依据。

| 检查项 | 复审结论 |
| --- | --- |
| 单一责任边界 | 仅覆盖每日学习首页；T09C–T09E、S5、S7、家长 Web 面板和 Phase 2/3 均明确排除。 |
| T09A 复用 | 复用 current semester 恢复与显式 `semesterId`，不新建选择器、不修改 T09A 学期业务逻辑。 |
| 状态与隔离 | 已覆盖缺失当前学期、加载、空、错误/重试、刷新恢复、stale current 和双学期隔离。 |
| PRD 范围歧义 | 已处理：尽管总 PRD 为未来保留 current + `FOLLOW_UP` 同读能力，T09B 固定为当前已选择的单学期首页；跨学期汇总后置并需新门禁。 |
| 实施与验证 | 已列出后端/API、前端、真实 SQLite 集成测试、前端单测、隔离 E2E、文档治理、diff 检查和合入 `master` 后复验。 |
| 禁止项 | 已明确不处理 KaTeX 遗留 warning，不扩大为全局导航、课表编辑、练习历史、归档或后续阶段。 |

## 8. 批准与实施启动记录（2026-07-18）

- 用户已明确批准按本计划实施 T09B。
- 实施工作区使用 `codex/phase1-t09b-daily-study-home`；基线验证已通过（前端 64/64、后端 215/215）。
- 本记录仅确认门禁已解除，不构成完成声明；T09C–T09E、S5、S7、家长 Web 面板和 Phase 2/3 继续不在实施范围内。

## 8. 实施验证记录（2026-07-18，待主线集成）

- 实现提交：`562a633 feat(phase1): 实现 T09B 每日学习首页`；计划提交：`d324dab docs(phase1): 登记 T09B 每日学习首页实施计划`。
- 已实现且仅实现本计划的当前单学期只读首页：复用 T09A current semester，展示今日/明日任务、明日课程、已确认考试、待处理资料、错题复习和确定性下一步；未新增 migration、写 API、全局导航、课表编辑、练习历史或其他后续任务。
- 分支验证：`pnpm type-check`、后端/前端 build、T09B 后端真实 SQLite 集成测试 3/3、前端页面测试 4/4、前端根级测试 69/69、后端全量测试 218/218、隔离 Playwright E2E 1/1、文档治理与差异检查均通过。首次全量运行的一次既有 S4 子进程启动失败已以单文件 6/6 和后端全量 218/218 重跑确认未复现，未改动 S4。
- 既有 KaTeX 535.51 kB 构建 warning 仅如实保留，未在本任务处理。
- 当前任务分支已推送，但尚未 fast-forward 合入 `master`、尚未推送 `origin/master`；不得据此报告 T09B 已在主线完成。
