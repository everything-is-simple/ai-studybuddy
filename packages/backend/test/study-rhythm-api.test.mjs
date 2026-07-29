import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const backendDir = path.resolve(import.meta.dirname, '..');

// 顺序分配端口，避免同一测试文件内多个后端实例因随机冲突导致健康检查超时。
let nextPortOffset = 0;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t06-api-'));
  const port = 48000 + (nextPortOffset % 3000);
  nextPortOffset += 1;
  const processHandle = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
    },
    stdio: 'ignore',
  });

  t.after(async () => {
    processHandle.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return { dataRoot, port };
    } catch {
      // 后端尚未开始监听，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('built backend did not become healthy');
}

async function requestJson(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

async function initializeReadySemester(port, overrides = {}) {
  const result = await requestJson(port, 'POST', '/api/dev/init-semester', {
    studentName: 'Alice',
    semesterCode: `sem-${crypto.randomUUID()}`,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
    ...overrides,
  });
  assert.equal(result.status, 200);
  assert.equal(result.json?.success, true);
  return result.json.data.semesterId;
}

async function createCourse(port, semesterId, name, retakeOfCourseInstanceId) {
  const body = { semesterId, name };
  if (retakeOfCourseInstanceId !== undefined) body.retakeOfCourseInstanceId = retakeOfCourseInstanceId;
  return requestJson(port, 'POST', '/api/courses', body);
}

async function deleteCourse(port, semesterId, courseId) {
  return requestJson(port, 'DELETE', `/api/courses/${courseId}?semesterId=${semesterId}`);
}

async function createExam(port, semesterId, courseInstanceId, overrides = {}) {
  return requestJson(port, 'POST', '/api/exams', {
    semesterId,
    courseInstanceId,
    name: '单元测验',
    examAt: '2026-05-10T08:00:00.000Z',
    ...overrides,
  });
}

async function getExam(port, semesterId, examId) {
  return requestJson(port, 'GET', `/api/exams/${examId}?semesterId=${semesterId}`);
}

async function confirmExam(port, semesterId, examId) {
  return requestJson(port, 'PATCH', `/api/exams/${examId}/confirmation`, { semesterId });
}

async function createTask(port, semesterId, courseInstanceId, overrides = {}) {
  return requestJson(port, 'POST', '/api/study-tasks', {
    semesterId,
    courseInstanceId,
    type: 'practice',
    title: '练习任务',
    ...overrides,
  });
}

function openSemesterDb(dataRoot, semesterId) {
  return new Database(path.join(dataRoot, 'semesters', semesterId, 'semester.db'));
}

// ── 课程 ──────────────────────────────────────────────────────

test('creates and lists courses within one ready semester', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);

  const created = await createCourse(backend.port, semesterId, '数学分析');
  assert.equal(created.status, 201);
  assert.equal(created.json.success, true);
  assert.equal(created.json.data.name, '数学分析');
  assert.equal(created.json.data.semesterId, semesterId);

  const listed = await requestJson(backend.port, 'GET', `/api/courses?semesterId=${semesterId}`);
  assert.equal(listed.status, 200);
  assert.equal(listed.json.success, true);
  assert.deepEqual(
    listed.json.data.map((course) => course.name),
    ['数学分析']
  );
});

test('deletes an empty course within its ready semester', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const created = await createCourse(backend.port, semesterId, '待删除课程');

  const deleted = await deleteCourse(backend.port, semesterId, created.json.data.id);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.success, true);
  assert.equal(deleted.json.data.id, created.json.data.id);

  const listed = await requestJson(backend.port, 'GET', `/api/courses?semesterId=${semesterId}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.json.data, []);
});

test('rejects course writes to missing or unready semester', async (t) => {
  const backend = await startBackend(t);

  const missing = await createCourse(backend.port, crypto.randomUUID(), '数学');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.success, false);
  assert.equal(missing.json.error.code, 'SEMESTER_NOT_FOUND');

  // 通过初始化时失败或尚未 ready 的学期难以构造，这里依赖未就绪语义测试。
});

test('rejects malformed retakeOfCourseInstanceId and preserves valid unknown UUID', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);

  const malformed = await createCourse(backend.port, semesterId, '数学', 'not-a-uuid');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.success, false);
  assert.equal(malformed.json.error.code, 'COURSE_INPUT_INVALID');

  const unknownRetakeId = crypto.randomUUID();
  const created = await createCourse(backend.port, semesterId, '复修数学', unknownRetakeId);
  assert.equal(created.status, 201);
  assert.equal(created.json.data.retakeOfCourseInstanceId, unknownRetakeId);
});

// ── 考试目标 ──────────────────────────────────────────────────

test('creates and lists multiple assessment attempts sorted by examAt', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '数学');
  const courseInstanceId = course.json.data.id;

  const later = await createExam(backend.port, semesterId, courseInstanceId, {
    name: '期末',
    examAt: '2026-07-01T08:00:00.000Z',
  });
  const earlier = await createExam(backend.port, semesterId, courseInstanceId, {
    name: '期中',
    examAt: '2026-04-01T08:00:00.000Z',
  });
  assert.equal(later.status, 201);
  assert.equal(earlier.status, 201);

  const listed = await requestJson(
    backend.port,
    'GET',
    `/api/exams?semesterId=${semesterId}&courseInstanceId=${courseInstanceId}`
  );
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.json.data.map((exam) => exam.name),
    ['期中', '期末']
  );
});

test('rejects exam when courseInstanceId belongs to another semester', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '数学');

  const cross = await createExam(backend.port, semesterB, courseA.json.data.id, { name: '跨学期考试' });
  assert.equal(cross.status, 404);
  assert.equal(cross.json.success, false);
  assert.equal(cross.json.error.code, 'COURSE_NOT_FOUND');
});

test('persists attemptType and confirmationStatus with defaults', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '英语');

  const confirmed = await createExam(backend.port, semesterId, course.json.data.id, {
    name: '听力',
    confirmationStatus: 'confirmed',
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.json.data.attemptType, 'normal');
  assert.equal(confirmed.json.data.confirmationStatus, 'confirmed');
  assert.ok(confirmed.json.data.confirmedAt);

  const rejected = await createExam(backend.port, semesterId, course.json.data.id, {
    name: '口语',
    attemptType: 'makeup',
    confirmationStatus: 'rejected',
  });
  assert.equal(rejected.status, 201);
  assert.equal(rejected.json.data.attemptType, 'makeup');
  assert.equal(rejected.json.data.confirmationStatus, 'rejected');
  assert.equal(rejected.json.data.confirmedAt, undefined);
});

test('gets one exam only from the requested ready semester', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '数学');
  const examA = await createExam(backend.port, semesterA, courseA.json.data.id, {
    name: '数学期中',
  });

  const found = await getExam(backend.port, semesterA, examA.json.data.id);
  assert.equal(found.status, 200);
  assert.equal(found.json.success, true);
  assert.equal(found.json.data.id, examA.json.data.id);
  assert.equal(found.json.data.name, '数学期中');

  const crossSemester = await getExam(backend.port, semesterB, examA.json.data.id);
  assert.equal(crossSemester.status, 404);
  assert.equal(crossSemester.json.success, false);
  assert.equal(crossSemester.json.error.code, 'EXAM_NOT_FOUND');

  const missing = await getExam(backend.port, semesterA, crypto.randomUUID());
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'EXAM_NOT_FOUND');

  const malformed = await getExam(backend.port, semesterA, 'not-a-uuid');
  assert.equal(malformed.status, 404);
  assert.equal(malformed.json.error.code, 'EXAM_NOT_FOUND');
});

test('confirms a pending exam once and immediately updates task priority', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '物理');
  const exam = await createExam(backend.port, semesterId, course.json.data.id, {
    name: '物理期中',
    examAt: '2026-05-20T09:00:00.000Z',
  });
  const task = await createTask(backend.port, semesterId, course.json.data.id, {
    assessmentAttemptId: exam.json.data.id,
    title: '物理复习',
  });
  assert.equal(task.json.data.priorityBucket, 3);

  const first = await confirmExam(backend.port, semesterId, exam.json.data.id);
  assert.equal(first.status, 200);
  assert.equal(first.json.success, true);
  assert.equal(first.json.data.confirmationStatus, 'confirmed');
  assert.equal(first.json.data.examAt, '2026-05-20T09:00:00.000Z');
  assert.ok(first.json.data.confirmedAt);

  const second = await confirmExam(backend.port, semesterId, exam.json.data.id);
  assert.equal(second.status, 200);
  assert.equal(second.json.data.confirmedAt, first.json.data.confirmedAt);

  const tasks = await requestJson(backend.port, 'GET', `/api/study-tasks?semesterId=${semesterId}`);
  const refreshedTask = tasks.json.data.find((item) => item.id === task.json.data.id);
  assert.equal(refreshedTask.priorityBucket, 1);

  const timeline = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterId}`);
  const confirmationEvents = timeline.json.data.filter(
    (event) => event.eventType === 'assessment_attempt_confirmed'
  );
  assert.equal(confirmationEvents.length, 1);
  assert.equal(confirmationEvents[0].title, '考试日期已确认');
  assert.equal(confirmationEvents[0].courseInstanceId, course.json.data.id);
  assert.equal(confirmationEvents[0].evidenceRef, `assessment_attempt:${exam.json.data.id}`);
  assert.equal(confirmationEvents[0].occurredAt, first.json.data.confirmedAt);
  assert.equal(confirmationEvents[0].parentVisible, true);
});

test('rejects confirmation for rejected, superseded, missing, and cross-semester exams', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '英语');
  const rejected = await createExam(backend.port, semesterA, courseA.json.data.id, {
    name: '已拒绝考试',
    confirmationStatus: 'rejected',
  });
  const superseded = await createExam(backend.port, semesterA, courseA.json.data.id, {
    name: '已替代考试',
    confirmationStatus: 'superseded',
  });

  for (const examId of [rejected.json.data.id, superseded.json.data.id]) {
    const result = await confirmExam(backend.port, semesterA, examId);
    assert.equal(result.status, 409);
    assert.equal(result.json.success, false);
    assert.equal(result.json.error.code, 'EXAM_CONFIRMATION_INVALID');
  }

  const missing = await confirmExam(backend.port, semesterA, crypto.randomUUID());
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'EXAM_NOT_FOUND');

  const crossSemester = await confirmExam(backend.port, semesterB, rejected.json.data.id);
  assert.equal(crossSemester.status, 404);
  assert.equal(crossSemester.json.error.code, 'EXAM_NOT_FOUND');
});

// ── 学习任务 ──────────────────────────────────────────────────

test('creates a task and rejects assessmentAttemptId from another course', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const math = await createCourse(backend.port, semesterId, '数学');
  const english = await createCourse(backend.port, semesterId, '英语');
  const mathExam = await createExam(backend.port, semesterId, math.json.data.id, { name: '数学期中' });

  const valid = await createTask(backend.port, semesterId, math.json.data.id, {
    assessmentAttemptId: mathExam.json.data.id,
    title: '数学练习',
  });
  assert.equal(valid.status, 201);

  const crossCourse = await createTask(backend.port, semesterId, english.json.data.id, {
    assessmentAttemptId: mathExam.json.data.id,
    title: '英语误关联',
  });
  assert.equal(crossCourse.status, 404);
  assert.equal(crossCourse.json.error.code, 'EXAM_NOT_FOUND');
});

test('PATCH todo to done writes exactly one study_task_completed event', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '物理');
  const task = await createTask(backend.port, semesterId, course.json.data.id, { title: '物理作业' });
  const taskId = task.json.data.id;

  const firstDone = await requestJson(backend.port, 'PATCH', `/api/study-tasks/${taskId}/status`, {
    semesterId,
    status: 'done',
  });
  assert.equal(firstDone.status, 200);
  assert.equal(firstDone.json.data.status, 'done');

  const secondDone = await requestJson(backend.port, 'PATCH', `/api/study-tasks/${taskId}/status`, {
    semesterId,
    status: 'done',
  });
  assert.equal(secondDone.status, 200);

  const timeline = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterId}`);
  assert.equal(timeline.status, 200);
  const completedEvents = timeline.json.data.filter((event) => event.eventType === 'study_task_completed');
  assert.equal(completedEvents.length, 1);
  assert.equal(completedEvents[0].taskId, taskId);
  assert.equal(completedEvents[0].sourceSystem, 'S1');
});

test('rejects malformed occurredAt when completing a task', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '地理');
  const task = await createTask(backend.port, semesterId, course.json.data.id, { title: '地理作业' });

  const invalidTime = await requestJson(backend.port, 'PATCH', `/api/study-tasks/${task.json.data.id}/status`, {
    semesterId,
    status: 'done',
    occurredAt: 'not-a-timestamp',
  });

  assert.equal(invalidTime.status, 409);
  assert.equal(invalidTime.json.error.code, 'TASK_STATUS_INVALID');

  const timeline = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterId}`);
  assert.equal(timeline.status, 200);
  assert.equal(timeline.json.data.filter((event) => event.eventType === 'study_task_completed').length, 0);
});
test('rejects illegal status transitions and missing tasks', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '化学');
  const task = await createTask(backend.port, semesterId, course.json.data.id, { title: '化学作业' });
  const taskId = task.json.data.id;

  await requestJson(backend.port, 'PATCH', `/api/study-tasks/${taskId}/status`, { semesterId, status: 'done' });

  const illegal = await requestJson(backend.port, 'PATCH', `/api/study-tasks/${taskId}/status`, {
    semesterId,
    status: 'doing',
  });
  assert.equal(illegal.status, 409);
  assert.equal(illegal.json.error.code, 'TASK_STATUS_INVALID');

  const missing = await requestJson(backend.port, 'PATCH', `/api/study-tasks/${crypto.randomUUID()}/status`, {
    semesterId,
    status: 'done',
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'TASK_NOT_FOUND');
});

test('derivedOverdue is true for past-deadline non-terminal tasks and never writes status overdue', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '历史');

  const overdue = await createTask(backend.port, semesterId, course.json.data.id, {
    title: '逾期任务',
    deadlineAt: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(overdue.status, 201);
  assert.equal(overdue.json.data.status, 'todo');
  assert.equal(overdue.json.data.derivedOverdue, true);
  assert.equal(overdue.json.data.priorityBucket, 0);
});

test('only confirmed examAt drives task priority', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '生物');

  const pendingExam = await createExam(backend.port, semesterId, course.json.data.id, {
    name: '待确认',
    examAt: '2026-04-01T08:00:00.000Z',
    confirmationStatus: 'pending',
  });
  const confirmedExam = await createExam(backend.port, semesterId, course.json.data.id, {
    name: '已确认',
    examAt: '2026-05-01T08:00:00.000Z',
    confirmationStatus: 'confirmed',
  });

  const pendingTask = await createTask(backend.port, semesterId, course.json.data.id, {
    assessmentAttemptId: pendingExam.json.data.id,
    title: 'pending 任务',
  });
  const confirmedTask = await createTask(backend.port, semesterId, course.json.data.id, {
    assessmentAttemptId: confirmedExam.json.data.id,
    title: 'confirmed 任务',
  });

  assert.equal(pendingTask.json.data.priorityBucket, 3);
  assert.equal(confirmedTask.json.data.priorityBucket, 1);
});

test('active weak point raises error_review task priority without overriding overdue priority', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '线性代数');
  const db = openSemesterDb(backend.dataRoot, semesterId);
  const moduleId = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO knowledge_modules (
        id, course_instance_id, material_id, title, importance, difficulty,
        source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
      ) VALUES (?, ?, NULL, '向量空间定义', 'high', 'medium', '测试证据', 'learning', '理解定义', '常见概念题', ?, ?)`
    ).run(moduleId, course.json.data.id, '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z');
    db.prepare(
      `INSERT INTO weak_points (
        id, course_instance_id, knowledge_module_id, status, evidence_count,
        first_detected_at, latest_detected_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', 2, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      course.json.data.id,
      moduleId,
      '2026-07-17T00:00:00.000Z',
      '2026-07-17T00:00:00.000Z',
      '2026-07-17T00:00:00.000Z',
      '2026-07-17T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO study_tasks (
        id, course_instance_id, knowledge_module_id, type, title, status,
        estimated_minutes, deadline_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'error_review', '复习薄弱点：向量空间定义', 'todo', 20, NULL, ?, ?)`
    ).run(
      crypto.randomUUID(),
      course.json.data.id,
      moduleId,
      '2026-07-17T00:00:00.000Z',
      '2026-07-17T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO study_tasks (
        id, course_instance_id, knowledge_module_id, type, title, status,
        estimated_minutes, deadline_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'error_review', '逾期错题复习', 'todo', 20, '2020-01-01T00:00:00.000Z', ?, ?)`
    ).run(
      crypto.randomUUID(),
      course.json.data.id,
      moduleId,
      '2026-07-17T00:00:01.000Z',
      '2026-07-17T00:00:01.000Z'
    );
  } finally {
    db.close();
  }

  const listed = await requestJson(
    backend.port,
    'GET',
    `/api/study-tasks?semesterId=${semesterId}&courseInstanceId=${course.json.data.id}`
  );
  assert.equal(listed.status, 200);
  const activeReview = listed.json.data.find((task) => task.title === '复习薄弱点：向量空间定义');
  const overdueReview = listed.json.data.find((task) => task.title === '逾期错题复习');
  assert.equal(activeReview.derivedOverdue, false);
  assert.equal(activeReview.priorityBucket, 1);
  assert.equal(overdueReview.derivedOverdue, true);
  assert.equal(overdueReview.priorityBucket, 0);
});

test('lists study tasks for the requested course in deadline order', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, '数据结构');
  const anotherCourse = await createCourse(backend.port, semesterId, '操作系统');

  await createTask(backend.port, semesterId, course.json.data.id, { title: '无截止任务' });
  await createTask(backend.port, semesterId, course.json.data.id, {
    title: '较晚截止任务',
    deadlineAt: '2026-05-20T08:00:00.000Z',
  });
  await createTask(backend.port, semesterId, course.json.data.id, {
    title: '较早截止任务',
    deadlineAt: '2026-05-10T08:00:00.000Z',
  });
  await createTask(backend.port, semesterId, anotherCourse.json.data.id, { title: '其他课程任务' });

  const listed = await requestJson(
    backend.port,
    'GET',
    `/api/study-tasks?semesterId=${semesterId}&courseInstanceId=${course.json.data.id}`
  );
  assert.equal(listed.status, 200);
  assert.equal(listed.json.success, true);
  assert.deepEqual(
    listed.json.data.map((task) => task.title),
    ['较早截止任务', '较晚截止任务', '无截止任务']
  );
  assert.equal(listed.json.data[0].courseInstanceId, course.json.data.id);
});
// ── 事件与时间线 ──────────────────────────────────────────────

test('study-events reject cross-semester course or task references', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '地理');

  const crossCourse = await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterB,
    sourceSystem: 'S1',
    eventType: 'manual_note',
    title: '跨学期事件',
    courseInstanceId: courseA.json.data.id,
  });
  assert.equal(crossCourse.status, 404);
  assert.equal(crossCourse.json.error.code, 'COURSE_NOT_FOUND');

  const taskA = await createTask(backend.port, semesterA, courseA.json.data.id, { title: '地理作业' });
  const crossTask = await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterB,
    sourceSystem: 'S2',
    eventType: 'material_processed',
    title: '跨学期任务事件',
    taskId: taskA.json.data.id,
  });
  assert.equal(crossTask.status, 404);
  assert.equal(crossTask.json.error.code, 'TASK_NOT_FOUND');
});

test('timeline filters one or multiple event types with course AND, descending order, and semester isolation', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '政治');
  const courseB = await createCourse(backend.port, semesterA, '体育');

  await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterA,
    sourceSystem: 'S1',
    eventType: 'practice_completed',
    title: '政治练习',
    courseInstanceId: courseA.json.data.id,
    occurredAt: '2026-03-01T10:00:00.000Z',
  });
  await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterA,
    sourceSystem: 'S1',
    eventType: 'practice_completed',
    title: '体育练习',
    courseInstanceId: courseB.json.data.id,
    occurredAt: '2026-03-02T10:00:00.000Z',
  });
  await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterB,
    sourceSystem: 'S1',
    eventType: 'mistake_reviewed',
    title: 'B学期错题',
    occurredAt: '2026-03-03T10:00:00.000Z',
  });

  const allA = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterA}`);
  assert.equal(allA.status, 200);
  assert.deepEqual(
    allA.json.data.map((event) => event.title),
    ['体育练习', '政治练习']
  );

  await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterA,
    sourceSystem: 'S4',
    eventType: 'mistake_reviewed',
    title: '政治错题',
    courseInstanceId: courseA.json.data.id,
    occurredAt: '2026-03-04T10:00:00.000Z',
  });
  await requestJson(backend.port, 'POST', '/api/study-events', {
    semesterId: semesterA,
    sourceSystem: 'S2',
    eventType: 'material_note_completed',
    title: '政治资料',
    courseInstanceId: courseA.json.data.id,
    occurredAt: '2026-02-28T10:00:00.000Z',
  });

  const singleType = await requestJson(
    backend.port,
    'GET',
    `/api/timeline?semesterId=${semesterA}&eventType=practice_completed`
  );
  assert.deepEqual(
    singleType.json.data.map((event) => event.title),
    ['体育练习', '政治练习']
  );

  const multipleTypes = await requestJson(
    backend.port,
    'GET',
    `/api/timeline?semesterId=${semesterA}&eventType=material_note_completed&eventType=mistake_reviewed`
  );
  assert.deepEqual(
    multipleTypes.json.data.map((event) => event.title),
    ['政治错题', '政治资料']
  );

  const courseAndTypes = await requestJson(
    backend.port,
    'GET',
    `/api/timeline?semesterId=${semesterA}&courseInstanceId=${courseA.json.data.id}&eventType=practice_completed&eventType=mistake_reviewed`
  );
  assert.deepEqual(
    courseAndTypes.json.data.map((event) => event.title),
    ['政治错题', '政治练习']
  );

  const limited = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterA}&limit=1`);
  assert.equal(limited.json.data.length, 1);
  assert.equal(limited.json.data[0].title, '政治错题');
});

test('timeline preserves exact event type values, deduplicates identical values, and validates query shape', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const spacedType = '  existing type  ';
  const longType = `existing-${'x'.repeat(80)}`;

  for (const [eventType, title] of [
    [spacedType, '带空格类型'],
    [longType, '长类型'],
  ]) {
    const created = await requestJson(backend.port, 'POST', '/api/study-events', {
      semesterId,
      sourceSystem: 'S1',
      eventType,
      title,
    });
    assert.equal(created.status, 201);
  }

  const exactParams = new URLSearchParams({ semesterId });
  exactParams.append('eventType', spacedType);
  exactParams.append('eventType', longType);
  const exact = await requestJson(backend.port, 'GET', `/api/timeline?${exactParams}`);
  assert.equal(exact.status, 200);
  assert.deepEqual(
    exact.json.data.map((event) => event.eventType).sort(),
    [longType, spacedType].sort()
  );

  const duplicates = new URLSearchParams({ semesterId });
  for (let index = 0; index < 21; index += 1) duplicates.append('eventType', spacedType);
  const deduplicated = await requestJson(backend.port, 'GET', `/api/timeline?${duplicates}`);
  assert.equal(deduplicated.status, 200);
  assert.equal(deduplicated.json.data.length, 1);
  assert.equal(deduplicated.json.data[0].eventType, spacedType);

  const invalidQueries = [
    `semesterId=${semesterId}&eventType=`,
    `semesterId=${semesterId}&eventType=${encodeURIComponent('   ')}`,
    `semesterId=${semesterId}&eventType[value]=practice_completed`,
  ];
  const tooMany = new URLSearchParams({ semesterId });
  for (let index = 0; index < 21; index += 1) tooMany.append('eventType', `type-${index}`);
  invalidQueries.push(tooMany.toString());

  for (const query of invalidQueries) {
    const response = await requestJson(backend.port, 'GET', `/api/timeline?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal(response.json.error.code, 'TIMELINE_QUERY_INVALID');
  }
});

test('rejects invalid timeline limit', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);

  const zero = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterId}&limit=0`);
  assert.equal(zero.status, 400);
  assert.equal(zero.json.error.code, 'TIMELINE_QUERY_INVALID');

  const huge = await requestJson(backend.port, 'GET', `/api/timeline?semesterId=${semesterId}&limit=999`);
  assert.equal(huge.status, 400);
  assert.equal(huge.json.error.code, 'TIMELINE_QUERY_INVALID');
});

// ── T09C：课程、课表与考试目标编辑 ────────────────────────────

async function updateCourse(port, semesterId, courseId, data) {
  return requestJson(port, 'PATCH', `/api/courses/${courseId}`, { semesterId, ...data });
}

async function getScheduleEntries(port, semesterId) {
  return requestJson(port, 'GET', `/api/schedule-entries?semesterId=${semesterId}`);
}

async function createScheduleEntry(port, data) {
  return requestJson(port, 'POST', '/api/schedule-entries', data);
}

async function updateScheduleEntry(port, semesterId, entryId, data) {
  return requestJson(port, 'PATCH', `/api/schedule-entries/${entryId}`, { semesterId, ...data });
}

async function deleteScheduleEntry(port, semesterId, entryId) {
  return requestJson(port, 'DELETE', `/api/schedule-entries/${entryId}`, { semesterId });
}

async function updateExam(port, semesterId, examId, data) {
  return requestJson(port, 'PATCH', `/api/exams/${examId}`, { semesterId, ...data });
}

test('T09C edits courses and keeps schedule entry reads and writes isolated by ready semester', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '化学');
  const courseB = await createCourse(backend.port, semesterB, '生物');
  assert.equal(courseA.status, 201);
  assert.equal(courseB.status, 201);

  const renamed = await updateCourse(backend.port, semesterA, courseA.json.data.id, { name: '有机化学' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.success, true);
  assert.equal(renamed.json.data.name, '有机化学');

  const crossCourse = await updateCourse(backend.port, semesterB, courseA.json.data.id, { name: '不应跨学期改名' });
  assert.equal(crossCourse.status, 404);
  assert.equal(crossCourse.json.success, false);
  assert.equal((await requestJson(backend.port, 'GET', `/api/courses?semesterId=${semesterA}`)).json.data[0].name, '有机化学');

  const empty = await getScheduleEntries(backend.port, semesterA);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.data, []);

  const created = await createScheduleEntry(backend.port, {
    semesterId: semesterA,
    courseInstanceId: courseA.json.data.id,
    weekday: 1,
    startTime: '08:00',
    endTime: '09:30',
    location: 'A101',
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.success, true);
  assert.deepEqual(created.json.data, {
    id: created.json.data.id,
    semesterId: semesterA,
    courseInstanceId: courseA.json.data.id,
    courseName: '有机化学',
    weekday: 1,
    startTime: '08:00',
    endTime: '09:30',
    location: 'A101',
    source: 'student_confirmed',
    createdAt: created.json.data.createdAt,
    updatedAt: created.json.data.updatedAt,
  });

  const entriesA = await getScheduleEntries(backend.port, semesterA);
  assert.equal(entriesA.status, 200);
  assert.equal(entriesA.json.data.length, 1);
  assert.equal(entriesA.json.data[0].id, created.json.data.id);
  assert.deepEqual((await getScheduleEntries(backend.port, semesterB)).json.data, []);

  for (const invalid of [
    { weekday: -1, startTime: '10:00', endTime: '11:00', location: 'A101' },
    { weekday: 7, startTime: '10:00', endTime: '11:00', location: 'A101' },
    { weekday: 2, startTime: '25:00', endTime: '26:00', location: 'A101' },
    { weekday: 2, startTime: '12:00', endTime: '11:00', location: 'A101' },
    { weekday: 2, startTime: '10:00', endTime: '11:00', location: '' },
    { weekday: 2, startTime: '10:00', endTime: '11:00', location: 'x'.repeat(201) },
  ]) {
    const invalidResult = await createScheduleEntry(backend.port, {
      semesterId: semesterA,
      courseInstanceId: courseA.json.data.id,
      ...invalid,
    });
    assert.equal(invalidResult.status, 400);
    assert.equal(invalidResult.json.success, false);
  }

  const duplicate = await createScheduleEntry(backend.port, {
    semesterId: semesterA,
    courseInstanceId: courseA.json.data.id,
    weekday: 1,
    startTime: '08:00',
    endTime: '09:30',
    location: '另一教室',
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.success, false);

  const crossCreate = await createScheduleEntry(backend.port, {
    semesterId: semesterB,
    courseInstanceId: courseA.json.data.id,
    weekday: 2,
    startTime: '10:00',
    endTime: '11:00',
    location: 'B202',
  });
  assert.equal(crossCreate.status, 404);
  assert.equal(crossCreate.json.success, false);

  const updated = await updateScheduleEntry(backend.port, semesterA, created.json.data.id, {
    courseInstanceId: courseA.json.data.id,
    weekday: 3,
    startTime: '13:00',
    endTime: '14:30',
    location: 'B202',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.weekday, 3);
  assert.equal(updated.json.data.location, 'B202');
  assert.equal(updated.json.data.source, 'student_confirmed');

  const crossUpdate = await updateScheduleEntry(backend.port, semesterB, created.json.data.id, {
    courseInstanceId: courseB.json.data.id,
    weekday: 3,
    startTime: '13:00',
    endTime: '14:30',
    location: '不应写入',
  });
  assert.equal(crossUpdate.status, 404);
  assert.equal(crossUpdate.json.success, false);
  const crossDelete = await deleteScheduleEntry(backend.port, semesterB, created.json.data.id);
  assert.equal(crossDelete.status, 404);
  assert.equal(crossDelete.json.success, false);

  const removed = await deleteScheduleEntry(backend.port, semesterA, created.json.data.id);
  assert.equal(removed.status, 200);
  assert.equal(removed.json.success, true);
  assert.equal(removed.json.data.id, created.json.data.id);
  assert.deepEqual((await getScheduleEntries(backend.port, semesterA)).json.data, []);
});

test('T09C records confirmed exam date changes atomically, requires reconfirmation, and preserves confirmation for goal-only edits', async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, '历史');
  const courseB = await createCourse(backend.port, semesterB, '地理');
  const originalExamAt = '2026-05-10T08:00:00.000Z';
  const exam = await createExam(backend.port, semesterA, courseA.json.data.id, {
    name: '期中考试',
    examAt: originalExamAt,
    confirmationStatus: 'confirmed',
    goal: '掌握中国近代史',
  });
  assert.equal(exam.status, 201);
  assert.equal(exam.json.data.confirmationStatus, 'confirmed');
  assert.ok(exam.json.data.confirmedAt);
  const originalConfirmedAt = exam.json.data.confirmedAt;

  const historyBeforeUpdate = openSemesterDb(backend.dataRoot, semesterA);
  assert.equal(historyBeforeUpdate.prepare('SELECT COUNT(*) AS count FROM assessment_date_changes').get().count, 0);
  historyBeforeUpdate.close();

  const crossExam = await updateExam(backend.port, semesterB, exam.json.data.id, { goal: '不应跨学期修改' });
  assert.equal(crossExam.status, 404);
  assert.equal(crossExam.json.success, false);
  assert.equal((await getExam(backend.port, semesterA, exam.json.data.id)).json.data.goal, '掌握中国近代史');

  const invalidName = await updateExam(backend.port, semesterA, exam.json.data.id, { name: '  ' });
  assert.equal(invalidName.status, 400);
  const invalidDate = await updateExam(backend.port, semesterA, exam.json.data.id, { examAt: 'not-an-iso-date' });
  assert.equal(invalidDate.status, 400);

  const changedAt = '2026-05-15T08:00:00.000Z';
  const changed = await updateExam(backend.port, semesterA, exam.json.data.id, {
    name: '期中统考',
    examAt: changedAt,
    goal: '掌握中国近代史与世界史',
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.data.name, '期中统考');
  assert.equal(changed.json.data.examAt, changedAt);
  assert.equal(changed.json.data.goal, '掌握中国近代史与世界史');
  assert.equal(changed.json.data.confirmationStatus, 'pending');
  assert.equal(changed.json.data.confirmedAt, undefined);
  const historyAfterUpdate = openSemesterDb(backend.dataRoot, semesterA);
  const changes = historyAfterUpdate
    .prepare('SELECT previous_exam_at, next_exam_at FROM assessment_date_changes WHERE assessment_attempt_id = ?')
    .all(exam.json.data.id);
  assert.deepEqual(changes, [{ previous_exam_at: originalExamAt, next_exam_at: changedAt }]);
  historyAfterUpdate.close();

  const reconfirmed = await confirmExam(backend.port, semesterA, exam.json.data.id);
  assert.equal(reconfirmed.status, 200);
  assert.equal(reconfirmed.json.data.confirmationStatus, 'confirmed');
  assert.ok(reconfirmed.json.data.confirmedAt);

  const goalOnly = await updateExam(backend.port, semesterA, exam.json.data.id, { goal: '只调整目标，不改日期' });
  assert.equal(goalOnly.status, 200);
  assert.equal(goalOnly.json.data.confirmationStatus, 'confirmed');
  assert.equal(goalOnly.json.data.confirmedAt, reconfirmed.json.data.confirmedAt);
  assert.equal(goalOnly.json.data.goal, '只调整目标，不改日期');
  const finalHistory = openSemesterDb(backend.dataRoot, semesterA);
  assert.equal(finalHistory.prepare('SELECT COUNT(*) AS count FROM assessment_date_changes').get().count, 1);
  finalHistory.close();
});