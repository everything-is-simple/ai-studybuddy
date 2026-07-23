import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDir, '..', '..', '..');

test('T06B 计划任务注册脚本通过部署 wrapper 运行，含每日 22:30、登录补发和 StartWhenAvailable', async () => {
  const script = await readFile(path.join(repositoryRoot, 'scripts', 'register-parent-report-task.ps1'), 'utf8');
  assert.match(script, /run-parent-report-task\.ps1/);
  assert.match(script, /-InstallRoot\s+['"]?\{1\}/);
  assert.match(script, /New-ScheduledTaskTrigger\s+-Daily\s+-At\s+['"]?22:30/);
  assert.match(script, /New-ScheduledTaskTrigger\s+-AtLogOn/);
  assert.match(script, /New-ScheduledTaskSettingsSet[\s\S]*-StartWhenAvailable/);
  assert.match(script, /New-ScheduledTaskPrincipal[\s\S]*-LogonType\s+Interactive[\s\S]*-RunLevel\s+Limited/);
  assert.doesNotMatch(script, /SMTP_AUTH_CODE|FEISHU_WEBHOOK_URL|SMTP_TO|authorization-code/i);
});

test('T06B 计划任务 wrapper 校验运行根和回环监听，只调用部署包内已编译 runner', async () => {
  const wrapper = await readFile(path.join(repositoryRoot, 'scripts', 'run-parent-report-task.ps1'), 'utf8');
  assert.match(wrapper, /Import-AIStudyBuddyEnvFile/);
  assert.match(wrapper, /Assert-AIStudyBuddyLoopbackHost/);
  assert.match(wrapper, /APP_DATA_ROOT is required/);
  assert.match(wrapper, /scripts[\\/]parent-report-runner\.js/);
  assert.match(wrapper, /Get-NodeVersionInfo/);
  assert.doesNotMatch(wrapper, /SMTP_AUTH_CODE|FEISHU_WEBHOOK_URL|SMTP_TO|authorization-code/i);
});
