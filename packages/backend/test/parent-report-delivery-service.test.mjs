import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.AI_PROVIDERS = '';
const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t06b-delivery-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const { initializeSemester } = await import('../dist/db/semester-initializer.js');
const { openExistingDbAtPath } = await import('../dist/db/connection.js');
const { ParentReportDeliveryService } = await import('../dist/services/parent-report-delivery-service.js');
const { getSemesterParentReportArchiveDir } = await import('../dist/db/paths.js');

function createReadySemester() {
  return initializeSemester(
    {
      studentName: '测试学生',
      semesterCode: `t06b-${crypto.randomUUID()}`,
      teachingStartDate: '2026-02-20',
      teachingEndDate: '2026-07-10',
    },
    { appDataRoot: dataRoot }
  );
}

function createReport(input) {
  const reminderCount = input.reportType === 'exam_reminder' ? 1 : 0;
  return {
    reportKey: `${input.reportType}:${input.periodStart}:${input.periodEnd}`,
    reportType: input.reportType,
    period: { startDate: input.periodStart, endDate: input.periodEnd },
    generatedAt: '2026-05-31T14:30:00.000Z',
    ruleReport: {
      status: 'ok',
      summary: '已汇总本周期学习事实。',
      sections: [
        {
          kind: input.reportType === 'exam_reminder' ? 'exam_reminder' : 'study_rhythm',
          title: input.reportType === 'exam_reminder' ? '考前提醒' : '学习节奏',
          summary: '学习 <进步> & "稳定"',
          metrics: {
            oneDayReminders: reminderCount,
            threeDayReminders: 0,
            sevenDayReminders: 0,
            visibleEvents: 2,
          },
          privacyLevel: 'aggregate_only',
        },
      ],
    },
    aiSummary: { status: 'not_requested' },
  };
}

function createGenerator(calls) {
  return {
    async generateReport(input) {
      calls.push({ ...input });
      return createReport(input);
    },
  };
}

function withSemesterDb(semester, callback) {
  const db = openExistingDbAtPath(semester.semesterDbPath);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

test('T06B 冻结 report:<date> 快照、周日月末合并一次并按渠道去重', async () => {
  const semester = createReadySemester();
  const generated = [];
  const sent = [];
  let now = '2026-05-31T14:30:00.000Z';
  const service = new ParentReportDeliveryService({
    now: () => now,
    reportGenerator: createGenerator(generated),
    channels: [
      {
        channel: 'smtp',
        isConfigured: () => true,
        send: async (payload) => sent.push(payload),
      },
      {
        channel: 'feishu',
        isConfigured: () => true,
        send: async (payload) => sent.push(payload),
      },
    ],
  });

  const first = await service.deliver({ semesterId: semester.semesterId, reportDate: '2026-05-31' });
  assert.equal(first.reportKey, 'report:2026-05-31');
  assert.deepEqual(
    generated.map((item) => [item.reportType, item.periodStart, item.periodEnd]),
    [
      ['daily', '2026-05-31', '2026-05-31'],
      ['weekly', '2026-05-25', '2026-05-31'],
      ['monthly', '2026-05-01', '2026-05-31'],
      ['exam_reminder', '2026-05-31', '2026-05-31'],
    ]
  );
  assert.equal(sent.length, 2);
  assert.match(sent.find((item) => item.channel === 'smtp').html, /&lt;进步&gt; &amp; &quot;稳定&quot;/);
  assert.doesNotMatch(sent.find((item) => item.channel === 'smtp').html, /学习 <进步>/);
  assert.equal(sent.find((item) => item.channel === 'feishu').card.card.header.title.content, '学习日报');

  const second = await service.deliver({ semesterId: semester.semesterId, reportDate: '2026-05-31' });
  assert.equal(second.channels.smtp.status, 'deduplicated');
  assert.equal(second.channels.feishu.status, 'deduplicated');
  assert.equal(generated.length, 4, '同一 report_key 必须复用冻结快照，不得重新统计');
  assert.equal(sent.length, 2, '成功渠道不得再次发送');

  withSemesterDb(semester, (db) => {
    const snapshot = db.prepare('SELECT report_key, content_json, content_hash FROM parent_reports').get();
    assert.equal(snapshot.report_key, 'report:2026-05-31');
    assert.match(snapshot.content_hash, /^[a-f0-9]{16}$/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM report_deliveries WHERE status = 'sent'").get().count, 2);
  });
});

test('T06B 渠道失败隔离、脱敏失败摘要和到期后单渠道重试', async () => {
  const semester = createReadySemester();
  const generated = [];
  const sent = [];
  let now = '2026-06-02T14:30:00.000Z';
  let smtpAttempts = 0;
  const SECRET = 'smtp://parent@example.test/authorization-code-DO-NOT-LEAK';
  const service = new ParentReportDeliveryService({
    now: () => now,
    reportGenerator: createGenerator(generated),
    channels: [
      {
        channel: 'smtp',
        isConfigured: () => true,
        send: async () => {
          smtpAttempts += 1;
          if (smtpAttempts === 1) throw new Error(SECRET);
          sent.push('smtp');
        },
      },
      {
        channel: 'feishu',
        isConfigured: () => true,
        send: async () => sent.push('feishu'),
      },
    ],
  });

  const first = await service.deliver({ semesterId: semester.semesterId, reportDate: '2026-06-02' });
  assert.equal(first.channels.smtp.status, 'failed');
  assert.equal(first.channels.smtp.nextRetryAt, '2026-06-02T14:30:05.000Z');
  assert.equal(first.channels.feishu.status, 'sent');
  assert.deepEqual(sent, ['feishu']);
  assert.doesNotMatch(JSON.stringify(first), /authorization-code|parent@example|smtp:\/\//);

  withSemesterDb(semester, (db) => {
    const row = db.prepare("SELECT status, error_summary FROM report_deliveries WHERE channel = 'smtp'").get();
    assert.deepEqual(row, { status: 'failed', error_summary: 'SMTP_SEND_FAILED' });
  });

  const generatedBeforeRetry = generated.length;
  now = '2026-06-02T14:30:06.000Z';
  const retry = await service.deliver({ semesterId: semester.semesterId, reportDate: '2026-06-02' });
  assert.equal(retry.channels.smtp.status, 'sent');
  assert.equal(retry.channels.feishu.status, 'deduplicated');
  assert.equal(generated.length, generatedBeforeRetry, '失败重试只能读取原冻结快照');
  assert.deepEqual(sent, ['feishu', 'smtp']);
});

test('T06B 未配置渠道跳过，不创建发送记录也不泄漏渠道地址', async () => {
  const semester = createReadySemester();
  const service = new ParentReportDeliveryService({
    now: () => '2026-06-03T14:30:00.000Z',
    reportGenerator: createGenerator([]),
    channels: [
      { channel: 'smtp', isConfigured: () => false, send: async () => assert.fail('must not send') },
      { channel: 'feishu', isConfigured: () => false, send: async () => assert.fail('must not send') },
    ],
  });

  const result = await service.deliver({ semesterId: semester.semesterId, reportDate: '2026-06-03' });
  assert.equal(result.channels.smtp.status, 'skipped_unconfigured');
  assert.equal(result.channels.feishu.status, 'skipped_unconfigured');
  withSemesterDb(semester, (db) => {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM report_deliveries').get().count, 0);
  });
});


test('T06B retryDue 恢复过期 sending 租约，只重试未成功渠道且复用冻结快照', async () => {
  const semester = createReadySemester();
  const generated = [];
  const initial = new ParentReportDeliveryService({
    now: () => '2026-06-04T14:30:00.000Z',
    reportGenerator: createGenerator(generated),
    channels: [
      { channel: 'smtp', isConfigured: () => true, send: async () => {} },
      { channel: 'feishu', isConfigured: () => true, send: async () => {} },
    ],
  });
  await initial.deliver({ semesterId: semester.semesterId, reportDate: '2026-06-04' });
  const generatedBeforeRetry = generated.length;
  withSemesterDb(semester, (db) => {
    db.prepare(
      `UPDATE report_deliveries
       SET status = 'sending', sent_at = NULL, lease_expires_at = '2026-06-04T14:29:59.000Z'
       WHERE report_key = 'report:2026-06-04' AND channel = 'smtp'`
    ).run();
  });

  const retried = [];
  const recovery = new ParentReportDeliveryService({
    now: () => '2026-06-04T14:30:00.000Z',
    reportGenerator: createGenerator(generated),
    channels: [
      { channel: 'smtp', isConfigured: () => true, send: async () => retried.push('smtp') },
      { channel: 'feishu', isConfigured: () => true, send: async () => retried.push('feishu') },
    ],
  });
  const results = await recovery.retryDue({ semesterId: semester.semesterId });
  assert.equal(results.length, 1);
  assert.equal(results[0].channels.smtp.status, 'sent');
  assert.equal(results[0].channels.feishu.status, 'deduplicated');
  assert.deepEqual(retried, ['smtp']);
  assert.equal(generated.length, generatedBeforeRetry);
});

test('T06B migration 从真实 v6 形态补齐缺失的快照与投递表及恢复字段', async () => {
  const { openDbAtPath } = await import('../dist/db/connection.js');
  const { migrateSemesterDb, getAppliedVersion } = await import('../dist/db/migrations.js');
  const legacyPath = path.join(dataRoot, `legacy-${crypto.randomUUID()}.db`);
  const db = openDbAtPath(legacyPath);
  try {
    // v1-v6 从未创建 T06B 的两张表；真实升级库只会留下 v6 migration 记录。
    db.exec(`
      CREATE TABLE schema_migrations (scope TEXT NOT NULL, version INTEGER NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY(scope, version));
      INSERT INTO schema_migrations(scope, version, applied_at) VALUES ('semester', 6, '2026-06-01T00:00:00.000Z');
    `);
    migrateSemesterDb(db);
    assert.equal(getAppliedVersion(db, 'semester'), 8);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'parent_reports'").get());
    const columns = db.pragma('table_info(report_deliveries)').map((column) => column.name);
    for (const column of ['report_key', 'channel', 'status', 'sent_at', 'error_summary', 'attempt_count', 'last_attempt_at', 'next_retry_at', 'updated_at', 'lease_expires_at', 'created_at']) assert.ok(columns.includes(column));
    assert.equal(db.pragma('foreign_key_list(report_deliveries)').some((foreignKey) => foreignKey.table === 'parent_reports' && foreignKey.from === 'report_key'), true);
  } finally {
    db.close();
  }
});
test('T06B 每渠道三次自动尝试后停止跨运行重试，并保留脱敏失败留档', async () => {
  const semester = createReadySemester();
  let now = '2026-06-06T14:30:00.000Z';
  let smtpAttempts = 0;
  const service = new ParentReportDeliveryService({
    now: () => now,
    reportGenerator: createGenerator([]),
    channels: [
      { channel: 'smtp', isConfigured: () => true, send: async () => { smtpAttempts += 1; throw new Error('SMTP_UNAVAILABLE'); } },
      { channel: 'feishu', isConfigured: () => false, send: async () => {} },
    ],
  });

  const initial = await service.deliver({ semesterId: semester.semesterId, reportDate: '2026-06-06' });
  assert.equal(initial.channels.smtp.status, 'failed');
  assert.equal(initial.channels.smtp.nextRetryAt, '2026-06-06T14:30:05.000Z');
  now = '2026-06-06T14:30:05.000Z';
  const second = await service.retryDue({ semesterId: semester.semesterId });
  assert.equal(second.length, 1);
  assert.equal(second[0].channels.smtp.nextRetryAt, '2026-06-06T14:30:35.000Z');
  now = '2026-06-06T14:30:35.000Z';
  const third = await service.retryDue({ semesterId: semester.semesterId });
  assert.equal(third.length, 1);
  assert.equal(third[0].channels.smtp.status, 'failed');
  assert.equal(third[0].channels.smtp.nextRetryAt, undefined);
  now = '2026-06-07T14:30:00.000Z';
  assert.deepEqual(await service.retryDue({ semesterId: semester.semesterId }), []);
  assert.equal(smtpAttempts, 3);

  withSemesterDb(semester, (db) => {
    const row = db.prepare("SELECT status, attempt_count, next_retry_at FROM report_deliveries WHERE report_key = 'report:2026-06-06' AND channel = 'smtp'").get();
    assert.deepEqual(row, { status: 'failed', attempt_count: 3, next_retry_at: null });
  });
});

test('T06B 双渠道均失败时原子留存脱敏 HTML 与错误摘要，成功重试后清理待人工补发留档', async () => {
  const semester = createReadySemester();
  const initial = new ParentReportDeliveryService({
    now: () => '2026-06-05T14:30:00.000Z',
    reportGenerator: createGenerator([]),
    channels: [
      { channel: 'smtp', isConfigured: () => true, send: async () => { throw new Error('smtp-password@example.test'); } },
      { channel: 'feishu', isConfigured: () => true, send: async () => { throw new Error('https://hooks.example.test/secret'); } },
    ],
  });

  const failed = await initial.deliver({ semesterId: semester.semesterId, reportDate: '2026-06-05' });
  assert.equal(failed.channels.smtp.status, 'failed');
  assert.equal(failed.channels.feishu.status, 'failed');

  const archiveDir = getSemesterParentReportArchiveDir(semester.semesterId);
  const html = await readFile(path.join(archiveDir, 'report-2026-06-05.html'), 'utf8');
  const summary = JSON.parse(await readFile(path.join(archiveDir, 'report-2026-06-05.delivery.json'), 'utf8'));
  assert.match(html, /学习日报/);
  assert.equal(summary.reportKey, 'report:2026-06-05');
  assert.deepEqual(summary.channels, { smtp: 'SMTP_SEND_FAILED', feishu: 'FEISHU_SEND_FAILED' });
  const archived = `${html}${JSON.stringify(summary)}`;
  assert.doesNotMatch(archived, /smtp-password@example\.test|hooks\.example\.test|secret/);

  const recovered = new ParentReportDeliveryService({
    now: () => '2026-06-05T14:30:06.000Z',
    reportGenerator: createGenerator([]),
    channels: [
      { channel: 'smtp', isConfigured: () => true, send: async () => {} },
      { channel: 'feishu', isConfigured: () => true, send: async () => {} },
    ],
  });
  const retried = await recovered.retryDue({ semesterId: semester.semesterId });
  assert.equal(retried.length, 1);
  await assert.rejects(readFile(path.join(archiveDir, 'report-2026-06-05.html'), 'utf8'), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(archiveDir, 'report-2026-06-05.delivery.json'), 'utf8'), { code: 'ENOENT' });
});
