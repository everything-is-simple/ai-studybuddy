import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  createSecretSignoffSummary,
  executeSecretScanSignoff,
  listApprovedPackageFiles,
  normalizeSignoffMetadata,
  scanSecretSignoffBoundary,
  verifyApprovedGitState,
} = require('../../../scripts/lib/AIStudyBuddy.SecretScan.cjs');

const metadata = {
  artifactId: 'WAVE0-R1-ARTIFACT',
  packageFingerprint: '0123456789ab',
  approvalWindowId: 'WAVE0_R1_WINDOW',
};

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'synthetic Git fixture setup must succeed');
  return result.stdout.trim();
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studybuddy-t02r1-'));
  const repositoryRoot = path.join(root, 'repository');
  const packageRoot = path.join(root, 'candidate-package');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(repositoryRoot, 'tracked.txt'), 'safe tracked content\n', 'utf8');
  runGit(repositoryRoot, ['init', '--quiet']);
  runGit(repositoryRoot, ['config', 'user.email', 'fixture@example.invalid']);
  runGit(repositoryRoot, ['config', 'user.name', 'Synthetic Fixture']);
  runGit(repositoryRoot, ['add', 'tracked.txt']);
  runGit(repositoryRoot, ['commit', '--quiet', '-m', 'synthetic fixture']);
  const approvedCommit = runGit(repositoryRoot, ['rev-parse', 'HEAD']).toLowerCase();
  await writeFile(path.join(packageRoot, 'deployment-manifest.json'), JSON.stringify({ buildCommit: approvedCommit, packageFingerprint: metadata.packageFingerprint }), 'utf8');
  await writeFile(path.join(packageRoot, 'app.txt'), 'safe candidate content\n', 'utf8');
  return { root, repositoryRoot, packageRoot, approvedCommit };
}

function assertDoesNotLeak(value, ...forbidden) {
  const text = String(value);
  for (const item of forbidden) assert.equal(text.includes(item), false);
}

function zeroReport(inputCount = 1) {
  return {
    inputCount,
    scannedFiles: inputCount,
    blockedInputCount: 0,
    findingCount: 0,
    blocked: { sensitive: 0, nonText: 0, symlink: 0, oversize: 0, unreadable: 0 },
    ruleCounts: { 'ASB-CREDENTIAL-ASSIGNMENT': 0 },
  };
}

test('R1 signoff validates metadata schemas without echoing rejected input', () => {
  const sentinel = `invalid/r1-${randomUUID()}`;
  assert.throws(
    () => normalizeSignoffMetadata({ ...metadata, artifactId: sentinel, approvedCommit: 'a'.repeat(40) }),
    (error) => error.code === 'SECRET_SCAN_SIGNOFF_METADATA_INVALID' && error.message === 'SECRET_SCAN_SIGNOFF_METADATA_INVALID'
  );
  try {
    normalizeSignoffMetadata({ ...metadata, artifactId: sentinel, approvedCommit: 'a'.repeat(40) });
  } catch (error) {
    assertDoesNotLeak(JSON.stringify(error), sentinel);
  }
});

test('R1 signoff locks the full approved commit and rejects tracked staged or unstaged changes', async () => {
  const fixture = await createFixture();
  const sentinel = `invalid-r1-${randomUUID()}`;
  try {
    verifyApprovedGitState(fixture.repositoryRoot, fixture.approvedCommit);
    await writeFile(path.join(fixture.repositoryRoot, 'tracked.txt'), sentinel, 'utf8');
    assert.throws(
      () => verifyApprovedGitState(fixture.repositoryRoot, fixture.approvedCommit),
      (error) => error.code === 'SECRET_SCAN_TRACKED_CHANGES_PRESENT' && error.message === 'SECRET_SCAN_TRACKED_CHANGES_PRESENT'
    );
    assert.throws(
      () => verifyApprovedGitState(fixture.repositoryRoot, 'b'.repeat(40)),
      (error) => error.code === 'SECRET_SCAN_APPROVED_COMMIT_MISMATCH' || error.code === 'SECRET_SCAN_GIT_STATE_UNVERIFIABLE'
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('R1 converts all skipped or unreadable candidate inputs into blocked coverage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studybuddy-t02r1-boundary-'));
  try {
    await writeFile(path.join(root, 'safe.txt'), 'safe\n', 'utf8');
    await writeFile(path.join(root, 'large.txt'), 'x'.repeat(128), 'utf8');
    const report = await scanSecretSignoffBoundary({
      rootDir: root,
      candidates: ['safe.txt', '.env.local', 'binary.bin', 'large.txt', 'link.txt', 'missing.txt'],
      maxBytes: 32,
      lstat: async (candidate) => {
        if (candidate.endsWith('link.txt')) return { isSymbolicLink: () => true };
        return lstat(candidate);
      },
    });
    assert.equal(report.inputCount, 6);
    assert.equal(report.scannedFiles, 1);
    assert.equal(report.blockedInputCount, 5);
    assert.deepEqual(report.blocked, { sensitive: 1, nonText: 1, symlink: 1, oversize: 1, unreadable: 1 });
    const summary = createSecretSignoffSummary({
      metadata: { ...metadata, approvedCommit: 'a'.repeat(40) },
      repositoryReport: report,
      packageReport: zeroReport(),
    });
    assert.equal(summary.resultCode, 'BLOCKED_UNSCANNED_INPUT');
    assertDoesNotLeak(JSON.stringify(summary), root, 'safe.txt', 'missing.txt');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('R1 synthetic repository and package can produce a fully redacted pass summary', async () => {
  const fixture = await createFixture();
  try {
    const summary = await executeSecretScanSignoff({
      repositoryRoot: fixture.repositoryRoot,
      packageRoot: fixture.packageRoot,
      metadata: { ...metadata, approvedCommit: fixture.approvedCommit },
    });
    assert.equal(summary.resultCode, 'SECRET_SCAN_SIGNOFF_PASSED');
    assert.equal(summary.approvedCommitShort, fixture.approvedCommit.slice(0, 12));
    assert.equal(summary.repository.blockedInputCount, 0);
    assert.equal(summary.package.blockedInputCount, 0);
    assertDoesNotLeak(JSON.stringify(summary), fixture.root, fixture.repositoryRoot, fixture.packageRoot, 'tracked.txt', 'app.txt');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('R1 rejects candidate package roots within the repository and mismatched manifests without path leakage', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => listApprovedPackageFiles({ packageRoot: fixture.repositoryRoot, repositoryRoot: fixture.repositoryRoot }),
      (error) => error.code === 'SECRET_SCAN_PACKAGE_ROOT_INVALID' && error.message === 'SECRET_SCAN_PACKAGE_ROOT_INVALID'
    );
    await writeFile(path.join(fixture.packageRoot, 'deployment-manifest.json'), JSON.stringify({ buildCommit: 'b'.repeat(40), packageFingerprint: metadata.packageFingerprint }), 'utf8');
    await assert.rejects(
      () => executeSecretScanSignoff({
        repositoryRoot: fixture.repositoryRoot,
        packageRoot: fixture.packageRoot,
        metadata: { ...metadata, approvedCommit: fixture.approvedCommit },
      }),
      (error) => error.code === 'SECRET_SCAN_PACKAGE_MANIFEST_MISMATCH' && error.message === 'SECRET_SCAN_PACKAGE_MANIFEST_MISMATCH'
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('R1 summary rejects empty input groups and reports a fixed non-pass code', () => {
  const summary = createSecretSignoffSummary({
    metadata: { ...metadata, approvedCommit: 'a'.repeat(40) },
    repositoryReport: zeroReport(0),
    packageReport: zeroReport(),
  });
  assert.equal(summary.resultCode, 'SECRET_SCAN_INPUT_EMPTY');
});
