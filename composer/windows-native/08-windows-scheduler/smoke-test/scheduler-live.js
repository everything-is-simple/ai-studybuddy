const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../../shared/db');
const { buildTaskXml, sanitizeSchedulerError } = require('./scheduler-utils');

const taskName = 'AIStudyBuddy-Phase07-Smoke';
const runnerPath = path.join(__dirname, 'report-runner.js');
const outputDir = path.join(__dirname, '..', 'output', 'live');
const outputPath = path.join(outputDir, 'scheduler-result.json');
const xmlPath = path.join(os.tmpdir(), `${taskName}.xml`);

function execute(args) {
  return execFileSync('schtasks.exe', args, { encoding: 'utf8', windowsHide: true });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const xml = buildTaskXml({ nodePath: process.execPath, runnerPath, outputPath });
  fs.writeFileSync(xmlPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
  let registered = false;
  try {
    execute(['/Create', '/TN', taskName, '/XML', xmlPath, '/F']);
    registered = true;
    execute(['/Run', '/TN', taskName]);
    const deadline = Date.now() + 30000;
    while (!fs.existsSync(outputPath) && Date.now() < deadline) await sleep(500);
    if (!fs.existsSync(outputPath)) throw new Error('task did not produce report-runner output within 30 seconds');
    const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const db = openDatabase(result.dbPath);
    const delivery = db.prepare('SELECT status FROM report_deliveries WHERE report_key=? AND channel=?').get(result.reportKey, 'scheduler');
    db.close();
    if (result.status !== 'sent' || delivery?.status !== 'sent') throw new Error('scheduler runner did not persist expected delivery record');
    console.log(`PASS_LIVE: ${taskName} triggered isolated report runner and persisted ${result.reportKey}`);
  } catch (error) {
    console.log(`BLOCKED_EXTERNAL: ${sanitizeSchedulerError(error.message)}`);
    process.exitCode = 2;
  } finally {
    if (registered) {
      try { execute(['/Delete', '/TN', taskName, '/F']); } catch (error) { console.error(`CLEANUP_REQUIRED: ${sanitizeSchedulerError(error.message)}`); process.exitCode = 1; }
    }
    fs.rmSync(xmlPath, { force: true });
  }
}

main();
