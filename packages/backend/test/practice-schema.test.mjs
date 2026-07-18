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
  const courses = [
    ['course-1', 'semester-1', '线性代数'],
    ['course-2', 'semester-1', '概率论'],
  ];
  for (const [id, semesterId, name] of courses) {
    db.prepare(
      'INSERT INTO course_instances (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, semesterId, name, now, now);
  }

  const assessments = [
    ['assessment-1', 'course-1', '线性代数期末'],
    ['assessment-2', 'course-2', '概率论期末'],
  ];
  for (const [id, courseId, name] of assessments) {
    db.prepare(
      `INSERT INTO assessment_attempts (
        id, course_instance_id, name, exam_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, name, '2026-08-01T00:00:00.000Z', now, now);
  }

  const materials = [
    ['material-1', 'course-1', '向量空间'],
    ['material-2', 'course-2', '随机变量'],
  ];
  for (const [id, courseId, title] of materials) {
    db.prepare(
      `INSERT INTO materials (
        id, course_instance_id, file_type, storage_key, status, created_at, updated_at,
        original_filename, title, file_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, 'text', `materials/${id}/source.txt`, 'completed', now, now, `${id}.txt`, title, 128);
  }

  const modules = [
    ['module-1', 'course-1', 'material-1', '向量空间'],
    ['module-2', 'course-2', 'material-2', '随机变量'],
  ];
  for (const [id, courseId, materialId, title] of modules) {
    db.prepare(
      `INSERT INTO knowledge_modules (
        id, course_instance_id, material_id, title, importance, difficulty,
        source_evidence, learn_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, materialId, title, 'high', 'medium', `${title}定义`, 'not_started', now, now);
  }

  return now;
}

function insertSession(db, overrides = {}) {
  const row = {
    id: nextId('session'),
    courseInstanceId: 'course-1',
    assessmentAttemptId: 'assessment-1',
    status: 'in_progress',
    questionCount: 3,
    timeLimitSeconds: 600,
    startedAt: '2026-07-16T00:00:00.000Z',
    submittedAt: null,
    gradedAt: null,
    totalScore: null,
    correctRate: null,
    overtime: 0,
    totalDurationSeconds: null,
    difficultyPreference: 'mixed',
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
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
    studentAnswer: 'A',
    isCorrect: 1,
    timeSpentSeconds: 15,
    answerOrder: 1,
    createdAt: '2026-07-16T00:00:00.000Z',
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

async function openFreshSemester(t, prefix) {
  const dir = await withTempDir(prefix);
  const migrations = await import('../dist/db/migrations.js');
  const db = migrations.initSemesterDbAtPath(path.join(dir, 'semester.db'));
  registerDbCleanup(t, db, dir);
  return { db, migrations };
}

test('fresh semester database applies current migrations with S3 tables, indexes, and triggers exactly once', async (t) => {
  const { db, migrations } = await openFreshSemester(t, 'studybuddy-t03a-fresh-');

  assert.equal(migrations.getAppliedVersion(db, 'semester'), 8);
  assert.deepEqual(columnNames(db, 'practice_sessions'), [
    'id',
    'course_instance_id',
    'assessment_attempt_id',
    'status',
    'question_count',
    'time_limit_seconds',
    'started_at',
    'submitted_at',
    'graded_at',
    'total_score',
    'correct_rate',
    'overtime',
    'total_duration_seconds',
    'difficulty_preference',
    'created_at',
    'updated_at',
    'session_kind',
    'origin_mistake_id',
  ]);
  assert.deepEqual(columnNames(db, 'questions'), [
    'id',
    'practice_session_id',
    'course_instance_id',
    'knowledge_module_id',
    'type',
    'stem',
    'options_json',
    'correct_answer',
    'acceptable_answers_json',
    'difficulty',
    'explanation',
    'source_evidence',
    'ai_model',
    'prompt_version',
    'question_order',
    'created_at',
    'origin_question_id',
  ]);
  assert.deepEqual(columnNames(db, 'practice_answers'), [
    'id',
    'session_id',
    'question_id',
    'student_answer',
    'is_correct',
    'time_spent_seconds',
    'answer_order',
    'created_at',
  ]);

  for (const [table, expectedIndexes] of [
    [
      'practice_sessions',
      ['idx_practice_sessions_assessment', 'idx_practice_sessions_course', 'idx_practice_sessions_status'],
    ],
    [
      'questions',
      [
        'idx_questions_course_difficulty_type',
        'idx_questions_module',
        'idx_questions_session',
        'idx_questions_session_order',
      ],
    ],
    [
      'practice_answers',
      [
        'idx_practice_answers_question_correct',
        'idx_practice_answers_session',
        'idx_practice_answers_session_order',
        'idx_practice_answers_session_question',
      ],
    ],
  ]) {
    const actual = indexNames(db, table);
    for (const index of expectedIndexes) assert.ok(actual.includes(index), `${table} missing ${index}`);
  }

  const actualTriggers = triggerNames(db);
  for (const trigger of [
    'validate_assessment_practice_course_update',
    'validate_knowledge_module_question_course_update',
    'validate_practice_answers_insert',
    'validate_practice_answers_update',
    'validate_practice_sessions_insert',
    'validate_practice_sessions_update',
    'validate_questions_insert',
    'validate_questions_update',
  ]) {
    assert.ok(actualTriggers.includes(trigger), `missing ${trigger}`);
  }

  migrations.migrateSemesterDb(db);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'semester' AND version = 5").get().count,
    1
  );
});

test('v3 semester database upgrades to current schema without losing existing S1 or S2 data', async (t) => {
  const dir = await withTempDir('studybuddy-t03a-upgrade-');
  const { openDbAtPath } = await import('../dist/db/connection.js');
  const migrations = await import('../dist/db/migrations.js');
  const { SCHEMA_SEMESTER_SQL } = require('../dist/db/sql/schema-semester.js');
  const { SEMESTER_V2_SQL } = require('../dist/db/sql/migration-semester-v2.js');
  const { SEMESTER_V3_SQL } = require('../dist/db/sql/migration-semester-v3.js');
  const db = openDbAtPath(path.join(dir, 'semester-v3.db'));
  registerDbCleanup(t, db, dir);

  migrations.applyMigrations(db, 'semester', [
    { version: 1, sql: SCHEMA_SEMESTER_SQL },
    { version: 2, sql: SEMESTER_V2_SQL },
    { version: 3, sql: SEMESTER_V3_SQL },
  ]);
  seedFoundation(db);
  assert.equal(migrations.getAppliedVersion(db, 'semester'), 3);

  migrations.migrateSemesterDb(db);

  assert.equal(migrations.getAppliedVersion(db, 'semester'), 8);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'semester' AND version = 5").get().count,
    1
  );
  assert.equal(db.prepare('SELECT name FROM course_instances WHERE id = ?').get('course-1').name, '线性代数');
  assert.equal(db.prepare('SELECT title FROM knowledge_modules WHERE id = ?').get('module-1').title, '向量空间');
  for (const table of ['practice_sessions', 'questions', 'practice_answers']) {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  }

  migrations.migrateSemesterDb(db);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'semester' AND version = 5").get().count,
    1
  );
});

test('practice_sessions enforce scalar constraints and assessment-course consistency', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t03a-session-');
  seedFoundation(db);

  const invalidCheckCases = [
    { status: 'invalid' },
    { questionCount: 0 },
    { questionCount: 21 },
    { questionCount: 1.5 },
    { timeLimitSeconds: 0 },
    { timeLimitSeconds: 1.5 },
    { difficultyPreference: 'extreme' },
    { totalScore: -1 },
    { totalScore: 1.5 },
    { totalScore: 4 },
    { correctRate: -0.1 },
    { correctRate: 1.1 },
    { correctRate: 'not-a-number' },
    { overtime: 2 },
    { overtime: 1.5 },
    { totalDurationSeconds: -1 },
    { totalDurationSeconds: 1.5 },
  ];
  for (const overrides of invalidCheckCases) {
    assert.throws(() => insertSession(db, overrides), /CHECK constraint failed/);
  }

  assert.throws(
    () => insertSession(db, { courseInstanceId: 'course-1', assessmentAttemptId: 'assessment-2' }),
    /practice session assessment course mismatch/
  );

  const session = insertSession(db, { id: 'session-1', questionCount: 3 });
  assert.equal(db.prepare('SELECT question_count FROM practice_sessions WHERE id = ?').get(session.id).question_count, 3);
});

test('questions enforce type, JSON, ordering, and session-course-module consistency', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t03a-question-');
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 3 });

  const invalidCheckCases = [
    { type: 'essay' },
    { stem: '   ' },
    { stem: 'x'.repeat(2001) },
    { optionsJson: null },
    { optionsJson: 'not-json' },
    { type: 'fill_blank', optionsJson: '["A"]', acceptableAnswersJson: '["答案"]' },
    { acceptableAnswersJson: '["A"]' },
    { difficulty: 'extreme' },
    { aiModel: '   ' },
    { questionOrder: 0 },
    { questionOrder: 1.5 },
  ];
  for (const overrides of invalidCheckCases) {
    assert.throws(() => insertQuestion(db, overrides), /CHECK constraint failed/);
  }

  assert.throws(
    () => insertQuestion(db, { courseInstanceId: 'course-2', knowledgeModuleId: 'module-2' }),
    /question course relation mismatch/
  );
  assert.throws(
    () => insertQuestion(db, { courseInstanceId: 'course-1', knowledgeModuleId: 'module-2' }),
    /question course relation mismatch/
  );

  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  assert.throws(() => insertQuestion(db, { questionOrder: 1 }), /UNIQUE constraint failed/);
  insertQuestion(db, {
    id: 'question-2',
    type: 'multiple_choice',
    optionsJson: '["A","B","C"]',
    correctAnswer: 'A,C',
    questionOrder: 2,
  });
  insertQuestion(db, {
    id: 'question-3',
    type: 'fill_blank',
    optionsJson: null,
    correctAnswer: '向量空间',
    acceptableAnswersJson: '["向量空间","线性空间"]',
    questionOrder: 3,
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM questions').get().count, 3);
});

test('practice_answers enforce grading scalars, order, uniqueness, and question-session consistency', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t03a-answer-');
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 2 });
  insertSession(db, { id: 'session-2', assessmentAttemptId: null, questionCount: 1 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertQuestion(db, { id: 'question-2', questionOrder: 2 });
  insertQuestion(db, { id: 'question-other-session', practiceSessionId: 'session-2', questionOrder: 1 });

  const invalidCheckCases = [
    { isCorrect: 2 },
    { isCorrect: 1.5 },
    { timeSpentSeconds: -1 },
    { timeSpentSeconds: 1.5 },
  ];
  for (const overrides of invalidCheckCases) {
    assert.throws(() => insertAnswer(db, overrides), /CHECK constraint failed/);
  }

  for (const answerOrder of [0, 1.5, 2]) {
    assert.throws(() => insertAnswer(db, { answerOrder }), /practice answer relation mismatch/);
  }
  assert.throws(
    () => insertAnswer(db, { sessionId: 'session-1', questionId: 'question-other-session', answerOrder: 1 }),
    /practice answer relation mismatch/
  );

  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1 });
  assert.throws(
    () => insertAnswer(db, { questionId: 'question-1', answerOrder: 1 }),
    /UNIQUE constraint failed/
  );
  insertAnswer(db, {
    id: 'answer-2',
    questionId: 'question-2',
    answerOrder: 2,
    studentAnswer: null,
    isCorrect: null,
    timeSpentSeconds: null,
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM practice_answers').get().count, 2);
});

test('assessment, session, and knowledge-module deletion semantics preserve or cascade S3 records', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t03a-delete-');
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 1 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1 });

  db.prepare('DELETE FROM assessment_attempts WHERE id = ?').run('assessment-1');
  assert.equal(
    db.prepare('SELECT assessment_attempt_id FROM practice_sessions WHERE id = ?').get('session-1').assessment_attempt_id,
    null
  );

  db.prepare('DELETE FROM practice_sessions WHERE id = ?').run('session-1');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM questions').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM practice_answers').get().count, 0);

  insertSession(db, { id: 'session-module-delete', assessmentAttemptId: null, questionCount: 1 });
  insertQuestion(db, {
    id: 'question-module-delete',
    practiceSessionId: 'session-module-delete',
    questionOrder: 1,
  });
  insertAnswer(db, {
    id: 'answer-module-delete',
    sessionId: 'session-module-delete',
    questionId: 'question-module-delete',
    answerOrder: 1,
  });
  db.prepare('DELETE FROM knowledge_modules WHERE id = ?').run('module-1');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM questions').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM practice_answers').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM practice_sessions').get().count, 1);
});

test('parent and child updates cannot create dirty S3 cross-table relations', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t03a-update-');
  seedFoundation(db);
  insertSession(db, { id: 'session-1', questionCount: 1 });
  insertSession(db, { id: 'session-2', assessmentAttemptId: null, questionCount: 1 });
  insertQuestion(db, { id: 'question-1', questionOrder: 1 });
  insertAnswer(db, { id: 'answer-1', questionId: 'question-1', answerOrder: 1 });

  assert.throws(
    () => db.prepare("UPDATE assessment_attempts SET course_instance_id = 'course-2' WHERE id = 'assessment-1'").run(),
    /assessment practice course mismatch/
  );
  assert.throws(
    () => db.prepare("UPDATE practice_sessions SET assessment_attempt_id = 'assessment-2' WHERE id = 'session-1'").run(),
    /practice session relation mismatch/
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE practice_sessions SET course_instance_id = 'course-2', assessment_attempt_id = NULL WHERE id = 'session-1'")
        .run(),
    /practice session relation mismatch/
  );
  assert.throws(
    () => db.prepare("UPDATE knowledge_modules SET course_instance_id = 'course-2' WHERE id = 'module-1'").run(),
    /knowledge module question course mismatch/
  );
  assert.throws(
    () => db.prepare("UPDATE questions SET course_instance_id = 'course-2' WHERE id = 'question-1'").run(),
    /question relation mismatch/
  );
  assert.throws(
    () => db.prepare("UPDATE questions SET knowledge_module_id = 'module-2' WHERE id = 'question-1'").run(),
    /question relation mismatch/
  );
  assert.throws(
    () => db.prepare("UPDATE questions SET practice_session_id = 'session-2' WHERE id = 'question-1'").run(),
    /question relation mismatch/
  );
  assert.throws(
    () => db.prepare('UPDATE questions SET question_order = 2 WHERE id = ?').run('question-1'),
    /question relation mismatch/
  );
  assert.throws(
    () => db.prepare("UPDATE practice_answers SET session_id = 'session-2' WHERE id = 'answer-1'").run(),
    /practice answer relation mismatch/
  );
  assert.throws(
    () => db.prepare('UPDATE practice_answers SET answer_order = 2 WHERE id = ?').run('answer-1'),
    /practice answer relation mismatch/
  );

  db.prepare("UPDATE assessment_attempts SET name = '更新后的考试' WHERE id = 'assessment-1'").run();
  db.prepare("UPDATE practice_sessions SET assessment_attempt_id = NULL WHERE id = 'session-1'").run();
  db.prepare("UPDATE knowledge_modules SET title = '更新后的模块' WHERE id = 'module-1'").run();
  db.prepare("UPDATE questions SET difficulty = 'hard' WHERE id = 'question-1'").run();
  db.prepare(
    "UPDATE practice_answers SET student_answer = 'B', is_correct = 0, time_spent_seconds = 20 WHERE id = 'answer-1'"
  ).run();

  assert.deepEqual(db.prepare('SELECT student_answer, is_correct, time_spent_seconds FROM practice_answers').get(), {
    student_answer: 'B',
    is_correct: 0,
    time_spent_seconds: 20,
  });
});

assert.equal(typeof Database, 'function');