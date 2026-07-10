const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, exam_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_tasks (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      deadline TEXT, study_minutes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      FOREIGN KEY(course_id) REFERENCES courses(id)
    );
    CREATE TABLE IF NOT EXISTS study_events (
      id TEXT PRIMARY KEY, task_id TEXT, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL, FOREIGN KEY(task_id) REFERENCES study_tasks(id)
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, job_type TEXT NOT NULL, status TEXT NOT NULL,
      payload_json TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1, available_at TEXT NOT NULL,
      started_at TEXT, completed_at TEXT, error_summary TEXT
    );
    CREATE TABLE IF NOT EXISTS report_deliveries (
      report_key TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
      sent_at TEXT, error_summary TEXT, PRIMARY KEY(report_key, channel)
    );
  `);
  return db;
}

function backupDatabase(db, destination) {
  db.pragma("wal_checkpoint(TRUNCATE)");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(db.name, destination);
}

module.exports = { openDatabase, backupDatabase };
