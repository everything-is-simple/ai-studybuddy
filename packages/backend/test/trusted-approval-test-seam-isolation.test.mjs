import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MARKER = '__TEST_ONLY_';
const allowedDefinitions = new Set([
  'scripts/lib/AIStudyBuddy.TrustedApproval.cjs',
  'scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs',
  'scripts/lib/AIStudyBuddy.NoFollow.cjs',
]);
const helperPath = 'packages/backend/test/helpers/trusted-approval-fixture.mjs';
const scannerPath = 'packages/backend/test/trusted-approval-test-seam-isolation.test.mjs';

function trackedSources(root) {
  const raw = execFileSync('git', ['ls-files', '-z', '--', 'scripts', 'packages'], { cwd: root, encoding: 'buffer' });
  return raw.toString('utf8').split('\0').filter((file) => /\.(?:cjs|js|mjs)$/.test(file));
}

test('test-only factories are isolated to the exact tracked-source allowlist', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const sources = trackedSources(root);
  assert.equal(sources.includes(helperPath), true);
  for (const relativePath of sources) {
    const source = readFileSync(join(root, relativePath), 'utf8');
    const hasMarker = source.includes(MARKER);
    if (!hasMarker) continue;
    assert.equal(allowedDefinitions.has(relativePath) || relativePath === helperPath || relativePath === scannerPath, true, relativePath);
    if (relativePath === helperPath) assert.match(source, /require\([^)]*AIStudyBuddy\.(?:TrustedApproval|VerifierIntegrity|NoFollow)\.cjs[^)]*\)/);
  }
  for (const relativePath of allowedDefinitions) {
    assert.equal(sources.includes(relativePath), true);
  }
});

test('no-follow production module contains no ordinary path or ACL fallback token', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const source = readFileSync(join(root, 'scripts/lib/AIStudyBuddy.NoFollow.cjs'), 'utf8');
  for (const forbidden of [new RegExp('(?:node:)?f' + 's\\.readFile'), /realpath/, /Get-Acl/, /Set-Acl/, /icacls/]) {
    assert.equal(forbidden.test(source), false);
  }
});
