// ============================================================
// 开发验证 API — Phase 0.8 T02
// 仅用于验证数据库底座，不做完整业务逻辑。
// ============================================================

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
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
import { getGlobalDbPath, getSemesterDbPath, getSemesterDir } from "../db/paths";

const router: Router = Router();

// ── POST /api/dev/init-semester ────────────────────────────
// 初始化全局库 + 创建学期库 + 创建目录结构
interface InitSemesterBody {
  studentName: string;
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string;
}

router.post("/init-semester", (req: Request, res: Response) => {
  try {
    const body = req.body as InitSemesterBody;

    // 参数校验
    if (!body.studentName || !body.semesterCode || !body.teachingStartDate || !body.teachingEndDate) {
      const error: ApiError = {
        success: false,
        error: {
          code: "MISSING_PARAMS",
          message: "studentName, semesterCode, teachingStartDate, teachingEndDate are required",
        },
      };
      return res.status(400).json(error);
    }

    // 1. 初始化全局库（如不存在）
    const globalDb = initGlobalDb();

    // 2. 插入 student（如不存在）
    const studentId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 检查是否已有同名学生
    const existingStudent = globalDb
      .prepare("SELECT id FROM students WHERE name = ?")
      .get(body.studentName) as { id: string } | undefined;

    const actualStudentId = existingStudent?.id ?? studentId;

    if (!existingStudent) {
      globalDb.prepare(
        "INSERT INTO students (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
      ).run(studentId, body.studentName, now, now);
    }

    // 3. 检查 semesterCode 是否已存在
    const existingSemester = globalDb
      .prepare("SELECT id FROM semesters WHERE semester_code = ?")
      .get(body.semesterCode) as { id: string } | undefined;

    if (existingSemester) {
      checkpointAndClose(globalDb);
      const error: ApiError = {
        success: false,
        error: {
          code: "SEMESTER_CODE_EXISTS",
          message: `semester_code="${body.semesterCode}" already exists`,
        },
      };
      return res.status(409).json(error);
    }

    // 4. 生成 semesterId 并初始化学期库
    const semesterId = crypto.randomUUID();
    const semesterDb = initSemesterDb(semesterId);
    checkpointAndClose(semesterDb);

    // 5. 在全局库插入 semester 记录
    const dbRelativePath = `semesters/${semesterId}/semester.db`;
    globalDb.prepare(
      `INSERT INTO semesters
        (id, semester_code, student_id, teaching_start_date, teaching_end_date, final_archive_date, status, db_relative_path, ready, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 1, ?, ?)`
    ).run(
      semesterId,
      body.semesterCode,
      actualStudentId,
      body.teachingStartDate,
      body.teachingEndDate,
      body.finalArchiveDate ?? null,
      dbRelativePath,
      now,
      now
    );

    // 6. 确保学期目录存在（initSemesterDb 已创建 files/ 和 tmp/）
    const semesterDir = getSemesterDir(semesterId);
    const filesDir = `${semesterDir}/files`;
    const tmpDir = `${semesterDir}/tmp`;
    fs.mkdirSync(filesDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // 7. 关闭全局库
    checkpointAndClose(globalDb);

    const response: ApiSuccess = {
      success: true,
      data: {
        globalDb: getGlobalDbPath(),
        semesterDb: getSemesterDbPath(semesterId),
        semesterId,
        semesterCode: body.semesterCode,
        status: "active",
        semesterDir,
      },
    };

    return res.json(response);
  } catch (e) {
    const error: ApiError = {
      success: false,
      error: {
        code: "DB_INIT_FAILED",
        message: e instanceof Error ? e.message : String(e),
      },
    };
    return res.status(500).json(error);
  }
});

// ── GET /api/dev/db-health ──────────────────────────────────
// 检查全局库和所有学期库的健康状态
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

      globalHealth = {
        exists: true,
        wal,
        foreignKeys: fk,
        integrity,
      };
    }

    // 查询所有 ready 学期
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
          "SELECT id, semester_code, status, db_relative_path FROM semesters WHERE ready = 1"
        )
        .all() as Array<{
        id: string;
        semester_code: string;
        status: string;
        db_relative_path: string;
      }>;

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
      data: {
        globalDb: globalHealth,
        semesters,
      },
    };

    return res.json(response);
  } catch (e) {
    const error: ApiError = {
      success: false,
      error: {
        code: "DB_HEALTH_CHECK_FAILED",
        message: e instanceof Error ? e.message : String(e),
      },
    };
    return res.status(500).json(error);
  }
});

export default router;
