import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../..');
const scriptRoot = path.join(repoRoot, 'scripts');
const productionScripts = [
  'start-production.ps1',
  'bootstrap-runtime.ps1',
  'check-installation.ps1',
  'test-ocr-runtime.ps1',
];

async function readScript(name) {
  return readFile(path.join(scriptRoot, name), 'utf8');
}

test('deployment runtime helpers are packaged scripts, not inline native-code fragments', async () => {
  await access(path.join(scriptRoot, 'lib', 'AIStudyBuddy.RuntimeChecks.py'));
  await access(path.join(scriptRoot, 'lib', 'AIStudyBuddy.RuntimeChecks.cjs'));

  const module = await readFile(path.join(scriptRoot, 'lib', 'AIStudyBuddy.Deployment.psm1'), 'utf8');
  assert.match(module, /function Invoke-AIStudyBuddyPythonRuntimeCheck\b/);
  assert.match(module, /function Invoke-AIStudyBuddyNodeRuntimeCheck\b/);
  assert.match(module, /AIStudyBuddy\.RuntimeChecks\.py/);
  assert.match(module, /AIStudyBuddy\.RuntimeChecks\.cjs/);
});

test('deployment entry scripts do not send source code through python -c or node -e', async () => {
  for (const name of productionScripts) {
    const source = await readScript(name);
    assert.doesNotMatch(
      source,
      /(?:\$env:PYTHON_PATH|\$venvPython|\$PythonPath|\bpython(?:\.exe)?)\s+-c\b/i,
      `${name} must invoke a checked-in Python helper file instead of python -c`
    );
    assert.doesNotMatch(
      source,
      /\bnode(?:\.exe)?\s+-e\b/i,
      `${name} must invoke a checked-in Node helper file instead of node -e`
    );
  }
});

test('deployment Node eligibility is centralized on the verified Node 24 baseline', async () => {
  const module = await readFile(path.join(scriptRoot, 'lib', 'AIStudyBuddy.Deployment.psm1'), 'utf8');
  assert.match(module, /function Test-AIStudyBuddySupportedNodeVersion\b/);
  assert.match(module, /\[int\]\$NodeVersion\.Major -eq 24/);

  for (const name of ['start-production.ps1', 'bootstrap-runtime.ps1', 'check-installation.ps1']) {
    const source = await readScript(name);
    assert.match(source, /Test-AIStudyBuddySupportedNodeVersion\b/, `${name} must use the shared Node 24 gate`);
    assert.doesNotMatch(
      source,
      /20-25|20–25|20, 22, or 24/,
      `${name} must not advertise a wider Node range than the verified Node 24 baseline`
    );
  }

  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'deployment', 'runtime-compatibility.json'), 'utf8'));
  assert.equal(manifest.node.minimumMajor, 24);
  assert.equal(manifest.node.maximumMajor, 24);
  assert.equal(manifest.node.supportedMajors, undefined);
  assert.equal(manifest.node.verified, 'v24.14.0');
});
test('deployment entry scripts use the shared runtime check module functions', async () => {
  for (const name of ['start-production.ps1', 'bootstrap-runtime.ps1', 'check-installation.ps1']) {
    const source = await readScript(name);
    assert.match(source, /Invoke-AIStudyBuddyPythonRuntimeCheck\b/, `${name} must use the Python runtime helper`);
  }
  for (const name of ['bootstrap-runtime.ps1', 'check-installation.ps1']) {
    const source = await readScript(name);
    assert.match(source, /Invoke-AIStudyBuddyNodeRuntimeCheck\b/, `${name} must use the Node runtime helper`);
  }
});

test('restore defaults to validation-only and only writes under explicit EnableWrite approval', async () => {
  const restore = await readScript('restore-data.ps1');
  assert.match(restore, /CmdletBinding\(SupportsShouldProcess\)/);
  assert.match(restore, /Get-AIStudyBuddyValidatedBackup\b/);
  assert.match(restore, /\$PSCmdlet\.ShouldProcess\b/);
  // 默认（无 -EnableWrite）必须 fail-closed：只验证不写入
  assert.match(restore, /if \(-not \$EnableWrite\)\s*\{\s*Write-Output "RESTORE_VALIDATED_NO_WRITE/);
  assert.match(restore, /RESTORE_VALIDATED_NO_WRITE/);
  // -EnableWrite 下才允许受控写入（Wave 1 T04-3 已批准：含服务停止门禁、recovery point、逐文件 hash、完整性复验）
  assert.match(restore, /\$EnableWrite/);
  assert.match(restore, /Copy-Item/);
  assert.match(restore, /\.IsReadOnly\s*=\s*\$false/);
  // 写入路径必须包含完整状态序列与安全门禁
  assert.match(restore, /RESTORE_PID_FILE_PRESENT/);
  assert.match(restore, /RESTORE_WRITERS_ACTIVE/);
  assert.match(restore, /RESTORE_RECOVERY_POINT_FAILED/);
  assert.match(restore, /RESTORE_COMPLETED/);
  // Wave 2 持久化状态机：状态文件、中断标记、重启默认、回滚出口声明
  assert.match(restore, /restore-state\.json/);
  assert.match(restore, /interrupt-marker\.json/);
  assert.match(restore, /RESTORE_RECOVERY_REQUIRED/);
  assert.match(restore, /CUTOVER_IN_PROGRESS/);
  assert.match(restore, /ROLLBACK_VERIFIED/);
  // 完整 ROLLBACK/MANUAL_ESCALATION 流程属目标机演练阶段，脚本已声明状态机契约
});

test('backup script uses the shared Windows PowerShell 5.1 relative-path helper chain', async () => {
  const module = await readFile(path.join(scriptRoot, 'lib', 'AIStudyBuddy.Deployment.psm1'), 'utf8');
  const backup = await readScript('backup-data.ps1');
  assert.match(module, /function Get-AIStudyBuddyRelativePath\b/);
  assert.match(module, /function Get-AIStudyBuddyDataFiles\b[\s\S]*?Get-AIStudyBuddyRelativePath\b/);
  assert.match(backup, /Get-AIStudyBuddyDataFiles\b/);
  assert.doesNotMatch(module, /\[IO\.Path\]::GetRelativePath\b/);
  assert.doesNotMatch(backup, /\[IO\.Path\]::GetRelativePath\b/);
});
