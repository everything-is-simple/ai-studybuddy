// ============================================================
// T09E 学期访问边界：归档学期只读、当前/活跃学期可写。
// - 仅查询全局学期索引，不迁移/移动/删除学期数据。
// - 读边界允许 active 与 archived；写边界拒绝 archived。
// ============================================================

import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { getAppliedVersion, migrateGlobalDb } from '../db/migrations';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENT_SEMESTER_VERSION = 11;

export class SemesterAccessError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'SemesterAccessError';
  }
}

interface SemesterAccessRow {
  id: string;
  status: 'active' | 'archived';
  ready: number;
  db_relative_path: string;
}

export interface SemesterAccessInfo {
  id: string;
  status: 'active' | 'archived';
  dbPath: string;
}

export function assertSemesterReadable(semesterIdValue: unknown): SemesterAccessInfo {
  const row = readSemesterAccessRow(semesterIdValue);
  if (row.status !== 'active' && row.status !== 'archived') {
    throw new SemesterAccessError('SEMESTER_NOT_FOUND', 404, '学期不存在');
  }
  return toAccessInfo(row);
}

export function assertSemesterWritable(semesterIdValue: unknown): SemesterAccessInfo {
  const info = assertSemesterReadable(semesterIdValue);
  if (info.status === 'archived') {
    throw new SemesterAccessError('SEMESTER_ARCHIVED', 409, '归档学期只能查看历史，不能新增或修改数据');
  }
  return info;
}

function readSemesterAccessRow(semesterIdValue: unknown): SemesterAccessRow {
  if (typeof semesterIdValue !== 'string' || !UUID_RE.test(semesterIdValue)) {
    throw new SemesterAccessError('SEMESTER_NOT_FOUND', 404, '学期不存在');
  }

  let db: DatabaseType | undefined;
  try {
    db = openExistingDbAtPath(getGlobalDbPath());
    migrateGlobalDb(db);
    const row = db
      .prepare('SELECT id, status, ready, db_relative_path FROM semesters WHERE id = ?')
      .get(semesterIdValue) as SemesterAccessRow | undefined;
    if (!row) throw new SemesterAccessError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    if (row.ready !== 1) throw new SemesterAccessError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    if (row.db_relative_path !== `semesters/${row.id}/semester.db`) {
      throw new SemesterAccessError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    if (!fs.existsSync(getSemesterDbPath(row.id))) {
      throw new SemesterAccessError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    }
    assertSemesterDbVersion(row.id);
    return row;
  } catch (error) {
    if (error instanceof SemesterAccessError) throw error;
    throw new SemesterAccessError('SEMESTER_NOT_FOUND', 404, '学期不存在');
  } finally {
    db?.close();
  }
}

function assertSemesterDbVersion(semesterId: string): void {
  const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
  try {
    if (getAppliedVersion(db, 'semester') !== CURRENT_SEMESTER_VERSION) {
      throw new SemesterAccessError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    }
  } finally {
    db.close();
  }
}

function toAccessInfo(row: SemesterAccessRow): SemesterAccessInfo {
  return { id: row.id, status: row.status, dbPath: getSemesterDbPath(row.id) };
}
