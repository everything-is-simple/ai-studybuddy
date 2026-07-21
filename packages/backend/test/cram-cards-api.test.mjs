import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const backendDir = path.resolve(import.meta.dirname, '..');

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('failed to allocate a free port');
  return port;
}

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t04-cram-api-'));
  const port = await getFreePort();
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: { ...process.env, APP_DATA_ROOT: dataRoot, BACKEND_HOST: '127.0.0.1', BACKEND_PORT: String(port), AI_PROVIDERS: '', AI_API_KEY: '', AI_BASE_URL: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(async () => { child.kill(); await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return { dataRoot, port }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend did not become healthy: ${stderr}`);
}

async function requestJson(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : undefined, text };
}

async function initializeReadySemester(port) {
  const result = await requestJson(port, 'POST', '/api/dev/init-semester', {
    studentName: 'T04-Cram', semesterCode: `t04-cram-${crypto.randomUUID()}`, teachingStartDate: '2026-02-20', teachingEndDate: '2026-06-30',
  });
  assert.equal(result.status, 200, result.text);
  return result.json.data.semesterId;
}

async function createCourse(port, semesterId, name) {
  const result = await requestJson(port, 'POST', '/api/courses', { semesterId, name });
  assert.equal(result.status, 201, result.text);
  return result.json.data;
}

async function createExam(port, semesterId, courseInstanceId, overrides = {}) {
  const result = await requestJson(port, 'POST', '/api/exams', {
    semesterId, courseInstanceId, name: '阶段考试', examAt: '2026-08-01T00:00:00.000Z', confirmationStatus: 'confirmed', ...overrides,
  });
  assert.equal(result.status, 201, result.text);
  return result.json.data;
}

function openSemesterDb(dataRoot, semesterId) { return new Database(path.join(dataRoot, 'semesters', semesterId, 'semester.db')); }

function seedModule(dataRoot, semesterId, courseId, overrides = {}) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    const id = overrides.id ?? crypto.randomUUID();
    const now = overrides.updatedAt ?? '2026-07-20T00:00:00.000Z';
    db.prepare(`INSERT INTO knowledge_modules (
      id, course_instance_id, material_id, title, importance, difficulty, source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, 'medium', ?, 'not_started', ?, ?, ?, ?)`)
      .run(id, courseId, overrides.title ?? '模块', overrides.importance ?? 'medium', '禁止返回的资料原文', overrides.contentSummary ?? '可安全展示的摘要', overrides.examRelevance ?? '可安全展示的考点', now, now);
    return id;
  } finally { db.close(); }
}

function seedWeakPoint(dataRoot, semesterId, courseId, moduleId, evidenceCount, latestAt) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    db.prepare(`INSERT INTO weak_points (
      id, course_instance_id, knowledge_module_id, status, evidence_count, first_detected_at, latest_detected_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), courseId, moduleId, evidenceCount, latestAt, latestAt, latestAt, latestAt);
  } finally { db.close(); }
}

function seedMistake(dataRoot, semesterId, courseId, moduleId, errorCount, latestAt, status = 'needs_review') {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    const firstSessionId = crypto.randomUUID();
    const questionId = crypto.randomUUID();
    const answerId = crypto.randomUUID();
    const insertSession = db.prepare(`INSERT INTO practice_sessions (
      id, course_instance_id, assessment_attempt_id, status, question_count, time_limit_seconds, started_at, submitted_at, graded_at,
      total_score, correct_rate, overtime, total_duration_seconds, difficulty_preference, created_at, updated_at
    ) VALUES (?, ?, NULL, 'graded', 1, NULL, ?, ?, ?, 0, 0, 0, 10, 'mixed', ?, ?)`);
    insertSession.run(firstSessionId, courseId, latestAt, latestAt, latestAt, latestAt, latestAt);
    db.prepare(`INSERT INTO questions (
      id, practice_session_id, course_instance_id, knowledge_module_id, type, stem, options_json, correct_answer,
      acceptable_answers_json, difficulty, explanation, source_evidence, ai_model, prompt_version, question_order, created_at
    ) VALUES (?, ?, ?, ?, 'fill_blank', '禁止返回的题干', NULL, '禁止返回的正确答案', NULL, 'medium', '禁止返回的解析', '禁止返回的来源原文', 'test-model', 'test-prompt', 1, ?)`)
      .run(questionId, firstSessionId, courseId, moduleId, latestAt);
    const insertAnswer = db.prepare(`INSERT INTO practice_answers (
      id, session_id, question_id, student_answer, is_correct, time_spent_seconds, answer_order, created_at
    ) VALUES (?, ?, ?, '禁止返回的学生作答', 0, 10, 1, ?)`);
    insertAnswer.run(answerId, firstSessionId, questionId, latestAt);
    db.prepare(`INSERT INTO mistakes (
      id, course_instance_id, assessment_attempt_id, knowledge_module_id, question_id, first_practice_answer_id, latest_practice_answer_id,
      status, error_count, first_error_at, latest_error_at, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), courseId, moduleId, questionId, answerId, answerId, status, errorCount, latestAt, latestAt, latestAt, latestAt);
  } finally { db.close(); }
}

function snapshotCounts(dataRoot, semesterId) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    return {
      modules: db.prepare('SELECT COUNT(*) AS count FROM knowledge_modules').get().count,
      weakPoints: db.prepare('SELECT COUNT(*) AS count FROM weak_points').get().count,
      mistakes: db.prepare('SELECT COUNT(*) AS count FROM mistakes').get().count,
      events: db.prepare('SELECT COUNT(*) AS count FROM study_events').get().count,
    };
  } finally { db.close(); }
}

test('T04 cram cards aggregate same-course S2/S4 signals deterministically without leaking source facts or writing', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '数学');
  const exam = await createExam(backend.port, semesterId, course.id);
  const weakOlder = seedModule(backend.dataRoot, semesterId, course.id, { title: '薄弱旧模块', importance: 'low' });
  const weakNewer = seedModule(backend.dataRoot, semesterId, course.id, { title: '薄弱新模块', importance: 'critical' });
  const mistakeModule = seedModule(backend.dataRoot, semesterId, course.id, { title: '错题模块', importance: 'high' });
  const baselineModule = seedModule(backend.dataRoot, semesterId, course.id, { title: '基础模块', importance: 'critical' });
  seedModule(backend.dataRoot, semesterId, course.id, { title: '无摘要模块', contentSummary: ' ', examRelevance: ' ' });
  seedWeakPoint(backend.dataRoot, semesterId, course.id, weakOlder, 3, '2026-07-18T00:00:00.000Z');
  seedWeakPoint(backend.dataRoot, semesterId, course.id, weakNewer, 3, '2026-07-21T00:00:00.000Z');
  seedMistake(backend.dataRoot, semesterId, course.id, mistakeModule, 4, '2026-07-22T00:00:00.000Z');
  seedMistake(backend.dataRoot, semesterId, course.id, mistakeModule, 2, '2026-07-19T00:00:00.000Z', 'pending_review');
  const before = snapshotCounts(backend.dataRoot, semesterId);

  const result = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${exam.id}/cram-cards?semesterId=${semesterId}`);
  assert.equal(result.status, 200, result.text);
  assert.equal(result.json.success, true);
  assert.equal(result.json.data.courseInstanceId, course.id);
  assert.deepEqual(result.json.data.cards.map((card) => card.knowledgeModuleId), [weakNewer, weakOlder, mistakeModule, baselineModule]);
  assert.deepEqual(result.json.data.cards[0].sources, [{ kind: 'weak_point', count: 3 }, { kind: 'knowledge_module', count: 1 }]);
  assert.deepEqual(result.json.data.cards[2].sources, [{ kind: 'knowledge_module', count: 1 }, { kind: 'mistake', count: 2 }]);
  const serialized = JSON.stringify(result.json.data);
  for (const forbidden of ['sourceEvidence', 'source_evidence', 'questionId', 'correctAnswer', 'studentAnswer', 'errorCause', '禁止返回的资料原文']) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.deepEqual(snapshotCounts(backend.dataRoot, semesterId), before);
});

test('T04 cram cards reject unconfirmed and other-semester exams and allow an empty safe-card response', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '英语');
  const pending = await createExam(backend.port, semesterId, course.id, { confirmationStatus: 'pending' });
  const confirmed = await createExam(backend.port, semesterId, course.id);
  const pendingResult = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${pending.id}/cram-cards?semesterId=${semesterId}`);
  assert.equal(pendingResult.status, 409, pendingResult.text);
  assert.equal(pendingResult.json.error.code, 'ASSESSMENT_NOT_CONFIRMED');
  const emptyResult = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${confirmed.id}/cram-cards?semesterId=${semesterId}`);
  assert.equal(emptyResult.status, 200, emptyResult.text);
  assert.deepEqual(emptyResult.json.data.cards, []);

  const otherSemester = await initializeReadySemester(backend.port);
  const otherCourse = await createCourse(backend.port, otherSemester, '英语');
  const otherExam = await createExam(backend.port, otherSemester, otherCourse.id);
  const crossSemester = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${otherExam.id}/cram-cards?semesterId=${semesterId}`);
  assert.equal(crossSemester.status, 404, crossSemester.text);
  assert.equal(crossSemester.json.error.code, 'ASSESSMENT_ATTEMPT_NOT_FOUND');
});
