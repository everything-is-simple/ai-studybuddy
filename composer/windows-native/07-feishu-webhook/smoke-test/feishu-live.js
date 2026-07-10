require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env.local') });
const { formatFeishuCard } = require('../../shared/report-format');

function buildFixtureReport() {
  return {
    reportKey: 'report:2026-05-31', sections: ['daily', 'weekly', 'monthly'],
    counts: { done: 1, in_progress: 0, overdue: 0 }, minutes: 30,
    tasks: [{ course_name: '测试课程', title: '脱敏任务', status: 'done', study_minutes: 30 }],
    reminders: [{ courseName: '测试课程', days: 7 }], summary: '完成 1 项，逾期 0 项，学习 30 分钟。'
  };
}

async function main() {
  if (!process.env.FEISHU_WEBHOOK_URL) {
    console.log('BLOCKED_EXTERNAL: FEISHU_WEBHOOK_URL required');
    process.exitCode = 2;
    return;
  }
  const response = await fetch(process.env.FEISHU_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(formatFeishuCard(buildFixtureReport())) });
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
  console.log('PASS_LIVE: Feishu webhook accepted');
}
main().catch((error) => { console.error(`FAIL_LIVE: ${error.message}`); process.exitCode = 1; });
