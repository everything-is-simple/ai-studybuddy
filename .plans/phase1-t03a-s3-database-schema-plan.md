# Phase 1-T03A：S3 数据库与 Schema 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 未经用户明确批准不得修改 Schema、migration、业务代码、测试或任务完成状态。

**状态**：待用户批准；当前仅完成只读核查、计划编写与自审

**日期**：2026-07-16

**任务归属**：Phase 1-T03A / S3 PracticeRunner；只建立学期库数据模型、migration、必要类型和数据库测试

**Goal:** 在现有学期库 migration v1-v3 之后追加 v4，为 S3 建立 `practice_sessions`、`questions`、`practice_answers` 三张表及可验证的约束、关联和类型基线，不实现任何 API、Service、Worker、AI 调用或前端流程。

**Architecture:** 继续使用 `packages/backend/src/db/sql/*.ts` 内联 SQL 常量和 `migrations.ts` 的连续版本 runner；不改写已发布的 v1-v3，也不把 S3 表塞回 `schema-semester.ts`。三张表归属每学期的 `semester.db`，用 SQLite 外键、CHECK、唯一索引和少量跨表一致性 trigger 保证考试/课程/模块/session/答案不会串联到错误对象。来源资料不在 `questions` 重复存 `material_id`：通过 `knowledge_modules.material_id` 回链资料，并在题目中保存 `source_evidence` 快照。

**Tech Stack:** TypeScript 5、Node.js test runner、better-sqlite3、SQLite migration runner、pnpm workspace、`@ai-studybuddy/shared`。

---

## 1. 已确认的现有约束

1. 学期库当前最高 migration 为 **v3**；`SEMESTER_MIGRATIONS` 必须连续递增，故本任务固定使用 **v4**。
2. 已发布 migration 不可重写；新库也通过 v1 → v2 → v3 → v4 初始化，因此不修改 `schema-semester.ts`。
3. 每个 migration 的 SQL 与 `schema_migrations` 记录由 runner 在同一 SQLite transaction 中提交；重复调用会跳过已执行版本。
4. 学期库打开时启用 `foreign_keys = ON`；布尔值沿用 SQLite `INTEGER 0/1`，时间沿用 UTC ISO 8601 `TEXT`。
5. 现有表名和列名使用复数表名 + `snake_case`；共享/API 类型使用 `camelCase`。
6. T03A 不新增 API，因此测试应直接打开隔离临时数据库，不启动后端、不访问 Provider、不写正式 `APP_DATA_ROOT`。
7. 当前主 checkout 的 `docs/04-开发任务清单-Todo-List.md` 已显示为未提交修改，但文本 diff 为空（换行符状态）；实施与收尾前必须重新确认所有权，不能覆盖该现有状态。

---

## 2. 文件范围

### 获批后创建

- `packages/backend/src/db/sql/migration-semester-v4.ts`：S3 三表、索引、CHECK、外键和跨表一致性 trigger。
- `packages/backend/test/practice-schema.test.mjs`：v4 RED/GREEN、升级兼容、约束、关联和级联行为测试。

### 获批后修改

- `packages/backend/src/db/migrations.ts`：import `SEMESTER_V4_SQL` 并登记 `{ version: 4, sql: SEMESTER_V4_SQL }`。
- `packages/backend/test/semester-initialization.test.mjs`：把既有 fresh/upgrade migration 回归从 v3 校准到 v4，并断言三张 S3 表存在，避免全量测试保留过期版本假设。
- `packages/shared/src/types.ts`：增加不泄露 API 行为的 S3 基础枚举/记录类型。
- `docs/04-开发任务清单-Todo-List.md`：仅在实现与验证全部通过、且确认不会覆盖现有修改后，将 T03A 标为完成并登记证据。
- `docs/00-文档索引-Index.md`：仅在 T03A 完成后把“下一实现门禁”从 T03A 调整为 T03B；不创建新编号文档。
- `.plans/phase1-t03a-s3-database-schema-plan.md`：获批后登记批准状态，完成后登记验证结果。

### 明确不修改

- `packages/backend/src/db/sql/schema-semester.ts`（已发布 v1）。
- S1/S2 Service、API、Worker、Provider Router 和前端文件。
- S3 PRD 的产品边界；若实施发现必须修订 PRD，先停下并请求用户批准。
- S4-S7 PRD 或代码。

---

## 3. 数据模型决策

### 3.1 `practice_sessions`

- 主键：`id TEXT PRIMARY KEY`。
- 关联：`course_instance_id` 必填并级联删除；`assessment_attempt_id` 可空并 `ON DELETE SET NULL`。
- 跨表一致性：若填写考试，trigger 要求该考试属于同一个 `course_instance_id`。
- 状态：`in_progress | submitted | graded`，默认 `in_progress`。
- 题数：`question_count` 为 1-20；T03B API 再收紧“生成时 5-20”。
- 限时：`time_limit_seconds` 为空表示不限时，否则必须大于 0。
- 结果：`total_score` 为 0 到 `question_count`；`correct_rate` 为 0.0-1.0；`overtime` 为 0/1；总用时不得为负。
- 审计：`started_at`、`submitted_at`、`graded_at`、`created_at`、`updated_at`。

### 3.2 `questions`

- 每题只属于一个 `practice_session_id`，并显式保存 `course_instance_id` 与 `knowledge_module_id`。
- 增加 PRD 数据对象中遗漏但 API 契约需要的 `question_order INTEGER NOT NULL`；用唯一索引保证同一 session 内顺序不重复。
- trigger 保证 session、course、knowledge module 三者属于同一课程。
- 类型：`single_choice | multiple_choice | fill_blank`。
- `stem` 长度 1-2000；`correct_answer` 非空。
- `options_json`：选择题必须为 JSON 数组；填空题必须为 NULL。
- `acceptable_answers_json`：选择题必须为 NULL；填空题可空或为 JSON 数组。
- 难度：`easy | medium | hard`。
- 来源资料：不重复增加 `material_id`；通过 `knowledge_modules.material_id` 回链，`source_evidence` 保存生成时证据快照。
- 生成审计：`ai_model` 非空、`prompt_version` 默认 `s3-practice-v1.0`、`created_at`。

### 3.3 `practice_answers`

- 关联：`session_id` 与 `question_id` 均级联删除。
- 唯一性：同一 session 每题最多一条答案；同一 session 的 `answer_order` 不重复。
- trigger 保证 question 确实属于该 session，且 `answer_order` 与 `questions.question_order` 一致。
- `student_answer` 可空（允许未作答）；`is_correct` 可空或 0/1；`time_spent_seconds` 可空或非负。
- T03A 不加入部分得分、错因、S4 归档字段或主观题评分字段。

---

### Task 1：先写 v4 migration 与约束的失败测试（RED）

**Files:**
- Create: `packages/backend/test/practice-schema.test.mjs`
- Modify: `packages/backend/test/semester-initialization.test.mjs`

- [ ] **Step 1：建立隔离数据库测试夹具**

测试文件使用 `mkdtemp()` 和 `better-sqlite3`，从构建产物导入 migration：

```js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

async function withTempDir(t, prefix) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function seedFoundation(db) {
  const now = '2026-07-16T00:00:00.000Z';
  db.prepare(`INSERT INTO course_instances
    (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run('course-1', 'semester-1', '线性代数', now, now);
  db.prepare(`INSERT INTO assessment_attempts
    (id, course_instance_id, name, exam_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run('assessment-1', 'course-1', '期末考试', '2026-08-01T00:00:00.000Z', now, now);
  db.prepare(`INSERT INTO materials
    (id, course_instance_id, file_type, storage_key, status, created_at, updated_at,
     original_filename, title, file_size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('material-1', 'course-1', 'text', 'materials/material-1/source.txt', 'completed', now, now,
      'source.txt', '向量空间', 128);
  db.prepare(`INSERT INTO knowledge_modules
    (id, course_instance_id, material_id, title, importance, difficulty,
     source_evidence, learn_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('module-1', 'course-1', 'material-1', '向量空间', 'high', 'medium',
      '第 1 节：向量空间定义', 'learning', now, now);
  return now;
}
```

- [ ] **Step 2：先校准既有 migration 回归测试到 v4（RED）**

修改 `packages/backend/test/semester-initialization.test.mjs` 中两个仍断言最高版本为 3 的用例：

- fresh database 用例名称改为 `semester migrations apply v2, v3 and v4 schema changes`，期望版本改为 4，并断言 `practice_sessions`、`questions`、`practice_answers` 存在。
- legacy upgrade 用例名称改为 `semester migrations upgrade an existing v1 database through v4`，期望版本改为 4，并保留已有 S1 数据断言。

在 v4 尚未登记时，至少一个版本断言必须失败，证明既有全量回归不会被遗忘。

- [ ] **Step 3：写 fresh database shape 测试**

断言：

```js
assert.equal(getAppliedVersion(db, 'semester'), 4);
assert.deepEqual(columnNames(db, 'practice_sessions'), [
  'id', 'course_instance_id', 'assessment_attempt_id', 'status', 'question_count',
  'time_limit_seconds', 'started_at', 'submitted_at', 'graded_at', 'total_score',
  'correct_rate', 'overtime', 'total_duration_seconds', 'difficulty_preference',
  'created_at', 'updated_at'
]);
assert.deepEqual(columnNames(db, 'questions'), [
  'id', 'practice_session_id', 'course_instance_id', 'knowledge_module_id', 'type',
  'stem', 'options_json', 'correct_answer', 'acceptable_answers_json', 'difficulty',
  'explanation', 'source_evidence', 'ai_model', 'prompt_version', 'question_order', 'created_at'
]);
assert.deepEqual(columnNames(db, 'practice_answers'), [
  'id', 'session_id', 'question_id', 'student_answer', 'is_correct',
  'time_spent_seconds', 'answer_order', 'created_at'
]);
```

同时通过 `sqlite_master` / `PRAGMA index_list` 断言计划中的索引和 trigger 全部存在。

- [ ] **Step 4：写 v3 → v4 升级兼容测试**

测试先用 `SCHEMA_SEMESTER_SQL`、`SEMESTER_V2_SQL`、`SEMESTER_V3_SQL` 和 `applyMigrations()` 构造真实 v3 数据库，插入一条已有课程/考试/资料/知识模块，再调用 `migrateSemesterDb(db)`：

```js
assert.equal(getAppliedVersion(db, 'semester'), 4);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'semester' AND version = 4").get().count, 1);
assert.equal(db.prepare('SELECT title FROM knowledge_modules WHERE id = ?').get('module-1').title, '向量空间');
migrateSemesterDb(db);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'semester' AND version = 4").get().count, 1);
```

- [ ] **Step 5：写 session 约束与关联测试**

覆盖：非法状态、题数 0/21/小数、限时 0/小数、非法难度偏好、负分/小数分、正确率越界/非数值、非法 overtime、负数或小数总用时，以及“考试属于另一课程”的 trigger 拒绝。正向插入一个合法 session。

- [ ] **Step 6：写 question 约束与关联测试**

覆盖：非法题型、空题干、题干超过 2000、选择题 options 为 NULL 或非法 JSON、填空题携带 options、选择题携带 acceptable answers、非法难度、空模型、顺序小于 1 或为小数、同 session 顺序重复，以及 session/course/module 不一致。正向插入单选、多选、填空各一题。

- [ ] **Step 7：写 answer 约束与关联测试**

覆盖：非法 `is_correct`、负数或小数用时、顺序小于 1 或为小数、重复 session+question、重复 session+answer_order、答案引用另一 session 的题目、answer_order 与 question_order 不一致。正向插入已答题和未作答记录。

- [ ] **Step 8：写删除语义测试**

覆盖：删除 assessment 后 session 的 `assessment_attempt_id` 变 NULL；删除 session 后其 questions 与 practice_answers 级联删除；删除 knowledge module 按 PRD 级联删除对应 question 与 answer。

- [ ] **Step 9：写父记录/顺序更新的一致性测试**

覆盖以下反向更新，确认数据库层不能在已有引用后制造脏关联：

- 已有 session 时，不允许把关联 assessment 移到另一课程；
- 已有 question 时，不允许把 session 或 knowledge module 移到另一课程；
- 已有 answer 时，不允许把 question 改到另一 session，或把 `question_order` 改成与 `answer_order` 不一致；
- 合法且不破坏引用关系的更新仍可执行。

- [ ] **Step 10：构建当前代码并运行 RED**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/practice-schema.test.mjs
```

预期：测试因 applied version 仍为 3、三张表不存在而失败；失败原因必须指向缺少 v4，而不是测试语法或夹具错误。

---

### Task 2：实现学期库 migration v4（GREEN 的最小 Schema）

**Files:**
- Create: `packages/backend/src/db/sql/migration-semester-v4.ts`
- Modify: `packages/backend/src/db/migrations.ts`

- [ ] **Step 1：新增完整 v4 SQL 常量**

`migration-semester-v4.ts` 应一次性创建三表、索引和 trigger；表创建顺序固定为 session → question → answer。SQL 使用以下契约（实现时保持字段和约束一致，不引入额外业务表）：

```sql
CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  assessment_attempt_id TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress', 'submitted', 'graded')),
  question_count INTEGER NOT NULL
    CHECK(typeof(question_count) = 'integer' AND question_count BETWEEN 1 AND 20),
  time_limit_seconds INTEGER
    CHECK(time_limit_seconds IS NULL OR (typeof(time_limit_seconds) = 'integer' AND time_limit_seconds > 0)),
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  graded_at TEXT,
  total_score INTEGER
    CHECK(total_score IS NULL OR (typeof(total_score) = 'integer' AND total_score BETWEEN 0 AND question_count)),
  correct_rate REAL
    CHECK(correct_rate IS NULL OR (typeof(correct_rate) IN ('integer', 'real')
      AND correct_rate >= 0.0 AND correct_rate <= 1.0)),
  overtime INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(overtime) = 'integer' AND overtime IN (0, 1)),
  total_duration_seconds INTEGER
    CHECK(total_duration_seconds IS NULL OR
      (typeof(total_duration_seconds) = 'integer' AND total_duration_seconds >= 0)),
  difficulty_preference TEXT NOT NULL DEFAULT 'mixed'
    CHECK(difficulty_preference IN ('easy', 'medium', 'hard', 'mixed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id) ON DELETE SET NULL
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  practice_session_id TEXT NOT NULL,
  course_instance_id TEXT NOT NULL,
  knowledge_module_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('single_choice', 'multiple_choice', 'fill_blank')),
  stem TEXT NOT NULL CHECK(length(trim(stem)) BETWEEN 1 AND 2000),
  options_json TEXT,
  correct_answer TEXT NOT NULL CHECK(length(trim(correct_answer)) > 0),
  acceptable_answers_json TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
  explanation TEXT,
  source_evidence TEXT,
  ai_model TEXT NOT NULL CHECK(length(trim(ai_model)) > 0),
  prompt_version TEXT NOT NULL DEFAULT 's3-practice-v1.0' CHECK(length(trim(prompt_version)) > 0),
  question_order INTEGER NOT NULL
    CHECK(typeof(question_order) = 'integer' AND question_order >= 1),
  created_at TEXT NOT NULL,
  CHECK(
    (type IN ('single_choice', 'multiple_choice')
      AND options_json IS NOT NULL AND json_valid(options_json) = 1 AND json_type(options_json) = 'array'
      AND acceptable_answers_json IS NULL)
    OR
    (type = 'fill_blank' AND options_json IS NULL
      AND (acceptable_answers_json IS NULL OR
        (json_valid(acceptable_answers_json) = 1 AND json_type(acceptable_answers_json) = 'array')))
  ),
  FOREIGN KEY(practice_session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE
);

CREATE TABLE practice_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  student_answer TEXT,
  is_correct INTEGER
    CHECK(is_correct IS NULL OR (typeof(is_correct) = 'integer' AND is_correct IN (0, 1))),
  time_spent_seconds INTEGER
    CHECK(time_spent_seconds IS NULL OR
      (typeof(time_spent_seconds) = 'integer' AND time_spent_seconds >= 0)),
  answer_order INTEGER NOT NULL
    CHECK(typeof(answer_order) = 'integer' AND answer_order >= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);
```

- [ ] **Step 2：增加索引和唯一约束**

```sql
CREATE INDEX idx_practice_sessions_course
  ON practice_sessions(course_instance_id, created_at DESC);
CREATE INDEX idx_practice_sessions_assessment
  ON practice_sessions(assessment_attempt_id, created_at DESC);
CREATE INDEX idx_practice_sessions_status
  ON practice_sessions(status, created_at DESC);

CREATE INDEX idx_questions_session
  ON questions(practice_session_id, created_at);
CREATE INDEX idx_questions_module
  ON questions(knowledge_module_id, created_at DESC);
CREATE INDEX idx_questions_course_difficulty_type
  ON questions(course_instance_id, difficulty, type);
CREATE UNIQUE INDEX idx_questions_session_order
  ON questions(practice_session_id, question_order);

CREATE INDEX idx_practice_answers_session
  ON practice_answers(session_id, answer_order);
CREATE INDEX idx_practice_answers_question_correct
  ON practice_answers(question_id, is_correct);
CREATE UNIQUE INDEX idx_practice_answers_session_question
  ON practice_answers(session_id, question_id);
CREATE UNIQUE INDEX idx_practice_answers_session_order
  ON practice_answers(session_id, answer_order);
```

- [ ] **Step 3：增加跨表一致性 trigger**

必须同时覆盖 INSERT 与相关列 UPDATE：

```sql
CREATE TRIGGER validate_practice_sessions_insert
BEFORE INSERT ON practice_sessions
FOR EACH ROW
WHEN NEW.assessment_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM assessment_attempts a
  WHERE a.id = NEW.assessment_attempt_id
    AND a.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'practice session assessment course mismatch');
END;

CREATE TRIGGER validate_practice_sessions_update
BEFORE UPDATE OF course_instance_id, assessment_attempt_id ON practice_sessions
FOR EACH ROW
WHEN (NEW.assessment_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM assessment_attempts a
  WHERE a.id = NEW.assessment_attempt_id
    AND a.course_instance_id = NEW.course_instance_id
)) OR EXISTS (
  SELECT 1 FROM questions q
  WHERE q.practice_session_id = OLD.id
    AND q.course_instance_id <> NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'practice session relation mismatch');
END;
```

`questions` 与 `practice_answers` 的四个 trigger 使用以下条件；question UPDATE 必须同时监听 `question_order` 并保护既有 answers：

```sql
CREATE TRIGGER validate_questions_insert
BEFORE INSERT ON questions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM practice_sessions s
  WHERE s.id = NEW.practice_session_id
    AND s.course_instance_id = NEW.course_instance_id
) OR NOT EXISTS (
  SELECT 1 FROM knowledge_modules m
  WHERE m.id = NEW.knowledge_module_id
    AND m.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'question course relation mismatch');
END;

CREATE TRIGGER validate_questions_update
BEFORE UPDATE OF practice_session_id, course_instance_id, knowledge_module_id, question_order ON questions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM practice_sessions s
  WHERE s.id = NEW.practice_session_id
    AND s.course_instance_id = NEW.course_instance_id
) OR NOT EXISTS (
  SELECT 1 FROM knowledge_modules m
  WHERE m.id = NEW.knowledge_module_id
    AND m.course_instance_id = NEW.course_instance_id
) OR EXISTS (
  SELECT 1 FROM practice_answers a
  WHERE a.question_id = OLD.id
    AND (a.session_id <> NEW.practice_session_id OR a.answer_order <> NEW.question_order)
)
BEGIN
  SELECT RAISE(ABORT, 'question relation mismatch');
END;

CREATE TRIGGER validate_practice_answers_insert
BEFORE INSERT ON practice_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = NEW.question_id
    AND q.practice_session_id = NEW.session_id
    AND q.question_order = NEW.answer_order
)
BEGIN
  SELECT RAISE(ABORT, 'practice answer relation mismatch');
END;

CREATE TRIGGER validate_practice_answers_update
BEFORE UPDATE OF session_id, question_id, answer_order ON practice_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = NEW.question_id
    AND q.practice_session_id = NEW.session_id
    AND q.question_order = NEW.answer_order
)
BEGIN
  SELECT RAISE(ABORT, 'practice answer relation mismatch');
END;

CREATE TRIGGER validate_assessment_practice_course_update
BEFORE UPDATE OF course_instance_id ON assessment_attempts
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM practice_sessions s
  WHERE s.assessment_attempt_id = OLD.id
    AND s.course_instance_id <> NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'assessment practice course mismatch');
END;

CREATE TRIGGER validate_knowledge_module_question_course_update
BEFORE UPDATE OF course_instance_id ON knowledge_modules
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM questions q
  WHERE q.knowledge_module_id = OLD.id
    AND q.course_instance_id <> NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge module question course mismatch');
END;
```

错误摘要固定、无资料正文和完整 UUID。共创建 8 个一致性 trigger；测试必须覆盖 INSERT、子记录 UPDATE 和父记录 UPDATE 三个方向。

- [ ] **Step 4：登记连续 migration v4**

在 `migrations.ts` 中增加：

```ts
import { SEMESTER_V4_SQL } from './sql/migration-semester-v4';
```

并把 semester migrations 改为：

```ts
const SEMESTER_MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: SCHEMA_SEMESTER_SQL },
  { version: 2, sql: SEMESTER_V2_SQL },
  { version: 3, sql: SEMESTER_V3_SQL },
  { version: 4, sql: SEMESTER_V4_SQL },
];
```

不得修改 runner 的 gap、transaction 或 jobs repair 行为。

- [ ] **Step 5：运行专项测试确认 GREEN**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/practice-schema.test.mjs
```

预期：所有 practice schema 测试通过；无网络访问、无正式数据写入。

---

### Task 3：增加最小 S3 类型基线

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1：增加枚举与记录类型**

类型使用 camelCase，不定义 API endpoint，不把“未提交时隐藏答案”误当成已实现行为：

```ts
export type PracticeQuestionType = 'single_choice' | 'multiple_choice' | 'fill_blank';
export type PracticeDifficulty = 'easy' | 'medium' | 'hard';
export type PracticeDifficultyPreference = PracticeDifficulty | 'mixed';
export type PracticeSessionStatus = 'in_progress' | 'submitted' | 'graded';

export interface PracticeQuestionRecord {
  id: string;
  practiceSessionId: string;
  courseInstanceId: string;
  knowledgeModuleId: string;
  type: PracticeQuestionType;
  stem: string;
  options?: string[];
  correctAnswer: string;
  acceptableAnswers?: string[];
  difficulty: PracticeDifficulty;
  explanation?: string;
  sourceEvidence?: string;
  aiModel: string;
  promptVersion: string;
  questionOrder: number;
  createdAt: string;
}

export interface PracticeSessionRecord {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string;
  status: PracticeSessionStatus;
  questionCount: number;
  timeLimitSeconds?: number;
  startedAt: string;
  submittedAt?: string;
  gradedAt?: string;
  totalScore?: number;
  correctRate?: number;
  overtime: boolean;
  totalDurationSeconds?: number;
  difficultyPreference: PracticeDifficultyPreference;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeAnswerRecord {
  id: string;
  sessionId: string;
  questionId: string;
  studentAnswer?: string;
  isCorrect?: boolean;
  timeSpentSeconds?: number;
  answerOrder: number;
  createdAt: string;
}
```

这些是存储/领域记录，不是公开响应 DTO；T03B/T03C 必须另行定义“作答前隐藏正确答案”和“批改后结果”契约。

- [ ] **Step 2：运行 type-check**

```powershell
pnpm type-check
```

预期：所有 workspace 类型检查通过。

---

### Task 4：独立审查与回归修复

**Files:**
- Review only first: all T03A files
- Modify only if a confirmed defect is found: files already listed in this plan

- [ ] **Step 1：迁移审查**

逐项确认：v4 连续、v1-v3 未改写、单事务、重复迁移不重复记录、fresh 与 v3 upgrade 都通过、JSON1 函数在当前 SQLite 可用。

- [ ] **Step 2：关联审查**

逐项确认：assessment/course、session/course、module/course、answer/session/question/order 不可串联；父记录 course 归属变更、session course 变更、question session/order 变更也不能破坏已有引用；外键删除语义与 PRD 一致。

- [ ] **Step 3：范围与隐私审查**

确认没有 API、Service、Worker、AI prompt、前端、S4 表、真实资料、真实考试名称、Provider 配置、完整 UUID 或运行数据库进入 diff。测试数据只能使用固定占位 ID 和虚构短文本。

- [ ] **Step 4：针对发现的问题先补失败测试，再做最小修复**

任何修复都遵循 RED → GREEN；不得借机重构 migration runner、S1/S2 schema 或 shared 类型全文件。

---

### Task 5：全量验证与完成态文档

**Files:**
- Modify after all code verification passes: `docs/04-开发任务清单-Todo-List.md`
- Modify after all code verification passes: `docs/00-文档索引-Index.md`
- Modify after all code verification passes: `.plans/phase1-t03a-s3-database-schema-plan.md`

- [ ] **Step 1：重新检查工作区并设置唯一隔离目录**

```powershell
git status --short --branch
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t03a-20260716-final-001'
```

若该目录已经存在，改用 `phase1-t03a-20260716-final-002`；不得复用正式运行数据。虽然专项测试使用系统临时目录，全量命令仍保留该隔离环境变量。

- [ ] **Step 2：运行专项验证**

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/practice-schema.test.mjs
```

预期：退出码 0，v4 fresh/upgrade/constraint/relationship/cascade 全部通过。

- [ ] **Step 3：运行全量验证**

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

预期：全部退出码 0。T03A 无页面或 API，不要求浏览器 smoke；数据库集成测试是本任务的 smoke 证据。

- [ ] **Step 4：更新完成态文档**

仅在 Step 2-3 全部通过后：

- `docs/04` 将 T03A 标为完成，记录 migration v4、三表、约束/关联测试数量和验证摘要；T03B 仍为未开始。
- `docs/00` 将下一实现门禁调整为 T03B；S4-S7 保持未触发。
- 计划文件状态改为“已批准、实现与验证完成”，登记真实命令和结果。
- 若 `docs/04` 的现有未提交状态无法确认所有权或无法安全保留，停止该文件的更新并向用户报告，不覆盖、不清理。

- [ ] **Step 5：运行文档治理与 diff 检查**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git status --short --branch
```

如用户随后要求提交，才显式暂存本任务文件并运行：

```powershell
git add -- .plans/phase1-t03a-s3-database-schema-plan.md packages/backend/src/db/sql/migration-semester-v4.ts packages/backend/src/db/migrations.ts packages/backend/test/practice-schema.test.mjs packages/backend/test/semester-initialization.test.mjs packages/shared/src/types.ts docs/00-文档索引-Index.md docs/04-开发任务清单-Todo-List.md
git diff --cached --check
git commit -m "feat(s3): 建立限时练习数据库 Schema"
```

若某个列出的文档没有实际变化，不暂存该文件。未经用户明确要求不得 push 或 merge。

---

## 4. 验收标准

- [ ] 学期库从 v3 连续升级到 v4，重复迁移不重复执行，已有 S1/S2 数据保留。
- [ ] fresh database 与 upgrade database 都包含 `practice_sessions`、`questions`、`practice_answers`。
- [ ] 表字段覆盖 PRD 与目标文件要求；`question_order` 补齐作答前题目排序缺口。
- [ ] 类型、状态、难度、题干、JSON、题数、限时、分数、正确率、布尔值和用时约束可由测试证明。
- [ ] assessment/course、session/course/module、answer/session/question/order 不可交叉串联；父记录和题目顺序更新也不能制造脏关联。
- [ ] session/question/answer 唯一索引与查询索引存在。
- [ ] shared 类型与 Schema 字段命名、可空性和枚举一致。
- [ ] 不新增 API、Service、Worker、AI 调用、前端、S4 归档或未来 PRD。
- [ ] 既有 `semester-initialization.test.mjs` 已从 v3 期望更新到 v4，fresh 与 legacy upgrade 回归均通过。
- [ ] type-check、后端 build、前端 build、专项测试、全量测试、docs governance、`git diff --check` 全部通过。

---

## 5. 自审结论（计划阶段）

### 5.1 规格覆盖

- 三张目标表、题型/题干/选项/答案/可接受答案/难度/知识模块/来源证据、考试关联、限时、状态、时间、超时、得分/正确率、逐题答案/正确性/用时均有明确字段和测试；SQLite 非 STRICT 表的整数/数值字段增加 `typeof(...)` 约束，避免小数绕过。
- 来源资料采用“KnowledgeModule.material_id 回链 + Question.source_evidence 快照”，避免重复 material 外键产生漂移。
- PRD 的 API 示例包含题目顺序但数据对象漏字段；计划增加 `question_order` 并用唯一索引/answer trigger 固化顺序。

### 5.2 兼容性与回滚风险

- 不改 v1-v3，升级只追加新表/索引/trigger；现有数据无需回填，风险低。
- SQLite migration runner 无自动 down migration；若 v4 失败，单事务应回滚且不写 version 4。已应用后的回退只能恢复数据库备份或发布后续修复 migration，不能手工改写 v4。
- 已用当前 `better-sqlite3` 的内存数据库只读核查 SQLite `3.53.2`，`json_valid()` 与 `json_type()` 可用；专项测试仍需把该约束纳入 RED/GREEN，防止运行时升级后漂移。
- 独立复审发现既有 `semester-initialization.test.mjs` 硬编码最高版本为 v3，且原六个 trigger 无法阻止父记录或题目顺序更新后产生脏关联；本计划已补入既有回归更新、整数类型约束和父/子双向更新测试。

### 5.3 范围与隐私

- 计划没有生成/批改 API、AI 调用、Worker、前端或 S4 行为。
- 题干、答案和来源证据属于学生学习内容；T03A 不新增日志，不把测试正文、真实资料或完整 UUID 写入仓库证据。
- 家长访问控制属于后续 API/S6，不在 Schema 计划中新增家长可见题目字段。

### 5.4 待用户批准的关键设计点

1. migration 编号固定为 v4。
2. `questions` 增加 `question_order`，解决 PRD 中“作答前顺序”缺口。
3. 不增加冗余 `source_material_id`，通过知识模块回链资料。
4. 使用 trigger 强制跨表课程/session/order 一致性，而不是等到 T03B/T03C Service 才发现脏关联。
5. T03A 完成前不更新任务状态；当前阶段只提交本计划供审查。

---

## 6. 批准门禁

当前只允许保存和审查本计划。只有用户明确回复批准 Phase 1-T03A 实施后，才从 Task 1 的失败测试开始修改测试、migration、类型和完成态文档。
