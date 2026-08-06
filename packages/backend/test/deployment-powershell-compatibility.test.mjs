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

test('restore remains validation-only until write safety is separately approved', async () => {
  const restore = await readScript('restore-data.ps1');
  assert.match(restore, /CmdletBinding\(SupportsShouldProcess\)/);
  assert.match(restore, /Get-AIStudyBuddyValidatedBackup\b/);
  assert.match(restore, /\$PSCmdlet\.ShouldProcess\b/);
  assert.match(restore, /if \(-not \$EnableWrite\)\s*\{\s*Write-Output 'RESTORE_WRITE_DISABLED'/);
  assert.match(restore, /RESTORE_VALIDATED_NO_WRITE/);
  assert.match(restore, /RESTORE_WRITE_DISABLED/);
  assert.match(restore, /Copy-Item -LiteralPath/);
  assert.doesNotMatch(restore, /\.IsReadOnly\s*=\s*\$false/);
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
