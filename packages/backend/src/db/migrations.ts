// ============================================================
// Migration 执行器 — 后端开发规范第 4 节
// 简单 version 递增，不引入复杂 migration 框架。
// ============================================================

import fs from "fs";
import path from "path";
import type { DatabaseType } from "./connection";
import { openGlobalDb, openSemesterDb } from "./connection";
import { getSemesterDbPath, getSemesterFilesDir, getSemesterTmpDir } from "./paths";

const SQL_DIR = path.join(__dirname, "sql");
const GLOBAL_SCHEMA_VERSION = 1;
const SEMESTER_SCHEMA_VERSION = 1;

/**
 * 查询已执行的 migration version。
 */
export function getAppliedVersion(
  db: DatabaseType,
  scope: string
): number {
  const row = db
    .prepare("SELECT MAX(version) as v FROM schema_migrations WHERE scope = ?")
    .get(scope) as { v: number | null } | undefined;

  return row?.v ?? 0;
}

/**
 * 记录已执行的 migration version。
 */
function recordMigration(
  db: DatabaseType,
  scope: string,
  version: number
): void {
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (scope, version, applied_at) VALUES (?, ?, ?)"
  ).run(scope, version, new Date().toISOString());
}

/**
 * 初始化全局库 studybuddy.db。
 * - 创建所有全局表
 * - 记录 schema version 1
 */
export function initGlobalDb(): DatabaseType {
  const db = openGlobalDb();

  // 读取并执行全局 schema
  const schemaSql = fs.readFileSync(
    path.join(SQL_DIR, "schema-global.sql"),
    "utf-8"
  );
  db.exec(schemaSql);

  // 记录 migration
  recordMigration(db, "global", GLOBAL_SCHEMA_VERSION);

  return db;
}

/**
 * 初始化学期库 semester.db。
 * - 创建学期目录结构
 * - 创建所有学期表
 * - 记录 schema version 1
 */
export function initSemesterDb(semesterId: string): DatabaseType {
  // 确保学期目录存在
  const filesDir = getSemesterFilesDir(semesterId);
  const tmpDir = getSemesterTmpDir(semesterId);
  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  // 打开学期库
  const db = openSemesterDb(semesterId);

  // 读取并执行学期 schema
  const schemaSql = fs.readFileSync(
    path.join(SQL_DIR, "schema-semester.sql"),
    "utf-8"
  );
  db.exec(schemaSql);

  // 记录 migration
  recordMigration(db, "semester", SEMESTER_SCHEMA_VERSION);

  return db;
}

/**
 * 检查学期库是否已初始化（文件存在且有 schema_migrations 表）。
 */
export function isSemesterDbInitialized(semesterId: string): boolean {
  const dbPath = getSemesterDbPath(semesterId);
  if (!fs.existsSync(dbPath)) return false;

  try {
    const db = openSemesterDb(semesterId);
    const row = db
      .prepare(
        "SELECT COUNT(*) as c FROM schema_migrations WHERE scope = 'semester'"
      )
      .get() as { c: number };
    db.close();
    return row.c > 0;
  } catch {
    return false;
  }
}
