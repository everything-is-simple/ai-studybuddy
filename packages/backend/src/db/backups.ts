// ============================================================
// SQLite 备份与恢复
// 备份通过 checkpoint 后复制，记录写入全局库；恢复先校验备份副本，
// 并删除旧 WAL/SHM，避免损坏副本的旁路日志污染恢复结果。
// ============================================================

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { backupDb, checkpointAndClose, openDbAtPath, runIntegrityCheck } from "./connection";
import { initGlobalDbAtPath } from "./migrations";

export interface CreateDatabaseBackupInput {
  scope: "global" | "semester";
  databasePath: string;
  globalDbPath: string;
  backupsDir: string;
  note?: string;
}

export interface DatabaseBackup {
  id: string;
  backupPath: string;
  createdAt: string;
}

export interface RestoreDatabaseInput {
  backupPath: string;
  destinationPath: string;
}

/** 返回 ok 或可记录的错误摘要，供健康检查与恢复前校验使用。 */
export function checkDatabaseIntegrityAtPath(databasePath: string): string {
  try {
    const db = openDbAtPath(databasePath);
    try {
      return runIntegrityCheck(db);
    } finally {
      db.close();
    }
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * 创建可恢复副本，并在全局库登记 backup_records。
 * 复制前 checkpoint，保证 WAL 中已提交页面进入备份的主数据库文件。
 */
export function createDatabaseBackup(input: CreateDatabaseBackupInput): DatabaseBackup {
  if (!fs.existsSync(input.databasePath)) {
    throw new Error(`[BACKUP] database does not exist: ${input.databasePath}`);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const safeTimestamp = createdAt.replace(/[:.]/g, "-");
  const backupPath = path.join(
    path.resolve(input.backupsDir),
    `${input.scope}-${safeTimestamp}-${id}.db`
  );

  const sourceDb = openDbAtPath(input.databasePath);
  try {
    backupDb(sourceDb, backupPath);
  } finally {
    sourceDb.close();
  }

  if (checkDatabaseIntegrityAtPath(backupPath) !== "ok") {
    fs.rmSync(backupPath, { force: true });
    throw new Error(`[BACKUP] integrity check failed after copy: ${backupPath}`);
  }

  const globalDb = initGlobalDbAtPath(input.globalDbPath);
  try {
    globalDb
      .prepare(
        "INSERT INTO backup_records (id, scope, backup_path, created_at, note) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, input.scope, backupPath, createdAt, input.note ?? null);
  } finally {
    checkpointAndClose(globalDb);
  }

  return { id, backupPath, createdAt };
}

/**
 * 用已校验的备份副本覆盖目标数据库。
 * 删除目标的 -wal/-shm，防止旧旁路日志在下次打开时重新污染数据库。
 */
export function restoreDatabaseFromBackup(input: RestoreDatabaseInput): void {
  if (!fs.existsSync(input.backupPath)) {
    throw new Error(`[RESTORE] backup does not exist: ${input.backupPath}`);
  }
  if (checkDatabaseIntegrityAtPath(input.backupPath) !== "ok") {
    throw new Error(`[RESTORE] backup integrity check failed: ${input.backupPath}`);
  }

  fs.mkdirSync(path.dirname(input.destinationPath), { recursive: true });
  for (const sidecar of [`${input.destinationPath}-wal`, `${input.destinationPath}-shm`]) {
    fs.rmSync(sidecar, { force: true });
  }
  fs.copyFileSync(input.backupPath, input.destinationPath);

  const integrity = checkDatabaseIntegrityAtPath(input.destinationPath);
  if (integrity !== "ok") {
    throw new Error(`[RESTORE] restored database integrity check failed: ${integrity}`);
  }
}