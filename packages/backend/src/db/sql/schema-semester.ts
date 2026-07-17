// ============================================================
// 学期库 schema — semester.db（内联，避免 dist 运行态 ENOENT）
// 每学期一个独立 SQLite，课程通过 course_instance_id 隔离
// ============================================================

export const SCHEMA_SEMESTER_SQL = `
-- course_instances：某学期的一次具体修读
CREATE TABLE IF NOT EXISTS course_instances (
  id TEXT PRIMARY KEY,
  semester_id TEXT NOT NULL,
  name TEXT NOT NULL,
  retake_of_course_instance_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- assessment_attempts：考试尝试
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  name TEXT NOT NULL,
  attempt_type TEXT NOT NULL DEFAULT 'normal',
  exam_at TEXT NOT NULL,
  goal TEXT,
  daily_study_minutes INTEGER,
  scope_summary TEXT,
  source TEXT,
  source_confidence REAL,
  child_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id)
);

-- study_tasks：学习任务
CREATE TABLE IF NOT EXISTS study_tasks (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  assessment_attempt_id TEXT,
  knowledge_module_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  estimated_minutes INTEGER,
  deadline_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id)
);

-- study_events：时间线与报告证据
CREATE TABLE IF NOT EXISTS study_events (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT,
  task_id TEXT,
  source_system TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  workload_minutes INTEGER,
  parent_visible INTEGER NOT NULL DEFAULT 1,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id),
  FOREIGN KEY(task_id) REFERENCES study_tasks(id)
);

-- jobs：持久化后台任务
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
  created_at TEXT NOT NULL
);

-- parent_reports：家长报告脱敏冻结快照
CREATE TABLE IF NOT EXISTS parent_reports (
  report_key TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parent_reports_report_date
  ON parent_reports(report_date);

-- report_deliveries：报告渠道去重与可恢复状态
CREATE TABLE IF NOT EXISTS report_deliveries (
  report_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('smtp', 'feishu')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'sending', 'sent', 'failed')),
  sent_at TEXT,
  error_summary TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  updated_at TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(report_key, channel),
  FOREIGN KEY(report_key) REFERENCES parent_reports(report_key)
);
-- materials：文件索引
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id)
);

-- normalized_texts：格式转换后的纯文本
CREATE TABLE IF NOT EXISTS normalized_texts (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(material_id) REFERENCES materials(id)
);

-- structured_notes：AI 生成的结构化笔记
CREATE TABLE IF NOT EXISTS structured_notes (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  knowledge_module_id TEXT,
  markdown TEXT NOT NULL,
  highlights_json TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(material_id) REFERENCES materials(id)
);

-- mind_maps：思维导图数据
CREATE TABLE IF NOT EXISTS mind_maps (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markmap',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES structured_notes(id)
);

-- knowledge_modules：可考知识模块
CREATE TABLE IF NOT EXISTS knowledge_modules (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  material_id TEXT,
  title TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  exam_content TEXT,
  source_evidence TEXT,
  learn_status TEXT NOT NULL DEFAULT 'not_started',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id),
  FOREIGN KEY(material_id) REFERENCES materials(id)
);

-- schema_migrations（学期库独立）
CREATE TABLE IF NOT EXISTS schema_migrations (
  scope TEXT NOT NULL,
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY(scope, version)
);
`;
