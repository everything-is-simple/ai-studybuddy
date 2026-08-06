import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
let nextPortOffset = 0;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t09b-api-'));
  const port = 56000 + (nextPortOffset % 2000);
  nextPortOffset += 1;
  const processHandle = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: { ...process.env, APP_DATA_ROOT: dataRoot, BACKEND_HOST: '127.0.0.1', BACKEND_PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(async () => {
    processHandle.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return { port, dataRoot };
    } catch {
      // 等待后端监听。
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

async function initializeReadySemester(port, semesterCode) {
  const result = await requestJson(port, 'POST', '/api/dev/init-semester', {
    studentName: 'Alice',
    semesterCode,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
  });
  assert.equal(result.status, 200);
  return result.json.data.semesterId;
}

async function createCourse(port, semesterId, name) {
  const result = await requestJson(port, 'POST', '/api/courses', { semesterId, name });
  assert.equal(result.status, 201);
  return result.json.data;
}

async function createTask(port, semesterId, courseInstanceId, title, deadlineAt) {
  const result = await requestJson(port, 'POST', '/api/study-tasks', {
    semesterId,
    courseInstanceId,
    type: 'practice',
    title,
    deadlineAt,
  });
  assert.equal(result.status, 201);
  return result.json.data;
}

async function createAndConfirmExam(port, semesterId, courseInstanceId, name, examAt) {
  const created = await requestJson(port, 'POST', '/api/exams', {
    semesterId,
    courseInstanceId,
    name,
    attemptType: 'normal',
    examAt,
  });
  assert.equal(created.status, 201);
  const confirmed = await requestJson(port, 'PATCH', `/api/exams/${created.json.data.id}/confirmation`, { semesterId });
  assert.equal(confirmed.status, 200);
  return confirmed.json.data;
}

function seedTomorrowScheduleAndFailedMaterial(dataRoot, semesterId, courseInstanceId) {
  const db = new Database(path.join(dataRoot, 'semesters', semesterId, 'semester.db'));
  try {
    const now = '2026-05-10T08:00:00.000Z';
    const scheduleId = crypto.randomUUID();
    const materialId = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO schedule_entries (id, course_instance_id, weekday, start_time, end_time, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(scheduleId, courseInstanceId, 1, '08:00', '09:40', '教学楼 A-101', now, now);
    db.prepare(
      `
      INSERT INTO materials (
        id, course_instance_id, file_type, storage_key, status, original_filename, title,
        file_size_bytes, created_at, updated_at
      ) VALUES (?, ?, 'pdf', ?, 'conversion_failed', ?, ?, 12, ?, ?)
    `
    ).run(
      materialId,
      courseInstanceId,
      `semesters/${semesterId}/files/${crypto.randomUUID()}.pdf`,
      '失败讲义.pdf',
      '失败讲义',
      now,
      now
    );
    return { scheduleId, materialId };
  } finally {
    db.close();
  }
}

test('daily study home aggregates only the requested ready semester and never writes data', async (t) => {
  const backend = await startBackend(t);
  const primarySemesterId = await initializeReadySemester(backend.port, `spring-${crypto.randomUUID()}`);
  const otherSemesterId = await initializeReadySemester(backend.port, `autumn-${crypto.randomUUID()}`);
  const primaryCourse = await createCourse(backend.port, primarySemesterId, '数学');
  const otherCourse = await createCourse(backend.port, otherSemesterId, '英语');
  const task = await createTask(
    backend.port,
    primarySemesterId,
    primaryCourse.id,
    '完成函数练习',
    '2026-05-10T20:00:00.000Z'
  );
  await createTask(backend.port, otherSemesterId, otherCourse.id, '不应泄漏的英语任务', '2026-05-10T08:00:00.000Z');
  const exam = await createAndConfirmExam(
    backend.port,
    primarySemesterId,
    primaryCourse.id,
    '高数期中',
    '2026-05-12T08:00:00.000Z'
  );

  const beforeTasks = await requestJson(backend.port, 'GET', `/api/study-tasks?semesterId=${primarySemesterId}`);
  const result = await requestJson(
    backend.port,
    'GET',
    `/api/daily-study-home?semesterId=${primarySemesterId}&date=2026-05-10`
  );
  const afterTasks = await requestJson(backend.port, 'GET', `/api/study-tasks?semesterId=${primarySemesterId}`);

  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.deepEqual(result.json.data, {
    semesterId: primarySemesterId,
    date: '2026-05-10',
    todayTasks: [
      {
        id: task.id,
        title: '完成函数练习',
        courseName: '数学',
        deadlineAt: '2026-05-10T20:00:00.000Z',
        type: 'practice',
      },
    ],
    tomorrowTasks: [],
    tomorrowSchedule: [],
    upcomingExams: [
      { id: exam.id, name: '高数期中', courseName: '数学', examAt: '2026-05-12T08:00:00.000Z', daysUntil: 2 },
    ],
    pendingQualityMaterials: [],
    errorReviews: [],
    nextAction: { kind: 'today_task', title: '完成函数练习', path: `/courses/${primaryCourse.id}` },
  });
  assert.deepEqual(afterTasks.json.data, beforeTasks.json.data, '首页读取不得写入或改变任务');
});

test('daily study home exposes existing tomorrow schedule and conversion-failed material facts', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port, `spring-${crypto.randomUUID()}`);
  const course = await createCourse(backend.port, semesterId, '物理');
  const { scheduleId, materialId } = seedTomorrowScheduleAndFailedMaterial(backend.dataRoot, semesterId, course.id);

  const result = await requestJson(
    backend.port,
    'GET',
    `/api/daily-study-home?semesterId=${semesterId}&date=2026-05-10`
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data.tomorrowSchedule, [
    {
      id: scheduleId,
      courseInstanceId: course.id,
      courseName: '物理',
      startTime: '08:00',
      endTime: '09:40',
      location: '教学楼 A-101',
    },
  ]);
  assert.deepEqual(result.json.data.pendingQualityMaterials, [
    {
      id: materialId,
      courseInstanceId: course.id,
      courseName: '物理',
      title: '失败讲义',
      status: 'conversion_failed',
    },
  ]);
});

test('daily study home rejects malformed semesterId and non-calendar date', async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port, `spring-${crypto.randomUUID()}`);

  const malformedSemester = await requestJson(
    backend.port,
    'GET',
    '/api/daily-study-home?semesterId=not-a-uuid&date=2026-05-10'
  );
  const malformedDate = await requestJson(
    backend.port,
    'GET',
    `/api/daily-study-home?semesterId=${semesterId}&date=2026-02-30`
  );

  assert.equal(malformedSemester.status, 404);
  assert.equal(malformedSemester.json.success, false);
  assert.equal(malformedSemester.json.error.code, 'SEMESTER_NOT_FOUND');
  assert.equal(malformedDate.status, 400);
  assert.equal(malformedDate.json.success, false);
  assert.equal(malformedDate.json.error.code, 'INVALID_DATE');
});
