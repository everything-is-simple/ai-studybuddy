function dayKey(date) { return date.toISOString().slice(0, 10); }
function isLastDayOfMonth(date) { const tomorrow = new Date(date); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); return tomorrow.getUTCDate() === 1; }
function buildReport(db, date) {
  const reportKey = `report:${dayKey(date)}`;
  const sections = ['daily'];
  if (date.getUTCDay() === 0) sections.push('weekly');
  if (isLastDayOfMonth(date)) sections.push('monthly');
  const tasks = db.prepare(`SELECT c.name AS course_name, t.title, t.status, t.study_minutes, c.exam_at
    FROM study_tasks t JOIN courses c ON c.id=t.course_id ORDER BY c.name, t.title`).all();
  const counts = tasks.reduce((acc, task) => { acc[task.status] = (acc[task.status] || 0) + 1; return acc; }, {});
  const minutes = tasks.reduce((sum, task) => sum + task.study_minutes, 0);
  const reminders = tasks.filter((task) => {
    if (!task.exam_at) return false;
    const days = Math.round((Date.parse(task.exam_at) - date.getTime()) / 86400000);
    return [7, 3, 1].includes(days);
  }).map((task) => ({ courseName: task.course_name, days: Math.round((Date.parse(task.exam_at) - date.getTime()) / 86400000) }));
  return { reportKey, sections, tasks, counts, minutes, reminders, summary: `完成 ${counts.done || 0} 项，逾期 ${counts.overdue || 0} 项，学习 ${minutes} 分钟。` };
}
function markDelivery(db, reportKey, channel, status, errorSummary = null) {
  db.prepare(`INSERT INTO report_deliveries (report_key, channel, status, sent_at, error_summary) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(report_key, channel) DO UPDATE SET status=excluded.status, sent_at=excluded.sent_at, error_summary=excluded.error_summary`).run(reportKey, channel, status, status === 'sent' ? new Date().toISOString() : null, errorSummary);
}
function deliveryNeeded(db, reportKey, channel) {
  const row = db.prepare('SELECT status FROM report_deliveries WHERE report_key=? AND channel=?').get(reportKey, channel);
  return !row || row.status !== 'sent';
}
module.exports = { buildReport, markDelivery, deliveryNeeded };
