const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openDatabase } = require('../../shared/db');
const { buildReport, markDelivery, deliveryNeeded } = require('../../shared/report');
const { formatEmailHtml, formatFeishuCard, addAiSummary } = require('../../shared/report-format');

function createReport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-report-'));
  const db = openDatabase(path.join(dir, 'report.sqlite'));
  db.prepare('INSERT INTO courses VALUES (?,?,?,?)').run('c1', '高数', '2026-06-07T14:30:00.000Z', '2026-01-01');
  db.prepare('INSERT INTO study_tasks VALUES (?,?,?,?,?,?,?)').run('t1', 'c1', '复习极限', 'done', null, 45, '2026-01-01');
  return { db, report: buildReport(db, new Date('2026-05-31T14:30:00.000Z')) };
}

test('report merges daily weekly monthly and reminder with channel dedupe', () => {
  const { db, report } = createReport();
  assert.deepEqual(report.sections, ['daily', 'weekly', 'monthly']);
  assert.equal(report.reminders[0].days, 7);
  assert.match(report.summary, /完成 1 项/);
  assert.equal(deliveryNeeded(db, report.reportKey, 'email'), true);
  markDelivery(db, report.reportKey, 'email', 'sent');
  assert.equal(deliveryNeeded(db, report.reportKey, 'email'), false);
  assert.equal(deliveryNeeded(db, report.reportKey, 'feishu'), true);
  db.close();
});

test('report renders redacted HTML and Feishu card for combined period', () => {
  const { db, report } = createReport();
  const html = formatEmailHtml(report);
  const card = formatFeishuCard(report);
  assert.match(html, /日报/);
  assert.match(html, /周报/);
  assert.match(html, /月报/);
  assert.match(html, /考试前 7 天/);
  assert.match(html, /高数/);
  assert.doesNotMatch(html, /资料原文|笔记正文|聊天内容/);
  assert.equal(card.msg_type, 'interactive');
  assert.match(card.card.elements[0].text.content, /日报/);
  assert.match(card.card.elements[0].text.content, /考试前 7 天/);
  db.close();
});

test('AI summary failure keeps deterministic report and success appends short summary', async () => {
  const { db, report } = createReport();
  const fallback = await addAiSummary(report, async () => { throw new Error('timeout'); });
  assert.equal(fallback.aiSummary, null);
  assert.equal(fallback.aiStatus, 'fallback');
  const polished = await addAiSummary(report, async () => '本周学习节奏稳定，继续保持。');
  assert.equal(polished.aiStatus, 'success');
  assert.equal(polished.aiSummary, '本周学习节奏稳定，继续保持。');
  db.close();
});
