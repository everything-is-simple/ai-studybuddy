import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  calculateControlledTrackedScopeIdentity,
  createControlledSyntheticReader,
  formatControlledScanSummary,
  formatScanSummary,
  listGitTrackedFiles,
  scanControlledSecretBoundary,
  scanSecretBoundary,
} = require('../../../scripts/lib/AIStudyBuddy.SecretScan.cjs');
function createSentinel() {
  return `invalid-controlled-sentinel-${randomUUID().replaceAll('-', '')}`;
}

function assertFixedError(error, code, sentinel) {
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(error.stack, undefined);
  if (sentinel) assert.equal(JSON.stringify({ code: error.code, message: error.message }).includes(sentinel), false);
  return true;
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'synthetic fixture Git setup must succeed');
}

async function createTrackedFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studybuddy-t02d-fixture-'));
  const fixtureDir = path.join(root, 'deployment-package');
  await mkdir(fixtureDir, { recursive: true });
  const sentinel = `invalid-scan-fixture-${randomUUID().replaceAll('-', '')}`;
  await writeFile(path.join(fixtureDir, 'settings.txt'), `API_KEY=${sentinel}\n`, 'utf8');
  await writeFile(path.join(root, '.env.local'), 'ignored=true\n', 'utf8');
  await writeFile(path.join(root, 'production.env'), 'ignored=true\n', 'utf8');
  runGit(root, ['init', '--quiet']);
  runGit(root, ['add', 'deployment-package/settings.txt']);
  return { root, sentinel };
}

function assertNoSentinel(value, sentinel) {
  assert.equal(String(value).includes(sentinel), false);
}

test('tracked synthetic deployment fixture reports only allowlisted finding fields', async () => {
  const { root, sentinel } = await createTrackedFixture();
  try {
    const trackedFiles = listGitTrackedFiles(root);
    assert.deepEqual(trackedFiles, ['deployment-package/settings.txt']);

    const report = await scanSecretBoundary({ rootDir: root, trackedFiles });
    assert.equal(report.status, 'ok');
    assert.equal(report.scannedFiles, 1);
    assert.equal(report.findingCount, 1);
    assert.deepEqual(Object.keys(report.findings[0]).sort(), ['category', 'fingerprint', 'line', 'path', 'ruleId']);
    assert.equal(report.findings[0].path, 'deployment-package/settings.txt');
    assert.equal(report.findings[0].ruleId, 'ASB-CREDENTIAL-ASSIGNMENT');
    assert.equal(report.findings[0].category, 'credential-assignment');
    assert.equal(report.findings[0].line, 1);
    assert.match(report.findings[0].fingerprint, /^[a-f0-9]{12}$/);
    assertNoSentinel(JSON.stringify(report), sentinel);
    assertNoSentinel(formatScanSummary(report), sentinel);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sensitive env candidates are skipped before any content read', async () => {
  const { root } = await createTrackedFixture();
  const readPaths = [];
  try {
    const report = await scanSecretBoundary({
      rootDir: root,
      trackedFiles: ['deployment-package/settings.txt', '.env.local', 'production.env'],
      readFile: async (candidate, encoding) => {
        readPaths.push(path.relative(root, candidate).replaceAll('\\', '/'));
        const { readFile } = await import('node:fs/promises');
        return readFile(candidate, encoding);
      },
    });
    assert.deepEqual(readPaths, ['deployment-package/settings.txt']);
    assert.equal(report.skipped.sensitive, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid tracked paths fail with a fixed error that omits the path', async () => {
  await assert.rejects(
    () => scanSecretBoundary({ rootDir: process.cwd(), trackedFiles: ['../outside.txt'] }),
    (error) =>
      error.code === 'SECRET_SCAN_INVALID_INPUT' &&
      error.message === 'SECRET_SCAN_INVALID_INPUT' &&
      error.stack === undefined
  );
});

test('missing tracked files fail without exposing filesystem details', async () => {
  const { root } = await createTrackedFixture();
  try {
    await assert.rejects(
      () => scanSecretBoundary({ rootDir: root, trackedFiles: ['missing.txt'] }),
      (error) =>
        error.code === 'SECRET_SCAN_FILE_ACCESS_FAILED' &&
        error.message === 'SECRET_SCAN_FILE_ACCESS_FAILED' &&
        error.stack === undefined
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


function createControlledApproval(trackedFiles, packageContentIdentity = 'a'.repeat(64)) {
  return {
    fullCommit: 'b'.repeat(40),
    windowId: 'synthetic_window_0001',
    trackedScopeIdentity: calculateControlledTrackedScopeIdentity(trackedFiles),
    packageContentIdentity,
  };
}

function createControlledInput(reader, overrides = {}) {
  const trackedFiles = overrides.trackedFiles ?? ['src/settings.txt'];
  const packageContentIdentity = overrides.packageContentIdentity ?? 'a'.repeat(64);
  return {
    approval: overrides.approval ?? createControlledApproval(trackedFiles, packageContentIdentity),
    trackedFiles,
    repositoryCandidates: overrides.repositoryCandidates ?? [{ relativePath: 'src/settings.txt', locator: 'synthetic-repository-file' }],
    packageCandidates: overrides.packageCandidates ?? [{ relativePath: 'package/settings.txt', locator: 'synthetic-package-file' }],
    packageIdentityBefore: overrides.packageIdentityBefore ?? packageContentIdentity,
    packageIdentityAfter: overrides.packageIdentityAfter ?? packageContentIdentity,
    reader,
  };
}

test('controlled R1 synthetic boundary binds full identities and emits no path, hash, or sentinel', async () => {
  const sentinel = createSentinel();
  const fixture = createControlledSyntheticReader({ content: `API_KEY=${sentinel}\n` });
  const report = await scanControlledSecretBoundary(createControlledInput(fixture.reader));
  const summary = formatControlledScanSummary(report);
  assert.deepEqual(Object.keys(report).sort(), ['artifactId', 'contractVersion', 'findingCount', 'ruleCounts', 'scannedFiles', 'skipped', 'status']);
  assert.equal(report.contractVersion, 'phase3-p1-controlled-readonly-v1');
  assert.match(report.artifactId, /^[a-f0-9]{36}$/);
  assert.equal(report.scannedFiles, 2);
  assert.equal(report.findingCount, 2);
  assert.deepEqual(report.ruleCounts, [{ ruleId: 'ASB-CREDENTIAL-ASSIGNMENT', category: 'credential-assignment', count: 2 }]);
  assert.equal(summary.includes(sentinel), false);
  assert.equal(summary.includes('settings.txt'), false);
  assert.equal(summary.includes('a'.repeat(64)), false);
  assert.equal(summary.includes('b'.repeat(40)), false);
  assert.equal(fixture.getMetrics().closeCount, 2);
});

test('controlled R1 rejects an untracked candidate before opening any handle', async () => {
  const fixture = createControlledSyntheticReader();
  await assert.rejects(
    () => scanControlledSecretBoundary(createControlledInput(fixture.reader, {
      repositoryCandidates: [{ relativePath: 'untracked/private.txt', locator: 'untracked-sentinel' }],
    })),
    (error) => assertFixedError(error, 'R1_UNTRACKED_OR_OUT_OF_SCOPE', 'untracked-sentinel')
  );
  assert.equal(fixture.getMetrics().openedCount, 0);
});

test('controlled R1 skips sensitive candidates before any handle read and rejects replacement races without a report', async () => {
  const sentinel = createSentinel();
  const sensitive = createControlledSyntheticReader({ content: `API_KEY=${sentinel}\n` });
  const sensitiveTracked = ['.env.local'];
  const sensitiveInput = createControlledInput(sensitive.reader, {
    trackedFiles: sensitiveTracked,
    approval: createControlledApproval(sensitiveTracked),
    repositoryCandidates: [{ relativePath: '.env.local', locator: sentinel }],
    packageCandidates: [{ relativePath: 'production.env', locator: sentinel }],
  });
  const report = await scanControlledSecretBoundary(sensitiveInput);
  assert.equal(report.scannedFiles, 0);
  assert.equal(report.skipped.sensitive, 2);
  assert.equal(sensitive.getMetrics().openedCount, 0);
  assert.equal(formatControlledScanSummary(report).includes(sentinel), false);

  const replaced = createControlledSyntheticReader({ failureMode: 'replacement' });
  await assert.rejects(
    () => scanControlledSecretBoundary(createControlledInput(replaced.reader)),
    (error) => assertFixedError(error, 'R1_NOFOLLOW_RISK')
  );
  assert.equal(replaced.getMetrics().closeCount, 1);
});

test('controlled R1 rejects unregistered readers before open and approval identity mismatch', async () => {
  const synthetic = createControlledSyntheticReader();
  await assert.rejects(
    () => scanControlledSecretBoundary(createControlledInput(synthetic.reader, { packageIdentityAfter: 'c'.repeat(64) })),
    (error) => assertFixedError(error, 'R1_PACKAGE_IDENTITY_INVALID')
  );
  let openCalls = 0;
  const hostileReader = {
    openVerifiedPath() {
      openCalls += 1;
      throw new Error('reader-secret-sentinel');
    },
    readVerifiedFile() {
      throw new Error('not reached');
    },
  };
  await assert.rejects(
    () => scanControlledSecretBoundary(createControlledInput(hostileReader)),
    (error) => assertFixedError(error, 'R1_NOFOLLOW_RISK', 'reader-secret-sentinel')
  );
  assert.equal(openCalls, 0);

  const readFailure = createControlledSyntheticReader({ failureMode: 'read-failure' });
  await assert.rejects(
    () => scanControlledSecretBoundary(createControlledInput(readFailure.reader)),
    (error) => assertFixedError(error, 'R1_NOFOLLOW_RISK')
  );
  assert.equal(readFailure.getMetrics().closeCount, 1);
});
