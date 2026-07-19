// ============================================================
// 全局库 schema — studybuddy.db（内联，避免 dist 运行态 ENOENT）
// 只存索引与配置，不写学期业务明细
// ============================================================

export const SCHEMA_GLOBAL_SQL = `
-- app_meta：系统配置键值对
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- students：孩子档案（单用户系统，但仍保留表结构）
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- parent_report_targets：家长报告渠道
CREATE TABLE IF NOT EXISTS parent_report_targets (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  target_address TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id)
);

-- semesters：学期索引
CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  semester_code TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL,
  teaching_start_date TEXT NOT NULL,
  teaching_end_date TEXT NOT NULL,
  final_archive_date TEXT,
  archived_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  db_relative_path TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id)
);

-- backup_records：备份记录
CREATE TABLE IF NOT EXISTS backup_records (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note TEXT
);

-- schema_migrations：迁移版本
CREATE TABLE IF NOT EXISTS schema_migrations (
  scope TEXT NOT NULL,
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY(scope, version)
);
`;
