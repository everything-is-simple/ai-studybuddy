import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../..');
const scriptsRoot = path.join(repoRoot, 'scripts');

test('deployment package script requires a safe explicit output root and delegates deletion to the boundary helper', async () => {
  const source = await readFile(path.join(scriptsRoot, 'build-deployment-package.ps1'), 'utf8');
  assert.match(source, /param\(\[string\]\$OutputRoot, \[switch\]\$SkipBuild\)/);
  assert.match(source, /New-AIStudyBuddyPackageBoundary\b/);
  assert.match(source, /Remove-AIStudyBuddyPackageBoundaryStage\b/);
  assert.match(source, /Assert-AIStudyBuddyPackageStagingContents\b/);
  assert.match(source, /PACKAGE_ARCHIVE_ALREADY_EXISTS/);
  assert.doesNotMatch(source, /Remove-Item\s+-LiteralPath\s+\$OutputRoot\s+-Recurse/i);
  assert.doesNotMatch(source, /Remove-Item\s+-LiteralPath\s+\$zip\s+-Force/i);
  assert.match(source, /\[Console\]::Error\.WriteLine\(\(Get-PackageBoundaryErrorCode \$_\)\)/);
});

test('synthetic external fixture rejects dangerous roots without deleting protected sentinels', () => {
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(scriptsRoot, 'test-deployment-output-delete-boundary.ps1'),
    ],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true, timeout: 30000 }
  );
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0);
  assert.equal(/BOUNDARY_TEST_OK/.test(output), true);
  assert.equal(/ASSERTION_FAILED|PACKAGE_[A-Z_]+.*[A-Z]:\\|stack|synthetic-protected-sentinel/i.test(output), false);
});
test('deployment entry rejects missing or relative output roots with fixed redacted errors', () => {
  for (const args of [['-SkipBuild'], ['-OutputRoot', 'relative-output', '-SkipBuild']]) {
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(scriptsRoot, 'build-deployment-package.ps1'),
        ...args,
      ],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true, timeout: 30000 }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 1);
    assert.equal(/PACKAGE_OUTPUT_(?:EMPTY|INVALID)/.test(output), true);
    assert.equal(/[A-Z]:\\|stack|Cannot bind argument|ParameterBinding/i.test(output), false);
  }
});
