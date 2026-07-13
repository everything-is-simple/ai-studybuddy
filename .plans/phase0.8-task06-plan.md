# Phase 0.8 T06：S1 学习节奏核心 API 行动计划

> **供执行型 Agent 使用：** 必须使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development`，按任务逐项执行本计划；步骤使用复选框（`- [ ]`）追踪。

**目标：** 在已完成的全局/学期 SQLite 初始化底座上，实现 S1 的课程、考试目标、学习任务、时间线事件与读取 API；课程、考试和任务均隔离在指定学期库中，且任务状态更新能产生可审计的 `StudyEvent`。

**架构：** 全局库 `semesters` 仅用于确定已就绪学期及其目录；T06 所有业务写入都经由 `semesterId` 打开对应 `semester.db`。先以 semester migration v2 补齐课程表条目、考试确认状态与变更历史，再在 `course_instances`、`assessment_attempts`、`study_tasks`、`study_events` 上实现 API；新增专用 S1 service 负责输入验证、关联存在性、事务、确定性排序和任务闭合事件，API Router 只负责 HTTP/信封映射。

**技术栈：** TypeScript、Express 4、better-sqlite3、Node 原生 `node:test`、`@ai-studybuddy/shared`、现有 `ApiSuccess<T>` / `ApiError` 信封与版本化 SQLite migration。

**实施前门禁：**

- [x] 保持 `.claude/settings.local.json` 为本地 Claude 配置，不读取、不提交；实现前确认 `.gitignore` 增加 `.claude/` 规则或用户明确将其作为仓库配置管理。
- [x] Claude 已审查：确认 API 边界、现有 schema、`/api/dev/init-semester` ready 行为和测试基础设施；识别了逾期状态与 T02 migration 前置项两项必须修订的问题。
- [x] 已按审查反馈修订：逾期仅作 T06 派生展示状态；将课程表、考试确认状态和考试日期变更历史纳入 semester migration v2。
- [x] 用户明确批准修订计划后才开始下面的实现任务。

---

## 当前事实与范围

- 已存在：全局 `semesters` 索引，学期库 `course_instances`、`assessment_attempts`、`study_tasks`、`study_events` 表，`initializeSemester()` 原子初始化，标准 API 信封，后端子进程 API 测试基础设施。
- T02 尚有明确前置项：必须先通过 semester migration v2 补齐 `schedule_entries`、考试 `confirmation_status` / `confirmed_at` 和日期变更历史；T06 只建立数据结构与 API 状态语义，不实现课程表 OCR、倒计时、提醒或家长报告。
- T06 明确交付：`POST/GET /courses`、`POST/GET /exams`、`POST /study-tasks`、`PATCH /study-tasks/:id/status`、`POST /study-events`、`GET /timeline`。
- 本任务不做：课程表 OCR/onboarding 预览、课程表写入 API、倒计时/7-3-1 提醒、逾期扫描 Job、知识模块 CRUD、AI 排程、资料/笔记、练习/错题、家长 API、S2 PRD；`knowledge_module_id` 可作为可选 UUID 引用保留，但不得提前访问 S2 表或实现 S2 业务。
- 文档口径：使用已存在的 S1 PRD，不新建 S1 文档；完成后更新 `docs/04-*`，若实际接口/数据边界改变 `08/09/10` 再做定点 SoT 回填。

## API 合同（计划审查基线）

所有响应使用 `{ success: true, data }` 或 `{ success: false, error: { code, message } }`。

| 方法与路径                                               | 请求要点                                                                                                                         | 成功响应要点                                       | 失败语义                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/courses`                                      | `semesterId`、`name`、可选 `retakeOfCourseInstanceId`                                                                            | 创建的 course instance；重修引用原样返回           | `SEMESTER_NOT_FOUND`、`SEMESTER_NOT_READY`、`COURSE_INPUT_INVALID` |
| `GET /api/courses?semesterId=`                           | `semesterId`                                                                                                                     | 指定学期的课程列表                                 | `SEMESTER_NOT_FOUND`、`SEMESTER_NOT_READY`                         |
| `POST /api/exams`                                        | `semesterId`、`courseInstanceId`、`name`、`examAt`、可选 `attemptType`、goal/scope/source/sourceConfidence、`confirmationStatus` | 创建的 assessment attempt                          | `COURSE_NOT_FOUND`、`EXAM_INPUT_INVALID`                           |
| `GET /api/exams?semesterId=&courseInstanceId?`           | `semesterId`，可选课程过滤                                                                                                       | 考试列表，按 `exam_at` 升序                        | `SEMESTER_NOT_FOUND`、`COURSE_NOT_FOUND`                           |
| `POST /api/study-tasks`                                  | `semesterId`、`courseInstanceId`、`type`、`title`、可选 exam/module/deadline/estimated minutes                                   | 创建的任务与确定性 priority 元数据                 | `TASK_INPUT_INVALID`、`COURSE_NOT_FOUND`、`EXAM_NOT_FOUND`         |
| `PATCH /api/study-tasks/:id/status`                      | `semesterId`、`status`，可选发生时间                                                                                             | 更新后的任务；从非 done 到 done 时写入唯一完成事件 | `TASK_NOT_FOUND`、`TASK_STATUS_INVALID`                            |
| `POST /api/study-events`                                 | `semesterId`、`sourceSystem`、`eventType`、`title`、可选 course/task/evidence/workload/可见性/发生时间                           | 创建的事件                                         | `EVENT_INPUT_INVALID`、`COURSE_NOT_FOUND`、`TASK_NOT_FOUND`        |
| `GET /api/timeline?semesterId=&courseInstanceId?&limit?` | `semesterId`，可选课程与 limit                                                                                                   | 倒序时间线                                         | `SEMESTER_NOT_FOUND`、`TIMELINE_QUERY_INVALID`                     |

`priority` 是读取/响应层的确定性派生值，不写入 `study_tasks`：先比较派生逾期，其次按已确认考试日期接近程度，再按 deadline，最后用创建时间稳定排序。派生逾期定义为 `deadlineAt < now` 且持久化 status 不为 `done` / `skipped`；T06 不通过 API 写入 `overdue`，未来逾期扫描 Job 如需持久化该状态必须另行设计迁移与转换规则。只有 `confirmationStatus = confirmed` 的考试日期可驱动正式考试优先级；`pending` / `rejected` / `superseded` 仅作信息展示。

固定输入枚举：`attemptType` 为 `normal | makeup | other`（缺省 `normal`）；`confirmationStatus` 为 `pending | confirmed | rejected | superseded`（缺省 `pending`）；`study_tasks.type` 为 `material_note | practice | error_review | exam_cram | custom`；T06 可写任务状态为 `todo | doing | pending_quality_check | done | skipped`。`child_confirmed` 是 v1 遗留列，T06 不读取、不写入；考试确认统一只认 `confirmation_status` / `confirmed_at`。

重修引用规则：`retakeOfCourseInstanceId` 是可选 UUID 文本，可能指向另一个学期的独立 `semester.db`；T06 仅校验其 UUID 格式并原样保存，不在当前学期库、其他学期库或全局索引中查询其存在性。跨学期重修关联解析与首页聚合留待后续任务。

---

## 文件结构

| 文件                                                    | 责任                                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/types.ts`                          | 将现有共享 `Course`/`Exam`/`StudyTask`/`StudyEvent` 与 T06 的 semester/course-instance API DTO、枚举和派生逾期字段对齐；不引入 S2/S3/S4 领域类型。 |
| `packages/backend/src/db/sql/migration-semester-v2.ts`  | T06 前置 migration：`schedule_entries`、`assessment_attempts` 考试确认字段、`assessment_date_changes`；不实现 OCR/提醒业务。                       |
| `packages/backend/src/db/migrations.ts`                 | 将 semester migration v2 加入严格递增 runner。                                                                                                     |
| `packages/backend/src/services/study-rhythm-service.ts` | S1 业务服务：学期可用性、关联校验、写入事务、任务状态转换、完成事件、确定性排序与 timeline 查询。                                                  |
| `packages/backend/src/api/study-rhythm.ts`              | HTTP Router：请求 JSON 校验、状态码和标准信封；不直接写 SQL。                                                                                      |
| `packages/backend/src/server.ts`                        | 挂载 `/api` 下 S1 Router。                                                                                                                         |
| `packages/backend/test/study-rhythm-api.test.mjs`       | 以隔离 `APP_DATA_ROOT` 和独立端口运行 build 后端，测试 API 合同、学期隔离、错误与回归。                                                            |
| `docs/04-开发任务清单-Todo-List.md`                     | T06 完成时勾选真实已交付项与验证证据。                                                                                                             |
| `docs/08-*`、`docs/09-*`、`docs/10-*`                   | 仅在实现与现有 SoT 的 API/数据/验收约定不一致时定点回填。                                                                                          |
| `.gitignore`                                            | 仅在用户没有要求版本管理 Claude 配置时增加 `.claude/`，防止本地 settings 混入提交。                                                                |

---

### Task 1：处理本地 `.claude` 配置并固定 T06 范围

**Files:**

- Modify: `.gitignore`
- Modify: `.plans/phase0.8-task06-plan.md`

- [x] **Step 1：确认本地配置不进入提交范围**

运行：

```powershell
Get-ChildItem .claude -Recurse -Force
Get-Content .claude\settings.local.json | ConvertFrom-Json | Select-Object -ExpandProperty permissions
```

预期：仅确认其为本机权限/工具配置；不在终端、计划、测试或 Git 历史输出任何具体 secret、token、命令白名单或私有路径。

- [x] **Step 2：写失败前置检查**

运行：

```powershell
git check-ignore -v .claude/settings.local.json
```

预期：当前失败，证明该本地文件存在误提交风险。

- [x] **Step 3：最小实现仓库忽略规则**

在 `.gitignore` 的 IDE 区域追加：

```gitignore
# Local Claude Code settings
.claude/
```

- [x] **Step 4：验证忽略规则**

运行：

```powershell
git check-ignore -v .claude/settings.local.json
git status --short
```

预期：第一条显示 `.gitignore` 匹配；第二条不再显示 `.claude/`。

- [x] **Step 5：提交检查点**

```powershell
git add .gitignore .plans/phase0.8-task06-plan.md
git commit -m "chore: ignore local Claude settings"
```

仅在用户批准执行 T06 后执行此提交；不得携带 `.claude/settings.local.json`。

---

### Task 2：先完成 T02 遗留的 S1 migration v2 前置项

**Files:**

- Create: `packages/backend/src/db/sql/migration-semester-v2.ts`
- Modify: `packages/backend/src/db/migrations.ts`
- Modify: `packages/backend/test/semester-initialization.test.mjs`

- [x] **Step 1：为 migration v2 编写失败测试**

在 `semester-initialization.test.mjs` 新增两条测试：第一条以全新临时 `semester.db` 调用 `initSemesterDbAtPath()`，断言连续 v1 → v2 初始化；第二条手工构造只到 v1 的学期库并插入既有 `assessment_attempts` 行，再通过 `applyMigrations()` 升级到 v2，断言旧数据保留且新增列默认值正确。

新库路径断言：

```js
assert.equal(getAppliedVersion(db, 'semester'), 2);
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schedule_entries'").get());
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'assessment_date_changes'").get());
const columns = db
  .prepare('PRAGMA table_info(assessment_attempts)')
  .all()
  .map((row) => row.name);
assert.ok(columns.includes('confirmation_status'));
assert.ok(columns.includes('confirmed_at'));
```

既有 v1 升级路径最小断言：

```js
const existing = db
  .prepare('SELECT id, name, confirmation_status, confirmed_at FROM assessment_attempts WHERE id = ?')
  .get(existingAttemptId);
assert.deepEqual(existing, {
  id: existingAttemptId,
  name: '期中考试',
  confirmation_status: 'pending',
  confirmed_at: null,
});
assert.equal(getAppliedVersion(db, 'semester'), 2);
```

- [x] **Step 2：运行 migration 测试并确认红灯**

```powershell
pnpm --filter @ai-studybuddy/backend run build
node --test --test-name-pattern="semester migration v2" packages/backend/test/semester-initialization.test.mjs
```

预期：当前最高 semester migration 为 v1，测试失败。

- [x] **Step 3：实现 v2 SQL**

在 `migration-semester-v2.ts` 定义单个 SQL 常量：

```sql
CREATE TABLE schedule_entries (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id)
);

ALTER TABLE assessment_attempts ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE assessment_attempts ADD COLUMN confirmed_at TEXT;

CREATE TABLE assessment_date_changes (
  id TEXT PRIMARY KEY,
  assessment_attempt_id TEXT NOT NULL,
  previous_exam_at TEXT NOT NULL,
  next_exam_at TEXT NOT NULL,
  source TEXT,
  changed_at TEXT NOT NULL,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id)
);
```

约束：`weekday` 后续写入时仅允许 `0..6`；考试确认状态只由 service 允许的四个枚举写入；v2 不回填或修改既有 v1 SQL。两条 `ALTER TABLE` 与两个 `CREATE TABLE` 必须放在同一个 `SEMESTER_V2_SQL` 常量中，依赖现有 migration runner 对单个版本 SQL 与 `schema_migrations` 记录的同一 SQLite transaction 提交，确保 v2 不会半应用。

- [x] **Step 4：注册并验证 migration v2**

在 `SEMESTER_MIGRATIONS` 追加 `{ version: 2, sql: SEMESTER_V2_SQL }`。运行 Task 2 Step 2 的测试，预期通过；再运行既有 migration gap 测试，确保连续版本规则不变。

- [x] **Step 5：提交前置检查点**

```powershell
git add packages/backend/src/db/sql/migration-semester-v2.ts packages/backend/src/db/migrations.ts packages/backend/test/semester-initialization.test.mjs
git commit -m "feat(backend): add S1 semester migration v2"
```

---

### Task 3：先写 S1 API 的失败集成测试

**Files:**

- Create: `packages/backend/test/study-rhythm-api.test.mjs`
- Reference: `packages/backend/test/semester-initialization.test.mjs`
- Reference: `packages/backend/test/dev-storage-api.test.mjs`

- [x] **Step 1：实现隔离后端启动 helper**

直接复制 `packages/backend/test/dev-storage-api.test.mjs` 的已验证启动/清理模式：`spawn(process.execPath, ["dist/server.js"])`、`t.after()` 清理、100 次 × 100ms 健康检查。仅将端口范围设为 `48000 + Math.floor(Math.random() * 3000)`；它与 semester `40000-42999`、storage `45000-47999`、converter `51000-51999` 不重叠。

在测试文件中使用上述不重叠端口与 10 秒健康检查预算，并在每个测试结束时终止子进程、删除临时 `APP_DATA_ROOT`：

```js
const port = 48000 + Math.floor(Math.random() * 3000);
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (response.ok) return { dataRoot, port };
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
throw new Error('built backend did not become healthy');
```

- [x] **Step 2：写入 API 先决条件 helper 与首个失败测试**

通过现有 `/api/dev/init-semester` 为每个测试创建 ready 学期；然后写：

```js
test('creates and lists courses within one ready semester', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const created = await postJson(backend.port, '/api/courses', { semesterId, name: '数学分析' });
  assert.equal(created.status, 201);
  assert.equal(created.json.success, true);
  const listed = await fetchJson(backend.port, `/api/courses?semesterId=${semesterId}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.json.data.map((course) => course.name),
    ['数学分析']
  );
});
```

- [x] **Step 3：补齐失败测试矩阵**

至少定义以下独立用例，先运行并确认当前均因路由/服务不存在而失败：

```js
// 1. 课程不能写入不存在或未 ready 的 semester。
// 2. 格式非法的 retakeOfCourseInstanceId 返回 COURSE_INPUT_INVALID。
// 3. 格式合法但当前 semester.db 不存在的 retakeOfCourseInstanceId 仍创建成功并原样保存，支持跨学期重修引用。
// 4. 一个 course instance 可创建多个 assessment attempts，GET /exams 按 examAt 升序。
// 5. exam 的 courseInstanceId 必须属于请求 semester。
// 6. 创建任务时 assessmentAttemptId 必须属于相同 course instance。
// 7. PATCH todo -> done 写一条 source_system=S1、event_type=study_task_completed 的事件；重复 PATCH done 不重复写事件。
// 8. 非法状态转换与不存在 task 返回稳定 ApiError。
// 9. POST study-events 不能引用请求 semester 外的 course/task。
// 10. GET timeline 只返回指定 semester，按 occurredAt 倒序，course 过滤生效。
// 11. deadline 已过且非终态任务在响应中 derivedOverdue=true 且优先级最高；API 不写 status=overdue。
// 12. 只有 confirmationStatus=confirmed 的 examAt 参与优先级；pending/rejected/superseded 不参与。
```

- [x] **Step 4：运行目标测试，确认红灯**

```powershell
pnpm --filter @ai-studybuddy/backend run build
node --test --test-reporter=spec packages/backend/test/study-rhythm-api.test.mjs
```

预期：测试因缺少 `/api/courses` 等路由而失败；不得先修改实现让它绿。

- [x] **Step 5：提交测试检查点**

```powershell
git add packages/backend/test/study-rhythm-api.test.mjs
git commit -m "test(backend): define S1 study rhythm API contracts"
```

---

### Task 4：对齐共享 DTO 与 S1 service 边界

**Files:**

- Modify: `packages/shared/src/types.ts`
- Create: `packages/backend/src/services/study-rhythm-service.ts`
- Test: `packages/backend/test/study-rhythm-api.test.mjs`

- [x] **Step 1：定义最小共享 API DTO**

在 `packages/shared/src/types.ts` 中新增或调整为与学期库一致的只读 DTO（字段采用 API camelCase，数据库列在 service 中显式映射）：

```ts
export interface CourseInstanceDto {
  id: string;
  semesterId: string;
  name: string;
  retakeOfCourseInstanceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentAttemptDto {
  id: string;
  courseInstanceId: string;
  name: string;
  attemptType: 'normal' | 'makeup' | 'other';
  examAt: string;
  confirmationStatus: 'pending' | 'confirmed' | 'rejected' | 'superseded';
  confirmedAt?: string;
  source?: string;
  sourceConfidence?: number;
}

export type StudyTaskType = 'material_note' | 'practice' | 'error_review' | 'exam_cram' | 'custom';
export type StudyTaskStatus = 'todo' | 'doing' | 'pending_quality_check' | 'done' | 'skipped';

export interface StudyTaskDto {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string;
  knowledgeModuleId?: string;
  type: StudyTaskType;
  title: string;
  status: StudyTaskStatus;
  estimatedMinutes?: number;
  deadlineAt?: string;
  completedAt?: string;
  derivedOverdue: boolean;
  priorityBucket: 0 | 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
}

export interface StudyEventDto {
  id: string;
  courseInstanceId?: string;
  taskId?: string;
  sourceSystem: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S7';
  eventType: string;
  title: string;
  workloadMinutes?: number;
  parentVisible: boolean;
  occurredAt: string;
  createdAt: string;
}
```

保留现有旧共享类型只在仍被使用时；若与新 DTO 重叠，先通过 `rg` 找所有 import，再一次性替换调用点，不留下两个含义不同的 `Course` 写模型。

- [x] **Step 2：创建 service 的依赖与错误边界**

在 `study-rhythm-service.ts` 中只导出一个 service 类和受控错误：

```ts
export class StudyRhythmError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export class StudyRhythmService {
  constructor(private readonly appDataRoot = config.appDataRoot) {}
  // createCourse, listCourses, createExam, listExams,
  // createTask, updateTaskStatus, createEvent, getTimeline
}
```

service 在进入学期库前查询 global `semesters`：必须存在、`ready = 1`，并使用该 semester id 的标准 `semester.db` 路径；禁止接受客户端传来的数据库路径。

- [x] **Step 3：实现通用关联校验与 column-to-DTO 映射**

实现私有 helper：`openReadySemesterDb(semesterId)`、`requireCourse(db, courseInstanceId)`、`requireExamForCourse(db, assessmentAttemptId, courseInstanceId)`、`requireTask(db, taskId)`、`toCourseDto(row)`、`toExamDto(row)`、`toTaskDto(row)`、`toEventDto(row)`。

所有 SQL 必须使用参数绑定：

```ts
const row = db
  .prepare(
    'SELECT id, semester_id, name, retake_of_course_instance_id, created_at, updated_at FROM course_instances WHERE id = ?'
  )
  .get(courseInstanceId);
```

- [x] **Step 4：目标测试变为局部通过**

```powershell
pnpm --filter @ai-studybuddy/backend run type-check
node --test --test-name-pattern="courses" packages/backend/test/study-rhythm-api.test.mjs
```

预期：测试仍因未挂载 HTTP 路由失败；service 的 TypeScript 编译通过。

---

### Task 5：实现课程与考试目标 API

**Files:**

- Modify: `packages/backend/src/services/study-rhythm-service.ts`
- Create: `packages/backend/src/api/study-rhythm.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/test/study-rhythm-api.test.mjs`

- [x] **Step 1：实现 service 写入事务**

`createCourse` 只校验 optional `retakeOfCourseInstanceId` 的 UUID 格式后原样插入；不得查询当前或其他学期库验证其存在性，因为重修引用按定义可跨学期。`createExam` 验证课程实例后插入 assessment attempt。时间字段由服务生成 ISO 字符串，ID 使用 `crypto.randomUUID()`：

```ts
db.transaction(() => {
  db.prepare(
    `INSERT INTO course_instances (
    id, semester_id, name, retake_of_course_instance_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, semesterId, name, retakeOfCourseInstanceId ?? null, now, now);
})();
```

`createExam` 严格校验 `examAt` 是有效 ISO datetime；`sourceConfidence` 存在时限制在 `0..1`；`attemptType` 只接受 `normal | makeup | other`；`confirmationStatus` 只接受 `pending | confirmed | rejected | superseded`。INSERT 必须省略 `child_confirmed`，依赖 v1 默认值 `0`；创建 confirmed 考试时写入 `confirmation_status = 'confirmed'` 与 `confirmed_at = now`，创建其他状态时写入对应状态与 `confirmed_at = null`。

- [x] **Step 2：实现 Router 的 JSON 校验与响应映射**

`study-rhythm.ts` 处理：

```ts
router.post('/courses', async (req, res) => {
  try {
    const course = service.createCourse(req.body);
    return res.status(201).json({ success: true, data: course });
  } catch (error) {
    return res.status(toStatus(error)).json(toApiError(error));
  }
});
```

同样实现 `GET /courses`、`POST /exams`、`GET /exams`。请求缺失必填字段返回 400；service 业务错误保留其 code/status；未知错误返回 `S1_REQUEST_FAILED`，不得把堆栈返回客户端。

- [x] **Step 3：挂载 Router**

在 `packages/backend/src/server.ts` 中：

```ts
import studyRhythmRouter from './api/study-rhythm';
app.use('/api', studyRhythmRouter);
```

不要把正式 S1 API 放在 `/api/dev`。

- [x] **Step 4：运行课程/考试测试**

```powershell
pnpm --filter @ai-studybuddy/backend run build
node --test --test-name-pattern="courses|assessment|exam" packages/backend/test/study-rhythm-api.test.mjs
```

预期：课程创建/读取、多考试目标、跨学期 course/exam/task 业务关联拒绝、合法跨学期重修 UUID 原样保存与输入校验通过。

- [x] **Step 5：提交检查点**

```powershell
git add packages/shared/src/types.ts packages/backend/src/services/study-rhythm-service.ts packages/backend/src/api/study-rhythm.ts packages/backend/src/server.ts packages/backend/test/study-rhythm-api.test.mjs
git commit -m "feat(backend): add S1 courses and exams API"
```

---

### Task 6：实现学习任务、确定性优先级与状态事件

**Files:**

- Modify: `packages/backend/src/services/study-rhythm-service.ts`
- Modify: `packages/backend/src/api/study-rhythm.ts`
- Modify: `packages/backend/test/study-rhythm-api.test.mjs`

- [x] **Step 1：实现任务创建与关联校验**

`createTask` 必须确认 course instance 存在；若 `assessmentAttemptId` 存在，必须属于该 course；若 `knowledgeModuleId` 非空，仅作为 UUID 文本保存，不查询未实现的 S2 表。校验 `estimatedMinutes` 为正整数，`deadlineAt` 为有效 ISO datetime。

- [x] **Step 2：实现状态机**

只允许以下转换：

```ts
const allowedTransitions: Record<StudyTaskStatus, readonly StudyTaskStatus[]> = {
  todo: ['doing', 'pending_quality_check', 'done', 'skipped'],
  doing: ['todo', 'pending_quality_check', 'done', 'skipped'],
  pending_quality_check: ['doing', 'done', 'skipped'],
  done: [],
  skipped: [],
};
```

`done` 与 `skipped` 是终态；非法转换返回 `TASK_STATUS_INVALID`。任务更新、`completed_at` 更新与首次完成事件插入必须放在同一个 SQLite transaction。

- [x] **Step 3：首次完成事件去重**

当且仅当旧状态不是 `done`、新状态为 `done` 时插入：

```ts
INSERT INTO study_events (
  id, course_instance_id, task_id, source_system, event_type, title,
  workload_minutes, parent_visible, occurred_at, created_at
) VALUES (?, ?, ?, 'S1', 'study_task_completed', ?, ?, 1, ?, ?)
```

重复 PATCH `done` 不写第二条事件；事件标题使用任务标题，不写 AI 文本或学习正文。

- [x] **Step 4：实现确定性 priority 派生**

在 list/query helper 内计算而不存库：

```ts
priorityBucket = derivedOverdue ? 0 : confirmedExamAt ? 1 : deadlineAt ? 2 : 3;
```

排序键依次为 `priorityBucket`、对应时间、`createdAt`、`id`；只使用 `confirmation_status = 'confirmed'` 的考试日期。`derivedOverdue` 不写回 status；该逻辑只供创建响应/后续读取使用，不提前实现逾期扫描 Job 或 AI 排程。

- [x] **Step 5：运行任务/状态测试**

```powershell
node --test --test-name-pattern="task|derived overdue|priority|done" packages/backend/test/study-rhythm-api.test.mjs
```

预期：关联校验、状态机、一次性事件与确定性排序全部通过。

- [x] **Step 6：提交检查点**

```powershell
git add packages/backend/src/services/study-rhythm-service.ts packages/backend/src/api/study-rhythm.ts packages/backend/test/study-rhythm-api.test.mjs
git commit -m "feat(backend): add S1 study task workflow"
```

---

### Task 7：实现外部事件写入与学生时间线

**Files:**

- Modify: `packages/backend/src/services/study-rhythm-service.ts`
- Modify: `packages/backend/src/api/study-rhythm.ts`
- Modify: `packages/backend/test/study-rhythm-api.test.mjs`

- [x] **Step 1：实现 `createEvent`**

允许 `sourceSystem` 仅为当前已知的 `S1`、`S2`、`S3`、`S4`、`S5`、`S7`；`courseInstanceId`、`taskId` 可选，但存在时必须在同一 semester 且 task 的 course 与 supplied course 一致。`occurredAt` 默认当前时间，`workloadMinutes` 为非负整数，`parentVisible` 为 boolean。

- [x] **Step 2：实现 `getTimeline`**

查询指定 `semester.db` 的 `study_events`，可选 `courseInstanceId`，`limit` 默认 50、范围 `1..200`，排序：

```sql
ORDER BY occurred_at DESC, created_at DESC, id DESC
```

返回 DTO，不返回 DB 文件路径、内部 SQL、输入/输出正文或其他学期数据。

- [x] **Step 3：实现 API 路由并验证标准信封**

```ts
router.post("/study-events", ...);
router.get("/timeline", ...);
```

所有客户端可预期错误为 JSON `ApiError`；不存在的 course/task、跨学期引用、非法 limit 分别有稳定 code。

- [x] **Step 4：运行时间线测试**

```powershell
node --test --test-name-pattern="event|timeline|semester isolation" packages/backend/test/study-rhythm-api.test.mjs
```

预期：其他子系统来源写入、课程过滤、倒序、limit、跨学期隔离和错误信封通过。

- [x] **Step 5：提交检查点**

```powershell
git add packages/backend/src/services/study-rhythm-service.ts packages/backend/src/api/study-rhythm.ts packages/backend/test/study-rhythm-api.test.mjs
git commit -m "feat(backend): add S1 study event timeline"
```

---

### Task 8：完整回归、审查、文档与交付

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify if evidence requires: `docs/08-共同底座架构-Architecture.md`
- Modify if evidence requires: `docs/09-测试验收计划-Test-Plan.md`
- Modify if contract changes: `docs/10-后端开发规范-Backend-Guidelines.md`
- Test: `packages/backend/test/study-rhythm-api.test.mjs`

- [x] **Step 1：执行目标与全量验证**

```powershell
pnpm --filter @ai-studybuddy/backend run build
node --test --test-reporter=spec packages/backend/test/study-rhythm-api.test.mjs
pnpm type-check
pnpm build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

预期：新 S1 测试和全量测试全部通过；文档治理与 diff 检查无错误。

- [x] **Step 2：进行 GPT 代码审查**

审查清单：

```text
- semesterId 是否是所有业务读写的强制边界？
- 是否拒绝跨学期的 course/exam/task/event 业务关联，同时允许只存不校验的跨学期 retake UUID？
- 所有多步写入是否在 SQLite transaction 中？
- done 事件是否严格一次性？
- 未确认 exam 是否没有参与优先级？
- 是否只使用 `confirmation_status` / `confirmed_at`，没有读取或写入 v1 遗留 `child_confirmed`？
- API 是否始终返回标准信封且不泄露 stack/DB 路径？
- 是否没有提前实现 S2 知识模块或 AI 排程？
- .claude 是否未进入暂存范围？
```

- [x] **Step 3：修复审查问题并新增回归测试**

每一个可复现问题先添加到 `study-rhythm-api.test.mjs`，确认红灯，再做最小修复；完成后重跑本任务 Step 1 的全套命令。

- [x] **Step 4：回填任务清单与必要 SoT**

在 `docs/04-开发任务清单-Todo-List.md` 中只勾选真正完成的 T06 子项，并记录实际测试命令与总数。若 API 合同、状态机或数据库边界与 `08/09/10` 当前 SoT 不一致，在同一变更中做定点回填；不创建 S2 文档。

- [x] **Step 5：最终提交与推送**

```powershell
git status --short
git add .gitignore .plans/phase0.8-task06-plan.md packages/shared/src/types.ts packages/backend/src/services/study-rhythm-service.ts packages/backend/src/api/study-rhythm.ts packages/backend/src/server.ts packages/backend/test/study-rhythm-api.test.mjs docs/04-开发任务清单-Todo-List.md
git diff --cached --check
git commit -m "feat(backend): add S1 study rhythm API"
git push origin <current-branch>
```

提交前逐项确认：不暂存 `.claude/`、`.env.local`、`dist/`、临时数据库、日志、测试输出或真实 AI 凭据。

---

## 计划自检

- [x] T02 的 S1 migration v2 前置项已进入实施任务；不再绕过 `schedule_entries`、考试确认状态或日期变更历史。
- [x] T06 六个指定 API 均有实现任务和 API 合同。
- [x] 课程、考试、任务和事件均由 `semesterId` 打开对应学期库，避免跨学期混写。
- [x] `overdue` 在 T06 明确为派生展示状态，未被伪装成可写持久化状态；后续 Job 另行设计。
- [x] 输入枚举、DTO、状态机、事务和 timeline 排序都有明确测试要求。
- [x] 计划包含 `.claude/` 本地配置隔离、Claude 审查、用户批准、全量验证、文档回填、提交与推送。
