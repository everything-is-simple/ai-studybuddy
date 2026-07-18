import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
let idSequence = 0;

function nextId(prefix) {
  idSequence += 1;
  return `${prefix}-${idSequence}`;
}

async function withTempDir(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

function registerDbCleanup(t, db, dir) {
  t.after(async () => {
    if (db.open) db.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function indexNames(db, table) {
  return db.prepare(`PRAGMA index_list(${table})`).all().map((row) => row.name);
}

function triggerNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'validate_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function seedFoundation(db) {
  const now = '2026-07-16T00:00:00.000Z';
  for (const [id, semesterId, name] of [
    ['course-1', 'semester-1', '线性代数'],
    ['course-2', 'semester-1', '概率论'],
  ]) {
    db.prepare('INSERT INTO course_instances (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      semesterId,
      name,
      now,
      now
    );
  }

  for (const [id, courseId, name] of [
    ['assessment-1', 'course-1', '线性代数期末'],
    ['assessment-2', 'course-2', '概率论期末'],
  ]) {
    db.prepare(
      `INSERT INTO assessment_attempts (
        id, course_instance_id, name, exam_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, name, '2026-08-01T00:00:00.000Z', now, now);
  }

  for (const [id, courseId, title] of [
    ['material-1', 'course-1', '向量空间'],
    ['material-2', 'course-2', '随机变量'],
  ]) {
    db.prepare(
      `INSERT INTO materials (
        id, course_instance_id, file_type, storage_key, status, created_at, updated_at,
        original_filename, title, file_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, 'text', `materials/${id}/source.txt`, 'completed', now, now, `${id}.txt`, title, 128);
  }

  for (const [id, courseId, materialId, title] of [
    ['module-1', 'course-1', 'material-1', '向量空间'],
    ['module-2', 'course-2', 'material-2', '随机变量'],
  ]) {
    db.prepare(
      `INSERT INTO knowledge_modules (
        id, course_instance_id, material_id, title, importance, difficulty,
        source_evidence, learn_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, materialId, title, 'high', 'medium', `${title}定义`, 'not_started', now, now);
  }
}

function insertSession(db, overrides = {}) {
  const row = {
    id: 'session-1',
    courseInstanceId: 'course-1',
    assessmentAttemptId: 'assessment-1',
    status: 'graded',
    questionCount: 2,
    timeLimitSeconds: 600,
    startedAt: '2026-07-16T00:00:00.000Z',
    submittedAt: '2026-07-16T00:10:00.000Z',
    gradedAt: '2026-07-16T00:10:00.000Z',
    totalScore: 0,
    correctRate: 0,
    overtime: 0,
    totalDurationSeconds: 600,
    difficultyPreference: 'mixed',
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:10:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO practice_sessions (
      id, course_instance_id, assessment_attempt_id, status, question_count,
      time_limit_seconds, started_at, submitted_at, graded_at, total_score,
      correct_rate, overtime, total_duration_seconds, difficulty_preference,
      created_at, updated_at
    ) VALUES (
      @id, @courseInstanceId, @assessmentAttemptId, @status, @questionCount,
      @timeLimitSeconds, @startedAt, @submittedAt, @gradedAt, @totalScore,
      @correctRate, @overtime, @totalDurationSeconds, @difficultyPreference,
      @createdAt, @updatedAt
    )`
  ).run(row);
  return row;
}

function insertQuestion(db, overrides = {}) {
  const row = {
    id: nextId('question'),
    practiceSessionId: 'session-1',
    courseInstanceId: 'course-1',
    knowledgeModuleId: 'module-1',
    type: 'single_choice',
    stem: '以下哪个是向量空间？',
    optionsJson: '["A. R²","B. 空集"]',
    correctAnswer: 'A',
    acceptableAnswersJson: null,
    difficulty: 'medium',
    explanation: 'R² 对加法与数乘封闭。',
    sourceEvidence: '向量空间定义',
    aiModel: 'test-model',
    promptVersion: 's3-practice-v1.0',
    questionOrder: 1,
    createdAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO questions (
      id, practice_session_id, course_instance_id, knowledge_module_id, type,
      stem, options_json, correct_answer, acceptable_answers_json, difficulty,
      explanation, source_evidence, ai_model, prompt_version, question_order, created_at
    ) VALUES (
      @id, @practiceSessionId, @courseInstanceId, @knowledgeModuleId, @type,
      @stem, @optionsJson, @correctAnswer, @acceptableAnswersJson, @difficulty,
      @explanation, @sourceEvidence, @aiModel, @promptVersion, @questionOrder, @createdAt
    )`
  ).run(row);
  return row;
}

function insertAnswer(db, overrides = {}) {
  const row = {
    id: nextId('answer'),
    sessionId: 'session-1',
    questionId: 'question-1',
    studentAnswer: 'B',
    isCorrect: 0,
    timeSpentSeconds: 15,
    answerOrder: 1,
    createdAt: '2026-07-16T00:10:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO practice_answers (
      id, session_id, question_id, student_answer, is_correct,
      time_spent_seconds, answer_order, created_at
    ) VALUES (
      @id, @sessionId, @questionId, @studentAnswer, @isCorrect,
      @timeSpentSeconds, @answerOrder, @createdAt
    )`
  ).run(row);
  return row;
}

function insertMistake(db, overrides = {}) {
  const row = {
    id: nextId('mistake'),
    courseInstanceId: 'course-1',
    assessmentAttemptId: 'assessment-1',
    knowledgeModuleId: 'module-1',
    questionId: 'question-1',
    firstPracticeAnswerId: 'answer-1',
    latestPracticeAnswerId: 'answer-1',
    status: 'pending_review',
    errorCount: 1,
    firstErrorAt: '2026-07-16T00:10:00.000Z',
    latestErrorAt: '2026-07-16T00:10:00.000Z',
    createdAt: '2026-07-16T00:10:00.000Z',
    updatedAt: '2026-07-16T00:10:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO mistakes (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, question_id,
      first_practice_answer_id, latest_practice_answer_id, status, error_count,
      first_error_at, latest_error_at, created_at, updated_at
    ) VALUES (
      @id, @courseInstanceId, @assessmentAttemptId, @knowledgeModuleId, @questionId,
      @firstPracticeAnswerId, @latestPracticeAnswerId, @status, @errorCount,
      @firstErrorAt, @latestErrorAt, @createdAt, @updatedAt
    )`
  ).run(row);
  return row;
}

function insertEvidence(db, overrides = {}) {
  const row = {
    id: nextId('evidence'),
    mistakeId: 'mistake-1',
    sourcePracticeAnswerId: 'answer-1',
    evidenceType: 'practice_error',
    courseInstanceId: 'course-1',
    knowledgeModuleId: 'module-1',
    questionId: 'question-1',
    occurredAt: '2026-07-16T00:10:00.000Z',
    createdAt: '2026-07-16T00:10:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO mistake_evidence (
      id, mistake_id, source_practice_answer_id, evidence_type,
      course_instance_id, knowledge_module_id, question_id, occurred_at, created_at
    ) VALUES (
      @id, @mistakeId, @sourcePracticeAnswerId, @evidenceType,
      @courseInstanceId, @knowledgeModuleId, @questionId, @occurredAt, @createdAt
    )`
  ).run(row);
  return row;
}

async function openFreshSemester(t, prefix) {
  const dir = await withTempDir(prefix);
  const migrations = await import('../dist/db/migrations.js');
  const db = migrations.initSemesterDbAtPath(path.join(dir, 'semester.db'));
  registerDbCleanup(t, db, dir);
  return { db, migrations };
}

test('fresh semester database applies current migrations with S4 tables, indexes, and triggers exactly once', async (t) => {
  const { db, migrations } = await openFreshSemester(t, 'studybuddy-t04a-fresh-');

  assert.equal(migrations.getAppliedVersion(db, 'semester'), 8);
  assert.deepEqual(columnNames(db, 'mistakes'), [
    'id',
    'course_instance_id',
    'assessment_attempt_id',
    'knowledge_module_id',
    'question_id',
    'first_practice_answer_id',
    'latest_practice_answer_id',
    'status',
    'error_count',
    'first_error_at',
    'latest_error_at',
    'created_at',
    'updated_at',
    'error_cause_category',
    'error_cause_note',
    'error_cause_confirmed_at',
  ]);
  assert.deepEqual(columnNames(db, 'mistake_evidence'), [
    'id',
    'mistake_id',
    'source_practice_answer_id',
    'evidence_type',
    'course_instance_id',
    'knowledge_module_id',
    'question_id',
    'occurred_at',
    'created_at',
  ]);
  assert.deepEqual(columnNames(db, 'weak_points'), [
    'id',
    'course_instance_id',
    'knowledge_module_id',
    'status',
    'evidence_count',
    'first_detected_at',
    'latest_detected_at',
    'created_at',
    'updated_at',
  ]);

  for (const [table, expectedIndexes] of [
    [
      'mistakes',
      [
        'idx_mistakes_course_status',
        'idx_mistakes_latest_error',
        'idx_mistakes_module_status',
        'idx_mistakes_question',
      ],
    ],
    [
      'mistake_evidence',
      [
        'idx_mistake_evidence_mistake',
        'idx_mistake_evidence_module',
        'idx_mistake_evidence_source_answer',
      ],
    ],
    ['weak_points', ['idx_weak_points_course_status', 'idx_weak_points_module']],
  ]) {
    const actual = indexNames(db, table);
    for (const index of expectedIndexes) assert.ok(actual.includes(index), `${table} missing ${index}`);
  }

  const actualTriggers = triggerNames(db);
  for (const trigger of [
    'validate_mistake_evidence_insert',
    'validate_mistake_evidence_update',
    'validate_mistakes_insert',
    'validate_mistakes_update',
    'validate_weak_points_insert',
    'validate_weak_points_update',
  ]) {
    assert.ok(actualTriggers.includes(trigger), `missing ${trigger}`);
  }

  migrations.migrateSemesterDb(db);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'semester' AND version = 5").get().count,
    1
  );
});

test('v4 semester database upgrades through current migrations without losing existing S3 data', async (t) => {
  const dir = await withTempDir('studybuddy-t04a-upgrade-');
  const { openDbAtPath } = await import('../dist/db/connection.js');
  const migrations = await import('../dist/db/migrations.js');
  const { SCHEMA_SEMESTER_SQL } = require('../dist/db/sql/schema-semester.js');
  const { SEMESTER_V2_SQL } = require('../dist/db/sql/migration-semester-v2.js');
  const { SEMESTER_V3_SQL } = require('../dist/db/sql/migration-semester-v3.js');
  const { SEMESTER_V4_SQL } = require('../dist/db/sql/migration-semester-v4.js');
  const db = openDbAtPath(path.join(dir, 'semester-v4.db'));
  registerDbCleanup(t, db, dir);

  migrations.applyMigrations(db, 'semester', [
    { version: 1, sql: SCHEMA_SEMESTER_SQL },
    { version: 2, sql: SEMESTER_V2_SQL },
    { version: 3, sql: SEMESTER_V3_SQL },
    { version: 4, sql: SEMESTER_V4_SQL },
  ]);
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 1 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1, isCorrect: 0 });
  assert.equal(migrations.getAppliedVersion(db, 'semester'), 4);

  migrations.migrateSemesterDb(db);

  assert.equal(migrations.getAppliedVersion(db, 'semester'), 8);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM practice_answers').get().count, 1);
  for (const table of ['mistakes', 'mistake_evidence', 'weak_points']) {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  }
});

test('S4 tables enforce incorrect-answer evidence, idempotent source answer, and weak-point threshold', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t04a-constraints-');
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 3 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertQuestion(db, { id: 'question-2', questionOrder: 2 });
  insertQuestion(db, { id: 'question-3', courseInstanceId: 'course-1', knowledgeModuleId: 'module-1', questionOrder: 3 });
  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1, isCorrect: 0 });
  insertAnswer(db, { id: 'answer-2', questionId: 'question-2', answerOrder: 2, isCorrect: 1 });

  assert.throws(
    () =>
      insertMistake(db, {
        id: 'bad-mistake-correct-answer',
        questionId: 'question-2',
        firstPracticeAnswerId: 'answer-2',
        latestPracticeAnswerId: 'answer-2',
      }),
    /mistake answer relation mismatch/
  );
  assert.throws(
    () => insertMistake(db, { id: 'bad-mistake-module', knowledgeModuleId: 'module-2' }),
    /mistake question relation mismatch/
  );

  insertMistake(db, { id: 'mistake-1' });
  insertEvidence(db, { id: 'evidence-1' });
  assert.throws(() => insertEvidence(db, { id: 'evidence-duplicate' }), /UNIQUE constraint failed/);
  assert.throws(
    () => insertEvidence(db, { id: 'bad-evidence-correct-answer', sourcePracticeAnswerId: 'answer-2', questionId: 'question-2' }),
    /mistake evidence source mismatch/
  );

  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO weak_points (
            id, course_instance_id, knowledge_module_id, status, evidence_count,
            first_detected_at, latest_detected_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`
        )
        .run(
          'weak-point-1',
          'course-1',
          'module-1',
          1,
          '2026-07-16T00:10:00.000Z',
          '2026-07-16T00:10:00.000Z',
          '2026-07-16T00:10:00.000Z',
          '2026-07-16T00:10:00.000Z'
        ),
    /CHECK constraint failed/
  );
});

test('v5 semester database upgrades through current migrations preserving mistakes and evidence data', async (t) => {
  const dir = await withTempDir('studybuddy-t04b-upgrade-');
  const { openDbAtPath } = await import('../dist/db/connection.js');
  const migrations = await import('../dist/db/migrations.js');
  const { SCHEMA_SEMESTER_SQL } = require('../dist/db/sql/schema-semester.js');
  const { SEMESTER_V2_SQL } = require('../dist/db/sql/migration-semester-v2.js');
  const { SEMESTER_V3_SQL } = require('../dist/db/sql/migration-semester-v3.js');
  const { SEMESTER_V4_SQL } = require('../dist/db/sql/migration-semester-v4.js');
  const { SEMESTER_V5_SQL } = require('../dist/db/sql/migration-semester-v5.js');
  const db = openDbAtPath(path.join(dir, 'semester-v5.db'));
  registerDbCleanup(t, db, dir);

  migrations.applyMigrations(db, 'semester', [
    { version: 1, sql: SCHEMA_SEMESTER_SQL },
    { version: 2, sql: SEMESTER_V2_SQL },
    { version: 3, sql: SEMESTER_V3_SQL },
    { version: 4, sql: SEMESTER_V4_SQL },
    { version: 5, sql: SEMESTER_V5_SQL },
  ]);
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 1 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1, isCorrect: 0 });
  insertMistake(db, { id: 'mistake-1' });
  insertEvidence(db, { id: 'evidence-1' });
  assert.equal(migrations.getAppliedVersion(db, 'semester'), 5);

  migrations.migrateSemesterDb(db);

  assert.equal(migrations.getAppliedVersion(db, 'semester'), 8);
  // 既有数据保留
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM mistake_evidence').get().count, 1);
  assert.equal(
    db.prepare('SELECT evidence_type FROM mistake_evidence WHERE id = ?').get('evidence-1').evidence_type,
    'practice_error'
  );
  // 新列存在且默认值正确
  assert.equal(db.prepare('SELECT error_cause_category FROM mistakes WHERE id = ?').get('mistake-1').error_cause_category, null);
  assert.equal(db.prepare('SELECT session_kind FROM practice_sessions WHERE id = ?').get('session-1').session_kind, 'practice');
  assert.equal(db.prepare('SELECT origin_question_id FROM questions WHERE id = ?').get('question-1').origin_question_id, null);
  // 唯一索引仍生效
  assert.throws(() => insertEvidence(db, { id: 'evidence-duplicate' }), /UNIQUE constraint failed/);
});

test('v6 constraints enforce error cause whitelist, redo session relation, and redo evidence source', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t04b-constraints-');
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 1 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1, isCorrect: 0 });
  insertMistake(db, { id: 'mistake-1' });
  insertEvidence(db, { id: 'evidence-1' });

  // 错因类别白名单
  assert.throws(
    () => db.prepare("UPDATE mistakes SET error_cause_category = 'lazy' WHERE id = 'mistake-1'").run(),
    /CHECK constraint failed/
  );
  db.prepare(
    "UPDATE mistakes SET error_cause_category = 'concept_unclear', error_cause_note = '向量空间闭包条件没吃透', error_cause_confirmed_at = '2026-07-16T01:00:00.000Z' WHERE id = 'mistake-1'"
  ).run();
  assert.equal(
    db.prepare('SELECT error_cause_category FROM mistakes WHERE id = ?').get('mistake-1').error_cause_category,
    'concept_unclear'
  );

  // mistake_redo session 必须挂 origin_mistake_id 且同课程
  const insertRedoSession = (id, originMistakeId, courseInstanceId = 'course-1') =>
    db
      .prepare(
        `INSERT INTO practice_sessions (
          id, course_instance_id, status, question_count, started_at,
          difficulty_preference, session_kind, origin_mistake_id, created_at, updated_at
        ) VALUES (?, ?, 'in_progress', 1, '2026-07-16T02:00:00.000Z', 'mixed', 'mistake_redo', ?, '2026-07-16T02:00:00.000Z', '2026-07-16T02:00:00.000Z')`
      )
      .run(id, courseInstanceId, originMistakeId);
  assert.throws(() => insertRedoSession('bad-redo-null', null), /practice session redo relation mismatch/);
  assert.throws(
    () => insertRedoSession('bad-redo-cross-course', 'mistake-1', 'course-2'),
    /practice session redo relation mismatch/
  );
  insertRedoSession('redo-session-1', 'mistake-1');

  // 普通 practice session 不得携带 origin_mistake_id
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO practice_sessions (
            id, course_instance_id, status, question_count, started_at,
            difficulty_preference, session_kind, origin_mistake_id, created_at, updated_at
          ) VALUES ('bad-practice-origin', 'course-1', 'in_progress', 1, '2026-07-16T02:00:00.000Z', 'mixed', 'practice', 'mistake-1', '2026-07-16T02:00:00.000Z', '2026-07-16T02:00:00.000Z')`
        )
        .run(),
    /practice session redo relation mismatch/
  );

  // 复制题溯源：origin 必须同课程同模块
  insertQuestion(db, {
    id: 'redo-question-1',
    practiceSessionId: 'redo-session-1',
    questionOrder: 1,
  });
  db.prepare("UPDATE questions SET origin_question_id = 'question-1' WHERE id = 'redo-question-1'").run();
  assert.throws(
    () => db.prepare("UPDATE questions SET origin_question_id = 'missing-question' WHERE id = 'redo-question-1'").run(),
    /question origin relation mismatch/
  );

  // redo 证据：redo_correct 必须来自 is_correct=1 的重做作答，question_id 指向原题
  insertAnswer(db, {
    id: 'redo-answer-correct',
    sessionId: 'redo-session-1',
    questionId: 'redo-question-1',
    studentAnswer: 'A',
    isCorrect: 1,
    answerOrder: 1,
  });
  assert.throws(
    () =>
      insertEvidence(db, {
        id: 'bad-redo-evidence-type',
        sourcePracticeAnswerId: 'redo-answer-correct',
        evidenceType: 'redo_incorrect',
      }),
    /mistake evidence source mismatch/
  );
  insertEvidence(db, {
    id: 'redo-evidence-1',
    sourcePracticeAnswerId: 'redo-answer-correct',
    evidenceType: 'redo_correct',
  });
  assert.equal(
    db.prepare('SELECT evidence_type FROM mistake_evidence WHERE id = ?').get('redo-evidence-1').evidence_type,
    'redo_correct'
  );
});

assert.equal(typeof Database, 'function');
