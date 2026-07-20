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
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) throw new Error('failed to allocate a free port');
  return port;
}

function jsonBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw ? JSON.parse(raw) : {});
    });
  });
}

async function startMockAi(t, handlers) {
  const calls = [];
  let index = 0;
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }
    const body = await jsonBody(request);
    calls.push(body);
    const handler = handlers[Math.min(index, handlers.length - 1)];
    index += 1;
    const result = typeof handler === 'function' ? handler(body) : handler;
    if (result.status && result.status >= 400) {
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: result.message ?? 'mock ai failed' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: result.model ?? 'mock-s5-model',
      choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  if (!port) throw new Error('failed to allocate a free mock AI port');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { baseUrl: `http://127.0.0.1:${port}/v1`, calls };
}

async function startBackend(t, aiBaseUrl) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-s5-api-'));
  const port = await getFreePort();
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      AI_PROVIDERS: JSON.stringify([
        { name: 'mock-s5', baseUrl: aiBaseUrl, apiKey: 'test-key', model: 'mock-s5-model', priority: 1 },
      ]),
      AI_API_KEY: '',
      AI_BASE_URL: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  t.after(async () => {
    child.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return { dataRoot, port };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend did not become healthy: ${stderr}`);
}

async function requestJson(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : undefined, text };
}

async function initializeReadySemester(port) {
  const response = await requestJson(port, 'POST', '/api/dev/init-semester', {
    studentName: 'T02-S5',
    semesterCode: `t02-s5-${crypto.randomUUID()}`,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
  });
  assert.equal(response.status, 200);
  return response.json.data.semesterId;
}

async function createCourse(port, semesterId, name) {
  const response = await requestJson(port, 'POST', '/api/courses', { semesterId, name });
  assert.equal(response.status, 201);
  return response.json.data;
}

async function createExam(port, semesterId, courseInstanceId, overrides = {}) {
  const response = await requestJson(port, 'POST', '/api/exams', {
    semesterId,
    courseInstanceId,
    name: '期末考试',
    examAt: '2026-08-01T00:00:00.000Z',
    confirmationStatus: 'confirmed',
    ...overrides,
  });
  assert.equal(response.status, 201);
  return response.json.data;
}

function openSemesterDb(dataRoot, semesterId) {
  return new Database(path.join(dataRoot, 'semesters', semesterId, 'semester.db'));
}

function seedKnowledgeModule(dataRoot, semesterId, courseInstanceId, overrides = {}) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    const now = '2026-07-20T00:00:00.000Z';
    const id = overrides.id ?? crypto.randomUUID();
    db.prepare(`INSERT INTO knowledge_modules (
      id, course_instance_id, material_id, title, importance, difficulty,
      source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?)`).run(
      id,
      courseInstanceId,
      overrides.title ?? '函数定义',
      overrides.importance ?? 'high',
      overrides.difficulty ?? 'medium',
      overrides.sourceEvidence ?? '函数是输入与输出之间的对应关系',
      overrides.contentSummary ?? '理解函数定义、定义域和值域。',
      overrides.examRelevance ?? '期末常见概念选择题',
      now,
      now
    );
    return id;
  } finally {
    db.close();
  }
}

function seedS4WeakPoint(dataRoot, semesterId, courseInstanceId, moduleId) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    const now = '2026-07-20T00:00:00.000Z';
    const weakPointId = crypto.randomUUID();
    db.prepare(`INSERT INTO weak_points (
      id, course_instance_id, knowledge_module_id, status, evidence_count,
      first_detected_at, latest_detected_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', 2, ?, ?, ?, ?)`).run(weakPointId, courseInstanceId, moduleId, now, now, now, now);
    return { weakPointId };
  } finally {
    db.close();
  }
}

function countMockExamRows(dataRoot, semesterId) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    return {
      papers: db.prepare('SELECT COUNT(*) AS count FROM mock_exam_papers').get().count,
      questions: db.prepare('SELECT COUNT(*) AS count FROM mock_exam_questions').get().count,
      attempts: db.prepare('SELECT COUNT(*) AS count FROM mock_exam_attempts').get().count,
      answers: db.prepare('SELECT COUNT(*) AS count FROM mock_exam_answers').get().count,
      analyses: db.prepare('SELECT COUNT(*) AS count FROM mock_exam_module_analyses').get().count,
      mistakes: db.prepare('SELECT COUNT(*) AS count FROM mistakes').get().count,
      weakPoints: db.prepare('SELECT COUNT(*) AS count FROM weak_points').get().count,
      s5Events: db.prepare("SELECT COUNT(*) AS count FROM study_events WHERE source_system = 'S5' AND event_type = 'mock_exam_completed'").get().count,
    };
  } finally {
    db.close();
  }
}

function sampleMockExamQuestions(moduleId) {
  return {
    questions: [
      {
        type: 'single_choice',
        stem: '函数定义最准确的描述是？',
        options: ['A. 每个输入对应唯一输出', 'B. 任意两个集合', 'C. 只能是数字公式', 'D. 没有限制'],
        correct_answer: 'A',
        acceptable_answers: null,
        difficulty: 'easy',
        knowledge_module_id: moduleId,
        explanation: '函数要求定义域中每个输入有唯一输出。',
        point_value: 1,
      },
      {
        type: 'multiple_choice',
        stem: '研究函数时常见要素包括哪些？',
        options: ['A. 定义域', 'B. 值域', 'C. 对应关系', 'D. 试卷页码'],
        correct_answer: ['A', 'B', 'C'],
        acceptable_answers: null,
        difficulty: 'medium',
        knowledge_module_id: moduleId,
        explanation: '定义域、值域和对应关系是核心要素。',
        point_value: 1,
      },
      {
        type: 'fill_blank',
        stem: '函数中输入取值的集合称为____。',
        options: null,
        correct_answer: '定义域',
        acceptable_answers: ['定义域'],
        difficulty: 'easy',
        knowledge_module_id: moduleId,
        explanation: '输入取值集合称为定义域。',
        point_value: 1,
      },
      {
        type: 'single_choice',
        stem: '若一个输入对应两个输出，通常是否满足函数定义？',
        options: ['A. 不满足', 'B. 一定满足', 'C. 与定义域无关', 'D. 只在整数中满足'],
        correct_answer: 'A',
        acceptable_answers: null,
        difficulty: 'medium',
        knowledge_module_id: moduleId,
        explanation: '同一输入不能对应多个输出。',
        point_value: 1,
      },
      {
        type: 'fill_blank',
        stem: '函数输出值组成的集合常称为____。',
        options: null,
        correct_answer: '值域',
        acceptable_answers: ['值域'],
        difficulty: 'easy',
        knowledge_module_id: moduleId,
        explanation: '输出值组成的集合称为值域。',
        point_value: 1,
      },
    ],
  };
}

function assertStudentQuestionShape(question) {
  assert.ok(question.id);
  assert.ok(question.stem);
  assert.ok(question.knowledgeModuleId);
  assert.equal(typeof question.questionOrder, 'number');
  assert.equal(typeof question.pointValue, 'number');
  assert.equal('correctAnswer' in question, false);
  assert.equal('acceptableAnswers' in question, false);
  assert.equal('explanation' in question, false);
  assert.equal('sourceEvidence' in question, false);
  assert.equal('correct_answer' in question, false);
}

test('POST creates a mock exam paper from confirmed exam and returns answer-hidden DTOs', async (t) => {
  const moduleId = crypto.randomUUID();
  const mockAi = await startMockAi(t, [{ content: JSON.stringify(sampleMockExamQuestions(moduleId)) }]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '数学');
  const exam = await createExam(backend.port, semesterId, course.id);
  seedKnowledgeModule(backend.dataRoot, semesterId, course.id, { id: moduleId });
  seedS4WeakPoint(backend.dataRoot, semesterId, course.id, moduleId);

  const created = await requestJson(backend.port, 'POST', '/api/mock-exam-papers', {
    semesterId,
    courseInstanceId: course.id,
    assessmentAttemptId: exam.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
    difficultyPreference: 'mixed',
    timeLimitSeconds: 600,
  });

  assert.equal(created.status, 201, created.text);
  assert.equal(created.json.success, true);
  assert.equal(created.json.data.courseInstanceId, course.id);
  assert.equal(created.json.data.assessmentAttemptId, exam.id);
  assert.equal(created.json.data.questionCount, 5);
  assert.equal(created.json.data.totalPoints, 5);
  assert.equal(created.json.data.timeLimitSeconds, 600);
  assert.equal(created.json.data.sourceSummary.weakPointCount, 1);
  assert.equal(created.json.data.sourceSummary.activeMistakeCount, 0);
  assert.deepEqual(created.json.data.questions.map((question) => question.questionOrder), [1, 2, 3, 4, 5]);
  for (const question of created.json.data.questions) assertStudentQuestionShape(question);

  const detail = await requestJson(backend.port, 'GET', `/api/mock-exam-papers/${created.json.data.id}?semesterId=${semesterId}`);
  assert.equal(detail.status, 200, detail.text);
  assert.deepEqual(detail.json.data.questions, created.json.data.questions);
  assert.deepEqual(countMockExamRows(backend.dataRoot, semesterId), {
    papers: 1,
    questions: 5,
    attempts: 0,
    answers: 0,
    analyses: 0,
    mistakes: 0,
    weakPoints: 1,
    s5Events: 0,
  });

  const aiRequest = mockAi.calls[0].messages.at(-1).content;
  assert.match(aiRequest, /函数定义/);
  assert.match(aiRequest, /weakPointCount/);
  assert.doesNotMatch(aiRequest, /完整笔记正文|storage_key|APP_DATA_ROOT/);
});

test('mock exam generation rejects pending exam, AI failure, and cross-course modules without partial inserts', async (t) => {
  const moduleId = crypto.randomUUID();
  const mockAi = await startMockAi(t, [{ status: 500, message: 'upstream unavailable' }]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const math = await createCourse(backend.port, semesterId, '数学');
  const english = await createCourse(backend.port, semesterId, '英语');
  const confirmed = await createExam(backend.port, semesterId, math.id);
  const pending = await createExam(backend.port, semesterId, math.id, { confirmationStatus: 'pending', name: '待确认期末' });
  seedKnowledgeModule(backend.dataRoot, semesterId, math.id, { id: moduleId });
  const wrongModuleId = seedKnowledgeModule(backend.dataRoot, semesterId, english.id, { title: '英语阅读' });

  const pendingResult = await requestJson(backend.port, 'POST', '/api/mock-exam-papers', {
    semesterId,
    courseInstanceId: math.id,
    assessmentAttemptId: pending.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
  });
  assert.equal(pendingResult.status, 409, pendingResult.text);
  assert.equal(pendingResult.json.error.code, 'ASSESSMENT_NOT_CONFIRMED');

  const crossModule = await requestJson(backend.port, 'POST', '/api/mock-exam-papers', {
    semesterId,
    courseInstanceId: math.id,
    assessmentAttemptId: confirmed.id,
    knowledgeModuleIds: [wrongModuleId],
    questionCount: 5,
  });
  assert.equal(crossModule.status, 404, crossModule.text);
  assert.equal(crossModule.json.error.code, 'KNOWLEDGE_MODULE_NOT_FOUND');

  const failed = await requestJson(backend.port, 'POST', '/api/mock-exam-papers', {
    semesterId,
    courseInstanceId: math.id,
    assessmentAttemptId: confirmed.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
  });
  assert.equal(failed.status, 502, failed.text);
  assert.equal(failed.json.success, false);
  assert.equal(failed.json.error.code, 'AI_ALL_PROVIDERS_FAILED');
  assert.equal(mockAi.calls.length, 2);
  assert.deepEqual(countMockExamRows(backend.dataRoot, semesterId), {
    papers: 0,
    questions: 0,
    attempts: 0,
    answers: 0,
    analyses: 0,
    mistakes: 0,
    weakPoints: 0,
    s5Events: 0,
  });
});

test('mock exam attempt submit grades answers, writes S5 analysis event, and does not create S4 facts', async (t) => {
  const moduleId = crypto.randomUUID();
  const mockAi = await startMockAi(t, [{ content: JSON.stringify(sampleMockExamQuestions(moduleId)) }]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '数学');
  const exam = await createExam(backend.port, semesterId, course.id);
  seedKnowledgeModule(backend.dataRoot, semesterId, course.id, { id: moduleId });

  const paper = await requestJson(backend.port, 'POST', '/api/mock-exam-papers', {
    semesterId,
    courseInstanceId: course.id,
    assessmentAttemptId: exam.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
    timeLimitSeconds: 120,
  });
  assert.equal(paper.status, 201, paper.text);

  const started = await requestJson(backend.port, 'POST', `/api/mock-exam-papers/${paper.json.data.id}/attempts`, { semesterId });
  assert.equal(started.status, 201, started.text);
  assert.equal(started.json.data.status, 'in_progress');
  for (const question of started.json.data.questions) assertStudentQuestionShape(question);

  const byOrder = new Map(started.json.data.questions.map((question) => [question.questionOrder, question]));
  const submitted = await requestJson(backend.port, 'POST', `/api/mock-exam-attempts/${started.json.data.id}/submit`, {
    semesterId,
    totalDurationSeconds: 130,
    answers: [
      { questionId: byOrder.get(1).id, answer: 'A', timeSpentSeconds: 10 },
      { questionId: byOrder.get(2).id, answer: 'A,C', timeSpentSeconds: 20 },
      { questionId: byOrder.get(3).id, answer: '定义域', timeSpentSeconds: 15 },
      { questionId: byOrder.get(4).id, answer: 'B', timeSpentSeconds: 25 },
    ],
  });

  assert.equal(submitted.status, 200, submitted.text);
  assert.equal(submitted.json.success, true);
  assert.equal(submitted.json.data.status, 'graded');
  assert.equal(submitted.json.data.totalScore, 2);
  assert.equal(submitted.json.data.totalPoints, 5);
  assert.equal(submitted.json.data.correctRate, 0.4);
  assert.equal(submitted.json.data.overtime, true);
  assert.equal(submitted.json.data.answers.length, 5);
  assert.equal(submitted.json.data.answers.filter((answer) => answer.isCorrect).length, 2);
  assert.equal(submitted.json.data.moduleAnalyses.length, 1);
  assert.equal(submitted.json.data.moduleAnalyses[0].weakSignal, true);
  assert.ok(submitted.json.data.answers[0].correctAnswer);
  assert.ok(submitted.json.data.answers[0].explanation);

  const detail = await requestJson(backend.port, 'GET', `/api/mock-exam-attempts/${started.json.data.id}?semesterId=${semesterId}`);
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json.data.status, 'graded');
  for (const question of detail.json.data.questions) assertStudentQuestionShape(question);

  assert.deepEqual(countMockExamRows(backend.dataRoot, semesterId), {
    papers: 1,
    questions: 5,
    attempts: 1,
    answers: 5,
    analyses: 1,
    mistakes: 0,
    weakPoints: 0,
    s5Events: 1,
  });
});

assert.equal(typeof Database, 'function');
