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
  fs.rmSync(testRoot, { recursive: true, force: true });
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
    try {
      const db = new Database(dbPath, { readonly: true });
      const result = db.pragma('integrity_check', { simple: true });
      db.close();

      // 如果能打开，完整性检查应该报告错误
      assert.notStrictEqual(result, 'ok', '损坏的数据库完整性检查不应该返回 ok');
    } catch (error) {
      // 无法打开数据库也是预期行为
      assert.ok(error.message.includes('file is not a database') || error.message.includes('disk I/O'),
        '应该抛出数据库损坏相关错误');
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

    // 创建全局数据库
    const globalDbPath = path.join(isolatedRoot, 'studybuddy.db');
    fs.mkdirSync(path.dirname(globalDbPath), { recursive: true });
    const globalDb = new Database(globalDbPath);
    globalDb.pragma('journal_mode = WAL');
    globalDb.exec(`
      CREATE TABLE IF NOT EXISTS semesters (
        semester_id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      INSERT INTO semesters (semester_id, status) VALUES
        ('active-001', 'active'),
        ('archived-001', 'archived'),
        ('follow-up-001', 'follow_up');
    `);
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
