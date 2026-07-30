// T04-2: 启动时数据库完整性检查测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

// 测试辅助函数
function createTestDataRoot() {
  const testRoot = path.join(process.env.APP_DATA_ROOT || '', `integrity-test-${Date.now()}`);
  fs.mkdirSync(testRoot, { recursive: true });
  return testRoot;
}

function createCleanDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS semesters (
      semester_id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
  `);
  db.close();
}

function corruptDb(dbPath) {
  // 写入垃圾数据破坏数据库（在文件头部覆盖SQLite magic number）
  const stats = fs.statSync(dbPath);
  if (stats.size < 16) {
    // 文件太小，追加垃圾数据
    fs.appendFileSync(dbPath, Buffer.from('CORRUPTED_DATA'));
  } else {
    // 在偏移16处写入垃圾数据（避免覆盖文件头）
    const fd = fs.openSync(dbPath, 'r+');
    fs.writeSync(fd, Buffer.from('CORRUPTED'), 16);
    fs.closeSync(fd);
  }
}

test('T04-2-A: 正常数据库通过完整性检查并成功启动', async (t) => {
  const testRoot = createTestDataRoot();
  const originalRoot = process.env.APP_DATA_ROOT;
  process.env.APP_DATA_ROOT = testRoot;

  try {
    // 创建干净的全局数据库
    const globalDbPath = path.join(testRoot, 'studybuddy.db');
    createCleanDb(globalDbPath);

    // 创建一个活跃学期数据库
    const semesterId = 'test-semester-001';
    const semesterDbPath = path.join(testRoot, 'semesters', semesterId, 'semester.db');
    createCleanDb(semesterDbPath);

    // 在全局库中注册学期
    const globalDb = new Database(globalDbPath);
    globalDb.prepare(`INSERT INTO semesters (semester_id, status) VALUES (?, 'active')`).run(semesterId);
    globalDb.close();

    // 动态加载bootstrap模块（使用file://协议）
    const { bootstrapBackend } = await import(`file:///${distDir}/bootstrap.js`);
    const { createApp } = await import(`file:///${distDir}/app.js`);
    const { MaterialJobWorker } = await import(`file:///${distDir}/services/material-job-worker.js`);
    const { initializeConfigurationService } = await import(`file:///${distDir}/config/configuration-service.js`);

    let startupLog = [];
    const controller = await bootstrapBackend({
      initializeConfiguration: initializeConfigurationService,
      createApplication: createApp,
      createWorker: () => new MaterialJobWorker(),
      port: 0,
      host: '127.0.0.1',
      log: (msg) => startupLog.push(msg),
    });

    // 验证启动成功，没有完整性失败日志
    assert.ok(controller.server.listening, '服务器应该成功启动');
    const hasIntegrityFailure = startupLog.some(msg => msg.includes('STARTUP_INTEGRITY_FAILED'));
    assert.strictEqual(hasIntegrityFailure, false, '不应该有完整性检查失败日志');

    await controller.shutdown();
  } finally {
    process.env.APP_DATA_ROOT = originalRoot;
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test('T04-2-B: 全局库损坏时拒绝启动', async (t) => {
  const testRoot = createTestDataRoot();
  const originalRoot = process.env.APP_DATA_ROOT;
  process.env.APP_DATA_ROOT = testRoot;

  try {
    // 创建并破坏全局数据库
    const globalDbPath = path.join(testRoot, 'studybuddy.db');
    createCleanDb(globalDbPath);
    corruptDb(globalDbPath);

    // 尝试启动应该失败
    const { bootstrapBackend } = await import(path.join(distDir, 'bootstrap.js'));
    const { createApp } = await import(path.join(distDir, 'app.js'));
    const { MaterialJobWorker } = await import(path.join(distDir, 'services', 'material-job-worker.js'));
    const { initializeConfigurationService } = await import(path.join(distDir, 'config', 'configuration-service.js'));

    let startupLog = [];
    await assert.rejects(
      async () => {
        await bootstrapBackend({
          initializeConfiguration: initializeConfigurationService,
          createApplication: createApp,
          createWorker: () => new MaterialJobWorker(),
          port: 0,
          host: '127.0.0.1',
          log: (msg) => startupLog.push(msg),
        });
      },
      { message: /Database integrity check failed/ },
      '应该抛出数据库完整性检查失败错误'
    );

    // 验证错误日志
    const hasGlobalFailure = startupLog.some(msg => msg.includes('scope=global'));
    assert.ok(hasGlobalFailure, '应该记录全局库完整性失败');
  } finally {
    process.env.APP_DATA_ROOT = originalRoot;
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test('T04-2-C: 学期库损坏时拒绝启动', async (t) => {
  const testRoot = createTestDataRoot();
  const originalRoot = process.env.APP_DATA_ROOT;
  process.env.APP_DATA_ROOT = testRoot;

  try {
    // 创建干净的全局数据库
    const globalDbPath = path.join(testRoot, 'studybuddy.db');
    createCleanDb(globalDbPath);

    // 创建并破坏学期数据库
    const semesterId = 'test-semester-corrupt';
    const semesterDbPath = path.join(testRoot, 'semesters', semesterId, 'semester.db');
    createCleanDb(semesterDbPath);

    // 在全局库中注册学期
    const globalDb = new Database(globalDbPath);
    globalDb.prepare(`INSERT INTO semesters (semester_id, status) VALUES (?, 'active')`).run(semesterId);
    globalDb.close();

    // 破坏学期数据库
    corruptDb(semesterDbPath);

    // 尝试启动应该失败
    const { bootstrapBackend } = await import(`file:///${distDir}/bootstrap.js`);
    const { createApp } = await import(`file:///${distDir}/app.js`);
    const { MaterialJobWorker } = await import(`file:///${distDir}/services/material-job-worker.js`);
    const { initializeConfigurationService } = await import(`file:///${distDir}/config/configuration-service.js`);

    let startupLog = [];
    await assert.rejects(
      async () => {
        await bootstrapBackend({
          initializeConfiguration: initializeConfigurationService,
          createApplication: createApp,
          createWorker: () => new MaterialJobWorker(),
          port: 0,
          host: '127.0.0.1',
          log: (msg) => startupLog.push(msg),
        });
      },
      { message: /Database integrity check failed/ },
      '应该抛出数据库完整性检查失败错误'
    );

    // 验证错误日志
    const hasSemesterFailure = startupLog.some(msg => msg.includes('scope=semester'));
    assert.ok(hasSemesterFailure, '应该记录学期库完整性失败');
  } finally {
    process.env.APP_DATA_ROOT = originalRoot;
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
