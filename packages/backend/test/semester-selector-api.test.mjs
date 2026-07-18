import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t09a-api-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const { createApp } = await import('../dist/app.js');

const unconfigured = { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null };
const configurationService = {
  getAllStatus: () => ({
    ai: unconfigured,
    smtp: unconfigured,
    feishu: unconfigured,
    runtime: { dataDir: true, aiAvailable: false, smtpAvailable: false, feishuAvailable: false, uptime: 1, nodeVersion: 'v22.test' },
  }),
  getActiveSnapshot: () => null,
  testAndActivate: async () => ({ activated: false, test: { pass: false } }),
  retest: async () => null,
};

async function startApp(t) {
  const app = createApp({
    configurationService,
    timetableRecognizer: {
      recognize: async () => ({
        text: '周一 08:00-08:45 数学 101\n周三 10:00-10:45 英语 202',
      }),
    },
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function json(base, method, pathname, body) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

function tinyPngFile() {
  return new File([
    Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00,
    ]),
  ], 'timetable.png', { type: 'image/png' });
}

async function preview(base, fields = {}) {
  const form = new FormData();
  form.set('semesterCode', fields.semesterCode ?? `sem-${crypto.randomUUID()}`);
  form.set('teachingStartDate', fields.teachingStartDate ?? '2026-02-20');
  form.set('teachingEndDate', fields.teachingEndDate ?? '2026-06-30');
  if (fields.studentName !== null) form.set('studentName', fields.studentName ?? 'Alice');
  form.set('timetableImage', tinyPngFile());
  const response = await fetch(`${base}/api/semesters/preview`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
}

test('semester current is empty before onboarding and set after preview confirmation', async (t) => {
  const base = await startApp(t);

  const before = await json(base, 'GET', '/api/semesters/current');
  assert.equal(before.status, 200);
  assert.equal(before.body.success, true);
  assert.equal(before.body.data.semester, null);

  const previewed = await preview(base, { semesterCode: '2026-spring' });
  assert.equal(previewed.status, 200);
  assert.equal(previewed.body.success, true);
  assert.equal(previewed.body.data.entries.length, 2);
  assert.equal(previewed.body.data.entries[0].weekday, 1);
  assert.equal(previewed.body.data.entries[0].courseName, '数学');

  const confirmed = await json(base, 'POST', '/api/semesters', {
    previewId: previewed.body.data.previewId,
    semesterCode: '2026-spring',
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
    studentName: 'Alice',
    entries: previewed.body.data.entries,
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.body.success, true);
  assert.equal(confirmed.body.data.current.semester.id, confirmed.body.data.semester.id);

  const current = await json(base, 'GET', '/api/semesters/current');
  assert.equal(current.body.data.semester.id, confirmed.body.data.semester.id);
  assert.equal(current.body.data.semester.semesterCode, '2026-spring');

  const courses = await json(base, 'GET', `/api/courses?semesterId=${confirmed.body.data.semester.id}`);
  assert.deepEqual(courses.body.data.map((course) => course.name), ['数学', '英语']);
});

test('semester onboarding rejects duplicate code and invalid date', async (t) => {
  const base = await startApp(t);
  const first = await preview(base, { semesterCode: 'duplicate-sem' });
  const created = await json(base, 'POST', '/api/semesters', {
    previewId: first.body.data.previewId,
    semesterCode: 'duplicate-sem',
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
    studentName: 'Alice',
    entries: first.body.data.entries,
  });
  assert.equal(created.status, 201);

  const duplicatePreview = await preview(base, { semesterCode: 'duplicate-sem' });
  assert.equal(duplicatePreview.status, 409);
  assert.equal(duplicatePreview.body.error.code, 'SEMESTER_CODE_EXISTS');

  const badDate = await preview(base, { semesterCode: 'bad-date-sem', teachingStartDate: '2026-02-30' });
  assert.equal(badDate.status, 400);
  assert.equal(badDate.body.error.code, 'INVALID_DATE');
});

test('selecting current semester switches API isolation explicitly', async (t) => {
  const base = await startApp(t);

  async function createSemester(semesterCode) {
    const p = await preview(base, { semesterCode });
    const c = await json(base, 'POST', '/api/semesters', {
      previewId: p.body.data.previewId,
      semesterCode,
      teachingStartDate: '2026-02-20',
      teachingEndDate: '2026-06-30',
      studentName: 'Alice',
      entries: p.body.data.entries.map((entry) => ({ ...entry, courseName: `${entry.courseName}-${semesterCode}` })),
    });
    assert.equal(c.status, 201);
    return c.body.data.semester.id;
  }

  const firstId = await createSemester('switch-a');
  const secondId = await createSemester('switch-b');

  const switched = await json(base, 'PUT', '/api/semesters/current', { semesterId: firstId });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.data.semester.id, firstId);

  const firstCourses = await json(base, 'GET', `/api/courses?semesterId=${firstId}`);
  const secondCourses = await json(base, 'GET', `/api/courses?semesterId=${secondId}`);
  assert.deepEqual(firstCourses.body.data.map((course) => course.name).sort(), ['数学-switch-a', '英语-switch-a'].sort());
  assert.deepEqual(secondCourses.body.data.map((course) => course.name).sort(), ['数学-switch-b', '英语-switch-b'].sort());
});
