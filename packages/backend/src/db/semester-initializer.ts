// ============================================================
// 学期初始化服务
// 以 staging → migration → 全局索引 ready=0 → atomic promote → ready=1 完成。
// 失败路径必须清理全局索引、新建 student 与目录半成品。
// ============================================================

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { DatabaseType } from "./connection";
import { checkpointAndClose } from "./connection";
import { initGlobalDbAtPath, initSemesterDbAtPath } from "./migrations";

export interface SemesterInitializationInput {
  studentName: string;
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string;
}

export interface InitializedSemester {
  semesterId: string;
  semesterCode: string;
  globalDbPath: string;
  semesterDbPath: string;
  semesterDir: string;
  status: "active";
}

export interface SemesterInitializerOptions {
  appDataRoot: string;
  promoteStaging?: (stagingDir: string, finalDir: string) => void;
  markReady?: (db: DatabaseType, semesterId: string, now: string) => void;
}

export class SemesterInitializationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "SemesterInitializationError";
  }
}

/** 严格校验 ISO 日历日期，拒绝 2026-02-30 一类被 Date.parse 归一化的输入。 */
export function isStrictIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 验证并规范化 API 输入；验证阶段不触碰文件系统和数据库。 */
export function validateSemesterInitializationInput(
  input: SemesterInitializationInput
): SemesterInitializationInput {
  const studentName = input.studentName?.trim();
  const semesterCode = input.semesterCode?.trim();

  if (!studentName || !semesterCode || !input.teachingStartDate || !input.teachingEndDate) {
    throw new SemesterInitializationError(
      "MISSING_PARAMS",
      400,
      "studentName, semesterCode, teachingStartDate, teachingEndDate are required"
    );
  }

  if (studentName.length > 100 || semesterCode.length > 100) {
    throw new SemesterInitializationError(
      "INVALID_PARAMS",
      400,
      "studentName and semesterCode must be ≤ 100 chars"
    );
  }

  for (const [field, value] of [
    ["teachingStartDate", input.teachingStartDate],
    ["teachingEndDate", input.teachingEndDate],
    ["finalArchiveDate", input.finalArchiveDate],
  ] as const) {
    if (value !== undefined && !isStrictIsoDate(value)) {
      throw new SemesterInitializationError(
        "INVALID_DATE",
        400,
        `${field} "${value}" is not a valid ISO calendar date (YYYY-MM-DD)`
      );
    }
  }

  if (input.teachingStartDate > input.teachingEndDate) {
    throw new SemesterInitializationError(
      "INVALID_DATE_RANGE",
      400,
      "teachingStartDate must be ≤ teachingEndDate"
    );
  }

  if (input.finalArchiveDate && input.finalArchiveDate < input.teachingEndDate) {
    throw new SemesterInitializationError(
      "INVALID_DATE_RANGE",
      400,
      "finalArchiveDate must be ≥ teachingEndDate"
    );
  }

  return {
    studentName,
    semesterCode,
    teachingStartDate: input.teachingStartDate,
    teachingEndDate: input.teachingEndDate,
    ...(input.finalArchiveDate === undefined
      ? {}
      : { finalArchiveDate: input.finalArchiveDate }),
  };
}

function writeMaintenanceFailure(
  appDataRoot: string,
  originalError: SemesterInitializationError,
  cleanupErrors: readonly Error[]
): void {
  try {
    const logDir = path.join(appDataRoot, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, "semester-init-failures.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        code: originalError.code,
        message: originalError.message,
        cleanupErrors: cleanupErrors.map((error) => error.message),
      })}\n`,
      "utf8"
    );
  } catch {
    // 最后一道维护日志失败时，仍保留原始初始化错误给调用方。
  }
}

function removeDirIfPresent(directory: string): void {
  if (fs.existsSync(directory)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function closeDb(db: DatabaseType | undefined): void {
  if (!db) return;
  try {
    checkpointAndClose(db);
  } catch {
    try {
      db.close();
    } catch {
      // 关闭失败不能覆盖业务错误。
    }
  }
}

/**
 * 创建一个学期的全局索引、独立业务库和目录。
 * 跨 SQLite 文件与文件系统无法形成单一事务，因此失败时执行可审计补偿。
 */
export function initializeSemester(
  rawInput: SemesterInitializationInput,
  options: SemesterInitializerOptions
): InitializedSemester {
  const input = validateSemesterInitializationInput(rawInput);
  const appDataRoot = path.resolve(options.appDataRoot);
  const globalDbPath = path.join(appDataRoot, "studybuddy.db");
  const semesterId = crypto.randomUUID();
  const semestersRoot = path.join(appDataRoot, "semesters");
  const stagingDir = path.join(semestersRoot, `${semesterId}.staging`);
  const finalDir = path.join(semestersRoot, semesterId);
  const stagingDbPath = path.join(stagingDir, "semester.db");
  const finalDbPath = path.join(finalDir, "semester.db");
  const now = new Date().toISOString();

  let globalDb: DatabaseType | undefined;
  let semesterInserted = false;
  let createdStudentId: string | undefined;
  let promoted = false;
  let phase: "prepare" | "staging" | "semester_db" | "global_write" | "promote" | "mark_ready" = "prepare";

  const compensate = (error: SemesterInitializationError): never => {
    const cleanupErrors: Error[] = [];

    try {
      if (globalDb && semesterInserted) {
        globalDb.transaction(() => {
          globalDb!.prepare("DELETE FROM semesters WHERE id = ?").run(semesterId);
          if (createdStudentId) {
            globalDb!
              .prepare(
                `DELETE FROM students
                 WHERE id = ?
                   AND NOT EXISTS (SELECT 1 FROM semesters WHERE student_id = ?)`
              )
              .run(createdStudentId, createdStudentId);
          }
        })();
      }
    } catch (cleanupError) {
      cleanupErrors.push(
        cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError))
      );
    }

    for (const directory of [stagingDir, finalDir]) {
      try {
        removeDirIfPresent(directory);
      } catch (cleanupError) {
        cleanupErrors.push(
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError))
        );
      }
    }

    closeDb(globalDb);
    globalDb = undefined;

    if (cleanupErrors.length > 0) {
      writeMaintenanceFailure(appDataRoot, error, cleanupErrors);
      throw new SemesterInitializationError(
        "COMPENSATION_FAILED",
        500,
        `${error.message}; compensation also failed`,
        cleanupErrors
      );
    }

    throw error;
  };

  try {
    phase = "prepare";
    fs.mkdirSync(semestersRoot, { recursive: true });
    globalDb = initGlobalDbAtPath(globalDbPath);

    const duplicate = globalDb
      .prepare("SELECT id FROM semesters WHERE semester_code = ?")
      .get(input.semesterCode) as { id: string } | undefined;
    if (duplicate) {
      throw new SemesterInitializationError(
        "SEMESTER_CODE_EXISTS",
        409,
        `semester_code "${input.semesterCode}" already exists`
      );
    }

    phase = "staging";
    fs.mkdirSync(path.join(stagingDir, "files"), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, "tmp"), { recursive: true });

    phase = "semester_db";
    const semesterDb = initSemesterDbAtPath(stagingDbPath);
    checkpointAndClose(semesterDb);

    phase = "global_write";
    globalDb.transaction(() => {
      const existingStudent = globalDb!
        .prepare("SELECT id FROM students WHERE name = ?")
        .get(input.studentName) as { id: string } | undefined;
      const studentId = existingStudent?.id ?? crypto.randomUUID();

      if (!existingStudent) {
        globalDb!
          .prepare(
            "INSERT INTO students (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
          )
          .run(studentId, input.studentName, now, now);
        createdStudentId = studentId;
      }

      globalDb!
        .prepare(
          `INSERT INTO semesters
            (id, semester_code, student_id, teaching_start_date, teaching_end_date,
             final_archive_date, status, db_relative_path, ready, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)`
        )
        .run(
          semesterId,
          input.semesterCode,
          studentId,
          input.teachingStartDate,
          input.teachingEndDate,
          input.finalArchiveDate ?? null,
          `semesters/${semesterId}/semester.db`,
          now,
          now
        );
      semesterInserted = true;
    })();

    phase = "promote";
    (options.promoteStaging ?? fs.renameSync)(stagingDir, finalDir);
    promoted = true;

    const markReady =
      options.markReady ??
      ((db: DatabaseType, id: string, timestamp: string) => {
        db.prepare("UPDATE semesters SET ready = 1, updated_at = ? WHERE id = ?").run(
          timestamp,
          id
        );
      });
    phase = "mark_ready";
    markReady(globalDb, semesterId, now);

    closeDb(globalDb);
    globalDb = undefined;

    return {
      semesterId,
      semesterCode: input.semesterCode,
      globalDbPath,
      semesterDbPath: finalDbPath,
      semesterDir: finalDir,
      status: "active",
    };
  } catch (cause) {
    const error =
      cause instanceof SemesterInitializationError
        ? cause
        : new SemesterInitializationError(
            phase === "promote"
              ? "RENAME_FAILED"
              : phase === "mark_ready"
                ? "READY_FLAG_FAILED"
                : phase === "staging"
                  ? "STAGING_DIR_FAILED"
                  : phase === "semester_db"
                    ? "SEMESTER_DB_INIT_FAILED"
                    : phase === "global_write"
                      ? "GLOBAL_DB_WRITE_FAILED"
                      : "SEMESTER_INIT_FAILED",
            500,
            `Failed to initialize semester: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause
          );
    return compensate(error);
  } finally {
    closeDb(globalDb);
  }
}