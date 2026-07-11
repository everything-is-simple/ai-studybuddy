// ============================================================
// 开发验证 API — Phase 0.8 T02
// 仅用于验证数据库共同底座；正式业务 API 在对应子系统开始时建立。
// ============================================================

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs";
import type { ApiError, ApiSuccess } from "@ai-studybuddy/shared";
import {
  isForeignKeysOn,
  isWalEnabled,
  openExistingDbAtPath,
  runIntegrityCheck,
} from "../db/connection";
import {
  initializeSemester,
  SemesterInitializationError,
  type SemesterInitializationInput,
} from "../db/semester-initializer";
import { getGlobalDbPath, getSemesterDbPath } from "../db/paths";
import { config } from "../config/env";

const router: Router = Router();

// ── POST /api/dev/init-semester ────────────────────────────
// 输入校验、staging 迁移与失败补偿全部由 semester-initializer 统一负责。
router.post("/init-semester", (req: Request, res: Response) => {
  try {
    const initialized = initializeSemester(
      req.body as SemesterInitializationInput,
      { appDataRoot: config.appDataRoot }
    );

    const response: ApiSuccess = {
      success: true,
      data: {
        semesterId: initialized.semesterId,
        semesterCode: initialized.semesterCode,
        status: initialized.status,
      },
    };
    return res.json(response);
  } catch (error) {
    const knownError =
      error instanceof SemesterInitializationError
        ? error
        : new SemesterInitializationError(
            "SEMESTER_INIT_FAILED",
            500,
            error instanceof Error ? error.message : String(error),
            error
          );
    const response: ApiError = {
      success: false,
      error: { code: knownError.code, message: knownError.message },
    };
    return res.status(knownError.status).json(response);
  }
});

// ── GET /api/dev/db-health ──────────────────────────────────
// 检查全局库和所有 ready 学期库的健康状态。
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
      const db = openExistingDbAtPath(globalDbPath);
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
      const db = openExistingDbAtPath(globalDbPath);
      const rows = db
        .prepare(
          "SELECT id, semester_code, status FROM semesters WHERE ready = 1"
        )
        .all() as Array<{ id: string; semester_code: string; status: string }>;

      for (const row of rows) {
        const semesterDbPath = getSemesterDbPath(row.id);
        const dbExists = fs.existsSync(semesterDbPath);
        let integrity = "not_initialized";
        if (dbExists) {
          const semesterDb = openExistingDbAtPath(semesterDbPath);
          integrity = runIntegrityCheck(semesterDb);
          semesterDb.close();
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
  } catch (error) {
    const response: ApiError = {
      success: false,
      error: {
        code: "DB_HEALTH_CHECK_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return res.status(500).json(response);
  }
});

export default router;