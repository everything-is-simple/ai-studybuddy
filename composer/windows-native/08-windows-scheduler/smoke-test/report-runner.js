const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('../../shared/db');
const { buildReport, markDelivery } = require('../../shared/report');

const outputPath = process.argv[2];
if (!outputPath) throw new Error('output path is required');
const outputDir = path.dirname(outputPath);
fs.mkdirSync(outputDir, { recursive: true });
const dbPath = path.join(outputDir, 'scheduler.sqlite');
const db = openDatabase(dbPath);
db.prepare('INSERT OR IGNORE INTO courses VALUES (?,?,?,?)').run('scheduler-course', '计划任务测试课程', null, '2026-01-01');
db.prepare('INSERT OR IGNORE INTO study_tasks VALUES (?,?,?,?,?,?,?)').run('scheduler-task', 'scheduler-course', '生成脱敏报告', 'done', null, 1, '2026-01-01');
const report = buildReport(db, new Date('2026-05-31T14:30:00.000Z'));
markDelivery(db, report.reportKey, 'scheduler', 'sent');
db.close();
fs.writeFileSync(outputPath, JSON.stringify({ status: 'sent', reportKey: report.reportKey, dbPath, pid: process.pid, finishedAt: new Date().toISOString() }, null, 2));
