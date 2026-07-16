import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-test-'));
  // 独立端口区间，避免与其他并发起后端的测试文件端口冲突（EADDRINUSE）
  const port = 40000 + Math.floor(Math.random() * 3000);
  const processHandle = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
    },
    stdio: 'ignore',
  });

  t.after(async () => {
    processHandle.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  // 100 次 × 100ms = 10s 预算，容忍多测试文件并发起后端时的 CPU 竞争
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return { dataRoot, port };
    } catch {
      // 后端尚未开始监听，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('built backend did not become healthy');
}

async function postJson(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

function semesterInput(overrides = {}) {
  return {
    studentName: 'Alice',
    semesterCode: '2026-spring',
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
    ...overrides,
  };
}

test('built initializer rejects a calendar date that does not exist', async (t) => {
  const backend = await startBackend(t);

  const result = await postJson(
    backend.port,
    '/api/dev/init-semester',
    semesterInput({ teachingStartDate: '2026-02-30' })
  );

  assert.equal(result.status, 400);
  assert.equal(result.json.success, false);
  assert.equal(result.json.error.code, 'INVALID_DATE');
});

test('rename failure removes new student, semester index, staging, and formal directory', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-rename-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { initializeSemester } = await import('../dist/db/semester-initializer.js');

  assert.throws(
    () =>
      initializeSemester(semesterInput(), {
        appDataRoot: dataRoot,
        promoteStaging() {
          throw new Error('injected rename failure');
        },
      }),
    { code: 'RENAME_FAILED' }
  );

  const globalDb = new Database(path.join(dataRoot, 'studybuddy.db'));
  assert.equal(globalDb.prepare('SELECT COUNT(*) AS count FROM students').get().count, 0);
  assert.equal(globalDb.prepare('SELECT COUNT(*) AS count FROM semesters').get().count, 0);
  globalDb.close();

  const semestersRoot = path.join(dataRoot, 'semesters');
  const entries = await readdir(semestersRoot).catch(() => []);
  assert.deepEqual(entries, []);
});
test('restores one damaged semester database from a recorded backup without affecting another semester', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-backup-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { initializeSemester } = await import('../dist/db/semester-initializer.js');
  const { createDatabaseBackup, restoreDatabaseFromBackup, checkDatabaseIntegrityAtPath } =
    await import('../dist/db/backups.js');

  const first = initializeSemester(semesterInput({ semesterCode: '2026-spring' }), {
    appDataRoot: dataRoot,
  });
  const second = initializeSemester(semesterInput({ semesterCode: '2026-fall' }), {
    appDataRoot: dataRoot,
  });

  const backup = createDatabaseBackup({
    scope: 'semester',
    databasePath: first.semesterDbPath,
    globalDbPath: first.globalDbPath,
    backupsDir: path.join(dataRoot, 'backups'),
    note: 'integration test',
  });

  await writeFile(first.semesterDbPath, 'deliberately corrupted', 'utf8');
  assert.notEqual(checkDatabaseIntegrityAtPath(first.semesterDbPath), 'ok');

  restoreDatabaseFromBackup({
    backupPath: backup.backupPath,
    destinationPath: first.semesterDbPath,
  });

  assert.equal(checkDatabaseIntegrityAtPath(first.semesterDbPath), 'ok');
  assert.equal(checkDatabaseIntegrityAtPath(second.semesterDbPath), 'ok');

  const globalDb = new Database(first.globalDbPath);
  const record = globalDb.prepare('SELECT scope, backup_path, note FROM backup_records').get();
  globalDb.close();

  assert.deepEqual(record, {
    scope: 'semester',
    backup_path: backup.backupPath,
    note: 'integration test',
  });
});
test('built initializer creates one ready index and isolated semester database', async (t) => {
  const backend = await startBackend(t);
  const result = await postJson(backend.port, '/api/dev/init-semester', semesterInput());

  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(result.json.data.status, 'active');

  const globalDb = new Database(path.join(backend.dataRoot, 'studybuddy.db'));
  const semester = globalDb
    .prepare('SELECT id, semester_code, ready FROM semesters WHERE semester_code = ?')
    .get('2026-spring');
  globalDb.close();

  assert.equal(semester.semester_code, '2026-spring');
  assert.equal(semester.ready, 1);
  assert.equal(checkFile(path.join(backend.dataRoot, 'semesters', semester.id, 'semester.db')), true);
});

test('built initializer rejects a duplicate semester without creating another student', async (t) => {
  const backend = await startBackend(t);
  const first = await postJson(backend.port, '/api/dev/init-semester', semesterInput());
  const duplicate = await postJson(backend.port, '/api/dev/init-semester', semesterInput({ studentName: 'Bob' }));

  assert.equal(first.status, 200);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.error.code, 'SEMESTER_CODE_EXISTS');

  const globalDb = new Database(path.join(backend.dataRoot, 'studybuddy.db'));
  const students = globalDb.prepare('SELECT name FROM students ORDER BY name').all();
  globalDb.close();
  assert.deepEqual(students, [{ name: 'Alice' }]);
});

test('ready flag failure removes promoted directory and all new global records', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-ready-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { initializeSemester } = await import('../dist/db/semester-initializer.js');

  assert.throws(
    () =>
      initializeSemester(semesterInput(), {
        appDataRoot: dataRoot,
        markReady() {
          throw new Error('injected ready update failure');
        },
      }),
    { code: 'READY_FLAG_FAILED' }
  );

  const globalDb = new Database(path.join(dataRoot, 'studybuddy.db'));
  assert.equal(globalDb.prepare('SELECT COUNT(*) AS count FROM students').get().count, 0);
  assert.equal(globalDb.prepare('SELECT COUNT(*) AS count FROM semesters').get().count, 0);
  globalDb.close();

  const entries = await readdir(path.join(dataRoot, 'semesters')).catch(() => []);
  assert.deepEqual(entries, []);
});

test('versioned migration applies each version once and rejects a gap', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-migration-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { openDbAtPath } = await import('../dist/db/connection.js');
  const { applyMigrations, getAppliedVersion } = await import('../dist/db/migrations.js');
  const db = openDbAtPath(path.join(dataRoot, 'migration.db'));
  try {
    applyMigrations(db, 'global', [
      { version: 1, sql: 'CREATE TABLE one (id INTEGER PRIMARY KEY);' },
      { version: 2, sql: 'CREATE TABLE two (id INTEGER PRIMARY KEY);' },
    ]);
    applyMigrations(db, 'global', [
      { version: 1, sql: 'CREATE TABLE one (id INTEGER PRIMARY KEY);' },
      { version: 2, sql: 'CREATE TABLE two (id INTEGER PRIMARY KEY);' },
    ]);

    assert.equal(getAppliedVersion(db, 'global'), 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE scope = 'global'").get().count, 2);
    assert.throws(() => applyMigrations(db, 'semester', [{ version: 2, sql: 'SELECT 1;' }]), /migration gap/);
  } finally {
    db.close();
  }
});

test('semester migrations apply v2, v3 and v4 schema changes', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-v2-fresh-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { initSemesterDbAtPath } = await import('../dist/db/migrations.js');
  const { getAppliedVersion } = await import('../dist/db/migrations.js');
  const db = initSemesterDbAtPath(path.join(dataRoot, 'semester.db'));
  try {
    assert.equal(getAppliedVersion(db, 'semester'), 4);
    for (const table of ['practice_sessions', 'questions', 'practice_answers']) {
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
    }
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schedule_entries'").get());
    assert.ok(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'assessment_date_changes'").get()
    );
    const columns = db
      .prepare('PRAGMA table_info(assessment_attempts)')
      .all()
      .map((row) => row.name);
    assert.ok(columns.includes('confirmation_status'));
    assert.ok(columns.includes('confirmed_at'));
    const materialColumns = db
      .prepare('PRAGMA table_info(materials)')
      .all()
      .map((row) => row.name);
    assert.ok(materialColumns.includes('original_filename'));
    assert.ok(materialColumns.includes('truncated'));
    const jobColumns = db
      .prepare('PRAGMA table_info(jobs)')
      .all()
      .map((row) => row.name);
    assert.ok(jobColumns.includes('material_id'));
    const eventColumns = db
      .prepare('PRAGMA table_info(study_events)')
      .all()
      .map((row) => row.name);
    assert.ok(eventColumns.includes('evidence_ref'));
    assert.ok(eventColumns.includes('source_confidence'));
    assert.ok(eventColumns.includes('quality_gate'));
  } finally {
    db.close();
  }
});

test('semester migrations upgrade an existing v1 database through v4', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t02-v2-upgrade-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { openDbAtPath } = await import('../dist/db/connection.js');
  const { migrateSemesterDb, getAppliedVersion } = await import('../dist/db/migrations.js');
  const { SCHEMA_SEMESTER_SQL } = require('../dist/db/sql/schema-semester.js');

  const db = openDbAtPath(path.join(dataRoot, 'legacy-v1.db'));
  try {
    db.exec(SCHEMA_SEMESTER_SQL);
    const v1AppliedAt = new Date().toISOString();
    db.prepare('INSERT INTO schema_migrations (scope, version, applied_at) VALUES (?, ?, ?)').run(
      'semester',
      1,
      v1AppliedAt
    );

    const courseId = 'course-0000-0000-0000-000000000001';
    const existingAttemptId = 'attempt-0000-0000-0000-000000000001';
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO course_instances (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(courseId, 'sem-0000-0000-0000-000000000001', '数学', now, now);
    db.prepare(
      `INSERT INTO assessment_attempts (
        id, course_instance_id, name, exam_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(existingAttemptId, courseId, '期中考试', '2026-05-10T08:00:00.000Z', now, now);

    migrateSemesterDb(db);

    const existing = db
      .prepare('SELECT id, name, confirmation_status, confirmed_at FROM assessment_attempts WHERE id = ?')
      .get(existingAttemptId);
    assert.deepEqual(existing, {
      id: existingAttemptId,
      name: '期中考试',
      confirmation_status: 'pending',
      confirmed_at: null,
    });
    assert.equal(getAppliedVersion(db, 'semester'), 4);
    for (const table of ['practice_sessions', 'questions', 'practice_answers']) {
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
    }
  } finally {
    db.close();
  }
});

function checkFile(filePath) {
  try {
    require('node:fs').accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
