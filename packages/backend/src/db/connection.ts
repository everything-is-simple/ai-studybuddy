// ============================================================
// SQLite 连接管理 — 后端开发规范第 2 节
// 所有数据库打开/关闭必须通过此模块。
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getGlobalDbPath, getSemesterDbPath } from './paths';

/**
 * 打开 SQLite 数据库，启用 WAL 和 foreign_keys。
 * 允许创建新库，用于初始化/写入路径。
 */
export function openDbAtPath(dbPath: string): DatabaseType {
  // 确保父目录存在
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * 仅打开已存在的数据库，禁止隐式创建空库或目录。
 * 用于健康检查、完整性检查等只读/诊断路径。
 */
export function openExistingDbAtPath(dbPath: string): DatabaseType {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB_NOT_FOUND ${dbPath}`);
  }
  const db = new Database(dbPath, { fileMustExist: true });
  // WAL is a persistent database setting established on create/write paths.
  // Reissuing "journal_mode = WAL" on every existing-DB connection is write-capable
  // and can serialize concurrent API reads, stalling route transitions.
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * 只读打开已存在数据库，禁止创建文件、目录或 WAL 副作用。
 */
export function openReadOnlyExistingDbAtPath(dbPath: string): DatabaseType {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB_NOT_FOUND ${dbPath}`);
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * 打开全局库 studybuddy.db。
 */
export function openGlobalDb(): DatabaseType {
  return openDbAtPath(getGlobalDbPath());
}

/**
 * 打开学期库 semester.db。
 */
export function openSemesterDb(semesterId: string): DatabaseType {
  return openDbAtPath(getSemesterDbPath(semesterId));
}

/**
 * 执行 PRAGMA integrity_check，返回 "ok" 或错误信息。
 */
export function runIntegrityCheck(db: DatabaseType): string {
  const result = db.pragma('integrity_check', { simple: true });
  return typeof result === 'string' ? result : String(result);
}

/**
 * 检查 WAL 是否启用。
 */
export function isWalEnabled(db: DatabaseType): boolean {
  const result = db.pragma('journal_mode', { simple: true });
  return result === 'wal';
}

/**
 * 检查 foreign_keys 是否启用。
 */
export function isForeignKeysOn(db: DatabaseType): boolean {
  const result = db.pragma('foreign_keys', { simple: true });
  return result === 1 || result === '1' || result === true;
}

/**
 * WAL checkpoint 后关闭数据库。
 */
export function checkpointAndClose(db: DatabaseType): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

/**
 * 获取所有活跃学期的数据库路径。
 * 读取全局库中 status 为 'active'、'teaching_ended' 或 'follow_up' 的学期。
 */
export function getAllActiveSemesterDbPaths(): string[] {
  const globalDb = openReadOnlyExistingDbAtPath(getGlobalDbPath());
  try {
    const rows = globalDb
      .prepare(
        `SELECT id AS semester_id FROM semesters
         WHERE status IN ('active', 'teaching_ended', 'follow_up')
         ORDER BY id`
      )
      .all() as { semester_id: string }[];

    return rows.map((row) => getSemesterDbPath(row.semester_id)).filter((dbPath) => fs.existsSync(dbPath));
  } finally {
    globalDb.close();
  }
}

/**
 * 备份数据库：先 checkpoint，然后复制 .db 文件。
 */
export function backupDb(db: DatabaseType, destination: string): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(db.name, destination);
}

// 导出类型供其他模块使用
export type { DatabaseType };
