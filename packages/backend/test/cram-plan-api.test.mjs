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
const NOW = '2026-07-21T08:00:00.000Z';

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
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t05-cram-plan-api-'));
  const port = await getFreePort();
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: { ...process.env, APP_DATA_ROOT: dataRoot, BACKEND_HOST: '127.0.0.1', BACKEND_PORT: String(port), CRAM_PLAN_NOW: NOW, AI_PROVIDERS: '', AI_API_KEY: '', AI_BASE_URL: '' },
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
    studentName: 'T05-CramPlan', semesterCode: `t05-cram-plan-${crypto.randomUUID()}`, teachingStartDate: '2026-02-20', teachingEndDate: '2026-06-30',
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
  const result = await requestJson(port, 'POST', '/api/exams', { semesterId, courseInstanceId, name: '冲刺考试', examAt: '2026-07-27T08:00:00.000Z', confirmationStatus: 'confirmed', ...overrides });
  assert.equal(result.status, 201, result.text);
  return result.json.data;
}
function openSemesterDb(dataRoot, semesterId) { return new Database(path.join(dataRoot, 'semesters', semesterId, 'semester.db')); }
function withDb(dataRoot, semesterId, callback) { const db = openSemesterDb(dataRoot, semesterId); try { return callback(db); } finally { db.close(); } }
function seedModule(dataRoot, semesterId, courseId) {
  return withDb(dataRoot, semesterId, (db) => { const id = crypto.randomUUID(); db.prepare(`INSERT INTO knowledge_modules (id, course_instance_id, material_id, title, importance, difficulty, source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at) VALUES (?, ?, NULL, '模块', 'high', 'medium', '禁止返回的资料原文', 'learning', '安全摘要', '安全考点', ?, ?)` ).run(id, courseId, NOW, NOW); return id; });
}
function seedTask(dataRoot, semesterId, courseId, deadlineAt, status = 'todo') {
  return withDb(dataRoot, semesterId, (db) => { const id = crypto.randomUUID(); db.prepare(`INSERT INTO study_tasks (id, course_instance_id, assessment_attempt_id, knowledge_module_id, type, title, status, estimated_minutes, deadline_at, completed_at, created_at, updated_at) VALUES (?, ?, NULL, NULL, 'custom', '不应回传的任务标题', ?, 20, ?, NULL, ?, ?)` ).run(id, courseId, status, deadlineAt, NOW, NOW); return id; });
}
function seedWeakPoint(dataRoot, semesterId, courseId, moduleId) {
  return withDb(dataRoot, semesterId, (db) => { const id = crypto.randomUUID(); db.prepare(`INSERT INTO weak_points (id, course_instance_id, knowledge_module_id, status, evidence_count, first_detected_at, latest_detected_at, created_at, updated_at) VALUES (?, ?, ?, 'active', 4, ?, ?, ?, ?)` ).run(id, courseId, moduleId, NOW, NOW, NOW, NOW); return id; });
}
function seedMistake(dataRoot, semesterId, courseId, moduleId) {
  return withDb(dataRoot, semesterId, (db) => {
    const id = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const questionId = crypto.randomUUID();
    const answerId = crypto.randomUUID();
    db.prepare(`INSERT INTO practice_sessions (id, course_instance_id, assessment_attempt_id, status, question_count, time_limit_seconds, started_at, submitted_at, graded_at, total_score, correct_rate, overtime, total_duration_seconds, difficulty_preference, created_at, updated_at) VALUES (?, ?, NULL, 'graded', 1, NULL, ?, ?, ?, 0, 0, 0, 10, 'mixed', ?, ?)` ).run(sessionId, courseId, NOW, NOW, NOW, NOW, NOW);
    db.prepare(`INSERT INTO questions (id, practice_session_id, course_instance_id, knowledge_module_id, type, stem, options_json, correct_answer, acceptable_answers_json, difficulty, explanation, source_evidence, ai_model, prompt_version, question_order, created_at) VALUES (?, ?, ?, ?, 'fill_blank', '禁止返回的题干', NULL, '禁止返回的正确答案', NULL, 'medium', '禁止返回的解析', '禁止返回的来源原文', 'test-model', 'test-prompt', 1, ?)` ).run(questionId, sessionId, courseId, moduleId, NOW);
    db.prepare(`INSERT INTO practice_answers (id, session_id, question_id, student_answer, is_correct, time_spent_seconds, answer_order, created_at) VALUES (?, ?, ?, '禁止返回的学生作答', 0, 10, 1, ?)` ).run(answerId, sessionId, questionId, NOW);
    db.prepare(`INSERT INTO mistakes (id, course_instance_id, assessment_attempt_id, knowledge_module_id, question_id, first_practice_answer_id, latest_practice_answer_id, status, error_count, first_error_at, latest_error_at, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, 'needs_review', 3, ?, ?, ?, ?)` ).run(id, courseId, moduleId, questionId, answerId, answerId, NOW, NOW, NOW, NOW);
    return { id, sessionId };
  });
}
function seedPractice(dataRoot, semesterId, courseId) {
  return withDb(dataRoot, semesterId, (db) => { const id = crypto.randomUUID(); db.prepare(`INSERT INTO practice_sessions (id, course_instance_id, assessment_attempt_id, status, question_count, time_limit_seconds, started_at, submitted_at, graded_at, total_score, correct_rate, overtime, total_duration_seconds, difficulty_preference, created_at, updated_at) VALUES (?, ?, NULL, 'graded', 5, 600, ?, ?, ?, 2, 0.4, 0, 120, 'mixed', ?, ?)` ).run(id, courseId, NOW, NOW, NOW, NOW, NOW); return id; });
}
function snapshotCounts(dataRoot, semesterId) { return withDb(dataRoot, semesterId, (db) => Object.fromEntries(['study_tasks', 'practice_sessions', 'mistakes', 'weak_points', 'study_events'].map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]))); }
function suggestions(data) { return data.days.flatMap((day) => day.suggestions); }

test('T05 cram plan ranks same-course read-only facts without leaking source content or writing', async (t) => {
  const backend = await startBackend(t); const semesterId = await initializeReadySemester(backend.port); const course = await createCourse(backend.port, semesterId, '数学'); const otherCourse = await createCourse(backend.port, semesterId, '物理'); const exam = await createExam(backend.port, semesterId, course.id);
  const moduleId = seedModule(backend.dataRoot, semesterId, course.id); const taskId = seedTask(backend.dataRoot, semesterId, course.id, '2026-07-22T08:00:00.000Z'); const doneTaskId = seedTask(backend.dataRoot, semesterId, course.id, '2026-07-22T08:00:00.000Z', 'done'); const weakId = seedWeakPoint(backend.dataRoot, semesterId, course.id, moduleId); const mistake = seedMistake(backend.dataRoot, semesterId, course.id, moduleId); const practiceId = seedPractice(backend.dataRoot, semesterId, course.id); const otherTaskId = seedTask(backend.dataRoot, semesterId, otherCourse.id, '2026-07-22T08:00:00.000Z'); const before = snapshotCounts(backend.dataRoot, semesterId);
  const result = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${exam.id}/cram-plan?semesterId=${semesterId}`);
  assert.equal(result.status, 200, result.text); assert.equal(result.json.success, true); assert.equal(result.json.data.availability, 'available'); assert.equal(result.json.data.daysUntilExam, 6); assert.equal(result.json.data.days.length, 7);
  const items = suggestions(result.json.data); assert.deepEqual(items.slice(0, 6).map((item) => item.id), [`task:${taskId}`, `weak:${weakId}`, `mistake:${mistake.id}`, `practice:${mistake.sessionId}`, 'cram-cards', `practice:${practiceId}`]); assert.equal(items.some((item) => item.sourceId === doneTaskId || item.sourceId === otherTaskId), false);
  const serialized = JSON.stringify(result.json.data); for (const forbidden of ['不应回传的任务标题', '禁止返回的资料原文', 'questionId', 'correctAnswer', 'studentAnswer', 'errorCause', 'provider']) assert.equal(serialized.includes(forbidden), false, forbidden); assert.deepEqual(snapshotCounts(backend.dataRoot, semesterId), before);
});

test('T05 cram plan enforces confirmed/semester boundaries and explicit window/empty states', async (t) => {
  const backend = await startBackend(t); const semesterId = await initializeReadySemester(backend.port); const course = await createCourse(backend.port, semesterId, '英语'); const pending = await createExam(backend.port, semesterId, course.id, { confirmationStatus: 'pending' }); const future = await createExam(backend.port, semesterId, course.id, { examAt: '2026-08-01T08:00:00.000Z' }); const ended = await createExam(backend.port, semesterId, course.id, { examAt: '2026-07-20T08:00:00.000Z' }); const empty = await createExam(backend.port, semesterId, course.id, { examAt: '2026-07-25T08:00:00.000Z' });
  const pendingResult = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${pending.id}/cram-plan?semesterId=${semesterId}`); assert.equal(pendingResult.status, 409, pendingResult.text); assert.equal(pendingResult.json.error.code, 'ASSESSMENT_NOT_CONFIRMED');
  for (const [exam, expected] of [[future, 'not_started'], [ended, 'ended']]) { const response = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${exam.id}/cram-plan?semesterId=${semesterId}`); assert.equal(response.status, 200, response.text); assert.equal(response.json.data.availability, expected); assert.deepEqual(response.json.data.days, []); }
  const emptyResult = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${empty.id}/cram-plan?semesterId=${semesterId}`); assert.equal(emptyResult.status, 200, emptyResult.text); assert.equal(emptyResult.json.data.availability, 'available'); assert.equal(suggestions(emptyResult.json.data).length, 0);
  const otherSemester = await initializeReadySemester(backend.port); const otherCourse = await createCourse(backend.port, otherSemester, '英语'); const otherExam = await createExam(backend.port, otherSemester, otherCourse.id); const crossSemester = await requestJson(backend.port, 'GET', `/api/assessment-attempts/${otherExam.id}/cram-plan?semesterId=${semesterId}`); assert.equal(crossSemester.status, 404, crossSemester.text); assert.equal(crossSemester.json.error.code, 'ASSESSMENT_ATTEMPT_NOT_FOUND');
});