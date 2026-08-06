import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.AI_PROVIDERS = '';
const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t06b-runner-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const { initializeSemester } = await import('../dist/db/semester-initializer.js');
const { openGlobalDb } = await import('../dist/db/connection.js');
const { ParentReportDeliveryRunner } = await import('../dist/scripts/parent-report-runner.js');

function createSemester() {
  return initializeSemester(
    {
      studentName: '测试学生',
      semesterCode: `t06b-runner-${crypto.randomUUID()}`,
      teachingStartDate: '2026-02-20',
      teachingEndDate: '2026-07-10',
    },
    { appDataRoot: dataRoot }
  );
}

function updateSemester(semesterId, status) {
  const db = openGlobalDb();
  try {
    db.prepare('UPDATE semesters SET status = ?, ready = 1 WHERE id = ?').run(status, semesterId);
  } finally {
    db.close();
  }
}

function updateAllSemesters(status, ready = 0) {
  const db = openGlobalDb();
  try {
    db.prepare('UPDATE semesters SET status = ?, ready = ?').run(status, ready);
  } finally {
    db.close();
  }
}

function fakeDelivery(calls) {
  return {
    async retryDue(input) {
      calls.push(['retryDue', input]);
      return [];
    },
    async deliver(input) {
      calls.push(['deliver', input]);
      return { reportKey: `report:${input.reportDate}`, snapshotCreated: true, channels: {} };
    },
  };
}

test('T06B runner 在 Asia/Shanghai 22:30 选择唯一 ready active 学期，先处理到期重试后创建当日批次', async () => {
  const semester = createSemester();
  const calls = [];
  const runner = new ParentReportDeliveryRunner({
    now: () => new Date('2026-05-31T14:30:00.000Z'),
    deliveryService: fakeDelivery(calls),
  });

  const result = await runner.run();
  assert.equal(result.status, 'delivered');
  assert.equal(result.reportDate, '2026-05-31');
  assert.deepEqual(calls, [
    ['retryDue', { semesterId: semester.semesterId }],
    ['deliver', { semesterId: semester.semesterId, reportDate: '2026-05-31' }],
  ]);
});

test('T06B runner 无唯一 active 学期时不生成新报告，follow_up 学期不进入自动批次', async () => {
  updateAllSemesters('follow_up', 0);
  const semester = createSemester();
  updateSemester(semester.semesterId, 'follow_up');
  const calls = [];
  const runner = new ParentReportDeliveryRunner({
    now: () => new Date('2026-06-01T14:31:00.000Z'),
    deliveryService: fakeDelivery(calls),
  });

  const result = await runner.run();
  assert.equal(result.status, 'no_active_semester');
  assert.deepEqual(calls, [['retryDue', { semesterId: semester.semesterId }]]);
});

test('T06B runner 在登录/StartWhenAvailable 的早于 22:30 触发中只补发最近一个错过日期', async () => {
  const semester = createSemester();
  const calls = [];
  const runner = new ParentReportDeliveryRunner({
    now: () => new Date('2026-06-02T14:29:00.000Z'),
    deliveryService: fakeDelivery(calls),
  });

  const result = await runner.run({ semesterId: semester.semesterId });
  assert.equal(result.status, 'delivered');
  assert.equal(result.reportDate, '2026-06-01');
  assert.deepEqual(calls, [
    ['retryDue', { semesterId: semester.semesterId }],
    ['deliver', { semesterId: semester.semesterId, reportDate: '2026-06-01' }],
  ]);
});

test('T06B runner 在同一次运行内按 5 秒、30 秒退避只重试失败渠道', async () => {
  const semester = createSemester();
  const calls = [];
  const waits = [];
  let nowMs = Date.parse('2026-06-03T14:30:00.000Z');
  let retryAttempt = 0;
  const failedAt5Seconds = {
    reportKey: 'report:2026-06-03',
    snapshotCreated: false,
    channels: { smtp: { status: 'failed', nextRetryAt: '2026-06-03T14:30:05.000Z' }, feishu: { status: 'sent' } },
  };
  const failedAt30Seconds = {
    reportKey: 'report:2026-06-03',
    snapshotCreated: false,
    channels: { smtp: { status: 'failed', nextRetryAt: '2026-06-03T14:30:35.000Z' }, feishu: { status: 'sent' } },
  };
  const settled = {
    reportKey: 'report:2026-06-03',
    snapshotCreated: false,
    channels: { smtp: { status: 'sent' }, feishu: { status: 'sent' } },
  };
  const runner = new ParentReportDeliveryRunner({
    now: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      nowMs += milliseconds;
    },
    deliveryService: {
      async retryDue(input) {
        calls.push(['retryDue', input]);
        retryAttempt += 1;
        if (retryAttempt === 1) return [];
        if (retryAttempt === 2) return [failedAt30Seconds];
        return [settled];
      },
      async deliver(input) {
        calls.push(['deliver', input]);
        return failedAt5Seconds;
      },
    },
  });

  const result = await runner.run({ semesterId: semester.semesterId });
  assert.equal(result.status, 'delivered');
  assert.deepEqual(waits, [5_000, 30_000]);
  assert.deepEqual(calls, [
    ['retryDue', { semesterId: semester.semesterId }],
    ['deliver', { semesterId: semester.semesterId, reportDate: '2026-06-03' }],
    ['retryDue', { semesterId: semester.semesterId }],
    ['retryDue', { semesterId: semester.semesterId }],
  ]);
});

test('T06B runner 有多个 ready active 学期时拒绝自动投递，避免跨学期重复发送', async () => {
  updateAllSemesters('follow_up', 0);
  const first = createSemester();
  const second = createSemester();
  const calls = [];
  const runner = new ParentReportDeliveryRunner({
    now: () => new Date('2026-06-03T14:31:00.000Z'),
    deliveryService: fakeDelivery(calls),
  });

  const result = await runner.run();
  assert.equal(result.status, 'ambiguous_active_semester');
  assert.deepEqual(calls, [
    ['retryDue', { semesterId: first.semesterId }],
    ['retryDue', { semesterId: second.semesterId }],
  ]);
});
