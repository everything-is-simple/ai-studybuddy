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
let nextBackendPort = 57800;
let nextAiPort = 57900;

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
  const port = nextAiPort++;
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
    response.end(
      JSON.stringify({
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model ?? 'mock-practice-model',
        choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })
    );
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { baseUrl: `http://127.0.0.1:${port}/v1`, calls };
}

async function startBackend(t, aiBaseUrl) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03b-api-'));
  const port = nextBackendPort++;
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      AI_PROVIDERS: JSON.stringify([
        { name: 'mock-practice', baseUrl: aiBaseUrl, apiKey: 'test-key', model: 'mock-practice-model', priority: 1 },
      ]),
      AI_API_KEY: '',
      AI_BASE_URL: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
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
  return { status: response.status, json: text ? JSON.parse(text) : undefined };
}

async function initializeReadySemester(port) {
  const response = await requestJson(port, 'POST', '/api/dev/init-semester', {
    studentName: 'T03B',
    semesterCode: `t03b-${crypto.randomUUID()}`,
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
    const now = '2026-07-16T00:00:00.000Z';
    const id = overrides.id ?? crypto.randomUUID();
    db.prepare(
      `INSERT INTO knowledge_modules (
        id, course_instance_id, material_id, title, importance, difficulty,
        source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?)`
    ).run(
      id,
      courseInstanceId,
      overrides.title ?? '向量空间定义',
      overrides.importance ?? 'high',
      overrides.difficulty ?? 'medium',
      overrides.sourceEvidence ?? '向量空间是满足加法和数乘封闭的集合',
      overrides.contentSummary ?? '理解向量空间的定义、封闭性和线性组合。',
      overrides.examRelevance ?? '常见概念题与选择题',
      now,
      now
    );
    return id;
  } finally {
    db.close();
  }
}

function countPracticeRows(dataRoot, semesterId) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    return {
      sessions: db.prepare('SELECT COUNT(*) AS count FROM practice_sessions').get().count,
      questions: db.prepare('SELECT COUNT(*) AS count FROM questions').get().count,
      answers: db.prepare('SELECT COUNT(*) AS count FROM practice_answers').get().count,
    };
  } finally {
    db.close();
  }
}

function sampleQuestions(moduleId) {
  return {
    questions: [
      {
        type: 'single_choice',
        stem: '向量空间的封闭性指什么？',
        options: ['A. 加法和数乘结果仍在集合内', 'B. 只能做加法', 'C. 只能做数乘', 'D. 没有限制'],
        correct_answer: 'A',
        acceptable_answers: null,
        difficulty: 'medium',
        knowledge_module_id: moduleId,
        explanation: '封闭性要求运算结果仍属于集合。',
      },
      {
        type: 'multiple_choice',
        stem: '以下哪些属于向量空间公理相关内容？',
        options: ['A. 加法封闭', 'B. 数乘封闭', 'C. 必须三维', 'D. 存在零向量'],
        correct_answer: ['A', 'B', 'D'],
        acceptable_answers: null,
        difficulty: 'medium',
        knowledge_module_id: moduleId,
        explanation: '向量空间不要求必须三维。',
      },
      {
        type: 'fill_blank',
        stem: '向量空间中的零元素通常称为____。',
        options: null,
        correct_answer: '零向量',
        acceptable_answers: ['零向量', '0 向量'],
        difficulty: 'easy',
        knowledge_module_id: moduleId,
        explanation: '零元素在向量空间中称为零向量。',
      },
      {
        type: 'single_choice',
        stem: '线性组合的系数来自哪里？',
        options: ['A. 标量域', 'B. 题干任意指定', 'C. 只能是整数', 'D. 只能是正数'],
        correct_answer: 'A',
        acceptable_answers: null,
        difficulty: 'easy',
        knowledge_module_id: moduleId,
        explanation: '线性组合的系数来自对应标量域。',
      },
      {
        type: 'fill_blank',
        stem: '向量空间的元素通常称为____。',
        options: null,
        correct_answer: '向量',
        acceptable_answers: ['向量'],
        difficulty: 'easy',
        knowledge_module_id: moduleId,
        explanation: '向量空间中的元素称为向量。',
      },
    ],
  };
}

function assertStudentQuestionShape(question) {
  assert.ok(question.id);
  assert.ok(question.stem);
  assert.ok(question.knowledgeModuleId);
  assert.equal(typeof question.questionOrder, 'number');
  assert.equal('correctAnswer' in question, false);
  assert.equal('acceptableAnswers' in question, false);
  assert.equal('explanation' in question, false);
  assert.equal('sourceEvidence' in question, false);
  assert.equal('aiModel' in question, false);
}

test('POST creates a practice session with AI questions, and GET returns answer-hidden student DTOs', async (t) => {
  const moduleId = crypto.randomUUID();
  const mockAi = await startMockAi(t, [{ content: JSON.stringify(sampleQuestions(moduleId)) }]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '线性代数');
  const exam = await createExam(backend.port, semesterId, course.id);
  seedKnowledgeModule(backend.dataRoot, semesterId, course.id, { id: moduleId });

  const created = await requestJson(backend.port, 'POST', '/api/practice-sessions', {
    semesterId,
    courseInstanceId: course.id,
    assessmentAttemptId: exam.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
    difficultyPreference: 'mixed',
    timeLimitSeconds: null,
  });

  assert.equal(created.status, 201);
  assert.equal(created.json.success, true);
  assert.equal(created.json.data.status, 'in_progress');
  assert.equal(created.json.data.courseInstanceId, course.id);
  assert.equal(created.json.data.assessmentAttemptId, exam.id);
  assert.equal(created.json.data.questionCount, 5);
  assert.equal(created.json.data.timeLimitSeconds, null);
  assert.deepEqual(
    created.json.data.questions.map((question) => question.questionOrder),
    [1, 2, 3, 4, 5]
  );
  for (const question of created.json.data.questions) assertStudentQuestionShape(question);

  const detail = await requestJson(
    backend.port,
    'GET',
    `/api/practice-sessions/${created.json.data.id}?semesterId=${semesterId}`
  );
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.json.data.questions, created.json.data.questions);
  assert.deepEqual(countPracticeRows(backend.dataRoot, semesterId), { sessions: 1, questions: 5, answers: 0 });

  const aiRequest = mockAi.calls[0].messages.at(-1).content;
  assert.match(aiRequest, /向量空间定义/);
  assert.doesNotMatch(aiRequest, /完整笔记正文|storage_key|APP_DATA_ROOT/);
});

test('AI provider failures return an error and do not create empty practice sessions', async (t) => {
  const mockAi = await startMockAi(t, [{ status: 500, message: 'upstream unavailable' }]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '线性代数');
  const moduleId = seedKnowledgeModule(backend.dataRoot, semesterId, course.id);

  const failed = await requestJson(backend.port, 'POST', '/api/practice-sessions', {
    semesterId,
    courseInstanceId: course.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
  });

  assert.equal(failed.status, 502);
  assert.equal(failed.json.success, false);
  assert.equal(failed.json.error.code, 'AI_ALL_PROVIDERS_FAILED');
  assert.deepEqual(countPracticeRows(backend.dataRoot, semesterId), { sessions: 0, questions: 0, answers: 0 });
});

test('invalid AI question JSON is rejected without partial inserts', async (t) => {
  const moduleId = crypto.randomUUID();
  const mockAi = await startMockAi(t, [
    { content: JSON.stringify({ questions: [{ ...sampleQuestions(moduleId).questions[0] }] }) },
  ]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '线性代数');
  seedKnowledgeModule(backend.dataRoot, semesterId, course.id, { id: moduleId });

  const failed = await requestJson(backend.port, 'POST', '/api/practice-sessions', {
    semesterId,
    courseInstanceId: course.id,
    knowledgeModuleIds: [moduleId],
    questionCount: 5,
  });

  assert.equal(failed.status, 502);
  assert.equal(failed.json.error.code, 'PRACTICE_GENERATION_FAILED');
  assert.deepEqual(countPracticeRows(backend.dataRoot, semesterId), { sessions: 0, questions: 0, answers: 0 });
});

test('cross-course knowledge modules are rejected before calling AI', async (t) => {
  const mockAi = await startMockAi(t, [{ content: JSON.stringify({ questions: [] }) }]);
  const backend = await startBackend(t, mockAi.baseUrl);
  const semesterId = await initializeReadySemester(backend.port);
  const math = await createCourse(backend.port, semesterId, '线性代数');
  const english = await createCourse(backend.port, semesterId, '英语');
  const wrongModuleId = seedKnowledgeModule(backend.dataRoot, semesterId, english.id, { title: '英语阅读' });

  const failed = await requestJson(backend.port, 'POST', '/api/practice-sessions', {
    semesterId,
    courseInstanceId: math.id,
    knowledgeModuleIds: [wrongModuleId],
    questionCount: 5,
  });

  assert.equal(failed.status, 404);
  assert.equal(failed.json.error.code, 'KNOWLEDGE_MODULE_NOT_FOUND');
  assert.equal(mockAi.calls.length, 0);
  assert.deepEqual(countPracticeRows(backend.dataRoot, semesterId), { sessions: 0, questions: 0, answers: 0 });
});

assert.equal(typeof Database, 'function');
