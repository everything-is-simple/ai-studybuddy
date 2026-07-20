import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import { migrateSemesterDb, getAppliedVersion } from '../dist/db/migrations.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

async function openFreshSemester(t, prefix = 'studybuddy-t02-s5-schema-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const dbPath = path.join(dir, 'semester.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  migrateSemesterDb(db);
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { db, dir };
}

function seedFoundation(db, options = {}) {
  const now = '2026-07-20T00:00:00.000Z';
  const courseId = options.courseId ?? crypto.randomUUID();
  const otherCourseId = options.otherCourseId ?? crypto.randomUUID();
  const moduleId = options.moduleId ?? crypto.randomUUID();
  const otherModuleId = options.otherModuleId ?? crypto.randomUUID();
  const confirmedExamId = options.confirmedExamId ?? crypto.randomUUID();
  const pendingExamId = options.pendingExamId ?? crypto.randomUUID();
  db.prepare('INSERT INTO course_instances (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(courseId, 'semester-1', '数学', now, now);
  db.prepare('INSERT INTO course_instances (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(otherCourseId, 'semester-1', '英语', now, now);
  db.prepare(`INSERT INTO knowledge_modules (
    id, course_instance_id, material_id, title, importance, difficulty,
    source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
  ) VALUES (?, ?, NULL, ?, 'high', 'medium', ?, 'not_started', ?, ?, ?, ?)`).run(
    moduleId,
    courseId,
    '函数定义',
    '函数是输入与输出之间的对应关系',
    '理解函数定义和定义域。',
    '期末常考选择题',
    now,
    now
  );
  db.prepare(`INSERT INTO knowledge_modules (
    id, course_instance_id, material_id, title, importance, difficulty,
    source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
  ) VALUES (?, ?, NULL, ?, 'medium', 'easy', ?, 'not_started', ?, ?, ?, ?)`).run(
    otherModuleId,
    otherCourseId,
    '阅读理解',
    '英语阅读摘要',
    '阅读理解摘要',
    '非数学考试范围',
    now,
    now
  );
  db.prepare(`INSERT INTO assessment_attempts (
    id, course_instance_id, name, attempt_type, exam_at, goal,
    confirmation_status, confirmed_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'normal', ?, NULL, ?, ?, ?, ?)`).run(
    confirmedExamId,
    courseId,
    '期末考试',
    '2026-08-01T00:00:00.000Z',
    'confirmed',
    now,
    now,
    now
  );
  db.prepare(`INSERT INTO assessment_attempts (
    id, course_instance_id, name, attempt_type, exam_at, goal,
    confirmation_status, confirmed_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'normal', ?, NULL, 'pending', NULL, ?, ?)`).run(
    pendingExamId,
    courseId,
    '待确认考试',
    '2026-08-10T00:00:00.000Z',
    now,
    now
  );
  return { courseId, otherCourseId, moduleId, otherModuleId, confirmedExamId, pendingExamId, now };
}

function insertPaper(db, foundation, overrides = {}) {
  const now = foundation.now;
  const id = overrides.id ?? crypto.randomUUID();
  db.prepare(`INSERT INTO mock_exam_papers (
    id, course_instance_id, assessment_attempt_id, status, title, question_count,
    time_limit_seconds, total_points, difficulty_preference, source_summary_json,
    generation_prompt_version, ai_model, source_hash, generated_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'generated', ?, 1, 90, 1, 'mixed', ?, 'test-v1', 'mock-model', ?, ?, ?, ?)`).run(
    id,
    overrides.courseId ?? foundation.courseId,
    overrides.assessmentId ?? foundation.confirmedExamId,
    '期末考试模拟考',
    JSON.stringify({ moduleCount: 1, weakPointCount: 0, activeMistakeCount: 0, moduleIds: [foundation.moduleId] }),
    crypto.randomUUID().replaceAll('-', ''),
    now,
    now,
    now
  );
  return id;
}

function insertQuestion(db, foundation, paperId, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  db.prepare(`INSERT INTO mock_exam_questions (
    id, paper_id, course_instance_id, knowledge_module_id, type, stem, options_json,
    correct_answer, acceptable_answers_json, difficulty, explanation, source_evidence,
    point_value, question_order, created_at
  ) VALUES (?, ?, ?, ?, 'single_choice', '函数定义是什么？', ?, 'A', NULL, 'medium', '解析', '证据', 1, 1, ?)`).run(
    id,
    overrides.paperId ?? paperId,
    overrides.courseId ?? foundation.courseId,
    overrides.moduleId ?? foundation.moduleId,
    JSON.stringify(['A. 对应关系', 'B. 任意集合', 'C. 只能线性', 'D. 无限制']),
    foundation.now
  );
  return id;
}

function insertAttempt(db, foundation, paperId, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  db.prepare(`INSERT INTO mock_exam_attempts (
    id, paper_id, course_instance_id, assessment_attempt_id, status, started_at,
    total_points, overtime, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'in_progress', ?, 1, 0, ?, ?)`).run(
    id,
    overrides.paperId ?? paperId,
    overrides.courseId ?? foundation.courseId,
    overrides.assessmentId ?? foundation.confirmedExamId,
    foundation.now,
    foundation.now,
    foundation.now
  );
  return id;
}

test('S5 mock exam migration v9 creates tables, indexes, and triggers on current schema', async (t) => {
  const { db } = await openFreshSemester(t);
  assert.equal(getAppliedVersion(db, 'semester'), 9);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'mock_exam_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, [
    'mock_exam_answers',
    'mock_exam_attempts',
    'mock_exam_module_analyses',
    'mock_exam_papers',
    'mock_exam_questions',
  ]);

  for (const indexName of [
    'idx_mock_exam_papers_assessment',
    'idx_mock_exam_questions_paper',
    'idx_mock_exam_attempts_paper',
    'idx_mock_exam_answers_attempt_question',
    'idx_mock_exam_module_analyses_attempt_module',
  ]) {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = ?").get(indexName).count, 1);
  }

  for (const triggerName of [
    'validate_mock_exam_papers_insert',
    'validate_mock_exam_questions_insert',
    'validate_mock_exam_attempts_insert',
    'validate_mock_exam_answers_insert',
    'validate_mock_exam_module_analyses_insert',
  ]) {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(triggerName).count, 1);
  }
});

test('S5 mock exam triggers require confirmed exam and same-course module relations', async (t) => {
  const { db } = await openFreshSemester(t, 'studybuddy-t02-s5-relations-');
  const foundation = seedFoundation(db);

  assert.throws(
    () => insertPaper(db, foundation, { assessmentId: foundation.pendingExamId }),
    /mock exam assessment relation mismatch/
  );

  const paperId = insertPaper(db, foundation);
  assert.throws(
    () => insertQuestion(db, foundation, paperId, { moduleId: foundation.otherModuleId }),
    /mock exam question relation mismatch/
  );

  const questionId = insertQuestion(db, foundation, paperId);
  const attemptId = insertAttempt(db, foundation, paperId);

  assert.throws(
    () => db.prepare(`INSERT INTO mock_exam_answers (
      id, attempt_id, question_id, student_answer, is_correct, score_awarded,
      time_spent_seconds, answer_order, created_at
    ) VALUES (?, ?, ?, 'A', 1, 1, 10, 2, ?)`).run(crypto.randomUUID(), attemptId, questionId, foundation.now),
    /mock exam answer relation mismatch/
  );

  assert.throws(
    () => db.prepare(`INSERT INTO mock_exam_module_analyses (
      id, attempt_id, knowledge_module_id, question_count, correct_count,
      score_awarded, total_points, correct_rate, weak_signal, created_at
    ) VALUES (?, ?, ?, 1, 1, 1, 1, 1.0, 0, ?)`).run(crypto.randomUUID(), attemptId, foundation.otherModuleId, foundation.now),
    /mock exam module analysis relation mismatch/
  );
});

assert.equal(typeof Database, 'function');
