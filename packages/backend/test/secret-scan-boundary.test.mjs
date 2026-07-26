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
  formatScanSummary,
  listGitTrackedFiles,
  scanSecretBoundary,
} = require('../../../scripts/lib/AIStudyBuddy.SecretScan.cjs');

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
