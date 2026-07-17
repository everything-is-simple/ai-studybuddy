// ============================================================
// Phase 1-T04B：S4 ErrorFixer API 集成测试
// 覆盖错题列表/详情/错因确认/原题重做/状态流转/薄弱点与学期隔离。
// 复用真实后端进程与真实 SQLite，不 mock DB。
// ============================================================

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
let nextBackendPort = 56100;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t04b-api-'));
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

async function initializeReadySemester(port, code) {
  const response = await requestJson(port, 'POST', '/api/dev/init-semester', {
    studentName: 'T04B',
    semesterCode: code ?? `t04b-${crypto.randomUUID()}`,
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
      '向量空间是满足加法和数乘封闭的集合',
      '理解向量空间的定义。',
      '常见概念题',
      now,
      now
    );
    return id;
  } finally {
    db.close();
  }
}

function seedPracticeSession(dataRoot, semesterId, courseInstanceId, questions, overrides = {}) {
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
      ) VALUES (?, ?, NULL, 'in_progress', ?, 600, ?, NULL, NULL, NULL, NULL, 0, NULL, 'mixed', ?, ?)`
    ).run(sessionId, courseInstanceId, questions.length, now, now, now);

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
        question.explanation ?? '封闭性是向量空间的核心。',
        '测试证据',
        index + 1,
        now
      );
    }
    return sessionId;
  } finally {
    db.close();
  }
}

function twoQuestions(moduleId) {
  return [
    {
      id: crypto.randomUUID(),
      knowledgeModuleId: moduleId,
      type: 'single_choice',
      stem: '向量空间封闭性指什么？这是一道用于验证错题详情展示的题目，题干足够长以测试列表预览截断。',
      options: ['A. 加法和数乘结果仍在集合内', 'B. 只能做加法', 'C. 只能做数乘', 'D. 没有限制'],
      correctAnswer: 'A',
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

/** 做一组题并全部答错，产生 2 条错题。 */
async function produceMistakes(port, semesterId, sessionId, questions) {
  const submit = await requestJson(port, 'POST', `/api/practice-sessions/${sessionId}/submit`, {
    semesterId,
    answers: [
      { questionId: questions[0].id, answer: 'B', timeSpentSeconds: 10 },
      { questionId: questions[1].id, answer: '零点', timeSpentSeconds: 10 },
    ],
    totalDurationSeconds: 20,
  });
  assert.equal(submit.status, 200);
  assert.equal(submit.json.data.totalScore, 0);
}

async function setup(t) {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '线性代数');
  const moduleId = seedKnowledgeModule(backend.dataRoot, semesterId, course.id);
  const questions = twoQuestions(moduleId);
  const sessionId = seedPracticeSession(backend.dataRoot, semesterId, course.id, questions);
  await produceMistakes(backend.port, semesterId, sessionId, questions);
  return { backend, semesterId, course, moduleId, questions, sessionId };
}

test('mistake list returns archived mistakes with filters, pagination, and semester isolation', async (t) => {
  const { backend, semesterId, course, moduleId } = await setup(t);

  const list = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  assert.equal(list.status, 200);
  assert.equal(list.json.data.total, 2);
  assert.equal(list.json.data.items.length, 2);
  const first = list.json.data.items[0];
  assert.equal(first.status, 'pending_review');
  assert.equal(first.knowledgeModuleTitle, '向量空间定义');
  assert.ok(first.stemPreview.length <= 81);
  assert.ok(!('correctAnswer' in first), 'list item must not leak correct answer');

  // status 筛选
  const filtered = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}&status=mastered`
  );
  assert.equal(filtered.json.data.total, 0);

  // module 筛选
  const byModule = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}&knowledgeModuleId=${moduleId}`
  );
  assert.equal(byModule.json.data.total, 2);

  // 非法 status
  const badStatus = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}&status=broken`
  );
  assert.equal(badStatus.status, 400);
  assert.equal(badStatus.json.error.code, 'MISTAKE_FILTER_INVALID');

  // 分页
  const paged = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}&page=2&pageSize=1`
  );
  assert.equal(paged.json.data.items.length, 1);
  assert.equal(paged.json.data.total, 2);

  // 学期隔离：另一学期读不到
  const otherSemester = await initializeReadySemester(backend.port, `t04b-other-${crypto.randomUUID()}`);
  const crossList = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${otherSemester}&courseInstanceId=${course.id}`
  );
  assert.equal(crossList.status, 404);
  assert.equal(crossList.json.error.code, 'COURSE_NOT_FOUND');
});

test('mistake detail exposes graded facts and evidence; missing mistake returns Chinese 404', async (t) => {
  const { backend, semesterId, course } = await setup(t);
  const list = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  const target = list.json.data.items.find((item) => item.questionType === 'single_choice');

  const detail = await requestJson(backend.port, 'GET', `/api/mistakes/${target.id}?semesterId=${semesterId}`);
  assert.equal(detail.status, 200);
  const data = detail.json.data;
  assert.equal(data.correctAnswer, 'A');
  assert.equal(data.studentAnswer, 'B');
  assert.ok(Array.isArray(data.options) && data.options.length === 4);
  assert.ok(data.explanation);
  assert.equal(data.errorCount, 1);
  assert.equal(data.evidence.length, 1);
  assert.equal(data.evidence[0].evidenceType, 'practice_error');
  assert.equal(data.errorCauseCategory, null);

  const missing = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes/${crypto.randomUUID()}?semesterId=${semesterId}`
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'MISTAKE_NOT_FOUND');
  assert.match(missing.json.error.message, /错题不存在/);
});

test('error cause confirmation moves pending mistake to needs_review and validates whitelist', async (t) => {
  const { backend, semesterId, course } = await setup(t);
  const list = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  const target = list.json.data.items[0];

  const bad = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/error-cause`, {
    semesterId,
    category: 'lazy',
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'MISTAKE_CAUSE_INVALID');

  const tooLong = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/error-cause`, {
    semesterId,
    category: 'concept_unclear',
    note: '长'.repeat(501),
  });
  assert.equal(tooLong.status, 400);

  const confirmed = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/error-cause`, {
    semesterId,
    category: 'concept_unclear',
    note: '封闭性概念没吃透',
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.data.errorCauseCategory, 'concept_unclear');
  assert.equal(confirmed.json.data.errorCauseNote, '封闭性概念没吃透');
  assert.ok(confirmed.json.data.errorCauseConfirmedAt);
  assert.equal(confirmed.json.data.status, 'needs_review');

  const db = openSemesterDb(backend.dataRoot, semesterId);
  try {
    const module = db.prepare('SELECT learn_status FROM knowledge_modules WHERE id = ?').get(target.knowledgeModuleId);
    assert.equal(module.learn_status, 'learning');
    const tasks = db
      .prepare(
        `SELECT type, status, knowledge_module_id, assessment_attempt_id
         FROM study_tasks
         WHERE knowledge_module_id = ? AND type = 'error_review'`
      )
      .all(target.knowledgeModuleId);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, 'todo');
    assert.equal(tasks[0].assessment_attempt_id, target.assessmentAttemptId);
    const event = db
      .prepare("SELECT * FROM study_events WHERE event_type = 'feedback_review_required' AND evidence_ref = ?")
      .get(`km:${target.knowledgeModuleId}`);
    assert.equal(event.source_system, 'S4');
    assert.equal(event.parent_visible, 1);
    assert.ok(!event.title.includes('封闭性'), 'feedback event must not contain stem text');
  } finally {
    db.close();
  }
});

test('redo flow: incorrect redo keeps needs_review without new mistakes; correct redo enables mastery', async (t) => {
  const { backend, semesterId, course } = await setup(t);
  const list = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  const target = list.json.data.items.find((item) => item.questionType === 'single_choice');

  // 未确认错因前也允许重做（错因与重做独立）
  const redo1 = await requestJson(backend.port, 'POST', `/api/mistakes/${target.id}/redo`, { semesterId });
  assert.equal(redo1.status, 201);
  const session1 = redo1.json.data;
  assert.equal(session1.sessionKind, 'mistake_redo');
  assert.equal(session1.originMistakeId, target.id);
  assert.equal(session1.questions.length, 1);
  assert.ok(!('correctAnswer' in session1.questions[0]), 'redo question must hide the answer before submit');

  // 已有进行中的重做时再次发起被拒
  const redoConflict = await requestJson(backend.port, 'POST', `/api/mistakes/${target.id}/redo`, { semesterId });
  assert.equal(redoConflict.status, 409);
  assert.equal(redoConflict.json.error.code, 'MISTAKE_REDO_IN_PROGRESS');

  // 第一次重做仍答错
  const submitWrong = await requestJson(backend.port, 'POST', `/api/practice-sessions/${session1.id}/submit`, {
    semesterId,
    answers: [{ questionId: session1.questions[0].id, answer: 'C', timeSpentSeconds: 8 }],
    totalDurationSeconds: 8,
  });
  assert.equal(submitWrong.status, 200);
  assert.equal(submitWrong.json.data.totalScore, 0);

  const afterWrong = await requestJson(backend.port, 'GET', `/api/mistakes/${target.id}?semesterId=${semesterId}`);
  assert.equal(afterWrong.json.data.status, 'needs_review');
  assert.equal(afterWrong.json.data.errorCount, 1, 'redo failure must not bump original error_count');
  assert.ok(afterWrong.json.data.evidence.some((item) => item.evidenceType === 'redo_incorrect'));

  const feedbackDbAfterWrong = openSemesterDb(backend.dataRoot, semesterId);
  try {
    const module = feedbackDbAfterWrong
      .prepare('SELECT learn_status FROM knowledge_modules WHERE id = ?')
      .get(target.knowledgeModuleId);
    assert.equal(module.learn_status, 'learning');
    const tasks = feedbackDbAfterWrong
      .prepare("SELECT * FROM study_tasks WHERE knowledge_module_id = ? AND type = 'error_review'")
      .all(target.knowledgeModuleId);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, 'todo');
    const event = feedbackDbAfterWrong
      .prepare("SELECT * FROM study_events WHERE event_type = 'feedback_review_required' AND evidence_ref = ?")
      .get(`km:${target.knowledgeModuleId}`);
    assert.equal(event.source_system, 'S4');
    assert.ok(!event.title.includes('封闭性'), 'feedback event must not contain stem text');
  } finally {
    feedbackDbAfterWrong.close();
  }

  // 关键回归：重做不产生新的错题
  const listAfterWrong = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  assert.equal(listAfterWrong.json.data.total, 2, 'redo must not create new mistakes');

  // 无 redo_correct 证据时直接标掌握（不带 confirm）被拒
  const masterTooEarly = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/status`, {
    semesterId,
    status: 'mastered',
  });
  assert.equal(masterTooEarly.status, 409);
  assert.equal(masterTooEarly.json.error.code, 'MISTAKE_MASTERY_EVIDENCE_REQUIRED');

  // 第二次重做答对
  const redo2 = await requestJson(backend.port, 'POST', `/api/mistakes/${target.id}/redo`, { semesterId });
  assert.equal(redo2.status, 201);
  const session2 = redo2.json.data;
  const submitRight = await requestJson(backend.port, 'POST', `/api/practice-sessions/${session2.id}/submit`, {
    semesterId,
    answers: [{ questionId: session2.questions[0].id, answer: 'A', timeSpentSeconds: 6 }],
    totalDurationSeconds: 6,
  });
  assert.equal(submitRight.status, 200);
  assert.equal(submitRight.json.data.totalScore, 1);

  const afterRight = await requestJson(backend.port, 'GET', `/api/mistakes/${target.id}?semesterId=${semesterId}`);
  assert.ok(afterRight.json.data.evidence.some((item) => item.evidenceType === 'redo_correct'));

  // 有 redo_correct 证据后可标掌握
  const mastered = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/status`, {
    semesterId,
    status: 'mastered',
  });
  assert.equal(mastered.status, 200);
  assert.equal(mastered.json.data.status, 'mastered');

  // 已掌握可手动重开
  const reopened = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/status`, {
    semesterId,
    status: 'needs_review',
  });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.json.data.status, 'needs_review');

  // StudyEvent：两次重做各写一条 mistake_reviewed，evidence_ref 指向错题且不含题干
  const db = openSemesterDb(backend.dataRoot, semesterId);
  try {
    const events = db
      .prepare("SELECT * FROM study_events WHERE event_type = 'mistake_reviewed' ORDER BY created_at ASC")
      .all();
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.source_system, 'S4');
      assert.equal(event.evidence_ref, `mistake:${target.id}`);
      assert.ok(!event.title.includes('封闭性'), 'event title must not contain stem text');
    }
  } finally {
    db.close();
  }

  const interference = await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId,
    sourceSystem: 'S1',
    eventType: 'study_task_completed',
    title: '干扰事件',
    courseInstanceId: course.id,
  });
  assert.equal(interference.status, 201);
  const timeline = await requestJson(
    backend.port,
    'GET',
    `/api/timeline?semesterId=${semesterId}&eventType=mistake_reviewed`
  );
  assert.equal(timeline.status, 200);
  assert.equal(timeline.json.data.length, 2);
  for (const event of timeline.json.data) {
    assert.equal(event.courseInstanceId, course.id);
    assert.equal(event.evidenceRef, `mistake:${target.id}`);
    assert.ok(!event.title.includes('封闭性'), 'timeline event title must not contain stem text');
  }
});

test('mastery with explicit student confirm works without redo evidence', async (t) => {
  const { backend, semesterId, course } = await setup(t);
  const list = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  const target = list.json.data.items[0];

  // 先确认错因使其进入 needs_review
  await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/error-cause`, {
    semesterId,
    category: 'misread',
  });

  const confirmed = await requestJson(backend.port, 'PATCH', `/api/mistakes/${target.id}/status`, {
    semesterId,
    status: 'mastered',
    confirm: true,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.data.status, 'mastered');

  // pending_review 不能直接标掌握
  const other = list.json.data.items.find((item) => item.id !== target.id);
  const invalid = await requestJson(backend.port, 'PATCH', `/api/mistakes/${other.id}/status`, {
    semesterId,
    status: 'mastered',
    confirm: true,
  });
  assert.equal(invalid.status, 409);
  assert.equal(invalid.json.error.code, 'MISTAKE_STATUS_INVALID');
});

test('weak points list joins module titles and redo failures update evidence counts', async (t) => {
  const { backend, semesterId, course } = await setup(t);

  // 初始两条 practice_error 证据同模块 → 已形成薄弱点
  const initial = await requestJson(
    backend.port,
    'GET',
    `/api/weak-points?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  assert.equal(initial.status, 200);
  assert.equal(initial.json.data.items.length, 1);
  assert.equal(initial.json.data.items[0].knowledgeModuleTitle, '向量空间定义');
  assert.equal(initial.json.data.items[0].evidenceCount, 2);

  // 一次失败重做 → 证据数 +1
  const list = await requestJson(
    backend.port,
    'GET',
    `/api/mistakes?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  const target = list.json.data.items.find((item) => item.questionType === 'single_choice');
  const redo = await requestJson(backend.port, 'POST', `/api/mistakes/${target.id}/redo`, { semesterId });
  await requestJson(backend.port, 'POST', `/api/practice-sessions/${redo.json.data.id}/submit`, {
    semesterId,
    answers: [{ questionId: redo.json.data.questions[0].id, answer: 'D', timeSpentSeconds: 5 }],
    totalDurationSeconds: 5,
  });

  const after = await requestJson(
    backend.port,
    'GET',
    `/api/weak-points?semesterId=${semesterId}&courseInstanceId=${course.id}`
  );
  assert.equal(after.json.data.items[0].evidenceCount, 3);
});
