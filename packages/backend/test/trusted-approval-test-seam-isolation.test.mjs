import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const MARKER = '__TEST_ONLY_';
const definitionPaths = new Set([
  'scripts/lib/AIStudyBuddy.TrustedApproval.cjs',
  'scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs',
  'scripts/lib/AIStudyBuddy.NoFollow.cjs',
  'scripts/lib/AIStudyBuddy.TrustAnchor.cjs',
]);
const helperPath = 'packages/backend/test/helpers/trusted-approval-fixture.mjs';
const scannerPath = 'packages/backend/test/trusted-approval-test-seam-isolation.test.mjs';
const helperConsumerPaths = new Set([
  'packages/backend/test/trusted-approval-contract.test.mjs',
  'packages/backend/test/verifier-integrity-gate.test.mjs',
  'packages/backend/test/nofollow-contract.test.mjs',
  'packages/backend/test/trust-anchor-contract.test.mjs',
]);
const providerModulePattern = /AIStudyBuddy\.[\s\S]{0,50}?(?:TrustedApproval|VerifierIntegrity|NoFollow|TrustAnchor)\.cjs/;
function staticStringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticStringValue(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStringValue(node.left);
    const right = staticStringValue(node.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function scriptKindFor(relativePath) {
  if (/\.tsx$/.test(relativePath)) return ts.ScriptKind.TSX;
  if (/\.(?:ts|cts|mts)$/.test(relativePath)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function containsComputedFactoryMarker(source, relativePath) {
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.ES2022, false, scriptKindFor(relativePath));
  let found = false;
  const inspect = (node) => {
    const expression = ts.isElementAccessExpression(node) ? node.argumentExpression : ts.isComputedPropertyName(node) ? node.expression : undefined;
    if (expression !== undefined && staticStringValue(expression)?.includes(MARKER)) found = true;
    if (!found) ts.forEachChild(node, inspect);
  };
  inspect(sourceFile);
  return found;
}

function trackedSources(root) {
  const raw = execFileSync('git', ['ls-files', '-z', '--', 'scripts', 'packages'], { cwd: root, encoding: 'buffer' });
  return raw.toString('utf8').split('\0').filter((file) => /\.(?:cjs|js|mjs|cts|ts|mts|tsx)$/.test(file));
}

function assertSourcePolicy(relativePath, source) {
  if (definitionPaths.has(relativePath) || relativePath === scannerPath) return;
  if (relativePath === helperPath) {
    assert.equal(providerModulePattern.test(source), true, 'helper must be the direct provider-module consumer');
    assert.equal(source.includes(MARKER), true, 'helper must directly use the test-only factories');
    return;
  }
  assert.equal(source.includes(MARKER), false, `unexpected factory marker: ${relativePath}`);
  assert.equal(containsComputedFactoryMarker(source, relativePath), false, `computed factory marker: ${relativePath}`);
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
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "const factory = module['__TE' + 'ST_ONLY_createTrustedApprovalVerifier'];"));
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "module[('__TEST' + '_ONLY') + '_createTrustedApprovalVerifier'];"));
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "module['__TEST' /* split */ + '_ONLY_createTrustedApprovalVerifier'];"));
  assert.throws(() => assertSourcePolicy('packages/backend/src/rogue.ts', "const factory = module[('__TEST' + '_ONLY') + '_createTrustedApprovalVerifier'];"));
  assert.throws(() => assertSourcePolicy('packages/backend/test/rogue.mjs', "export * from './helpers/trusted-approval-fixture.mjs';"));
});

test('no-follow production module contains no ordinary path or ACL fallback token', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const source = readFileSync(join(root, 'scripts/lib/AIStudyBuddy.NoFollow.cjs'), 'utf8');
  for (const forbidden of [new RegExp('(?:node:)?f' + 's\\.readFile'), /lstat/, /stat/, /realpath/, /Get-Acl/, /Set-Acl/, /icacls/, /PowerShell/]) {
    assert.equal(forbidden.test(source), false);
  }
});

test('trust-anchor production module has no environment, path or fallback configuration token', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const source = readFileSync(join(root, 'scripts/lib/AIStudyBuddy.TrustAnchor.cjs'), 'utf8');
  for (const forbidden of [/process\.env/, /APP_DATA_ROOT/, /Registry/, /readFile/, /realpath/, /Get-Acl/, /Set-Acl/]) {
    assert.equal(forbidden.test(source), false);
  }
});
