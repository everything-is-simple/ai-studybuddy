// ============================================================
// 学期库 migration v2：S1 业务字段补齐
// - schedule_entries：课程表条目（写入时 weekday 仅允许 0..6）
// - assessment_attempts：考试确认状态与确认时间
// - assessment_date_changes：考试日期变更历史
// 两条 ALTER TABLE 与两个 CREATE TABLE 位于同一常量，由 runner 单事务执行。
// ============================================================

export const SEMESTER_V2_SQL = `
CREATE TABLE schedule_entries (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id)
);

ALTER TABLE assessment_attempts ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE assessment_attempts ADD COLUMN confirmed_at TEXT;

CREATE TABLE assessment_date_changes (
  id TEXT PRIMARY KEY,
  assessment_attempt_id TEXT NOT NULL,
  previous_exam_at TEXT NOT NULL,
  next_exam_at TEXT NOT NULL,
  source TEXT,
  changed_at TEXT NOT NULL,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id)
);
`;
