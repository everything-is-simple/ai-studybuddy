const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runWithoutEnv(script) {
  return spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, SMTP_USER: '', SMTP_AUTH_CODE: '', SMTP_TO: '', FEISHU_WEBHOOK_URL: '' },
    encoding: 'utf8'
  });
}

test('SMTP live test reports blocked external credentials with exit code 2', () => {
  const result = runWithoutEnv('06-qq-smtp/smoke-test/smtp-live.js');
  assert.equal(result.status, 2);
  assert.match(result.stdout, /BLOCKED_EXTERNAL/);
});

test('Feishu live test reports blocked external credentials with exit code 2', () => {
  const result = runWithoutEnv('07-feishu-webhook/smoke-test/feishu-live.js');
  assert.equal(result.status, 2);
  assert.match(result.stdout, /BLOCKED_EXTERNAL/);
});
