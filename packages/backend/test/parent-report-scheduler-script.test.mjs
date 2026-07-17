import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDir, '..', '..', '..');

test('T06B 计划任务注册脚本只调用已编译 runner，含每日 22:30、登录补发和 StartWhenAvailable', async () => {
  const script = await readFile(path.join(repositoryRoot, 'scripts', 'register-parent-report-task.ps1'), 'utf8');
  assert.match(script, /dist[\\/]scripts[\\/]parent-report-runner\.js/);
  assert.match(script, /New-ScheduledTaskTrigger\s+-Daily\s+-At\s+['\"]?22:30/);
  assert.match(script, /New-ScheduledTaskTrigger\s+-AtLogOn/);
  assert.match(script, /New-ScheduledTaskSettingsSet[\s\S]*-StartWhenAvailable/);
  assert.doesNotMatch(script, /SMTP_AUTH_CODE|FEISHU_WEBHOOK_URL|SMTP_TO|authorization-code/i);
});
