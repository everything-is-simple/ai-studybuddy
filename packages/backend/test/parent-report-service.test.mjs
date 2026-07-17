import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.AI_PROVIDERS = '';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t06a-report-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const { initializeSemester } = await import('../dist/db/semester-initializer.js');
const { openExistingDbAtPath } = await import('../dist/db/connection.js');
const { ParentReportService } = await import('../dist/services/parent-report-service.js');

const NOW = '2026-06-01T20:00:00.000Z';

function createReadySemester() {
  return initializeSemester(
    {
      studentName: '测试学生',
      semesterCode: `t06a-${crypto.randomUUID()}`,
      teachingStartDate: '2026-02-20',
      teachingEndDate: '2026-07-10',
    },
    { appDataRoot: dataRoot }
  );
}

function withSemesterDb(semester, callback) {
  const db = openExistingDbAtPath(semester.semesterDbPath);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function insertCourse(db, semesterId, name = '数学') {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO course_instances (id, semester_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, semesterId, name, NOW, NOW);
  return id;
}

function insertKnowledgeModule(db, courseId, overrides = {}) {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO knowledge_modules (
      id, course_instance_id, material_id, title, importance, difficulty,
      source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'high', 'medium', ?, 'learning', ?, '高', ?, ?)`
  ).run(
    id,
    courseId,
    overrides.materialId ?? null,
    overrides.title ?? '函数基础',
    overrides.sourceEvidence ?? '资料原文：仅用于隐私防线测试',
    overrides.contentSummary ?? '笔记正文：仅用于隐私防线测试',
    NOW,
    NOW
  );
  return id;
}

function insertPracticeSession(db, courseId, overrides = {}) {
  const id = crypto.randomUUID();
  const gradedAt = overrides.gradedAt ?? '2026-06-01T10:00:00.000Z';
  const status = overrides.status ?? 'graded';
  db.prepare(
    `INSERT INTO practice_sessions (
      id, course_instance_id, assessment_attempt_id, status, question_count,
      time_limit_seconds, started_at, submitted_at, graded_at, total_score,
      correct_rate, overtime, total_duration_seconds, difficulty_preference,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 5, 600, ?, ?, ?, 4, ?, 0, 360, 'mixed', ?, ?)`
  ).run(id, courseId, status, gradedAt, gradedAt, status === 'graded' ? gradedAt : null, overrides.correctRate ?? 0.8, gradedAt, gradedAt);
  return id;
}

function findSection(report, kind) {
  const section = report.ruleReport.sections.find((item) => item.kind === kind);
  assert.ok(section, `missing ${kind} section`);
  return section;
}

function seedPrivateS2S3S4Data(db, semesterId) {
  const courseId = insertCourse(db, semesterId);
  const materialId = crypto.randomUUID();
  const failedMaterialId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO materials (
      id, course_instance_id, file_type, storage_key, status, original_filename, title,
      file_size_bytes, created_at, updated_at
    ) VALUES (?, ?, 'pdf', ?, 'completed', '资料原文.pdf', '资料原文', 12, ?, ?)`
  ).run(materialId, courseId, `semesters/${semesterId}/files/${crypto.randomUUID()}.pdf`, NOW, NOW);
  db.prepare(
    `INSERT INTO materials (
      id, course_instance_id, file_type, storage_key, status, original_filename, title,
      file_size_bytes, created_at, updated_at
    ) VALUES (?, ?, 'pdf', ?, 'conversion_failed', '失败讲义.pdf', '失败讲义', 12, ?, ?)`
  ).run(failedMaterialId, courseId, `semesters/${semesterId}/files/${crypto.randomUUID()}.pdf`, NOW, NOW);
  db.prepare(
    `INSERT INTO normalized_texts (id, material_id, source_type, text, char_count, created_at)
     VALUES (?, ?, 'pdf', '资料原文：不得出现在家长报告中。', 20, ?)`
  ).run(crypto.randomUUID(), materialId, NOW);

  const moduleId = insertKnowledgeModule(db, courseId, { materialId });
  const moduleId2 = insertKnowledgeModule(db, courseId, { title: '导数入门' });
  db.prepare(
    `INSERT INTO structured_notes (id, material_id, knowledge_module_id, markdown, created_at, updated_at)
     VALUES (?, ?, ?, '笔记正文：不得出现在家长报告中。', ?, ?)`
  ).run(crypto.randomUUID(), materialId, moduleId, NOW, NOW);

  db.prepare(
    `INSERT INTO study_tasks (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, type, title,
      status, estimated_minutes, deadline_at, completed_at, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, 'custom', '完成函数复习', 'done', 30, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), courseId, '2026-06-01T18:00:00.000Z', '2026-06-01T17:00:00.000Z', '2026-06-01T08:00:00.000Z', NOW);
  db.prepare(
    `INSERT INTO study_tasks (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, type, title,
      status, estimated_minutes, deadline_at, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, 'custom', '未完成任务', 'todo', 20, ?, ?, ?)`
  ).run(crypto.randomUUID(), courseId, '2026-06-01T18:00:00.000Z', '2026-06-01T08:00:00.000Z', NOW);
  db.prepare(
    `INSERT INTO study_events (
      id, course_instance_id, task_id, source_system, event_type, title,
      workload_minutes, parent_visible, occurred_at, created_at
    ) VALUES (?, ?, NULL, 'S1', 'task_done', '可见学习事件', 25, 1, ?, ?)`
  ).run(crypto.randomUUID(), courseId, '2026-06-01T12:00:00.000Z', NOW);
  db.prepare(
    `INSERT INTO study_events (
      id, course_instance_id, task_id, source_system, event_type, title,
      workload_minutes, parent_visible, occurred_at, created_at
    ) VALUES (?, ?, NULL, 'S1', 'private', '聊天内容：不得出现在家长报告中', 10, 0, ?, ?)`
  ).run(crypto.randomUUID(), courseId, '2026-06-01T13:00:00.000Z', NOW);

  const sessionId = insertPracticeSession(db, courseId);
  const questionId = crypto.randomUUID();
  const answerId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO questions (
      id, practice_session_id, course_instance_id, knowledge_module_id, type,
      stem, options_json, correct_answer, acceptable_answers_json, difficulty,
      explanation, source_evidence, ai_model, prompt_version, question_order, created_at
    ) VALUES (?, ?, ?, ?, 'single_choice', '完整题干：不得出现在报告中',
      '["A","B","C","D"]', '正确答案', NULL, 'medium', '完整解析',
      '测试证据', 'test-model', 's3-practice-v1.0', 1, ?)`
  ).run(questionId, sessionId, courseId, moduleId, NOW);
  db.prepare(
    `INSERT INTO practice_answers (
      id, session_id, question_id, student_answer, is_correct, time_spent_seconds, answer_order, created_at
    ) VALUES (?, ?, ?, '学生作答', 0, 12, 1, ?)`
  ).run(answerId, sessionId, questionId, NOW);
  const mistakeId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO mistakes (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, question_id,
      first_practice_answer_id, latest_practice_answer_id, status, error_count,
      first_error_at, latest_error_at, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'needs_review', 1, ?, ?, ?, ?)`
  ).run(mistakeId, courseId, moduleId, questionId, answerId, answerId, NOW, NOW, NOW, NOW);
  db.prepare(
    `INSERT INTO mistake_evidence (
      id, mistake_id, source_practice_answer_id, evidence_type,
      course_instance_id, knowledge_module_id, question_id, occurred_at, created_at
    ) VALUES (?, ?, ?, 'practice_error', ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), mistakeId, answerId, courseId, moduleId, questionId, NOW, NOW);
  db.prepare(
    `INSERT INTO weak_points (
      id, course_instance_id, knowledge_module_id, status, evidence_count,
      first_detected_at, latest_detected_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', 2, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), courseId, moduleId, NOW, NOW, NOW, NOW);
  db.prepare(
    `INSERT INTO study_tasks (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, type, title,
      status, estimated_minutes, deadline_at, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'error_review', '错因正文：仅用于隐私防线测试',
      'todo', 20, ?, ?, ?)`
  ).run(crypto.randomUUID(), courseId, moduleId, '2026-06-02T20:00:00.000Z', NOW, NOW);

  return { courseId, moduleId, moduleId2 };
}

test('T06A daily report returns rule-first empty-state blocks without inventing trends', async () => {
  const semester = createReadySemester();
  const report = await new ParentReportService({ now: () => NOW }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
  });

  assert.equal(report.reportType, 'daily');
  assert.equal(report.period.startDate, '2026-06-01');
  assert.equal(report.period.endDate, '2026-06-01');
  assert.equal(report.ruleReport.status, 'insufficient_data');
  assert.equal(report.aiSummary.status, 'not_requested');
  assert.match(report.ruleReport.summary, /暂无足够数据/);
  assert.ok(report.ruleReport.sections.some((section) => section.kind === 'data_quality'));
  assert.doesNotMatch(JSON.stringify(report), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test('T06A aggregates S1/S2/S3/S4/T05 facts using counts only and excludes private content', async () => {
  const semester = createReadySemester();
  const seeded = withSemesterDb(semester, (db) => seedPrivateS2S3S4Data(db, semester.semesterId));
  const report = await new ParentReportService({ now: () => NOW }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
  });

  const rhythm = findSection(report, 'study_rhythm');
  assert.equal(rhythm.metrics.courseInstances, 1);
  assert.equal(rhythm.metrics.completedTasks, 1);
  assert.equal(rhythm.metrics.overdueTasks, 1);
  assert.equal(rhythm.metrics.visibleEvents, 1);
  assert.equal(rhythm.metrics.workloadMinutes, 25);

  const materials = findSection(report, 'materials');
  assert.equal(materials.metrics.totalMaterials, 2);
  assert.equal(materials.metrics.completedMaterials, 1);
  assert.equal(materials.metrics.errorMaterials, 1);
  assert.equal(materials.metrics.knowledgeModules, 2);

  const practice = findSection(report, 'practice');
  assert.equal(practice.metrics.gradedSessions, 1);
  assert.equal(practice.metrics.averageCorrectRate, 0.8);

  const mistakes = findSection(report, 'mistakes');
  assert.equal(mistakes.metrics.openMistakes, 1);
  assert.equal(mistakes.metrics.activeWeakPoints, 1);
  assert.equal(mistakes.metrics.openErrorReviewTasks, 1);
  assert.equal(report.ruleReport.status, 'ok');

  const serialized = JSON.stringify(report);
  for (const forbidden of ['资料原文', '笔记正文', '完整题干', '正确答案', '学生作答', '错因正文', '聊天内容']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
  assert.doesNotMatch(serialized, new RegExp(seeded.courseId, 'i'));
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test('T06A honors daily, weekly, and monthly evidence windows', async () => {
  const semester = createReadySemester();
  withSemesterDb(semester, (db) => {
    const courseId = insertCourse(db, semester.semesterId);
    insertPracticeSession(db, courseId, { gradedAt: '2026-05-02T10:00:00.000Z', correctRate: 0.6 });
    insertPracticeSession(db, courseId, { gradedAt: '2026-05-30T10:00:00.000Z', correctRate: 0.7 });
    insertPracticeSession(db, courseId, { gradedAt: '2026-06-01T10:00:00.000Z', correctRate: 0.8 });
    for (const occurredAt of ['2026-05-02T10:00:00.000Z', '2026-05-30T10:00:00.000Z', '2026-06-01T10:00:00.000Z']) {
      db.prepare(
        `INSERT INTO study_events (
          id, course_instance_id, task_id, source_system, event_type, title,
          workload_minutes, parent_visible, occurred_at, created_at
        ) VALUES (?, ?, NULL, 'S3', 'practice_graded', '已批改练习', 10, 1, ?, ?)`
      ).run(crypto.randomUUID(), courseId, occurredAt, NOW);
    }
  });
  const service = new ParentReportService({ now: () => NOW });
  const daily = await service.generateReport({ semesterId: semester.semesterId, reportType: 'daily', periodStart: '2026-06-01', periodEnd: '2026-06-01' });
  const weekly = await service.generateReport({ semesterId: semester.semesterId, reportType: 'weekly', periodStart: '2026-05-26', periodEnd: '2026-06-01' });
  const monthly = await service.generateReport({ semesterId: semester.semesterId, reportType: 'monthly', periodStart: '2026-05-01', periodEnd: '2026-06-01' });

  assert.equal(findSection(daily, 'practice').metrics.gradedSessions, 1);
  assert.equal(findSection(weekly, 'practice').metrics.gradedSessions, 2);
  assert.equal(findSection(monthly, 'practice').metrics.gradedSessions, 3);
  assert.equal(findSection(daily, 'study_rhythm').metrics.visibleEvents, 1);
  assert.equal(findSection(weekly, 'study_rhythm').metrics.visibleEvents, 2);
  assert.equal(findSection(monthly, 'study_rhythm').metrics.visibleEvents, 3);
});

test('T06A generates formal 7/3/1-day reminders only for confirmed exams', async () => {
  const semester = createReadySemester();
  withSemesterDb(semester, (db) => {
    const courseId = insertCourse(db, semester.semesterId);
    for (const examAt of ['2026-06-02T08:00:00.000Z', '2026-06-04T08:00:00.000Z', '2026-06-08T08:00:00.000Z']) {
      db.prepare(
        `INSERT INTO assessment_attempts (
          id, course_instance_id, name, attempt_type, exam_at, confirmation_status,
          confirmed_at, created_at, updated_at
        ) VALUES (?, ?, '已确认考试', 'normal', ?, 'confirmed', ?, ?, ?)`
      ).run(crypto.randomUUID(), courseId, examAt, NOW, NOW, NOW);
    }
    db.prepare(
      `INSERT INTO assessment_attempts (
        id, course_instance_id, name, attempt_type, exam_at, confirmation_status,
        confirmed_at, created_at, updated_at
      ) VALUES (?, ?, 'pending-exam-private-name', 'normal', '2026-06-08T08:00:00.000Z', 'pending', NULL, ?, ?)`
    ).run(crypto.randomUUID(), courseId, NOW, NOW);
  });
  const report = await new ParentReportService({ now: () => NOW }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'exam_reminder',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
  });

  const reminder = findSection(report, 'exam_reminder');
  assert.equal(reminder.metrics.confirmedExamReminders, 3);
  assert.equal(reminder.metrics.oneDayReminders, 1);
  assert.equal(reminder.metrics.threeDayReminders, 1);
  assert.equal(reminder.metrics.sevenDayReminders, 1);
  assert.equal(reminder.metrics.unconfirmedExamReminders, 0);
  assert.match(reminder.summary, /7 天/);
  assert.doesNotMatch(JSON.stringify(report), /pending-exam-private-name/);
});

test('T06A AI summary only receives sanitized rule sections and appends successful optional content', async () => {
  const semester = createReadySemester();
  const seen = [];
  const report = await new ParentReportService({
    now: () => NOW,
    summarizeWithAi: async (payload) => {
      seen.push(payload);
      return { content: '今天节奏稳定，建议继续完成查漏补缺任务。', provider: 'fake', model: 'fake-parent-report', tokenUsed: 12, latencyMs: 1 };
    },
  }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
    includeAiSummary: true,
  });

  assert.equal(report.aiSummary.status, 'ok');
  assert.match(report.aiSummary.content, /节奏稳定/);
  assert.equal(seen.length, 1);
  assert.doesNotMatch(JSON.stringify(seen[0]), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test('T06A preserves the rule report when AI is not configured', async () => {
  const semester = createReadySemester();
  const report = await new ParentReportService({ now: () => NOW }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
    includeAiSummary: true,
  });

  assert.ok(report.ruleReport.sections.length > 0);
  assert.equal(report.aiSummary.status, 'failed');
  assert.match(report.aiSummary.errorSummary, /AI 摘要失败/);
});
test('T06A preserves the rule report when AI throws or returns empty content', async () => {
  const semester = createReadySemester();
  for (const summarizeWithAi of [async () => { throw new Error('provider timeout with secret details'); }, async () => ({ content: '   ', provider: 'fake', model: 'fake', tokenUsed: 0, latencyMs: 1 })]) {
    const report = await new ParentReportService({ now: () => NOW, summarizeWithAi }).generateReport({
      semesterId: semester.semesterId,
      reportType: 'daily',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-01',
      includeAiSummary: true,
    });
    assert.ok(report.ruleReport.sections.length > 0);
    assert.equal(report.aiSummary.status, 'failed');
    assert.match(report.aiSummary.errorSummary, /AI 摘要失败/);
    assert.doesNotMatch(report.aiSummary.errorSummary, /secret details/);
  }
});