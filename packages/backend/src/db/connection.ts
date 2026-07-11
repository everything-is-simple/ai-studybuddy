// ============================================================
// SQLite 连接管理 — 后端开发规范第 2 节
// 所有数据库打开/关闭必须通过此模块。
// ============================================================

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { Database as DatabaseType } from "better-sqlite3";
import { getGlobalDbPath, getSemesterDbPath } from "./paths";

/**
 * 打开 SQLite 数据库，启用 WAL 和 foreign_keys。
 */
export function openDbAtPath(dbPath: string): DatabaseType {
  // 确保父目录存在
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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
  const result = db.pragma("integrity_check", { simple: true });
  return typeof result === "string" ? result : String(result);
}

/**
 * 检查 WAL 是否启用。
 */
export function isWalEnabled(db: DatabaseType): boolean {
  const result = db.pragma("journal_mode", { simple: true });
  return result === "wal";
}

/**
 * 检查 foreign_keys 是否启用。
 */
export function isForeignKeysOn(db: DatabaseType): boolean {
  const result = db.pragma("foreign_keys", { simple: true });
  return result === 1 || result === "1" || result === true;
}

/**
 * WAL checkpoint 后关闭数据库。
 */
export function checkpointAndClose(db: DatabaseType): void {
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
}

/**
 * 备份数据库：先 checkpoint，然后复制 .db 文件。
 */
export function backupDb(
  db: DatabaseType,
  destination: string
): void {
  db.pragma("wal_checkpoint(TRUNCATE)");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(db.name, destination);
}

// 导出类型供其他模块使用
export type { DatabaseType };
