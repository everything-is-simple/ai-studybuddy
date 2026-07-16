import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const backendDir = path.resolve(import.meta.dirname, '..');
let nextBackendPort = 55000;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t04a-api-'));
  const port = nextBackendPort++;
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      AI_PROVIDERS: '[]',
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
    studentName: 'T04A',
    semesterCode: `t04a-${crypto.randomUUID()}`,
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

async function createExam(port, semesterId, courseInstanceId) {
  const response = await requestJson(port, 'POST', '/api/exams', {
    semesterId,
    courseInstanceId,
    name: '期末考试',
    examAt: '2026-08-01T00:00:00.000Z',
    confirmationStatus: 'confirmed',
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
      ) VALUES (?, ?, NULL, ?, 'high', 'medium', ?, 'not_started', ?, ?, ?, ?)`
    ).run(
      id,
      courseInstanceId,
      overrides.title ?? '向量空间定义',
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

function seedPracticeSession(dataRoot, semesterId, courseInstanceId, assessmentAttemptId, questions, overrides = {}) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    const now = overrides.now ?? '2026-07-16T00:00:00.000Z';
    const sessionId = overrides.sessionId ?? crypto.randomUUID();
    db.prepare(
      `INSERT INTO practice_sessions (
        id, course_instance_id, assessment_attempt_id, status, question_count,
        time_limit_seconds, started_at, submitted_at, graded_at, total_score,
        correct_rate, overtime, total_duration_seconds, difficulty_preference,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'in_progress', ?, 600, ?, NULL, NULL, NULL, NULL, 0, NULL, 'mixed', ?, ?)`
    ).run(sessionId, courseInstanceId, assessmentAttemptId ?? null, questions.length, now, now, now);

    for (const [index, question] of questions.entries()) {
      db.prepare(
        `INSERT INTO questions (
          id, practice_session_id, course_instance_id, knowledge_module_id, type,
          stem, options_json, correct_answer, acceptable_answers_json, difficulty,
          explanation, source_evidence, ai_model, prompt_version, question_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'medium', ?, ?, 'test-model', 's3-practice-v1.0', ?, ?)`
      ).run(
        question.id,
        sessionId,
        courseInstanceId,
        question.knowledgeModuleId,
        question.type,
        question.stem,
        question.options ? JSON.stringify(question.options) : null,
        question.correctAnswer,
        question.acceptableAnswers ? JSON.stringify(question.acceptableAnswers) : null,
        question.explanation ?? null,
        question.sourceEvidence ?? '测试证据',
        index + 1,
        now
      );
    }
    return sessionId;
  } finally {
    db.close();
  }
}

function questionSet(moduleId) {
  return [
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '向量空间封闭性指什么？',
      options: ['A. 加法和数乘结果仍在集合内', 'B. 只能做加法', 'C. 只能做数乘', 'D. 没有限制'],
      correctAnswer: 'A',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '线性组合的系数来自哪里？',
      options: ['A. 任意集合', 'B. 标量域', 'C. 只能是整数', 'D. 只能是正数'],
      correctAnswer: 'B',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'fill_blank',
      stem: '向量空间中的零元素称为____。',
      correctAnswer: '零向量',
      acceptableAnswers: ['零向量', '0 向量'],
    },
  ];
}

async function setupPractice(t) {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '线性代数');
  const exam = await createExam(backend.port, semesterId, course.id);
  const moduleId = seedKnowledgeModule(backend.dataRoot, semesterId, course.id);
  const questions = questionSet(moduleId);
  const sessionId = seedPracticeSession(backend.dataRoot, semesterId, course.id, exam.id, questions);
  return { backend, semesterId, course, exam, moduleId, questions, sessionId };
}

function readS4State(dataRoot, semesterId) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    return {
      answers: db.prepare('SELECT * FROM practice_answers ORDER BY answer_order ASC').all(),
      mistakes: db.prepare('SELECT * FROM mistakes ORDER BY created_at ASC, id ASC').all(),
      evidence: db.prepare('SELECT * FROM mistake_evidence ORDER BY occurred_at ASC, id ASC').all(),
      weakPoints: db.prepare('SELECT * FROM weak_points ORDER BY created_at ASC, id ASC').all(),
    };
  } finally {
    db.close();
  }
}

test('submit archives incorrect and unanswered practice answers and creates weak point after two evidences', async (t) => {
  const { backend, semesterId, course, moduleId, questions, sessionId } = await setupPractice(t);

  const submitted = await requestJson(backend.port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId,
    answers: [
      { questionId: questions[0].id, answer: 'A', timeSpentSeconds: 10 },
      { questionId: questions[1].id, answer: 'A', timeSpentSeconds: 11 },
    ],
    totalDurationSeconds: 60,
  });

  assert.equal(submitted.status, 200);
  assert.deepEqual(
    submitted.json.data.answers.map((answer) => answer.isCorrect),
    [true, false, false]
  );

  const state = readS4State(backend.dataRoot, semesterId);
  assert.equal(state.answers.length, 3);
  assert.equal(state.mistakes.length, 2);
  assert.equal(state.evidence.length, 2);
  assert.equal(state.weakPoints.length, 1);
  assert.equal(state.weakPoints[0].course_instance_id, course.id);
  assert.equal(state.weakPoints[0].knowledge_module_id, moduleId);
  assert.equal(state.weakPoints[0].evidence_count, 2);
  assert.deepEqual(
    state.evidence.map((row) => row.source_practice_answer_id).sort(),
    state.answers.filter((answer) => answer.is_correct === 0).map((answer) => answer.id).sort()
  );
});

test('one wrong evidence creates a mistake but not a weak point', async (t) => {
  const { backend, semesterId, questions, sessionId } = await setupPractice(t);

  const submitted = await requestJson(backend.port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId,
    answers: [
      { questionId: questions[0].id, answer: 'A', timeSpentSeconds: 10 },
      { questionId: questions[1].id, answer: 'B', timeSpentSeconds: 11 },
      { questionId: questions[2].id, answer: '错答案', timeSpentSeconds: 12 },
    ],
    totalDurationSeconds: 60,
  });

  assert.equal(submitted.status, 200);
  const state = readS4State(backend.dataRoot, semesterId);
  assert.equal(state.mistakes.length, 1);
  assert.equal(state.evidence.length, 1);
  assert.equal(state.weakPoints.length, 0);
});

test('archiving the same PracticeAnswer again is idempotent', async (t) => {
  const { backend, semesterId, questions, sessionId } = await setupPractice(t);
  const submitted = await requestJson(backend.port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId,
    answers: [{ questionId: questions[0].id, answer: 'B', timeSpentSeconds: 10 }],
    totalDurationSeconds: 60,
  });
  assert.equal(submitted.status, 200);

  const before = readS4State(backend.dataRoot, semesterId);
  const db = openSemesterDb(backend.dataRoot, semesterId);
  try {
    const { ErrorFixerService } = await import('../dist/services/error-fixer-service.js');
    const service = new ErrorFixerService();
    service.archiveIncorrectPracticeAnswers(db, sessionId, '2026-07-16T00:30:00.000Z');
  } finally {
    db.close();
  }
  const after = readS4State(backend.dataRoot, semesterId);

  assert.equal(after.mistakes.length, before.mistakes.length);
  assert.equal(after.evidence.length, before.evidence.length);
  assert.equal(after.weakPoints.length, before.weakPoints.length);
  assert.deepEqual(
    after.mistakes.map((row) => row.error_count),
    before.mistakes.map((row) => row.error_count)
  );
});

test('invalid submit rolls back without S4 rows', async (t) => {
  const { backend, semesterId, questions, sessionId } = await setupPractice(t);

  const failed = await requestJson(backend.port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId,
    answers: [{ questionId: questions[0].id, answer: 'Z' }],
    totalDurationSeconds: 60,
  });

  assert.equal(failed.status, 400);
  const state = readS4State(backend.dataRoot, semesterId);
  assert.equal(state.answers.length, 0);
  assert.equal(state.mistakes.length, 0);
  assert.equal(state.evidence.length, 0);
  assert.equal(state.weakPoints.length, 0);
});

assert.equal(typeof Database, 'function');
