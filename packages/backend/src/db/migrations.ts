// ============================================================
// SQLite migration 执行器
// - schema 以内联 TS 常量作为唯一事实来源；
// - 每个版本在独立 SQLite transaction 中执行并记录；
// - 正式路径与 staging 路径调用同一套 migration。
// ============================================================

import fs from 'fs';
import type { DatabaseType } from './connection';
import { openDbAtPath, openGlobalDb, openSemesterDb } from './connection';
import { getSemesterDbPath, getSemesterFilesDir, getSemesterTmpDir } from './paths';
import { SCHEMA_GLOBAL_SQL } from './sql/schema-global';
import { SCHEMA_SEMESTER_SQL } from './sql/schema-semester';
import { SEMESTER_V2_SQL } from './sql/migration-semester-v2';
import { SEMESTER_V3_SQL } from './sql/migration-semester-v3';
import { SEMESTER_V4_SQL } from './sql/migration-semester-v4';
import { SEMESTER_V5_SQL } from './sql/migration-semester-v5';
import { SEMESTER_V6_SQL } from './sql/migration-semester-v6';
import { migrateSemesterV7 } from './sql/migration-semester-v7';

export interface Migration {
  version: number;
  sql?: string;
  apply?: (db: DatabaseType) => void;
}

const GLOBAL_MIGRATIONS: readonly Migration[] = [{ version: 1, sql: SCHEMA_GLOBAL_SQL }];

const SEMESTER_MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: SCHEMA_SEMESTER_SQL },
  { version: 2, sql: SEMESTER_V2_SQL },
  { version: 3, sql: SEMESTER_V3_SQL },
  { version: 4, sql: SEMESTER_V4_SQL },
  { version: 5, sql: SEMESTER_V5_SQL },
  { version: 6, sql: SEMESTER_V6_SQL },
  { version: 7, apply: migrateSemesterV7 },
];

const CURRENT_JOBS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    available_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    error_summary TEXT,
    created_at TEXT NOT NULL,
    material_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_material_type_created
    ON jobs(material_id, job_type, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_material_type_active
    ON jobs(material_id, job_type)
    WHERE material_id IS NOT NULL AND status IN ('pending', 'running');
`;

function ensureMigrationTable(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      scope TEXT NOT NULL,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY(scope, version)
    );
  `);
}

/** 查询已执行的最高 migration version。 */
export function getAppliedVersion(db: DatabaseType, scope: string): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_migrations WHERE scope = ?').get(scope) as
    { v: number | null } | undefined;
  return row?.v ?? 0;
}

/**
 * 顺序执行尚未应用的 migration。
 * 每一个版本的 SQL 和 migration 记录在同一 transaction 内提交。
 */
export function applyMigrations(
  db: DatabaseType,
  scope: 'global' | 'semester',
  migrations: readonly Migration[]
): void {
  ensureMigrationTable(db);

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const current = getAppliedVersion(db, scope);
  const latest = ordered.at(-1)?.version ?? 0;

  if (current > latest) {
    throw new Error(`[MIGRATION] ${scope} database version ${current} is newer than application version ${latest}`);
  }

  let expectedVersion = current + 1;
  for (const migration of ordered) {
    if (migration.version <= current) continue;
    if (migration.version !== expectedVersion) {
      throw new Error(`[MIGRATION] ${scope} migration gap: expected ${expectedVersion}, got ${migration.version}`);
    }

    db.transaction(() => {
      if (migration.apply) {
        migration.apply(db);
      } else if (migration.sql) {
        db.exec(migration.sql);
      } else {
        throw new Error(`[MIGRATION] ${scope} migration ${migration.version} has no executor`);
      }
      db.prepare('INSERT INTO schema_migrations (scope, version, applied_at) VALUES (?, ?, ?)').run(
        scope,
        migration.version,
        new Date().toISOString()
      );
    })();

    expectedVersion += 1;
  }
}

export function migrateGlobalDb(db: DatabaseType): void {
  applyMigrations(db, 'global', GLOBAL_MIGRATIONS);
}

export function migrateSemesterDb(db: DatabaseType): void {
  applyMigrations(db, 'semester', SEMESTER_MIGRATIONS);
  ensureCurrentJobsTable(db);
}

function ensureCurrentJobsTable(db: DatabaseType): void {
  const jobsExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'jobs'")
    .get() as { 1: number } | undefined;

  if (!jobsExists) {
    db.exec(CURRENT_JOBS_TABLE_SQL);
    return;
  }

  const columns = db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'material_id')) {
    db.exec('ALTER TABLE jobs ADD COLUMN material_id TEXT;');
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_material_type_created
      ON jobs(material_id, job_type, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_material_type_active
      ON jobs(material_id, job_type)
      WHERE material_id IS NOT NULL AND status IN ('pending', 'running');
  `);
}

/** 初始化任意绝对路径上的全局库，供正式运行与集成测试复用。 */
export function initGlobalDbAtPath(dbPath: string): DatabaseType {
  const db = openDbAtPath(dbPath);
  migrateGlobalDb(db);
  return db;
}

/** 初始化任意绝对路径上的学期库，供 staging 与正式路径复用。 */
export function initSemesterDbAtPath(dbPath: string): DatabaseType {
  const db = openDbAtPath(dbPath);
  migrateSemesterDb(db);
  return db;
}

/** 初始化标准全局库 studybuddy.db。 */
export function initGlobalDb(): DatabaseType {
  const db = openGlobalDb();
  migrateGlobalDb(db);
  return db;
}

/** 初始化标准学期库 semester.db，同时确保 files/ 与 tmp/ 目录存在。 */
export function initSemesterDb(semesterId: string): DatabaseType {
  fs.mkdirSync(getSemesterFilesDir(semesterId), { recursive: true });
  fs.mkdirSync(getSemesterTmpDir(semesterId), { recursive: true });

  const db = openSemesterDb(semesterId);
  migrateSemesterDb(db);
  return db;
}

/** 检查标准学期库是否已初始化。 */
export function isSemesterDbInitialized(semesterId: string): boolean {
  const dbPath = getSemesterDbPath(semesterId);
  if (!fs.existsSync(dbPath)) return false;

  try {
    const db = openSemesterDb(semesterId);
    const version = getAppliedVersion(db, 'semester');
    db.close();
    return version > 0;
  } catch {
    return false;
  }
}
