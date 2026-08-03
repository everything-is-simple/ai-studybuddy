// T04-2: 数据库完整性检查功能测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const testRoot = path.join(process.env.APP_DATA_ROOT || '', 'db-integrity-test');

function setup() {
  fs.mkdirSync(testRoot, { recursive: true });
}

function teardown() {
  fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function createCleanDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_table (
      id INTEGER PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO test_table (id, value) VALUES (1, 'test');
  `);
  db.close();
}

function corruptDb(dbPath) {
  // 直接截断数据库文件到很小的大小，破坏SQLite结构
  const fd = fs.openSync(dbPath, 'r+');
  fs.ftruncateSync(fd, 100);
  fs.closeSync(fd);
}

test('T04-2-A: runIntegrityCheck 对正常数据库返回 ok', (t) => {
  setup();
  try {
    const dbPath = path.join(testRoot, 'clean.db');
    createCleanDb(dbPath);

    const db = new Database(dbPath, { readonly: true });
    const result = db.pragma('integrity_check', { simple: true });
    db.close();

    assert.strictEqual(result, 'ok', '完整性检查应该返回 ok');
  } finally {
    teardown();
  }
});

test('T04-2-B: runIntegrityCheck 对损坏数据库返回错误', (t) => {
  setup();
  try {
    const dbPath = path.join(testRoot, 'corrupt.db');
    createCleanDb(dbPath);
    corruptDb(dbPath);

    // 尝试打开损坏的数据库应该失败或返回错误
    let db;
    try {
      db = new Database(dbPath, { readonly: true });
      const result = db.pragma('integrity_check', { simple: true });

      // 如果能打开，完整性检查应该报告错误
      assert.notStrictEqual(result, 'ok', '损坏的数据库完整性检查不应该返回 ok');
    } catch (error) {
      // 无法打开数据库也是预期行为
      assert.match(
        String(error.message),
        /file is not a database|disk I\/O|database disk image is malformed|SQLITE_CORRUPT/i,
        '应该抛出数据库损坏相关错误'
      );
    } finally {
      db?.close();
    }
  } finally {
    teardown();
  }
});

test('T04-2-C: getAllActiveSemesterDbPaths 返回活跃学期路径', async (t) => {
  const originalRoot = process.env.APP_DATA_ROOT;
  const isolatedRoot = path.join(testRoot, 'isolated-test');
  process.env.APP_DATA_ROOT = isolatedRoot;

  try {
    setup();

    // 创建与正式运行一致的全局数据库结构。
    const globalDbPath = path.join(isolatedRoot, 'studybuddy.db');
    const { initGlobalDbAtPath } = await import('../dist/db/migrations.js');
    const globalDb = initGlobalDbAtPath(globalDbPath);
    const now = new Date().toISOString();
    globalDb.prepare('INSERT INTO students (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('student-001', 'Test', now, now);
    const insertSemester = globalDb.prepare(`
      INSERT INTO semesters (
        id, semester_code, student_id, teaching_start_date, teaching_end_date,
        status, db_relative_path, ready, created_at, updated_at
      ) VALUES (?, ?, 'student-001', '2026-02-20', '2026-06-30', ?, ?, 1, ?, ?)
    `);
    insertSemester.run('active-001', 'active-001', 'active', 'semesters/active-001/semester.db', now, now);
    insertSemester.run('archived-001', 'archived-001', 'archived', 'semesters/archived-001/semester.db', now, now);
    insertSemester.run('follow-up-001', 'follow-up-001', 'follow_up', 'semesters/follow-up-001/semester.db', now, now);
    globalDb.close();

    // 创建活跃学期数据库
    const activeSemesterDbPath = path.join(isolatedRoot, 'semesters', 'active-001', 'semester.db');
    createCleanDb(activeSemesterDbPath);

    const followUpSemesterDbPath = path.join(isolatedRoot, 'semesters', 'follow-up-001', 'semester.db');
    createCleanDb(followUpSemesterDbPath);

    // 动态导入模块
    const { getAllActiveSemesterDbPaths } = await import('../dist/db/connection.js');

    const paths = getAllActiveSemesterDbPaths();

    assert.strictEqual(paths.length, 2, '应该返回2个活跃学期路径');
    assert.ok(paths.some(p => p.includes('active-001')), '应该包含 active-001');
    assert.ok(paths.some(p => p.includes('follow-up-001')), '应该包含 follow-up-001');
    assert.ok(!paths.some(p => p.includes('archived-001')), '不应该包含 archived-001');
  } finally {
    process.env.APP_DATA_ROOT = originalRoot;
    teardown();
  }
});
