import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t09e-archive-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const { createApp } = await import('../dist/app.js');
const { initGlobalDb, initSemesterDbAtPath } = await import('../dist/db/migrations.js');
const { getSemesterDbPath } = await import('../dist/db/paths.js');

const unconfigured = { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null };
const configurationService = {
  getAllStatus: () => ({
    ai: unconfigured,
    smtp: unconfigured,
    feishu: unconfigured,
    runtime: {
      dataDir: true,
      aiAvailable: false,
      smtpAvailable: false,
      feishuAvailable: false,
      uptime: 1,
      nodeVersion: 'v22.test',
    },
  }),
  getActiveSnapshot: () => null,
  testAndActivate: async () => ({ activated: false, test: { pass: false } }),
  retest: async () => null,
};

async function startApp(t) {
  const app = createApp({
    configurationService,
    enableDevRoutes: false,
    timetableRecognizer: {
      recognize: async () => ({ text: '周一 08:00-08:45 数学 101\n周三 10:00-10:45 英语 202' }),
    },
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function json(base, method, pathname, body) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

function tinyPngFile() {
  return new File(
    [
      Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
      ]),
    ],
    'timetable.png',
    { type: 'image/png' }
  );
}

async function preview(base, fields = {}) {
  const form = new FormData();
  form.set('semesterCode', fields.semesterCode ?? `sem-${crypto.randomUUID()}`);
  form.set('teachingStartDate', fields.teachingStartDate ?? '2026-02-20');
  form.set('teachingEndDate', fields.teachingEndDate ?? '2026-06-30');
  if (fields.finalArchiveDate) form.set('finalArchiveDate', fields.finalArchiveDate);
  form.set('studentName', fields.studentName ?? 'Alice');
  form.set('timetableImage', tinyPngFile());
  const response = await fetch(`${base}/api/semesters/preview`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
}

function seedGradedPracticeSession(semesterId, courseId, overrides = {}) {
  const db = initSemesterDbAtPath(getSemesterDbPath(semesterId));
  try {
    const now = overrides.now ?? '2027-03-01T08:00:00.000Z';
    const assessmentId = overrides.assessmentId ?? crypto.randomUUID();
    const moduleId = overrides.moduleId ?? crypto.randomUUID();
    const sessionId = overrides.sessionId ?? crypto.randomUUID();
    const questionId = overrides.questionId ?? crypto.randomUUID();
    const answerId = overrides.answerId ?? crypto.randomUUID();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO assessment_attempts (id, course_instance_id, name, attempt_type, exam_at, goal, child_confirmed, created_at, updated_at)
                  VALUES (?, ?, ?, 'normal', ?, '90+', 1, ?, ?)`
      ).run(assessmentId, courseId, overrides.assessmentName ?? '期中考试', '2027-04-10T09:00:00.000Z', now, now);
      db.prepare(
        `INSERT INTO knowledge_modules (id, course_instance_id, title, importance, difficulty, source_evidence, learn_status, created_at, updated_at)
                  VALUES (?, ?, ?, 'high', 'medium', '课本第 1 章', 'learning', ?, ?)`
      ).run(moduleId, courseId, overrides.moduleTitle ?? '一次函数', now, now);
      db.prepare(
        `INSERT INTO practice_sessions (id, course_instance_id, assessment_attempt_id, status, question_count, time_limit_seconds, started_at, submitted_at, graded_at, total_score, correct_rate, overtime, total_duration_seconds, difficulty_preference, created_at, updated_at)
                  VALUES (?, ?, ?, 'graded', 1, 600, ?, ?, ?, 1, 1.0, 0, 120, 'mixed', ?, ?)`
      ).run(
        sessionId,
        courseId,
        assessmentId,
        now,
        '2027-03-01T08:02:00.000Z',
        '2027-03-01T08:02:01.000Z',
        now,
        '2027-03-01T08:02:01.000Z'
      );
      db.prepare(
        `INSERT INTO questions (id, practice_session_id, course_instance_id, knowledge_module_id, type, stem, options_json, correct_answer, acceptable_answers_json, difficulty, explanation, source_evidence, ai_model, prompt_version, question_order, created_at)
                  VALUES (?, ?, ?, ?, 'single_choice', '1+1=?', '["1","2","3","4"]', '2', NULL, 'easy', '基础加法', '课本第 1 章', 'test-model', 's3-practice-v1.0', 1, ?)`
      ).run(questionId, sessionId, courseId, moduleId, now);
      db.prepare(
        `INSERT INTO practice_answers (id, session_id, question_id, student_answer, is_correct, time_spent_seconds, answer_order, created_at)
                  VALUES (?, ?, ?, '2', 1, 30, 1, ?)`
      ).run(answerId, sessionId, questionId, '2027-03-01T08:02:00.000Z');
    })();
    return { assessmentId, moduleId, sessionId, questionId, answerId };
  } finally {
    db.close();
  }
}

async function createSemester(base, fields = {}) {
  const previewed = await preview(base, fields);
  assert.equal(previewed.status, 200);
  const created = await json(base, 'POST', '/api/semesters', {
    previewId: previewed.body.data.previewId,
    semesterCode: fields.semesterCode,
    teachingStartDate: fields.teachingStartDate ?? '2026-02-20',
    teachingEndDate: fields.teachingEndDate ?? '2026-06-30',
    finalArchiveDate: fields.finalArchiveDate,
    studentName: fields.studentName ?? 'Alice',
    entries: previewed.body.data.entries,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  return created.body.data.semester;
}

test('global schema exposes archivedAt and archive API keeps current semester active-only', async (t) => {
  const base = await startApp(t);
  const oldSemester = await createSemester(base, { semesterCode: '2026-spring', finalArchiveDate: '2026-07-15' });
  const newSemester = await createSemester(base, {
    semesterCode: '2026-fall',
    teachingStartDate: '2026-09-01',
    teachingEndDate: '2027-01-20',
  });

  const globalDb = initGlobalDb();
  try {
    const columns = globalDb.pragma('table_info(semesters)').map((column) => column.name);
    assert.ok(columns.includes('archived_at'));
  } finally {
    globalDb.close();
  }

  const currentArchive = await json(base, 'POST', `/api/semesters/${newSemester.id}/archive`);
  assert.equal(currentArchive.status, 409);
  assert.equal(currentArchive.body.success, false);
  assert.equal(currentArchive.body.error.code, 'CURRENT_SEMESTER_CANNOT_ARCHIVE');

  const switched = await json(base, 'PUT', '/api/semesters/current', { semesterId: newSemester.id });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.data.semester.id, newSemester.id);

  const archived = await json(base, 'POST', `/api/semesters/${oldSemester.id}/archive`);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.success, true);
  assert.equal(archived.body.data.id, oldSemester.id);
  assert.equal(archived.body.data.status, 'archived');
  assert.equal(typeof archived.body.data.archivedAt, 'string');
  assert.equal(existsSync(getSemesterDbPath(oldSemester.id)), true);

  const activeList = await json(base, 'GET', '/api/semesters');
  assert.deepEqual(
    activeList.body.data.map((semester) => semester.id),
    [newSemester.id]
  );

  const archivedList = await json(base, 'GET', '/api/semesters/archived');
  assert.equal(archivedList.status, 200);
  assert.deepEqual(
    archivedList.body.data.map((semester) => semester.id),
    [oldSemester.id]
  );

  const repeat = await json(base, 'POST', `/api/semesters/${oldSemester.id}/archive`);
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.data.archivedAt, archived.body.data.archivedAt);

  const selectArchived = await json(base, 'PUT', '/api/semesters/current', { semesterId: oldSemester.id });
  assert.equal(selectArchived.status, 404);
  assert.equal(selectArchived.body.error.code, 'SEMESTER_NOT_FOUND');
});

test('archived semesters reject semester-scoped writes while preserving reads', async (t) => {
  const base = await startApp(t);
  const oldSemester = await createSemester(base, { semesterCode: '2027-spring' });
  const newSemester = await createSemester(base, {
    semesterCode: '2027-fall',
    teachingStartDate: '2027-09-01',
    teachingEndDate: '2028-01-20',
  });
  await json(base, 'PUT', '/api/semesters/current', { semesterId: newSemester.id });
  const archived = await json(base, 'POST', `/api/semesters/${oldSemester.id}/archive`);
  assert.equal(archived.status, 200);

  const readCourses = await json(base, 'GET', `/api/courses?semesterId=${oldSemester.id}`);
  assert.equal(readCourses.status, 200);
  assert.equal(readCourses.body.success, true);

  const createCourse = await json(base, 'POST', '/api/courses', { semesterId: oldSemester.id, name: '物理' });
  assert.equal(createCourse.status, 409);
  assert.equal(createCourse.body.error.code, 'SEMESTER_ARCHIVED');

  const createPractice = await json(base, 'POST', '/api/practice-sessions', {
    semesterId: oldSemester.id,
    courseInstanceId: readCourses.body.data[0].id,
    questionCount: 5,
  });
  assert.equal(createPractice.status, 409);
  assert.equal(createPractice.body.error.code, 'SEMESTER_ARCHIVED');
});

test('practice history lists filtered sessions and reads archived graded results', async (t) => {
  const base = await startApp(t);
  const oldSemester = await createSemester(base, { semesterCode: '2028-spring' });
  const newSemester = await createSemester(base, {
    semesterCode: '2028-fall',
    teachingStartDate: '2028-09-01',
    teachingEndDate: '2029-01-20',
  });
  const readCourses = await json(base, 'GET', `/api/courses?semesterId=${oldSemester.id}`);
  assert.equal(readCourses.status, 200);
  const courseId = readCourses.body.data[0].id;
  const seeded = seedGradedPracticeSession(oldSemester.id, courseId);

  await json(base, 'PUT', '/api/semesters/current', { semesterId: newSemester.id });
  const archived = await json(base, 'POST', `/api/semesters/${oldSemester.id}/archive`);
  assert.equal(archived.status, 200);

  const history = await json(
    base,
    'GET',
    `/api/practice-sessions/history?semesterId=${oldSemester.id}&courseInstanceId=${courseId}&status=graded`
  );
  assert.equal(history.status, 200);
  assert.equal(history.body.success, true);
  assert.equal(history.body.data.items.length, 1);
  assert.equal(history.body.data.items[0].id, seeded.sessionId);
  assert.equal(history.body.data.items[0].courseName, readCourses.body.data[0].name);
  assert.equal(history.body.data.items[0].assessmentName, '期中考试');
  assert.equal(history.body.data.items[0].correctRate, 1);
  assert.equal(history.body.data.pagination.total, 1);

  const result = await json(
    base,
    'GET',
    `/api/practice-sessions/${seeded.sessionId}/history-result?semesterId=${oldSemester.id}`
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, seeded.sessionId);
  assert.equal(result.body.data.answers[0].questionId, seeded.questionId);
  assert.equal(result.body.data.answers[0].correctAnswer, '2');
  assert.equal(result.body.data.answers[0].isCorrect, true);
  assert.equal(result.body.data.answers[0].knowledgeModuleTitle, '一次函数');
});
