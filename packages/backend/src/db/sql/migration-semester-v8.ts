// ============================================================
// 学期库 migration v8：课程表来源元数据与写入约束
// ============================================================

import type { DatabaseType } from '../connection';

function hasTable(db: DatabaseType, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function hasColumn(db: DatabaseType, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column
  );
}

export function migrateSemesterV8(db: DatabaseType): void {
  // T06B 的最小历史迁移 fixture 仅保存了 v6 版本记录；没有可扩展的课表表时保留其兼容性。
  if (!hasTable(db, 'schedule_entries')) return;

  if (!hasColumn(db, 'schedule_entries', 'source')) {
    db.exec("ALTER TABLE schedule_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';");
  }
  if (!hasColumn(db, 'schedule_entries', 'source_confidence')) {
    db.exec('ALTER TABLE schedule_entries ADD COLUMN source_confidence REAL;');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_schedule_entries_course_weekday_start
      ON schedule_entries(course_instance_id, weekday, start_time);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_entries_unique_course_slot
      ON schedule_entries(course_instance_id, weekday, start_time, end_time);

    DROP TRIGGER IF EXISTS trg_schedule_entries_validate_insert;
    DROP TRIGGER IF EXISTS trg_schedule_entries_validate_update;

    CREATE TRIGGER trg_schedule_entries_validate_insert
    BEFORE INSERT ON schedule_entries
    BEGIN
      SELECT CASE WHEN NEW.weekday NOT BETWEEN 0 AND 6 THEN RAISE(ABORT, 'INVALID_WEEKDAY') END;
      SELECT CASE WHEN NEW.start_time NOT GLOB '[0-2][0-9]:[0-5][0-9]' THEN RAISE(ABORT, 'INVALID_START_TIME') END;
      SELECT CASE WHEN NEW.end_time NOT GLOB '[0-2][0-9]:[0-5][0-9]' THEN RAISE(ABORT, 'INVALID_END_TIME') END;
      SELECT CASE WHEN NEW.start_time >= NEW.end_time THEN RAISE(ABORT, 'INVALID_TIME_RANGE') END;
      SELECT CASE WHEN NEW.source NOT IN ('legacy', 'ocr', 'student_confirmed') THEN RAISE(ABORT, 'INVALID_SOURCE') END;
      SELECT CASE WHEN NEW.source_confidence IS NOT NULL AND (NEW.source_confidence < 0 OR NEW.source_confidence > 1) THEN RAISE(ABORT, 'INVALID_SOURCE_CONFIDENCE') END;
    END;

    CREATE TRIGGER trg_schedule_entries_validate_update
    BEFORE UPDATE ON schedule_entries
    BEGIN
      SELECT CASE WHEN NEW.weekday NOT BETWEEN 0 AND 6 THEN RAISE(ABORT, 'INVALID_WEEKDAY') END;
      SELECT CASE WHEN NEW.start_time NOT GLOB '[0-2][0-9]:[0-5][0-9]' THEN RAISE(ABORT, 'INVALID_START_TIME') END;
      SELECT CASE WHEN NEW.end_time NOT GLOB '[0-2][0-9]:[0-5][0-9]' THEN RAISE(ABORT, 'INVALID_END_TIME') END;
      SELECT CASE WHEN NEW.start_time >= NEW.end_time THEN RAISE(ABORT, 'INVALID_TIME_RANGE') END;
      SELECT CASE WHEN NEW.source NOT IN ('legacy', 'ocr', 'student_confirmed') THEN RAISE(ABORT, 'INVALID_SOURCE') END;
      SELECT CASE WHEN NEW.source_confidence IS NOT NULL AND (NEW.source_confidence < 0 OR NEW.source_confidence > 1) THEN RAISE(ABORT, 'INVALID_SOURCE_CONFIDENCE') END;
    END;
  `);
}
