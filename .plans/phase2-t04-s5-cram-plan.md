# Phase 2-T04 临考速背 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 T02 模拟考、T03 模拟考前端、S3 练习和 S4 错题既有事实的前提下，在已确认考试上下文内提供可追溯的确定性临考速背卡片与整次限时翻阅体验。

**Architecture:** T04 后续获批实施时仅增加一个由后端聚合的只读速背卡片 API、共享 DTO、`ExamCrammerService` 查询方法和学生端独立页面。卡片即时从同学期、同课程的知识模块、活跃薄弱点和未掌握错题事实组装；不持久化卡片或阅读进度，不新增 Schema/migration/Worker，也不调用真实 AI。浏览器只在 `sessionStorage` 保存不含正文的会话恢复元数据，权威卡片始终重新从 API 读取。

**Tech Stack:** Express、SQLite（只读查询）、`@ai-studybuddy/shared`、React、TypeScript、React Router、Vite、Vitest、Playwright、既有 `api-client.ts`、`use-practice-timer.ts`、`PageState`、`FeedbackMessage`、`sessionStorage`。

---

## 1. 触发依据、门禁结论与停止规则

- 计划基线：`origin/master` `439d6ad84169d7ddb1e88347ccc9963fd01bfeea`；该基线已包含 T03 模拟考前端实现 `e8f161b`、主线收尾 `bb8bf77` 和推送状态同步 `439d6ad`。
- `docs/00-文档索引-Index.md` 已将 `docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md` 登记为有效 S5 PRD；`docs/04-开发任务清单-Todo-List.md` 的 Phase 2 表将 T04 定义为“按薄弱点和错题生成速背卡片，限时翻阅”。
- S5 PRD 要求速背内容可追溯至知识模块、错题或薄弱点；S5 只能只读复用 S3/S4 历史事实，且不得让题干、答案、学生作答或速背正文进入 S6。
- 审计确认：T02 已提供模拟考的考试/课程/模块校验与重要性定义；T03 已提供当前学期守卫、API 客户端、页面状态组件、`sessionStorage` 草稿安全恢复和总时长计时模式；S3/S4 已有可复用的知识模块、活跃薄弱点和未掌握错题事实。现有系统没有速背卡片 Schema、API、DTO、Service 或页面。
- 本轮仓库记录没有发现用户明确批准进入 T04 业务实现。

**门禁结论：**允许创建、独立审查、提交和推送本行动计划；在用户明确批准前，严禁实现 T04。

**获批前停止规则：**本计划、审查结论和 `docs/04` 登记提交并推送后立即停止。不得新增或修改 `packages/backend`、`packages/frontend`、`packages/shared`、测试业务文件、数据库 Schema、migration、API、Service、Worker、Provider 配置或业务路由；不得以占位、样式、夹具、代码生成或预验证名义提前实现。不得启动 T05、T06、S7、S3 Worker、家长报告扩展或任何真实外部调用。

---

## 2. T04 单一责任、用户流程与验收边界

### 2.1 单一责任

T04 只为学生在**已确认考试**的既有考试上下文中，提供按风险排序、可追溯来源、可在固定总时长内翻阅的速背卡片。它不是每日冲刺计划，不聚合考试工作台“冲刺”区，不创建学习完成事实，也不改变 S3/S4 的掌握状态。

### 2.2 后续获批实施时的用户流程

1. 学生从既有考试上下文导航进入独立路由 `/exams/:examId/cram`；该导航是 T04 自身入口，不在工作台创建 T06“冲刺”区。
2. 前端以当前学期 ID 和路由考试 ID 请求只读速背卡片；后端验证学期、考试、课程归属和 `confirmed` 状态，再返回当前候选卡。
3. 学生在卡片加载成功后选择 5、10 或 15 分钟（默认 10 分钟），显式开始本次翻阅；开始前可以浏览卡片摘要但不启动倒计时。
4. 翻阅期间支持键盘和按钮翻转当前卡片、前一张/下一张；“已阅”仅是本地会话状态，不产生后端写入。
5. 倒计时按绝对结束时间运行，浏览器隐藏或刷新不暂停；结束后保留当前卡片的翻转能力，锁定前后切换，展示已阅统计和既有错题/知识模块人工复习入口。
6. 刷新时重新请求权威卡片，再按卡片 ID 交集恢复当前卡、已阅集合和未过期的结束时间；任何卡片集变化、无效存储或已过期状态均安全回退为重新开始。

### 2.3 验收标准

- 仅已确认、同学期、同课程的考试能得到速背卡片；不存在、跨课程、跨学期、未确认或失效考试不能读取卡片。
- 每张卡可追溯到一个知识模块，并合并对应薄弱点/错题来源标签和计数；同一 `knowledgeModuleId` 绝不重复成多张卡。
- 卡片只展示模块标题、`content_summary` 和可安全展示的 `exam_relevance`，以及不含原题的风险提示；不返回资料原文、`source_evidence`、题干、选项、正确答案、学生作答、错因备注或完整错题详情。
- 空候选、服务失败、409 冲突和网络失败均有中文可行动反馈；任何失败都不创建空卡、虚假卡或 S3/S4/S5 事实。
- 倒计时、刷新恢复、窄屏阅读和键盘翻卡均可用；浏览器存储失效不能阻断翻阅或导致敏感正文落入浏览器存储。

---

## 3. 数据来源、优先级、去重与复用契约

### 3.1 只读数据来源和组卡规则

- 后端复用 T02 的学期就绪、课程存在、考试属于课程且 `confirmation_status = confirmed` 的校验语义；课程由考试归属推导，前端不传可伪造的课程 ID。
- 候选只限当前学期、该课程的知识模块；只读取 `title`、`importance`、`content_summary` 和 `exam_relevance`。缺少有效 `content_summary` 与 `exam_relevance` 的模块不生成卡片，避免空卡。
- 对候选模块只读关联 `weak_points` 中 `active` 记录，以及 `mistakes` 中 `pending_review`、`needs_review` 记录；不读取题目正文、答案、学生作答、错因备注、`source_evidence` 或完整错题详情。
- 按 `knowledgeModuleId` 聚合：每个模块生成至多一张卡；来源字段保留模块 ID、来源种类（`weak_point`、`mistake`、`knowledge_module`）及脱敏数量/时间摘要，使学生能理解卡片风险来自哪里而不暴露原题。

### 3.2 稳定优先级和去重排序

1. 含活跃薄弱点的模块优先；同层按薄弱点 `evidenceCount` 降序、`latestDetectedAt` 降序。
2. 其后为无活跃薄弱点但含未掌握错题的模块；同层按聚合错题 `errorCount` 降序、最新 `latestErrorAt` 降序。
3. 最后为仅知识模块信号的模块；按 T02 已有重要性 `critical → high → medium → low` 排序。
4. 前述并列项继续按模块重要性和稳定模块 ID 升序，保证同一数据库快照得到稳定顺序。
5. 不设置静默截断；返回全部满足安全正文要求的候选卡，避免隐藏高风险来源。前端的总时长只限制翻阅时间，不改变候选排序或数据内容。

### 3.3 既有系统的只读复用边界

- **T02 模拟考：**复用 `ExamCrammerService` 的学期/课程/已确认考试校验、知识模块重要性定义和 API 错误映射；不改模拟卷、尝试、提交、成绩、模块分析或 AI 出题链路。
- **T03 模拟考前端：**复用当前学期守卫、`api-client.ts` 的 envelope/error 解包、`PageState`/`FeedbackMessage`、总时长计时和 `sessionStorage` 恢复模式；不改模拟考页面、路由行为、答题草稿或结果缓存。
- **S3 练习：**只复用已沉淀的课程/知识模块关联与练习历史形成的 S4 信号；不创建 PracticeSession/Answer，不重新批改或读取作答前后的题目内容。
- **S4 错题：**只读取活跃薄弱点、未掌握错题的模块级计数和时间；不改变 Mistake、MistakeEvidence 或 WeakPoint，不卡片化原题、正确答案、学生答案、错因或重做记录。

---

## 4. 后续获批实施的接口、页面、缓存与安全设计

### 4.1 必要新增项

| 项目     | 后续实现内容                                                                                                         | 必要性                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 后端 API | `GET /api/assessment-attempts/:assessmentAttemptId/cram-cards?semesterId=...`                                        | 前端不得读取 SQLite、文件目录或 Provider 配置，必须从受校验的服务端读取聚合结果。 |
| 共享 DTO | `CramFlashcardDto`、来源摘要 DTO 和响应 DTO；只含卡 ID、模块 ID/标题、安全正文、优先级、来源类型、脱敏计数与时间摘要 | 锁定前后端安全字段，防止意外回传题干、答案或错题原文。                            |
| Service  | `ExamCrammerService` 的确定性只读查询与排序/去重方法                                                                 | 复用既有 S5 校验并集中 SQL 聚合，避免前端拼接业务结论。                           |
| 前端     | API 客户端、`/exams/:examId/cram` 页面、卡片组件、会话/计时 Hook、入口链接及测试                                     | 提供 T04 独立体验，不引入 T06 工作台冲刺区。                                      |

### 4.2 明确不新增项

不新增 Schema、migration、持久化卡片、写 API、阅读进度事实、StudyEvent、Worker、Provider 配置、AI prompt、真实 AI 调用、S6 读取面、S3 Worker、T05 冲刺计划或 T06 工作台聚合。

### 4.3 缓存、刷新恢复与隐私

- 使用版本化键 `ai-studybuddy:cram:<semesterId>:<assessmentAttemptId>` 的 `sessionStorage`，仅保存考试 ID、卡片 ID 列表、当前卡片 ID、已阅 ID、绝对结束时间和已翻转的当前卡状态；不保存正文、错题内容、答案、资料、Provider 配置或秘密，绝不使用 `localStorage`。
- 读取失败、JSON 非法、键版本不符、卡片 ID 无交集、浏览器存储不可用或倒计时过期时删除/忽略会话状态并回到安全初始界面。
- API 不在日志、错误消息或响应中暴露资料原文、错题原文、答案、完整正式 UUID、密钥、Provider URL 或运行目录；S6 不读取卡片正文或来源明细。

### 4.4 状态与可访问性

- 空态：解释当前考试暂无可安全展示的速背卡片，提供错题列表和知识模块既有入口。
- 错误态：保留服务端固定中文错误，提供重试；401/404/409/网络失败不白屏、不显示 SQLite/Provider 细节。
- 窄屏：单卡优先、按钮保持可触及、正文可滚动、计时/进度不遮挡操作；宽屏不以多列牺牲阅读顺序。
- 每个翻卡、前后切换、开始计时和重试控件均有可见中文标签、键盘操作与明确禁用状态；时间结束以文字而非颜色单独表达。

---

## 5. 后续获批实施的测试矩阵与验证

### 5.1 自动化测试

- 后端集成测试优先放入 `packages/backend/test/cram-cards-api.test.mjs`：确认考试成功、未确认/不存在/跨课程/跨学期拒绝、同模块去重、排序稳定性、空候选、安全响应字段白名单、零写入和无 Schema 变更。
- 前端 API/组件测试：正确解包成功/失败 envelope；空态、重试、默认 10 分钟与 5/15 分钟选择；绝对时间倒计时、结束锁定、刷新恢复、卡片集变更、存储不可用、键盘翻卡和窄屏布局。
- 浏览器验收：在本地 Chrome 验收成功路径、空态、未确认/失败重试、刷新恢复、结束锁定及窄屏；截图仅存仓库外脱敏证据目录。

### 5.2 数据隔离与命令

所有会写运行数据的验证均先设置隔离根：

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase2-t04-s5-cram'
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

浏览器验收使用另一个同规则的仓库外隔离根；不运行真实 AI、QQ SMTP、飞书、中转站、Windows Task Scheduler 或其他外部 smoke。

---

## 6. 独立计划审查结论

- **任务边界：通过。**计划仅描述 T04 速背卡片与限时翻阅；T05 的每日计划和 T06 的工作台冲刺区均列为明确非目标。
- **实现授权：通过。**计划没有预先创建或授权 Schema、migration、Worker、写接口、真实 AI 或外部调用；用户明确批准前的停止规则位于计划开头并重复于文档登记。
- **隐私与数据：通过。**计划不含真实题干、答案、错题原文、资料、秘密、正式运行数据或完整真实 UUID；后续 DTO 采用字段白名单，浏览器不保存正文。
- **复用调查：通过。**已限定 T02 校验/排序、T03 API/计时/恢复、S3 事实边界与 S4 模块级信号的只读复用；没有假定前端可直接访问 SQLite 或 Provider 配置。
- **待批准项：**仅允许计划提交与推送。未收到用户对本计划的后续明确实施批准前，T04 业务实现保持禁止状态。
