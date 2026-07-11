// ============================================================
// 开发验证 API — Phase 0.8 T02
// 仅用于验证数据库底座，不做完整业务逻辑。
// ============================================================

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { ApiSuccess, ApiError } from "@ai-studybuddy/shared";
import { initGlobalDb, initSemesterDb } from "../db/migrations";
import {
  openGlobalDb,
  openSemesterDb,
  runIntegrityCheck,
  isWalEnabled,
  isForeignKeysOn,
  checkpointAndClose,
} from "../db/connection";
import {
  getGlobalDbPath,
  getSemesterDbPath,
  getSemesterDir,
} from "../db/paths";
import { config } from "../config/env";

const router: Router = Router();

// ── 工具函数 ──────────────────────────────────────────────────

/** 校验 ISO 日期格式（YYYY-MM-DD）。 */
function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

/** 清理半成品 staging 目录（失败时调用）。 */
function cleanupStaging(stagingDir: string): void {
  try {
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  } catch {
    // 清理失败不抛出，不影响错误响应
  }
}

// ── POST /api/dev/init-semester ────────────────────────────
// 可补偿原子化学期初始化：
//   1. 全量入参校验（日期格式、区间合法性）
//   2. 重复检查（semesterCode 唯一性）
//   3. staging 目录创建
//   4. 学期库初始化
//   5. 全局库事务写入（student upsert + semester insert，ready=0）
//   6. atomic rename staging → 正式目录
//   7. 更新 ready=1
//   任意步骤失败 → 清理 staging、回滚全局库写入

interface InitSemesterBody {
  studentName: string;
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string;
}

router.post("/init-semester", (req: Request, res: Response) => {
  const body = req.body as InitSemesterBody;

  // ── Step 1：全量入参校验 ──────────────────────────────────
  if (
    !body.studentName?.trim() ||
    !body.semesterCode?.trim() ||
    !body.teachingStartDate ||
    !body.teachingEndDate
  ) {
    const err: ApiError = {
      success: false,
      error: {
        code: "MISSING_PARAMS",
        message:
          "studentName, semesterCode, teachingStartDate, teachingEndDate are required",
      },
    };
    return res.status(400).json(err);
  }

  if (body.studentName.trim().length > 100) {
    const err: ApiError = {
      success: false,
      error: { code: "INVALID_PARAMS", message: "studentName must be ≤ 100 chars" },
    };
    return res.status(400).json(err);
  }

  if (!isIsoDate(body.teachingStartDate)) {
    const err: ApiError = {
      success: false,
      error: {
        code: "INVALID_DATE",
        message: `teachingStartDate "${body.teachingStartDate}" is not a valid ISO date (YYYY-MM-DD)`,
      },
    };
    return res.status(400).json(err);
  }

  if (!isIsoDate(body.teachingEndDate)) {
    const err: ApiError = {
      success: false,
      error: {
        code: "INVALID_DATE",
        message: `teachingEndDate "${body.teachingEndDate}" is not a valid ISO date (YYYY-MM-DD)`,
      },
    };
    return res.status(400).json(err);
  }

  if (body.teachingStartDate > body.teachingEndDate) {
    const err: ApiError = {
      success: false,
      error: {
        code: "INVALID_DATE_RANGE",
        message: "teachingStartDate must be ≤ teachingEndDate",
      },
    };
    return res.status(400).json(err);
  }

  if (body.finalArchiveDate !== undefined) {
    if (!isIsoDate(body.finalArchiveDate)) {
      const err: ApiError = {
        success: false,
        error: {
          code: "INVALID_DATE",
          message: `finalArchiveDate "${body.finalArchiveDate}" is not a valid ISO date (YYYY-MM-DD)`,
        },
      };
      return res.status(400).json(err);
    }
    if (body.finalArchiveDate < body.teachingEndDate) {
      const err: ApiError = {
        success: false,
        error: {
          code: "INVALID_DATE_RANGE",
          message: "finalArchiveDate must be ≥ teachingEndDate",
        },
      };
      return res.status(400).json(err);
    }
  }

  // ── Step 2：初始化全局库 + 重复检查 ──────────────────────
  let globalDb = initGlobalDb();

  const existingSemester = globalDb
    .prepare("SELECT id FROM semesters WHERE semester_code = ?")
    .get(body.semesterCode.trim()) as { id: string } | undefined;

  if (existingSemester) {
    checkpointAndClose(globalDb);
    const err: ApiError = {
      success: false,
      error: {
        code: "SEMESTER_CODE_EXISTS",
        message: `semester_code "${body.semesterCode}" already exists`,
      },
    };
    return res.status(409).json(err);
  }

  // ── Step 3：staging 目录 ───────────────────────────────────
  const semesterId = crypto.randomUUID();
  const dataRoot = config.appDataRoot;
  const stagingDir = path.join(dataRoot, "semesters", `${semesterId}-staging`);

  try {
    fs.mkdirSync(path.join(stagingDir, "files"), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, "tmp"), { recursive: true });
  } catch (e) {
    checkpointAndClose(globalDb);
    cleanupStaging(stagingDir);
    const err: ApiError = {
      success: false,
      error: {
        code: "STAGING_DIR_FAILED",
        message: `Failed to create staging directory: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
    return res.status(500).json(err);
  }

  // ── Step 4：学期库初始化（在 staging 路径下） ───────────────
  // initSemesterDb 使用标准路径；先在 staging 手动创建 db，再复制
  // 为简化实现，学期 db 直接在 staging 下创建，rename 后路径不变
  let semesterDb;
  const stagingDbPath = path.join(stagingDir, "semester.db");

  try {
    // 直接用 better-sqlite3 在 staging 路径建库
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    semesterDb = new Database(stagingDbPath);
    semesterDb.pragma("journal_mode = WAL");
    semesterDb.pragma("foreign_keys = ON");

    const { SCHEMA_SEMESTER_SQL } = require("../db/sql/schema-semester") as {
      SCHEMA_SEMESTER_SQL: string;
    };
    semesterDb.exec(SCHEMA_SEMESTER_SQL);

    semesterDb
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (scope, version, applied_at) VALUES (?, ?, ?)"
      )
      .run("semester", 1, new Date().toISOString());

    semesterDb.pragma("wal_checkpoint(TRUNCATE)");
    semesterDb.close();
  } catch (e) {
    checkpointAndClose(globalDb);
    cleanupStaging(stagingDir);
    const err: ApiError = {
      success: false,
      error: {
        code: "SEMESTER_DB_INIT_FAILED",
        message: `Failed to initialize semester.db: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
    return res.status(500).json(err);
  }

  // ── Step 5：全局库事务写入（ready=0） ────────────────────
  const now = new Date().toISOString();
  const studentName = body.studentName.trim();
  const semesterCode = body.semesterCode.trim();

  try {
    const insertAll = globalDb.transaction(() => {
      // student upsert（仅当不存在时插入）
      const existingStudent = globalDb
        .prepare("SELECT id FROM students WHERE name = ?")
        .get(studentName) as { id: string } | undefined;

      const actualStudentId = existingStudent?.id ?? crypto.randomUUID();

      if (!existingStudent) {
        globalDb
          .prepare(
            "INSERT INTO students (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
          )
          .run(actualStudentId, studentName, now, now);
      }

      // semester insert（ready=0，rename 完成后再置 1）
      globalDb
        .prepare(
          `INSERT INTO semesters
            (id, semester_code, student_id, teaching_start_date, teaching_end_date,
             final_archive_date, status, db_relative_path, ready, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)`
        )
        .run(
          semesterId,
          semesterCode,
          actualStudentId,
          body.teachingStartDate,
          body.teachingEndDate,
          body.finalArchiveDate ?? null,
          `semesters/${semesterId}/semester.db`,
          now,
          now
        );

      return actualStudentId;
    });

    insertAll();
  } catch (e) {
    checkpointAndClose(globalDb);
    cleanupStaging(stagingDir);
    const err: ApiError = {
      success: false,
      error: {
        code: "GLOBAL_DB_WRITE_FAILED",
        message: `Failed to write global index: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
    return res.status(500).json(err);
  }

  // ── Step 6：atomic rename staging → 正式目录 ─────────────
  const finalDir = getSemesterDir(semesterId);

  try {
    fs.renameSync(stagingDir, finalDir);
  } catch (e) {
    // rename 失败：回滚全局库 semester 行（student 行保留，无害）
    try {
      globalDb
        .prepare("DELETE FROM semesters WHERE id = ?")
        .run(semesterId);
    } catch {
      // 回滚失败记录，不影响错误响应
    }
    checkpointAndClose(globalDb);
    cleanupStaging(stagingDir);
    const err: ApiError = {
      success: false,
      error: {
        code: "RENAME_FAILED",
        message: `Failed to promote staging directory: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
    return res.status(500).json(err);
  }

  // ── Step 7：更新 ready=1 ──────────────────────────────────
  try {
    globalDb
      .prepare("UPDATE semesters SET ready = 1, updated_at = ? WHERE id = ?")
      .run(now, semesterId);
  } catch (e) {
    // ready 置位失败：学期目录已存在，但全局索引 ready=0，标记为异常
    checkpointAndClose(globalDb);
    const err: ApiError = {
      success: false,
      error: {
        code: "READY_FLAG_FAILED",
        message: `Semester directory created but failed to mark ready: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
    return res.status(500).json(err);
  }

  checkpointAndClose(globalDb);

  const response: ApiSuccess = {
    success: true,
    data: {
      globalDb: getGlobalDbPath(),
      semesterDb: getSemesterDbPath(semesterId),
      semesterId,
      semesterCode,
      status: "active",
      semesterDir: finalDir,
    },
  };

  return res.json(response);
});

// ── GET /api/dev/db-health ──────────────────────────────────
// 检查全局库和所有 ready 学期库的健康状态
router.get("/db-health", (_req: Request, res: Response) => {
  try {
    const globalDbPath = getGlobalDbPath();
    const globalDbExists = fs.existsSync(globalDbPath);

    let globalHealth: {
      exists: boolean;
      wal: boolean;
      foreignKeys: boolean;
      integrity: string;
    };

    if (!globalDbExists) {
      globalHealth = {
        exists: false,
        wal: false,
        foreignKeys: false,
        integrity: "not_initialized",
      };
    } else {
      const db = openGlobalDb();
      const wal = isWalEnabled(db);
      const fk = isForeignKeysOn(db);
      const integrity = runIntegrityCheck(db);
      db.close();
      globalHealth = { exists: true, wal, foreignKeys: fk, integrity };
    }

    const semesters: Array<{
      semesterCode: string;
      semesterId: string;
      status: string;
      dbExists: boolean;
      integrity: string;
    }> = [];

    if (globalDbExists) {
      const db = openGlobalDb();
      const rows = db
        .prepare(
          "SELECT id, semester_code, status FROM semesters WHERE ready = 1"
        )
        .all() as Array<{ id: string; semester_code: string; status: string }>;

      for (const row of rows) {
        const semDbPath = getSemesterDbPath(row.id);
        const dbExists = fs.existsSync(semDbPath);
        let integrity = "not_initialized";
        if (dbExists) {
          const semDb = openSemesterDb(row.id);
          integrity = runIntegrityCheck(semDb);
          semDb.close();
        }
        semesters.push({
          semesterCode: row.semester_code,
          semesterId: row.id,
          status: row.status,
          dbExists,
          integrity,
        });
      }

      db.close();
    }

    const response: ApiSuccess = {
      success: true,
      data: { globalDb: globalHealth, semesters },
    };
    return res.json(response);
  } catch (e) {
    const err: ApiError = {
      success: false,
      error: {
        code: "DB_HEALTH_CHECK_FAILED",
        message: e instanceof Error ? e.message : String(e),
      },
    };
    return res.status(500).json(err);
  }
});

export default router;
