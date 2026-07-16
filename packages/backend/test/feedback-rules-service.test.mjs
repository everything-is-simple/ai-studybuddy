import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function setupDb(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t05-feedback-'));
  process.env.APP_DATA_ROOT = dataRoot;
  const semesterId = crypto.randomUUID();
  const dbPath = path.join(dataRoot, 'semesters', semesterId, 'semester.db');
  const { initSemesterDbAtPath } = await import('../dist/db/migrations.js');
  const db = initSemesterDbAtPath(dbPath);
  t.after(async () => {
    db.close();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const now = '2026-07-17T00:00:00.000Z';
  const courseId = crypto.randomUUID();
  const examId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO course_instances (id, semester_id, name, created_at, updated_at)
     VALUES (?, ?, '线性代数', ?, ?)`
  ).run(courseId, semesterId, now, now);
  db.prepare(
    `INSERT INTO assessment_attempts (
      id, course_instance_id, name, attempt_type, exam_at, confirmation_status,
      confirmed_at, created_at, updated_at
    ) VALUES (?, ?, '期末考试', 'normal', '2026-08-01T00:00:00.000Z', 'confirmed', ?, ?, ?)`
  ).run(examId, courseId, now, now, now);
  return { db, semesterId, courseId, examId };
}

function seedKnowledgeModule(db, courseInstanceId, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const now = overrides.now ?? '2026-07-17T00:00:00.000Z';
  db.prepare(
    `INSERT INTO knowledge_modules (
      id, course_instance_id, material_id, title, importance, difficulty,
      source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'high', 'medium', '测试证据', ?, '理解向量空间定义', '常见概念题', ?, ?)`
  ).run(id, courseInstanceId, overrides.title ?? '向量空间定义', overrides.learnStatus ?? 'not_started', now, now);
  return id;
}

function seedMistake(db, input) {
  const now = input.now ?? '2026-07-17T00:00:00.000Z';
  const sessionId = input.sessionId ?? crypto.randomUUID();
  const questionId = input.questionId ?? crypto.randomUUID();
  const answerId = input.answerId ?? crypto.randomUUID();
  const mistakeId = input.mistakeId ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO practice_sessions (
      id, course_instance_id, assessment_attempt_id, status, question_count,
      time_limit_seconds, started_at, submitted_at, graded_at, total_score,
      correct_rate, overtime, total_duration_seconds, difficulty_preference,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'graded', 1, NULL, ?, ?, ?, 0, 0, 0, 30, 'mixed', ?, ?)`
  ).run(sessionId, input.courseInstanceId, input.assessmentAttemptId ?? null, now, now, now, now, now);
  db.prepare(
    `INSERT INTO questions (
      id, practice_session_id, course_instance_id, knowledge_module_id, type,
      stem, options_json, correct_answer, acceptable_answers_json, difficulty,
      explanation, source_evidence, ai_model, prompt_version, question_order, created_at
    ) VALUES (?, ?, ?, ?, 'single_choice', '向量空间封闭性指什么？',
      '["A. 加法和数乘结果仍在集合内","B. 只能做加法","C. 只能做数乘","D. 没有限制"]',
      'A', NULL, 'medium', '封闭性是核心', '测试证据', 'test-model', 's3-practice-v1.0', 1, ?)`
  ).run(questionId, sessionId, input.courseInstanceId, input.knowledgeModuleId, now);
  db.prepare(
    `INSERT INTO practice_answers (
      id, session_id, question_id, student_answer, is_correct, time_spent_seconds, answer_order, created_at
    ) VALUES (?, ?, ?, 'B', 0, 12, 1, ?)`
  ).run(answerId, sessionId, questionId, now);
  db.prepare(
    `INSERT INTO mistakes (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, question_id,
      first_practice_answer_id, latest_practice_answer_id, status, error_count,
      first_error_at, latest_error_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(
    mistakeId,
    input.courseInstanceId,
    input.assessmentAttemptId ?? null,
    input.knowledgeModuleId,
    questionId,
    answerId,
    answerId,
    input.status ?? 'pending_review',
    now,
    now,
    now,
    now
  );
  db.prepare(
    `INSERT INTO mistake_evidence (
      id, mistake_id, source_practice_answer_id, evidence_type,
      course_instance_id, knowledge_module_id, question_id, occurred_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    mistakeId,
    answerId,
    input.evidenceType ?? 'practice_error',
    input.courseInstanceId,
    input.knowledgeModuleId,
    questionId,
    now,
    now
  );
  return { mistakeId, questionId, answerId };
}

function seedWeakPoint(db, courseInstanceId, knowledgeModuleId, overrides = {}) {
  const now = overrides.now ?? '2026-07-17T00:00:00.000Z';
  const id = overrides.id ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO weak_points (
      id, course_instance_id, knowledge_module_id, status, evidence_count,
      first_detected_at, latest_detected_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    courseInstanceId,
    knowledgeModuleId,
    overrides.status ?? 'active',
    overrides.evidenceCount ?? 2,
    now,
    now,
    now,
    now
  );
  return id;
}

function readFeedbackState(db, moduleId) {
  return {
    module: db.prepare('SELECT * FROM knowledge_modules WHERE id = ?').get(moduleId),
    tasks: db.prepare('SELECT * FROM study_tasks WHERE knowledge_module_id = ? ORDER BY created_at ASC').all(moduleId),
    events: db.prepare('SELECT * FROM study_events WHERE evidence_ref = ? ORDER BY created_at ASC').all(`km:${moduleId}`),
    weakPoint: db.prepare('SELECT * FROM weak_points WHERE knowledge_module_id = ?').get(moduleId),
  };
}

async function feedbackService(options = {}) {
  const { FeedbackRulesService } = await import('../dist/services/feedback-rules-service.js');
  let seq = 0;
  return new FeedbackRulesService({
    now: () => options.now ?? '2026-07-17T00:00:00.000Z',
    id: () => `00000000-0000-4000-8000-${String((options.seed ?? 1) + seq++).padStart(12, '0')}`,
  });
}

test('pending_review single mistake keeps evidence only without changing module, task, or event', async (t) => {
  const { db, courseId, examId } = await setupDb(t);
  const moduleId = seedKnowledgeModule(db, courseId);
  seedMistake(db, {
    courseInstanceId: courseId,
    assessmentAttemptId: examId,
    knowledgeModuleId: moduleId,
    status: 'pending_review',
  });
  const service = await feedbackService();

  service.applyForModule(db, {
    courseInstanceId: courseId,
    knowledgeModuleId: moduleId,
    reason: 'practice_error',
    occurredAt: '2026-07-17T00:00:00.000Z',
  });

  const state = readFeedbackState(db, moduleId);
  assert.equal(state.module.learn_status, 'not_started');
  assert.equal(state.tasks.length, 0);
  assert.equal(state.events.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM mistake_evidence').get().count, 1);
});

test('confirmed review marks module learning, creates one error_review task, and is idempotent', async (t) => {
  const { db, courseId, examId } = await setupDb(t);
  const moduleId = seedKnowledgeModule(db, courseId);
  seedMistake(db, {
    courseInstanceId: courseId,
    assessmentAttemptId: examId,
    knowledgeModuleId: moduleId,
    status: 'needs_review',
  });
  const service = await feedbackService();

  for (let index = 0; index < 2; index += 1) {
    service.applyForModule(db, {
      courseInstanceId: courseId,
      knowledgeModuleId: moduleId,
      reason: 'error_cause_confirmed',
      occurredAt: '2026-07-17T00:00:00.000Z',
    });
  }

  const state = readFeedbackState(db, moduleId);
  assert.equal(state.module.learn_status, 'learning');
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].type, 'error_review');
  assert.equal(state.tasks[0].status, 'todo');
  assert.equal(state.tasks[0].assessment_attempt_id, examId);
  assert.equal(state.tasks[0].estimated_minutes, 20);
  assert.equal(state.tasks[0].deadline_at, '2026-07-20T00:00:00.000Z');
  assert.equal(state.events.filter((event) => event.event_type === 'feedback_review_required').length, 1);
});

test('active weak point creates urgent review task without duplicating existing open task', async (t) => {
  const { db, courseId } = await setupDb(t);
  const moduleId = seedKnowledgeModule(db, courseId);
  seedWeakPoint(db, courseId, moduleId);
  const service = await feedbackService();

  for (let index = 0; index < 2; index += 1) {
    service.applyForModule(db, {
      courseInstanceId: courseId,
      knowledgeModuleId: moduleId,
      reason: 'weak_point_active',
      occurredAt: '2026-07-17T00:00:00.000Z',
    });
  }

  const state = readFeedbackState(db, moduleId);
  assert.equal(state.module.learn_status, 'learning');
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].deadline_at, '2026-07-18T00:00:00.000Z');
  assert.equal(state.weakPoint.status, 'active');
});

test('mastery marks weak point and module mastered, completes open review task, and preserves evidence', async (t) => {
  const { db, courseId, examId } = await setupDb(t);
  const moduleId = seedKnowledgeModule(db, courseId, { learnStatus: 'learning' });
  seedMistake(db, {
    courseInstanceId: courseId,
    assessmentAttemptId: examId,
    knowledgeModuleId: moduleId,
    status: 'mastered',
  });
  seedWeakPoint(db, courseId, moduleId, { status: 'active', evidenceCount: 2 });
  db.prepare(
    `INSERT INTO study_tasks (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, type, title,
      status, estimated_minutes, deadline_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'error_review', '复习薄弱点：向量空间定义', 'todo', 20, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    courseId,
    examId,
    moduleId,
    '2026-07-18T00:00:00.000Z',
    '2026-07-17T00:00:00.000Z',
    '2026-07-17T00:00:00.000Z'
  );
  const evidenceBefore = db.prepare('SELECT COUNT(*) AS count FROM mistake_evidence').get().count;
  const service = await feedbackService();

  service.applyForModule(db, {
    courseInstanceId: courseId,
    knowledgeModuleId: moduleId,
    reason: 'mistake_mastered',
    occurredAt: '2026-07-17T00:00:00.000Z',
  });

  const state = readFeedbackState(db, moduleId);
  assert.equal(state.module.learn_status, 'mastered');
  assert.equal(state.weakPoint.status, 'mastered');
  assert.equal(state.weakPoint.evidence_count, 2);
  assert.equal(state.tasks[0].status, 'done');
  assert.equal(state.tasks[0].completed_at, '2026-07-17T00:00:00.000Z');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM mistake_evidence').get().count, evidenceBefore);
  assert.equal(state.events.filter((event) => event.event_type === 'feedback_review_mastered').length, 1);
});

test('reopened mastered mistake reactivates weak point and creates a fresh review task without refreshing review time', async (t) => {
  const { db, courseId, examId } = await setupDb(t);
  const moduleId = seedKnowledgeModule(db, courseId, { learnStatus: 'mastered' });
  const lastReviewedAt = '2026-07-10T00:00:00.000Z';
  db.prepare('UPDATE knowledge_modules SET last_reviewed_at = ? WHERE id = ?').run(lastReviewedAt, moduleId);
  seedMistake(db, {
    courseInstanceId: courseId,
    assessmentAttemptId: examId,
    knowledgeModuleId: moduleId,
    status: 'needs_review',
  });
  seedWeakPoint(db, courseId, moduleId, { status: 'mastered', evidenceCount: 2 });
  db.prepare(
    `INSERT INTO study_tasks (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, type, title,
      status, estimated_minutes, deadline_at, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'error_review', '复习薄弱点：向量空间定义', 'done', 20, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    courseId,
    examId,
    moduleId,
    '2026-07-12T00:00:00.000Z',
    '2026-07-12T00:00:00.000Z',
    '2026-07-10T00:00:00.000Z',
    '2026-07-12T00:00:00.000Z'
  );
  const service = await feedbackService({ seed: 100 });

  service.applyForModule(db, {
    courseInstanceId: courseId,
    knowledgeModuleId: moduleId,
    reason: 'mistake_reopened',
    occurredAt: '2026-07-17T00:00:00.000Z',
  });

  const state = readFeedbackState(db, moduleId);
  assert.equal(state.module.learn_status, 'learning');
  assert.equal(state.module.last_reviewed_at, lastReviewedAt);
  assert.equal(state.weakPoint.status, 'active');
  assert.equal(state.tasks.length, 2);
  assert.equal(state.tasks.filter((task) => task.status === 'done').length, 1);
  const openTask = state.tasks.find((task) => task.status === 'todo');
  assert.equal(openTask.type, 'error_review');
  assert.equal(openTask.deadline_at, '2026-07-20T00:00:00.000Z');
  assert.equal(state.events.filter((event) => event.event_type === 'feedback_review_required').length, 1);
});
