// ============================================================
// 学期全局库 migration v2：T09E 学期实际归档时间
// - final_archive_date 是计划/边界日期；archived_at 是真实操作时间。
// - 新库 schema 已包含最终列；旧库按需补列，确保 migration 可重复安全检查。
// ============================================================

import type { DatabaseType } from '../connection';

export function migrateGlobalV2(db: DatabaseType): void {
  const columns = db.prepare('PRAGMA table_info(semesters)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'archived_at')) {
    db.exec('ALTER TABLE semesters ADD COLUMN archived_at TEXT;');
  }
}
