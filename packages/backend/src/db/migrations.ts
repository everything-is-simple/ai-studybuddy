// ============================================================
// Migration 执行器 — 后端开发规范第 4 节
// SQL schema 以 TS 常量内联，避免编译产物丢失 .sql 文件。
// 简单 version 递增，不引入复杂 migration 框架。
// ============================================================

import type { DatabaseType } from "./connection";
import { openGlobalDb, openSemesterDb } from "./connection";
import { getSemesterDbPath, getSemesterFilesDir, getSemesterTmpDir } from "./paths";
import { SCHEMA_GLOBAL_SQL } from "./sql/schema-global";
import { SCHEMA_SEMESTER_SQL } from "./sql/schema-semester";
import fs from "fs";

const GLOBAL_SCHEMA_VERSION = 1;
const SEMESTER_SCHEMA_VERSION = 1;

/**
 * 查询已执行的最高 migration version。
 */
export function getAppliedVersion(db: DatabaseType, scope: string): number {
  const row = db
    .prepare("SELECT MAX(version) as v FROM schema_migrations WHERE scope = ?")
    .get(scope) as { v: number | null } | undefined;
  return row?.v ?? 0;
}

/**
 * 记录已执行的 migration version。
 */
function recordMigration(db: DatabaseType, scope: string, version: number): void {
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (scope, version, applied_at) VALUES (?, ?, ?)"
  ).run(scope, version, new Date().toISOString());
}

/**
 * 初始化全局库 studybuddy.db。
 * - 创建所有全局表（CREATE TABLE IF NOT EXISTS，幂等）
 * - 记录 schema version 1
 */
export function initGlobalDb(): DatabaseType {
  const db = openGlobalDb();
  db.exec(SCHEMA_GLOBAL_SQL);
  recordMigration(db, "global", GLOBAL_SCHEMA_VERSION);
  return db;
}

/**
 * 初始化学期库 semester.db。
 * - 确保学期目录结构存在（files/ tmp/）
 * - 创建所有学期表（幂等）
 * - 记录 schema version 1
 */
export function initSemesterDb(semesterId: string): DatabaseType {
  const filesDir = getSemesterFilesDir(semesterId);
  const tmpDir = getSemesterTmpDir(semesterId);
  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const db = openSemesterDb(semesterId);
  db.exec(SCHEMA_SEMESTER_SQL);
  recordMigration(db, "semester", SEMESTER_SCHEMA_VERSION);
  return db;
}

/**
 * 检查学期库是否已初始化（文件存在且有 schema_migrations 记录）。
 */
export function isSemesterDbInitialized(semesterId: string): boolean {
  const dbPath = getSemesterDbPath(semesterId);
  if (!fs.existsSync(dbPath)) return false;

  try {
    const db = openSemesterDb(semesterId);
    const row = db
      .prepare("SELECT COUNT(*) as c FROM schema_migrations WHERE scope = 'semester'")
      .get() as { c: number };
    db.close();
    return row.c > 0;
  } catch {
    return false;
  }
}
