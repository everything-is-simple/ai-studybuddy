# Phase 1-T04A S4 Schema 与错题归档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the current Codex thread explicitly permits delegation.

**Goal:** 为 S4 ErrorFixer 建立学期库 `mistakes`、`mistake_evidence`、`weak_points` 持久化结构，并在 S3 练习提交批改成功后，把错误 `practice_answers` 幂等归档为错题证据。

**Architecture:** T04A 只做后端 Schema、归档服务和集成测试。`practice_answers.is_correct = 0` 是只读事实输入；S4 不重判、不改写 S3 题目、答案或批改结果。归档与 S3 提交在同一个 SQLite transaction 内完成，避免“练习已批改但错题未归档”的半状态。

**Tech Stack:** TypeScript, Express service layer, SQLite/better-sqlite3, inline TS migration SQL, Node `node:test`, `@ai-studybuddy/shared`.

---

## Scope

- T04A includes:
  - 学期库 migration v5。
  - `mistakes`：按原题聚合的错题复盘单元。
  - `mistake_evidence`：每条错误证据，`source_practice_answer_id` 唯一，用于幂等。
  - `weak_points`：按课程实例 + 知识模块聚合，至少 2 条独立错误证据才创建。
  - `ErrorFixerService.archiveIncorrectPracticeAnswers()`。
  - S3 `submitPracticeSession()` 同事务调用归档服务。
  - 后端 schema 与 API 集成测试。
  - `docs/04` 登记完成证据，必要时校准 `docs/08` 状态行。
- T04A excludes:
  - T04B 前端错题列表、详情、错因确认、重做流程。
  - T05 回流规则、任务优先级提升、知识模块状态更新。
  - S5/S6/S7、Worker、真实外部 Provider smoke。
  - AI 错因建议、同类题/变题、复习排程算法。

Product defaults:

- 未作答由 S3 写入 `practice_answers.is_correct = 0`，因此进入 T04A 错题归档。
- `WeakPoint` 至少需要 2 条独立错误证据。

---

## Files

- Create: `packages/backend/src/db/sql/migration-semester-v5.ts`
  - Defines `mistakes`, `mistake_evidence`, `weak_points`, indexes and consistency triggers.
- Modify: `packages/backend/src/db/migrations.ts`
  - Imports `SEMESTER_V5_SQL` and appends `{ version: 5, sql: SEMESTER_V5_SQL }`.
- Create: `packages/backend/src/services/error-fixer-service.ts`
  - Owns S4 archive logic; accepts an existing semester DB transaction context.
- Modify: `packages/backend/src/services/practice-runner-service.ts`
  - Calls `ErrorFixerService.archiveIncorrectPracticeAnswers(db, sessionId, timestamp)` after inserting `practice_answers` and before returning submit result.
- Modify: `packages/shared/src/types.ts`
  - Adds minimal S4 storage/domain records, not public front-end DTOs.
- Create: `packages/backend/test/error-fixer-schema.test.mjs`
  - Covers migration v5 fresh/upgrade shape, constraints, triggers and idempotency-related uniqueness.
- Create: `packages/backend/test/error-fixer-archive-api.test.mjs`
  - Covers S3 submit automatic archival, unanswered-as-error, idempotent source evidence, weak point threshold, and rollback on invalid submit.
- Modify: `docs/04-开发任务清单-Todo-List.md`
  - On completion only: mark T04A implementation items complete and register verification evidence.
- Modify if needed: `docs/08-共同底座架构-Architecture.md`
  - Calibrate status line from “下一门禁为 S4 PRD” to “T04A 已完成 / 下一门禁 T04B” only after implementation verifies.

---

## Data Design

### `mistakes`

One row represents the review unit for an original S3 `question_id` in the same semester DB.

Key columns:

- `id TEXT PRIMARY KEY`
- `course_instance_id TEXT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE`
- `assessment_attempt_id TEXT REFERENCES assessment_attempts(id) ON DELETE SET NULL`
- `knowledge_module_id TEXT NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE`
- `question_id TEXT NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE`
- `first_practice_answer_id TEXT NOT NULL REFERENCES practice_answers(id) ON DELETE CASCADE`
- `latest_practice_answer_id TEXT NOT NULL REFERENCES practice_answers(id) ON DELETE CASCADE`
- `status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','needs_review','mastered'))`
- `error_count INTEGER NOT NULL CHECK(error_count >= 1)`
- `first_error_at TEXT NOT NULL`
- `latest_error_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### `mistake_evidence`

One row represents one independent evidence item. For T04A the only evidence type is `practice_error`.

Key columns:

- `id TEXT PRIMARY KEY`
- `mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE`
- `source_practice_answer_id TEXT NOT NULL UNIQUE REFERENCES practice_answers(id) ON DELETE CASCADE`
- `evidence_type TEXT NOT NULL CHECK(evidence_type IN ('practice_error'))`
- `course_instance_id TEXT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE`
- `knowledge_module_id TEXT NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE`
- `question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE`
- `occurred_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`

### `weak_points`

One row represents a module-level weak point after enough evidence exists.

Key columns:

- `id TEXT PRIMARY KEY`
- `course_instance_id TEXT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE`
- `knowledge_module_id TEXT NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE`
- `status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','mastered'))`
- `evidence_count INTEGER NOT NULL CHECK(evidence_count >= 2)`
- `first_detected_at TEXT NOT NULL`
- `latest_detected_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `UNIQUE(course_instance_id, knowledge_module_id)`

---

## Task 1: Write Failing Schema Tests

**Files:**

- Create: `packages/backend/test/error-fixer-schema.test.mjs`

- [ ] **Step 1: Add migration v5 schema tests**

Test cases:

- Fresh semester DB reaches version 5 and contains `mistakes`, `mistake_evidence`, `weak_points`.
- v4 semester DB upgrades to v5 without losing S3 tables.
- `mistake_evidence.source_practice_answer_id` is unique.
- `weak_points.evidence_count` rejects 1.
- Triggers reject:
  - a `mistake` whose question/module/course do not match;
  - a `mistake` whose first/latest answer is correct;
  - `mistake_evidence` pointing to a correct answer or mismatched mistake/question/module.

- [ ] **Step 2: Run and confirm RED**

Run:

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
node --test packages/backend/test/error-fixer-schema.test.mjs
```

Expected RED: tests fail because migration v5 / S4 tables do not exist.

---

## Task 2: Implement Migration v5 and Shared Types

**Files:**

- Create: `packages/backend/src/db/sql/migration-semester-v5.ts`
- Modify: `packages/backend/src/db/migrations.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add `SEMESTER_V5_SQL`**

Implement the three tables, indexes and triggers described above.

- [ ] **Step 2: Register v5**

Import `SEMESTER_V5_SQL` and append version 5 to `SEMESTER_MIGRATIONS`.

- [ ] **Step 3: Add minimal shared records**

Add:

```ts
export type MistakeStatus = 'pending_review' | 'needs_review' | 'mastered';
export type MistakeEvidenceType = 'practice_error';
export type WeakPointStatus = 'active' | 'mastered';
```

Then add `MistakeRecord`, `MistakeEvidenceRecord`, `WeakPointRecord`.

- [ ] **Step 4: Run schema tests and confirm GREEN**

Run:

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
node --test packages/backend/test/error-fixer-schema.test.mjs
```

Expected GREEN: schema tests pass.

---

## Task 3: Write Failing Archive Integration Tests

**Files:**

- Create: `packages/backend/test/error-fixer-archive-api.test.mjs`

- [ ] **Step 1: Add API integration tests**

Use existing S3 test helpers/patterns and real SQLite DB. Test cases:

- Submitting a practice session archives each `is_correct = 0` answer to `mistake_evidence`.
- Unanswered questions are archived because S3 stores them as incorrect.
- Correct answers are not archived.
- One wrong evidence in a module creates `mistakes` but not `weak_points`.
- Two independent wrong evidences in the same knowledge module create one `weak_points` row with `evidence_count = 2`.
- Re-running archival for the same `PracticeAnswer` does not create duplicate evidence or increment counts.
- Invalid submit still rolls back with no S4 rows.

- [ ] **Step 2: Run and confirm RED**

Run:

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
node --test packages/backend/test/error-fixer-archive-api.test.mjs
```

Expected RED: tests fail because `ErrorFixerService` and S3 submit integration do not exist.

---

## Task 4: Implement Archive Service and S3 Submit Integration

**Files:**

- Create: `packages/backend/src/services/error-fixer-service.ts`
- Modify: `packages/backend/src/services/practice-runner-service.ts`

- [ ] **Step 1: Add `ErrorFixerService`**

Expose:

```ts
archiveIncorrectPracticeAnswers(db: DatabaseType, sessionId: string, occurredAt: string): ArchiveMistakesResult
```

Behavior:

- Query `practice_answers` joined to `questions` and `practice_sessions`.
- Only consume `a.is_correct = 0`.
- For each source answer, skip if `mistake_evidence.source_practice_answer_id` already exists.
- Create or update the `mistakes` row for `question_id`.
- Insert one `mistake_evidence` row per new source answer.
- Recount evidence per `course_instance_id + knowledge_module_id`.
- Create/update `weak_points` only when count is at least 2.

- [ ] **Step 2: Call from S3 submit transaction**

In `submitPracticeSession()`, after `practice_answers` inserts and before returning, call:

```ts
this.errorFixer.archiveIncorrectPracticeAnswers(db, sessionId, timestamp);
```

Do not change the public S3 submit response shape in T04A.

- [ ] **Step 3: Run archive integration tests and confirm GREEN**

Run:

```powershell
pnpm -r --filter @ai-studybuddy/backend run build
node --test packages/backend/test/error-fixer-archive-api.test.mjs
```

Expected GREEN: archive tests pass.

---

## Task 5: Regression, Docs, Governance and Commit

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify if needed: `docs/08-共同底座架构-Architecture.md`

- [ ] **Step 1: Run focused regression**

```powershell
node --test packages/backend/test/practice-submit-api.test.mjs
node --test packages/backend/test/practice-schema.test.mjs
```

- [ ] **Step 2: Run full required validation**

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

- [ ] **Step 3: Update docs**

In `docs/04`, mark T04A as complete only after verification passes, and register:

- task branch name;
- commit hash after commit;
- verification commands;
- explicit non-goals.

If docs/08 status line remains stale, update it to reflect T04A completion and next gate T04B.

- [ ] **Step 4: Commit**

```powershell
git add .plans/phase1-t04a-s4-schema-archive-plan.md packages/backend/src/db/sql/migration-semester-v5.ts packages/backend/src/db/migrations.ts packages/backend/src/services/error-fixer-service.ts packages/backend/src/services/practice-runner-service.ts packages/shared/src/types.ts packages/backend/test/error-fixer-schema.test.mjs packages/backend/test/error-fixer-archive-api.test.mjs docs/04-开发任务清单-Todo-List.md docs/08-共同底座架构-Architecture.md
git commit -m "feat(s4): 实现错题归档与薄弱点 Schema"
```

- [ ] **Step 5: Merge and push**

Use the repository fast-forward flow:

```powershell
git checkout master
git pull --ff-only origin master
git merge --ff-only codex/phase1-t04a-s4-schema-archive-plan
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git push origin master
```

---

## Self-Review

- Scope is limited to T04A backend schema, archival and tests.
- No T04B front-end page, route, API DTO for list/detail, or browser E2E is included.
- No T05 feedback rule updates knowledge module status, study task priority or S1 scheduling.
- `practice_answers.is_correct = 0` remains a read-only S3 fact; S4 does not regrade.
- Same `PracticeAnswer` is idempotent through `mistake_evidence.source_practice_answer_id UNIQUE`.
- A `WeakPoint` cannot be created with fewer than 2 evidence rows.
- Semester isolation is preserved because all S4 data lives in the per-semester SQLite DB; course/module triggers prevent dirty cross-course relations.
- No Worker, AI Provider, real API key, real material, S5/S6/S7 or external smoke is included.
- Required governance checks: `scripts/check-docs-governance.ps1` and `git diff --check`.
