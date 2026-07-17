// ============================================================
// T06B 家长报告投递 migration v7
// - 冻结 report:<yyyy-mm-dd> 的脱敏快照；
// - 为 v6 缺失的 report_deliveries 创建完整表，或为既有表补齐恢复字段；
// - 不删除或重建历史发送记录。
// ============================================================

import type { DatabaseType } from '../connection';

export const SEMESTER_V7_SQL = `
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
`;

const DELIVERY_COLUMNS: ReadonlyArray<[string, string]> = [
  ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_attempt_at', 'TEXT'],
  ['next_retry_at', 'TEXT'],
  ['updated_at', 'TEXT'],
  ['lease_expires_at', 'TEXT'],
];

/**
 * 在 transaction 内执行。SQLite 不支持 `ADD COLUMN IF NOT EXISTS`，因此以
 * table_info 检查保证新库（初始化 schema 已含字段）、带有旧发送表的库和
 * v6 缺失发送表的库都能安全升级。
 */
export function migrateSemesterV7(db: DatabaseType): void {
  db.exec(SEMESTER_V7_SQL);
  const existing = new Set(
    (db.pragma('table_info(report_deliveries)') as Array<{ name: string }>).map((column) => column.name)
  );
  for (const [name, ddl] of DELIVERY_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE report_deliveries ADD COLUMN ${name} ${ddl}`);
    }
  }
}
