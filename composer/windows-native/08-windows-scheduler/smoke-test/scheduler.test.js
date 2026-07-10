const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { buildTaskXml, sanitizeSchedulerError } = require('./scheduler-utils');

test('scheduler XML enables StartWhenAvailable and runs isolated report runner', () => {
  const outputPath = path.join(os.tmpdir(), 'phase07-scheduler-output.json');
  const xml = buildTaskXml({ nodePath: 'C:\\Program Files\\nodejs\\node.exe', runnerPath: 'C:\\repo\\report-runner.js', outputPath });
  assert.match(xml, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(xml, /report-runner\.js/);
  assert.doesNotMatch(xml, /rapidocr|ocr-runner/i);
  assert.doesNotMatch(xml, /learning web service/i);
});

test('scheduler error redaction does not expose local absolute paths', () => {
  const message = sanitizeSchedulerError('Access denied: C:\\Users\\Student\\secret.xml');
  assert.match(message, /Access denied/);
  assert.doesNotMatch(message, /C:\\Users/);
});
