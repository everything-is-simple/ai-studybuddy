require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env.local') });
const nodemailer = require('nodemailer');
const { formatEmailHtml } = require('../../shared/report-format');

function buildFixtureReport() {
  return {
    reportKey: 'report:2026-05-31', sections: ['daily', 'weekly', 'monthly'],
    counts: { done: 1, in_progress: 0, overdue: 0 }, minutes: 30,
    tasks: [{ course_name: '测试课程', title: '脱敏任务', status: 'done', study_minutes: 30 }],
    reminders: [{ courseName: '测试课程', days: 7 }], summary: '完成 1 项，逾期 0 项，学习 30 分钟。'
  };
}

async function main() {
  const required = ['SMTP_USER', 'SMTP_AUTH_CODE', 'SMTP_TO'];
  if (required.some((key) => !process.env[key])) {
    console.log('BLOCKED_EXTERNAL: SMTP_USER, SMTP_AUTH_CODE, SMTP_TO required');
    process.exitCode = 2;
    return;
  }
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.qq.com', port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_SECURE !== 'false', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_AUTH_CODE } });
  await transport.sendMail({ from: process.env.SMTP_USER, to: process.env.SMTP_TO, subject: 'AI StudyBuddy Phase 0.7 邮件 smoke test', html: formatEmailHtml(buildFixtureReport()) });
  console.log('PASS_LIVE: QQ SMTP message accepted');
}
main().catch((error) => { console.error(`FAIL_LIVE: ${error.message}`); process.exitCode = 1; });
