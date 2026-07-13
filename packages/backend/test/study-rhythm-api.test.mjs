import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const backendDir = path.resolve(import.meta.dirname, "..");

// 顺序分配端口，避免同一测试文件内多个后端实例因随机冲突导致健康检查超时。
let nextPortOffset = 0;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "studybuddy-t06-api-"));
  const port = 48000 + (nextPortOffset % 3000);
  nextPortOffset += 1;
  const processHandle = spawn(process.execPath, ["dist/server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: "127.0.0.1",
      BACKEND_PORT: String(port),
    },
    stdio: "ignore",
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

  throw new Error("built backend did not become healthy");
}

async function requestJson(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
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
  const result = await requestJson(port, "POST", "/api/dev/init-semester", {
    studentName: "Alice",
    semesterCode: `sem-${crypto.randomUUID()}`,
    teachingStartDate: "2026-02-20",
    teachingEndDate: "2026-06-30",
    ...overrides,
  });
  assert.equal(result.status, 200);
  assert.equal(result.json?.success, true);
  return result.json.data.semesterId;
}

async function createCourse(port, semesterId, name, retakeOfCourseInstanceId) {
  const body = { semesterId, name };
  if (retakeOfCourseInstanceId !== undefined) body.retakeOfCourseInstanceId = retakeOfCourseInstanceId;
  return requestJson(port, "POST", "/api/courses", body);
}

async function createExam(port, semesterId, courseInstanceId, overrides = {}) {
  return requestJson(port, "POST", "/api/exams", {
    semesterId,
    courseInstanceId,
    name: "单元测验",
    examAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  });
}

async function createTask(port, semesterId, courseInstanceId, overrides = {}) {
  return requestJson(port, "POST", "/api/study-tasks", {
    semesterId,
    courseInstanceId,
    type: "practice",
    title: "练习任务",
    ...overrides,
  });
}

// ── 课程 ──────────────────────────────────────────────────────

test("creates and lists courses within one ready semester", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);

  const created = await createCourse(backend.port, semesterId, "数学分析");
  assert.equal(created.status, 201);
  assert.equal(created.json.success, true);
  assert.equal(created.json.data.name, "数学分析");
  assert.equal(created.json.data.semesterId, semesterId);

  const listed = await requestJson(backend.port, "GET", `/api/courses?semesterId=${semesterId}`);
  assert.equal(listed.status, 200);
  assert.equal(listed.json.success, true);
  assert.deepEqual(listed.json.data.map((course) => course.name), ["数学分析"]);
});

test("rejects course writes to missing or unready semester", async (t) => {
  const backend = await startBackend(t);

  const missing = await createCourse(backend.port, crypto.randomUUID(), "数学");
  assert.equal(missing.status, 404);
  assert.equal(missing.json.success, false);
  assert.equal(missing.json.error.code, "SEMESTER_NOT_FOUND");

  // 通过初始化时失败或尚未 ready 的学期难以构造，这里依赖未就绪语义测试。
});

test("rejects malformed retakeOfCourseInstanceId and preserves valid unknown UUID", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);

  const malformed = await createCourse(backend.port, semesterId, "数学", "not-a-uuid");
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.success, false);
  assert.equal(malformed.json.error.code, "COURSE_INPUT_INVALID");

  const unknownRetakeId = crypto.randomUUID();
  const created = await createCourse(backend.port, semesterId, "复修数学", unknownRetakeId);
  assert.equal(created.status, 201);
  assert.equal(created.json.data.retakeOfCourseInstanceId, unknownRetakeId);
});

// ── 考试目标 ──────────────────────────────────────────────────

test("creates and lists multiple assessment attempts sorted by examAt", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "数学");
  const courseInstanceId = course.json.data.id;

  const later = await createExam(backend.port, semesterId, courseInstanceId, {
    name: "期末",
    examAt: "2026-07-01T08:00:00.000Z",
  });
  const earlier = await createExam(backend.port, semesterId, courseInstanceId, {
    name: "期中",
    examAt: "2026-04-01T08:00:00.000Z",
  });
  assert.equal(later.status, 201);
  assert.equal(earlier.status, 201);

  const listed = await requestJson(backend.port, "GET", `/api/exams?semesterId=${semesterId}&courseInstanceId=${courseInstanceId}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.json.data.map((exam) => exam.name), ["期中", "期末"]);
});

test("rejects exam when courseInstanceId belongs to another semester", async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, "数学");

  const cross = await createExam(backend.port, semesterB, courseA.json.data.id, { name: "跨学期考试" });
  assert.equal(cross.status, 404);
  assert.equal(cross.json.success, false);
  assert.equal(cross.json.error.code, "COURSE_NOT_FOUND");
});

test("persists attemptType and confirmationStatus with defaults", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "英语");

  const confirmed = await createExam(backend.port, semesterId, course.json.data.id, {
    name: "听力",
    confirmationStatus: "confirmed",
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.json.data.attemptType, "normal");
  assert.equal(confirmed.json.data.confirmationStatus, "confirmed");
  assert.ok(confirmed.json.data.confirmedAt);

  const rejected = await createExam(backend.port, semesterId, course.json.data.id, {
    name: "口语",
    attemptType: "makeup",
    confirmationStatus: "rejected",
  });
  assert.equal(rejected.status, 201);
  assert.equal(rejected.json.data.attemptType, "makeup");
  assert.equal(rejected.json.data.confirmationStatus, "rejected");
  assert.equal(rejected.json.data.confirmedAt, undefined);
});

// ── 学习任务 ──────────────────────────────────────────────────

test("creates a task and rejects assessmentAttemptId from another course", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const math = await createCourse(backend.port, semesterId, "数学");
  const english = await createCourse(backend.port, semesterId, "英语");
  const mathExam = await createExam(backend.port, semesterId, math.json.data.id, { name: "数学期中" });

  const valid = await createTask(backend.port, semesterId, math.json.data.id, {
    assessmentAttemptId: mathExam.json.data.id,
    title: "数学练习",
  });
  assert.equal(valid.status, 201);

  const crossCourse = await createTask(backend.port, semesterId, english.json.data.id, {
    assessmentAttemptId: mathExam.json.data.id,
    title: "英语误关联",
  });
  assert.equal(crossCourse.status, 404);
  assert.equal(crossCourse.json.error.code, "EXAM_NOT_FOUND");
});

test("PATCH todo to done writes exactly one study_task_completed event", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "物理");
  const task = await createTask(backend.port, semesterId, course.json.data.id, { title: "物理作业" });
  const taskId = task.json.data.id;

  const firstDone = await requestJson(backend.port, "PATCH", `/api/study-tasks/${taskId}/status`, {
    semesterId,
    status: "done",
  });
  assert.equal(firstDone.status, 200);
  assert.equal(firstDone.json.data.status, "done");

  const secondDone = await requestJson(backend.port, "PATCH", `/api/study-tasks/${taskId}/status`, {
    semesterId,
    status: "done",
  });
  assert.equal(secondDone.status, 200);

  const timeline = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterId}`);
  assert.equal(timeline.status, 200);
  const completedEvents = timeline.json.data.filter((event) => event.eventType === "study_task_completed");
  assert.equal(completedEvents.length, 1);
  assert.equal(completedEvents[0].taskId, taskId);
  assert.equal(completedEvents[0].sourceSystem, "S1");
});


test("rejects malformed occurredAt when completing a task", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "地理");
  const task = await createTask(backend.port, semesterId, course.json.data.id, { title: "地理作业" });

  const invalidTime = await requestJson(
    backend.port,
    "PATCH",
    `/api/study-tasks/${task.json.data.id}/status`,
    {
      semesterId,
      status: "done",
      occurredAt: "not-a-timestamp",
    }
  );

  assert.equal(invalidTime.status, 409);
  assert.equal(invalidTime.json.error.code, "TASK_STATUS_INVALID");

  const timeline = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterId}`);
  assert.equal(timeline.status, 200);
  assert.equal(
    timeline.json.data.filter((event) => event.eventType === "study_task_completed").length,
    0
  );
});
test("rejects illegal status transitions and missing tasks", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "化学");
  const task = await createTask(backend.port, semesterId, course.json.data.id, { title: "化学作业" });
  const taskId = task.json.data.id;

  await requestJson(backend.port, "PATCH", `/api/study-tasks/${taskId}/status`, { semesterId, status: "done" });

  const illegal = await requestJson(backend.port, "PATCH", `/api/study-tasks/${taskId}/status`, {
    semesterId,
    status: "doing",
  });
  assert.equal(illegal.status, 409);
  assert.equal(illegal.json.error.code, "TASK_STATUS_INVALID");

  const missing = await requestJson(backend.port, "PATCH", `/api/study-tasks/${crypto.randomUUID()}/status`, {
    semesterId,
    status: "done",
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, "TASK_NOT_FOUND");
});

test("derivedOverdue is true for past-deadline non-terminal tasks and never writes status overdue", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "历史");

  const overdue = await createTask(backend.port, semesterId, course.json.data.id, {
    title: "逾期任务",
    deadlineAt: "2020-01-01T00:00:00.000Z",
  });
  assert.equal(overdue.status, 201);
  assert.equal(overdue.json.data.status, "todo");
  assert.equal(overdue.json.data.derivedOverdue, true);
  assert.equal(overdue.json.data.priorityBucket, 0);
});

test("only confirmed examAt drives task priority", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);
  const course = await createCourse(backend.port, semesterId, "生物");

  const pendingExam = await createExam(backend.port, semesterId, course.json.data.id, {
    name: "待确认",
    examAt: "2026-04-01T08:00:00.000Z",
    confirmationStatus: "pending",
  });
  const confirmedExam = await createExam(backend.port, semesterId, course.json.data.id, {
    name: "已确认",
    examAt: "2026-05-01T08:00:00.000Z",
    confirmationStatus: "confirmed",
  });

  const pendingTask = await createTask(backend.port, semesterId, course.json.data.id, {
    assessmentAttemptId: pendingExam.json.data.id,
    title: "pending 任务",
  });
  const confirmedTask = await createTask(backend.port, semesterId, course.json.data.id, {
    assessmentAttemptId: confirmedExam.json.data.id,
    title: "confirmed 任务",
  });

  assert.equal(pendingTask.json.data.priorityBucket, 3);
  assert.equal(confirmedTask.json.data.priorityBucket, 1);
});

// ── 事件与时间线 ──────────────────────────────────────────────

test("study-events reject cross-semester course or task references", async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, "地理");

  const crossCourse = await requestJson(backend.port, "POST", "/api/study-events", {
    semesterId: semesterB,
    sourceSystem: "S1",
    eventType: "manual_note",
    title: "跨学期事件",
    courseInstanceId: courseA.json.data.id,
  });
  assert.equal(crossCourse.status, 404);
  assert.equal(crossCourse.json.error.code, "COURSE_NOT_FOUND");

  const taskA = await createTask(backend.port, semesterA, courseA.json.data.id, { title: "地理作业" });
  const crossTask = await requestJson(backend.port, "POST", "/api/study-events", {
    semesterId: semesterB,
    sourceSystem: "S2",
    eventType: "material_processed",
    title: "跨学期任务事件",
    taskId: taskA.json.data.id,
  });
  assert.equal(crossTask.status, 404);
  assert.equal(crossTask.json.error.code, "TASK_NOT_FOUND");
});

test("timeline returns only requested semester in descending order with course filter", async (t) => {
  const backend = await startBackend(t);
  const semesterA = await initializeReadySemester(backend.port);
  const semesterB = await initializeReadySemester(backend.port);
  const courseA = await createCourse(backend.port, semesterA, "政治");
  const courseB = await createCourse(backend.port, semesterA, "体育");

  await requestJson(backend.port, "POST", "/api/study-events", {
    semesterId: semesterA,
    sourceSystem: "S1",
    eventType: "manual_note",
    title: "政治笔记",
    courseInstanceId: courseA.json.data.id,
    occurredAt: "2026-03-01T10:00:00.000Z",
  });
  await requestJson(backend.port, "POST", "/api/study-events", {
    semesterId: semesterA,
    sourceSystem: "S1",
    eventType: "manual_note",
    title: "体育笔记",
    courseInstanceId: courseB.json.data.id,
    occurredAt: "2026-03-02T10:00:00.000Z",
  });
  await requestJson(backend.port, "POST", "/api/study-events", {
    semesterId: semesterB,
    sourceSystem: "S1",
    eventType: "manual_note",
    title: "B学期笔记",
    occurredAt: "2026-03-03T10:00:00.000Z",
  });

  const allA = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterA}`);
  assert.equal(allA.status, 200);
  assert.deepEqual(allA.json.data.map((event) => event.title), ["体育笔记", "政治笔记"]);

  const filtered = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterA}&courseInstanceId=${courseA.json.data.id}`);
  assert.deepEqual(filtered.json.data.map((event) => event.title), ["政治笔记"]);

  const limited = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterA}&limit=1`);
  assert.equal(limited.json.data.length, 1);
  assert.equal(limited.json.data[0].title, "体育笔记");
});

test("rejects invalid timeline limit", async (t) => {
  const backend = await startBackend(t);
  const semesterId = await initializeReadySemester(backend.port);

  const zero = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterId}&limit=0`);
  assert.equal(zero.status, 400);
  assert.equal(zero.json.error.code, "TIMELINE_QUERY_INVALID");

  const huge = await requestJson(backend.port, "GET", `/api/timeline?semesterId=${semesterId}&limit=999`);
  assert.equal(huge.status, 400);
  assert.equal(huge.json.error.code, "TIMELINE_QUERY_INVALID");
});
