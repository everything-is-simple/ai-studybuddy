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
let nextBackendPort = 54000;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03c-api-'));
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
    studentName: 'T03C',
    semesterCode: `t03c-${crypto.randomUUID()}`,
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
    const timeLimitSeconds = Object.hasOwn(overrides, 'timeLimitSeconds') ? overrides.timeLimitSeconds : 600;
    db.prepare(
      `INSERT INTO practice_sessions (
        id, course_instance_id, assessment_attempt_id, status, question_count,
        time_limit_seconds, started_at, submitted_at, graded_at, total_score,
        correct_rate, overtime, total_duration_seconds, difficulty_preference,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, 'mixed', ?, ?)`
    ).run(
      sessionId,
      courseInstanceId,
      assessmentAttemptId ?? null,
      overrides.status ?? 'in_progress',
      questions.length,
      timeLimitSeconds,
      now,
      now,
      now
    );

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
      explanation: '封闭性要求运算结果仍属于集合。',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '线性组合的系数来自哪里？',
      options: ['A. 任意集合', 'B. 标量域', 'C. 只能是整数', 'D. 只能是正数'],
      correctAnswer: 'B',
      explanation: '线性组合的系数来自标量域。',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'multiple_choice',
      stem: '哪些是向量空间公理相关内容？',
      options: ['A. 加法封闭', 'B. 必须三维', 'C. 数乘封闭', 'D. 存在零向量'],
      correctAnswer: 'A,C,D',
      explanation: '向量空间不要求必须三维。',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'multiple_choice',
      stem: '哪些说法正确？',
      options: ['A. 有零向量', 'B. 必须有限维', 'C. 有加法', 'D. 无需数乘'],
      correctAnswer: 'A,C',
      explanation: '向量空间有加法和零向量。',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'fill_blank',
      stem: '向量空间中的零元素称为____。',
      correctAnswer: '零向量',
      acceptableAnswers: ['零向量', '0 向量'],
      explanation: '零元素通常称为零向量。',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'fill_blank',
      stem: '满足线性结构的空间可称为____。',
      correctAnswer: '线性空间',
      acceptableAnswers: ['向量空间', 'vector space'],
      explanation: '向量空间也称线性空间。',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'fill_blank',
      stem: '向量空间的元素称为____。',
      correctAnswer: '向量',
      acceptableAnswers: ['向量'],
      explanation: '向量空间的元素称为向量。',
    },
  ];
}

async function setupPractice(t, options = {}) {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, options.courseName ?? '线性代数');
  const exam = await createExam(backend.port, semesterId, course.id);
  const moduleId = seedKnowledgeModule(backend.dataRoot, semesterId, course.id);
  const questions = options.questions ?? questionSet(moduleId);
  const sessionId = seedPracticeSession(backend.dataRoot, semesterId, course.id, exam.id, questions, options.session ?? {});
  return { backend, semesterId, course, exam, moduleId, questions, sessionId };
}

function readPracticeState(dataRoot, semesterId, sessionId) {
  const db = openSemesterDb(dataRoot, semesterId);
  try {
    return {
      session: db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(sessionId),
      answers: db
        .prepare('SELECT * FROM practice_answers WHERE session_id = ? ORDER BY answer_order ASC')
        .all(sessionId),
      events: db
        .prepare("SELECT * FROM study_events WHERE event_type = 'practice_completed' ORDER BY created_at ASC")
        .all(),
      futureTables: db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('mistakes', 'weak_points')")
        .all(),
    };
  } finally {
    db.close();
  }
}

test('submit grades objective answers, records missing answers, updates session, and writes practice_completed event', async (t) => {
  const { backend, semesterId, course, questions, sessionId } = await setupPractice(t);

  const submitted = await requestJson(backend.port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId,
    answers: [
      { questionId: questions[0].id, answer: ' a ', timeSpentSeconds: 10 },
      { questionId: questions[1].id, answer: 'A', timeSpentSeconds: 11 },
      { questionId: questions[2].id, answer: 'D,A,C', timeSpentSeconds: 12 },
      { questionId: questions[3].id, answer: 'A', timeSpentSeconds: 13 },
      { questionId: questions[4].id, answer: '  零　向量  ', timeSpentSeconds: 14 },
      { questionId: questions[5].id, answer: 'VECTOR   SPACE', timeSpentSeconds: 15 },
    ],
    totalDurationSeconds: 601,
  });

  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.success, true);
  assert.equal(submitted.json.data.sessionId, sessionId);
  assert.equal(submitted.json.data.status, 'graded');
  assert.equal(submitted.json.data.totalScore, 4);
  assert.equal(submitted.json.data.questionCount, 7);
  assert.equal(submitted.json.data.correctRate, 4 / 7);
  assert.equal(submitted.json.data.overtime, true);
  assert.equal(submitted.json.data.totalDurationSeconds, 601);
  assert.deepEqual(
    submitted.json.data.answers.map((answer) => answer.isCorrect),
    [true, false, true, false, true, true, false]
  );
  assert.equal(submitted.json.data.answers[6].studentAnswer, null);
  assert.equal(submitted.json.data.answers[0].correctAnswer, 'A');
  assert.equal(submitted.json.data.answers[4].correctAnswer, '零向量');

  const state = readPracticeState(backend.dataRoot, semesterId, sessionId);
  assert.equal(state.session.status, 'graded');
  assert.equal(state.session.total_score, 4);
  assert.equal(state.session.correct_rate, 4 / 7);
  assert.equal(state.session.overtime, 1);
  assert.equal(state.session.total_duration_seconds, 601);
  assert.equal(state.session.submitted_at, state.session.graded_at);
  assert.equal(state.answers.length, 7);
  assert.deepEqual(
    state.answers.map((answer) => answer.is_correct),
    [1, 0, 1, 0, 1, 1, 0]
  );
  assert.equal(state.answers[6].student_answer, null);
  assert.equal(state.answers[6].time_spent_seconds, null);

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].source_system, 'S3');
  assert.equal(state.events[0].event_type, 'practice_completed');
  assert.equal(state.events[0].course_instance_id, course.id);
  assert.equal(state.events[0].evidence_ref, `practice_session:${sessionId}`);
  assert.equal(state.events[0].workload_minutes, 11);
  assert.equal(state.events[0].parent_visible, 1);
  assert.equal(state.events[0].occurred_at, state.session.submitted_at);
  assert.doesNotMatch(state.events[0].title, /零向量|VECTOR|A,C/);
  assert.deepEqual(state.futureTables, []);
});

test('submit treats equal time limit and unlimited sessions as not overtime', async (t) => {
  const { backend, semesterId, course, exam, moduleId } = await setupPractice(t);
  const oneQuestion = [
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '封闭性是否重要？',
      options: ['A. 是', 'B. 否', 'C. 不一定', 'D. 无关'],
      correctAnswer: 'A',
    },
  ];
  const equalLimitSession = seedPracticeSession(backend.dataRoot, semesterId, course.id, exam.id, oneQuestion, {
    timeLimitSeconds: 320,
  });
  const unlimitedSession = seedPracticeSession(
    backend.dataRoot,
    semesterId,
    course.id,
    exam.id,
    [{ ...oneQuestion[0], id: crypto.randomUUID() }],
    { timeLimitSeconds: null }
  );

  const equalLimit = await requestJson(backend.port, 'POST', `/api/practice-sessions/${equalLimitSession}/submit`, {
    semesterId,
    answers: [{ questionId: oneQuestion[0].id, answer: 'A' }],
    totalDurationSeconds: 320,
  });
  assert.equal(equalLimit.status, 200);
  assert.equal(equalLimit.json.data.overtime, false);

  const unlimitedQuestionId = readPracticeState(backend.dataRoot, semesterId, unlimitedSession).answers[0]?.question_id;
  assert.equal(unlimitedQuestionId, undefined);
  const db = openSemesterDb(backend.dataRoot, semesterId);
  const unlimitedQuestion = db.prepare('SELECT id FROM questions WHERE practice_session_id = ?').get(unlimitedSession);
  db.close();
  const unlimited = await requestJson(backend.port, 'POST', `/api/practice-sessions/${unlimitedSession}/submit`, {
    semesterId,
    answers: [{ questionId: unlimitedQuestion.id, answer: 'A' }],
    totalDurationSeconds: 9999,
  });
  assert.equal(unlimited.status, 200);
  assert.equal(unlimited.json.data.overtime, false);
});

test('submit rejects repeat, mismatched questions, invalid answers, and invalid durations without partial writes', async (t) => {
  const { backend, semesterId, course, exam, moduleId, sessionId } = await setupPractice(t);
  const validQuestions = [
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '封闭性是否重要？',
      options: ['A. 是', 'B. 否', 'C. 不一定', 'D. 无关'],
      correctAnswer: 'A',
    },
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'multiple_choice',
      stem: '哪些正确？',
      options: ['A. 有加法', 'B. 有数乘', 'C. 无零元', 'D. 无封闭性'],
      correctAnswer: 'A,B',
    },
  ];
  const repeatSession = seedPracticeSession(backend.dataRoot, semesterId, course.id, exam.id, validQuestions);
  const firstSubmit = await requestJson(backend.port, 'POST', `/api/practice-sessions/${repeatSession}/submit`, {
    semesterId,
    answers: [{ questionId: validQuestions[0].id, answer: 'A' }],
    totalDurationSeconds: 1,
  });
  assert.equal(firstSubmit.status, 200);
  const repeated = await requestJson(backend.port, 'POST', `/api/practice-sessions/${repeatSession}/submit`, {
    semesterId,
    answers: [{ questionId: validQuestions[0].id, answer: 'B' }],
    totalDurationSeconds: 2,
  });
  assert.equal(repeated.status, 409);
  assert.equal(repeated.json.error.code, 'PRACTICE_SESSION_STATE_INVALID');
  assert.equal(readPracticeState(backend.dataRoot, semesterId, repeatSession).session.total_duration_seconds, 1);

  const otherQuestion = [
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '其他 session 题目',
      options: ['A. 是', 'B. 否', 'C. 不一定', 'D. 无关'],
      correctAnswer: 'A',
    },
  ];
  const otherSession = seedPracticeSession(backend.dataRoot, semesterId, course.id, exam.id, otherQuestion);

  const cases = [
    {
      name: 'duplicate question',
      body: {
        semesterId,
        answers: [
          { questionId: validQuestions[0].id, answer: 'A' },
          { questionId: validQuestions[0].id, answer: 'B' },
        ],
        totalDurationSeconds: 5,
      },
      code: 'PRACTICE_SUBMIT_INPUT_INVALID',
    },
    {
      name: 'unknown question',
      body: { semesterId, answers: [{ questionId: crypto.randomUUID(), answer: 'A' }], totalDurationSeconds: 5 },
      code: 'PRACTICE_QUESTION_MISMATCH',
    },
    {
      name: 'cross session question',
      body: { semesterId, answers: [{ questionId: otherQuestion[0].id, answer: 'A' }], totalDurationSeconds: 5 },
      code: 'PRACTICE_QUESTION_MISMATCH',
    },
    {
      name: 'invalid single choice answer',
      body: { semesterId, answers: [{ questionId: validQuestions[0].id, answer: 'Z' }], totalDurationSeconds: 5 },
      code: 'PRACTICE_ANSWER_INVALID',
    },
    {
      name: 'invalid multiple choice answer',
      body: { semesterId, answers: [{ questionId: validQuestions[1].id, answer: 'A,A' }], totalDurationSeconds: 5 },
      code: 'PRACTICE_ANSWER_INVALID',
    },
    {
      name: 'invalid time spent',
      body: {
        semesterId,
        answers: [{ questionId: validQuestions[0].id, answer: 'A', timeSpentSeconds: -1 }],
        totalDurationSeconds: 5,
      },
      code: 'PRACTICE_SUBMIT_INPUT_INVALID',
    },
    {
      name: 'invalid total duration',
      body: { semesterId, answers: [{ questionId: validQuestions[0].id, answer: 'A' }], totalDurationSeconds: 1.5 },
      code: 'PRACTICE_SUBMIT_INPUT_INVALID',
    },
  ];

  for (const item of cases) {
    const testSessionQuestions = validQuestions.map((question) => ({ ...question, id: crypto.randomUUID() }));
    const testSession = seedPracticeSession(backend.dataRoot, semesterId, course.id, exam.id, testSessionQuestions);
    const body = JSON.parse(JSON.stringify(item.body));
    body.answers = body.answers.map((answer) => ({
      ...answer,
      questionId:
        answer.questionId === validQuestions[0].id
          ? testSessionQuestions[0].id
          : answer.questionId === validQuestions[1].id
            ? testSessionQuestions[1].id
            : answer.questionId,
    }));
    const failed = await requestJson(backend.port, 'POST', `/api/practice-sessions/${testSession}/submit`, body);
    assert.equal(failed.status >= 400, true, item.name);
    assert.equal(failed.json.success, false, item.name);
    assert.equal(failed.json.error.code, item.code, item.name);
    assert.equal(readPracticeState(backend.dataRoot, semesterId, testSession).answers.length, 0, item.name);
  }

  assert.equal(readPracticeState(backend.dataRoot, semesterId, otherSession).answers.length, 0);
  assert.equal(readPracticeState(backend.dataRoot, semesterId, sessionId).answers.length, 0);
});

test('submit cannot read a session through another semester id', async (t) => {
  const { backend, semesterId, questions, sessionId } = await setupPractice(t);
  const otherSemesterId = await initializeReadySemester(backend.port);

  const failed = await requestJson(backend.port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId: otherSemesterId,
    answers: [{ questionId: questions[0].id, answer: 'A' }],
    totalDurationSeconds: 5,
  });

  assert.equal(failed.status, 404);
  assert.equal(failed.json.error.code, 'PRACTICE_SESSION_NOT_FOUND');
  assert.equal(readPracticeState(backend.dataRoot, semesterId, sessionId).answers.length, 0);
});

assert.equal(typeof Database, 'function');
