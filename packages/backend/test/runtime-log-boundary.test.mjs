import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'studybuddy-t02f-log-boundary-'));
const protectedDataRoot = path.join(fixtureRoot, 'app-data');
const logRoot = path.join(fixtureRoot, 'logs');
fs.mkdirSync(protectedDataRoot, { recursive: true });
fs.mkdirSync(logRoot, { recursive: true });
const protectedSentinel = path.join(protectedDataRoot, 'sentinel.txt');
fs.writeFileSync(protectedSentinel, 'synthetic-protected-sentinel', 'utf8');

test.after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

const {
  RuntimeLogBoundary,
  RuntimeLogBoundaryError,
  createSiblingRuntimeLogBoundary,
  toSafeLogErrorCode,
} = await import('../dist/utils/runtime-log-boundary.js');
const {
  SemesterInitializationError,
  createMaintenanceFailureLogEntry,
} = await import('../dist/db/semester-initializer.js');
const { aiLogger } = await import('../dist/utils/ai-logger.js');

function maintenanceEntry() {
  return {
    event: 'SEMESTER_INITIALIZATION_MAINTENANCE_FAILURE',
    level: 'WARN',
    errorCode: 'SEMESTER_INITIALIZATION_FAILED',
    cleanupErrorCount: 1,
    cleanupErrorCode: 'MAINTENANCE_CLEANUP_FAILED',
    timestamp: '2026-07-26T00:00:00.000Z',
  };
}

function assertBoundaryCode(action, expectedCode) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof RuntimeLogBoundaryError);
    assert.equal(error.code, expectedCode);
    assert.equal(error.message, expectedCode);
    assert.equal(error.message.includes(fixtureRoot), false);
    return true;
  });
}

test('runtime log boundary rejects empty, root, protected, relative and non-allowlist targets before writes', () => {
  assertBoundaryCode(
    () => new RuntimeLogBoundary({ logRoot: '', protectedRoots: [protectedDataRoot] }),
    'LOG_ROOT_INVALID'
  );
  assertBoundaryCode(
    () => new RuntimeLogBoundary({ logRoot: path.parse(fixtureRoot).root, protectedRoots: [protectedDataRoot] }),
    'LOG_TARGET_PROTECTED_ROOT'
  );
  assertBoundaryCode(
    () => new RuntimeLogBoundary({ logRoot: protectedDataRoot, protectedRoots: [protectedDataRoot] }),
    'LOG_TARGET_PROTECTED_ROOT'
  );
  assertBoundaryCode(
    () => new RuntimeLogBoundary({ logRoot: 'relative-logs', protectedRoots: [protectedDataRoot] }),
    'LOG_ROOT_INVALID'
  );

  const boundary = new RuntimeLogBoundary({ logRoot, protectedRoots: [protectedDataRoot, process.cwd()] });
  assertBoundaryCode(
    () => boundary.append('maintenance', { ...maintenanceEntry(), errorMessage: 'synthetic-secret' }),
    'LOG_ENTRY_FIELDS_INVALID'
  );
  assertBoundaryCode(
    () => boundary.rotateAndRetain('unknown-log', { now: new Date(), maxRetainedFiles: 1 }),
    'LOG_TARGET_OUTSIDE_ALLOWLIST'
  );
  assert.equal(fs.readFileSync(protectedSentinel, 'utf8'), 'synthetic-protected-sentinel');
});

test('runtime log boundary rotates only allowlisted synthetic log files and retains the requested count', () => {
  const boundary = new RuntimeLogBoundary({ logRoot, protectedRoots: [protectedDataRoot, process.cwd()] });
  boundary.append('maintenance', maintenanceEntry());
  boundary.rotateAndRetain('maintenance', { now: new Date('2026-07-26T00:00:00.000Z'), maxRetainedFiles: 1 });

  boundary.append('maintenance', maintenanceEntry());
  boundary.rotateAndRetain('maintenance', { now: new Date('2026-07-27T00:00:00.000Z'), maxRetainedFiles: 1 });

  const errorDirectory = path.join(logRoot, 'errors');
  const files = fs.readdirSync(errorDirectory).sort();
  assert.deepEqual(files, ['maintenance.jsonl.20260727000000.rotated']);
  assert.equal(fs.readFileSync(protectedSentinel, 'utf8'), 'synthetic-protected-sentinel');
});

test('sibling runtime logs remain outside APP_DATA_ROOT and maintenance entries redact raw errors', () => {
  const isolatedRoot = path.join(fixtureRoot, 'isolated-data');
  fs.mkdirSync(isolatedRoot, { recursive: true });
  const boundary = createSiblingRuntimeLogBoundary(isolatedRoot);
  const secret = 'phase3-t02f-maintenance-secret';
  const entry = createMaintenanceFailureLogEntry(
    new SemesterInitializationError('SEMESTER_INITIALIZATION_FAILED', 500, secret),
    [new Error(secret)]
  );
  boundary.append('maintenance', entry);

  const siblingLogFile = path.join(fixtureRoot, 'logs', 'errors', 'maintenance.jsonl');
  const serialized = fs.readFileSync(siblingLogFile, 'utf8');
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(isolatedRoot), false);
  assert.match(serialized, /SEMESTER_INITIALIZATION_FAILED/);
});

test('error and AI console logging keep raw exception values out of output', () => {
  const secret = 'phase3-t02f-ai-error-secret';
  assert.equal(toSafeLogErrorCode(new Error(secret)), 'UNKNOWN_ERROR');

  const output = [];
  const originalConsoleLog = console.log;
  console.log = (line) => output.push(String(line));
  try {
    aiLogger.recordFailure({ taskType: 'note_generation', provider: 'safe-provider', error: new Error(secret) });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(output.length, 1);
  assert.equal(output[0].includes(secret), false);
  assert.equal(output[0].includes(fixtureRoot), false);
  assert.deepEqual(Object.keys(JSON.parse(output[0])).sort(), [
    'errorCode', 'event', 'level', 'provider', 'taskType', 'timestamp',
  ]);
});

test('symbolic-link log roots are rejected when the platform permits the synthetic fixture', async (t) => {
  const linkPath = path.join(fixtureRoot, 'logs-link');
  try {
    await symlink(logRoot, linkPath, 'junction');
  } catch {
    t.skip('Current environment does not permit synthetic junction creation.');
    return;
  }
  assertBoundaryCode(
    () => new RuntimeLogBoundary({ logRoot: linkPath, protectedRoots: [protectedDataRoot] }),
    'LOG_TARGET_REPARSE_POINT'
  );
});