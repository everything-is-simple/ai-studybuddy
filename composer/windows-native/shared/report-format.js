function sectionLabels(sections) {
  const labels = { daily: '日报', weekly: '周报', monthly: '月报' };
  return sections.map((section) => labels[section] || section).join('、');
}

function reportLines(report) {
  const counts = report.counts || {};
  const lines = [
    `**报告区块**：${sectionLabels(report.sections)}`,
    `**完成**：${counts.done || 0} 项`,
    `**进行中**：${counts.in_progress || 0} 项`,
    `**逾期**：${counts.overdue || 0} 项`,
    `**学习时长**：${report.minutes || 0} 分钟`,
  ];
  for (const task of report.tasks || []) {
    lines.push(`- ${task.course_name}：${task.title}（${task.status}，${task.study_minutes} 分钟）`);
  }
  for (const reminder of report.reminders || []) {
    lines.push(`**考试前 ${reminder.days} 天**：${reminder.courseName}`);
  }
  if (report.aiSummary) lines.push(`**学习总结**：${report.aiSummary}`);
  return lines;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function formatEmailHtml(report) {
  const lines = reportLines(report).map((line) => escapeHtml(line)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
  return `<!doctype html><html lang="zh-CN"><body><h1>AI StudyBuddy ${escapeHtml(sectionLabels(report.sections))}</h1><p>${lines.join('<br>')}</p></body></html>`;
}

function formatFeishuCard(report) {
  return {
    msg_type: 'interactive',
    card: {
      header: { title: { tag: 'plain_text', content: `AI StudyBuddy ${sectionLabels(report.sections)}` } },
      elements: [{ tag: 'div', text: { tag: 'lark_md', content: reportLines(report).join('\n') } }]
    }
  };
}

async function addAiSummary(report, summarize) {
  try {
    const summary = await summarize(report.summary);
    if (typeof summary !== 'string' || !summary.trim()) throw new Error('empty AI summary');
    return { ...report, aiSummary: summary.trim(), aiStatus: 'success' };
  } catch {
    return { ...report, aiSummary: null, aiStatus: 'fallback' };
  }
}

module.exports = { formatEmailHtml, formatFeishuCard, addAiSummary };
