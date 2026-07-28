import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MARKER = '__TEST_ONLY_';
const definitionPaths = new Set([
  'scripts/lib/AIStudyBuddy.TrustedApproval.cjs',
  'scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs',
  'scripts/lib/AIStudyBuddy.NoFollow.cjs',
]);
const helperPath = 'packages/backend/test/helpers/trusted-approval-fixture.mjs';
const scannerPath = 'packages/backend/test/trusted-approval-test-seam-isolation.test.mjs';
const helperConsumerPaths = new Set([
  'packages/backend/test/trusted-approval-contract.test.mjs',
  'packages/backend/test/verifier-integrity-gate.test.mjs',
  'packages/backend/test/nofollow-contract.test.mjs',
]);
const providerModulePattern = /AIStudyBuddy\.[\s\S]{0,50}?(?:TrustedApproval|VerifierIntegrity|NoFollow)\.cjs/;
const computedMarkerPattern = /__TEST\s*['"`]\s*\+\s*['"`]_ONLY/;

function trackedSources(root) {
  const raw = execFileSync('git', ['ls-files', '-z', '--', 'scripts', 'packages'], { cwd: root, encoding: 'buffer' });
  return raw.toString('utf8').split('\0').filter((file) => /\.(?:cjs|js|mjs)$/.test(file));
}

function assertSourcePolicy(relativePath, source) {
  if (definitionPaths.has(relativePath) || relativePath === scannerPath) return;
  if (relativePath === helperPath) {
    assert.equal(providerModulePattern.test(source), true, 'helper must be the direct provider-module consumer');
    assert.equal(source.includes(MARKER), true, 'helper must directly use the test-only factories');
    return;
  }
  assert.equal(source.includes(MARKER), false, `unexpected factory marker: ${relativePath}`);
  assert.equal(computedMarkerPattern.test(source), false, `computed factory marker: ${relativePath}`);
  if (!helperConsumerPaths.has(relativePath)) {
    assert.equal(source.includes('trusted-approval-fixture'), false, `unexpected fixture helper reference: ${relativePath}`);
  }
}

test('test-only factories are isolated to the exact tracked-source allowlist', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const sources = trackedSources(root);
  assert.equal(sources.includes(helperPath), true);
  for (const relativePath of definitionPaths) assert.equal(sources.includes(relativePath), true);
  for (const relativePath of sources) assertSourcePolicy(relativePath, readFileSync(join(root, relativePath), 'utf8'));
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "const x = module['__TEST' + '_ONLY_factory'];"));
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "const module = require('./AIStudyBuddy.' + 'TrustedApproval.cjs'); module['__TEST' + '_ONLY_factory'];"));
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "export * from './helpers/trusted-approval-fixture.mjs';"));
});

test('no-follow production module contains no ordinary path or ACL fallback token', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const source = readFileSync(join(root, 'scripts/lib/AIStudyBuddy.NoFollow.cjs'), 'utf8');
  for (const forbidden of [new RegExp('(?:node:)?f' + 's\\.readFile'), /lstat/, /stat/, /realpath/, /Get-Acl/, /Set-Acl/, /icacls/, /PowerShell/]) {
    assert.equal(forbidden.test(source), false);
  }
});
