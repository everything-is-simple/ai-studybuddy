// ============================================================
// Phase 1-T09A 学期 selector 与 onboarding 服务
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { OcrConverter } from '../adapters/converter';
import type { DatabaseType } from '../db/connection';
import { checkpointAndClose, openReadOnlyExistingDbAtPath } from '../db/connection';
import { initGlobalDb, initSemesterDbAtPath, migrateSemesterDb, getAppliedVersion } from '../db/migrations';
import { getAppDataRoot, getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import {
  SemesterInitializationError,
  isStrictIsoDate,
  validateSemesterInitializationInput,
} from '../db/semester-initializer';
import type {
  ConfirmSemesterRequest,
  CreateSemesterResponseDto,
  CurrentSemesterDto,
  SemesterPreviewDto,
  SemesterSummaryDto,
  TimetablePreviewEntryDto,
} from '@ai-studybuddy/shared';

const CURRENT_SEMESTER_KEY = 'current_semester_id';
const CURRENT_SEMESTER_VERSION = 8;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface TimetableRecognizer {
  recognize(inputPath: string): Promise<{ text: string }>;
}

export class OcrTimetableRecognizer implements TimetableRecognizer {
  async recognize(inputPath: string): Promise<{ text: string }> {
    const result = await new OcrConverter().convert(inputPath);
    if (!result.ok || !result.text) {
      throw new SemesterSelectorError('TIMETABLE_OCR_FAILED', 422, '课程表识别失败，请更换清晰图片后重试');
    }
    return { text: result.text };
  }
}

export class SemesterSelectorError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'SemesterSelectorError';
  }
}

interface PreviewRecord {
  preview: SemesterPreviewDto;
  tmpDir: string;
  expiresAtMs: number;
}

interface SemesterRow {
  id: string;
  semester_code: string;
  student_name: string;
  teaching_start_date: string;
  teaching_end_date: string;
  final_archive_date: string | null;
  archived_at: string | null;
  status: 'active' | 'archived';
  db_relative_path: string;
  ready: number;
  created_at: string;
  updated_at: string;
}

export class SemesterSelectorService {
  private readonly previews = new Map<string, PreviewRecord>();

  constructor(private readonly recognizer: TimetableRecognizer = new OcrTimetableRecognizer()) {}

  migrateReadySemesters(): void {
    if (!fs.existsSync(getGlobalDbPath())) return;
    const globalDb = initGlobalDb();
    try {
      const rows = globalDb.prepare("SELECT id FROM semesters WHERE ready = 1 AND status = 'active'").all() as Array<{
        id: string;
      }>;
      for (const row of rows) {
        try {
          const dbPath = getSemesterDbPath(row.id);
          if (!fs.existsSync(dbPath)) continue;
          const db = initSemesterDbAtPath(dbPath);
          checkpointAndClose(db);
        } catch {
          // 启动升级失败不能阻塞其他学期；selector 会将其视为不可选择。
        }
      }
    } finally {
      globalDb.close();
    }
  }

  listSemesters(): SemesterSummaryDto[] {
    this.cleanupExpiredPreviews();
    const db = initGlobalDb();
    try {
      const currentId = this.readCurrentId(db);
      const rows = db
        .prepare(
          `SELECT s.*, st.name AS student_name
           FROM semesters s
           JOIN students st ON st.id = s.student_id
           WHERE s.ready = 1 AND s.status = 'active'
           ORDER BY s.teaching_start_date DESC, s.created_at DESC, s.id DESC`
        )
        .all() as SemesterRow[];
      return rows
        .filter((row) => this.isSelectable(row))
        .map((row) => this.toSummary(row, row.id === currentId));
    } finally {
      db.close();
    }
  }

  listArchivedSemesters(): SemesterSummaryDto[] {
    this.cleanupExpiredPreviews();
    const db = initGlobalDb();
    try {
      const currentId = this.readCurrentId(db);
      const rows = db
        .prepare(
          `SELECT s.*, st.name AS student_name
           FROM semesters s
           JOIN students st ON st.id = s.student_id
           WHERE s.ready = 1 AND s.status = 'archived'
           ORDER BY s.archived_at DESC, s.updated_at DESC, s.id DESC`
        )
        .all() as SemesterRow[];
      return rows
        .filter((row) => this.isReadable(row))
        .map((row) => this.toSummary(row, row.id === currentId));
    } finally {
      db.close();
    }
  }

  archiveSemester(semesterId: unknown): SemesterSummaryDto {
    if (!isUuid(semesterId)) {
      throw new SemesterSelectorError('SEMESTER_NOT_FOUND', 404, '学期不存在或不可归档');
    }
    const db = initGlobalDb();
    try {
      const currentId = this.readCurrentId(db);
      const row = this.getSemesterRow(db, semesterId);
      if (!row || !this.isReadable(row)) {
        throw new SemesterSelectorError('SEMESTER_NOT_FOUND', 404, '学期不存在或不可归档');
      }
      if (row.id === currentId) {
        throw new SemesterSelectorError('CURRENT_SEMESTER_CANNOT_ARCHIVE', 409, '当前学期不能归档，请先切换到其他学期');
      }
      if (row.status === 'archived') {
        return this.toSummary(row, false);
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE semesters
         SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
         WHERE id = ?`
      ).run(now, now, row.id);
      const updated = this.getSemesterRow(db, row.id);
      if (!updated) throw new SemesterSelectorError('SEMESTER_NOT_FOUND', 404, '学期不存在或不可归档');
      return this.toSummary(updated, false);
    } finally {
      db.close();
    }
  }

  getCurrentSemester(): CurrentSemesterDto {
    this.cleanupExpiredPreviews();
    const db = initGlobalDb();
    try {
      const currentId = this.readCurrentId(db);
      if (!currentId) return { semester: null, recoveredFromStaleCurrent: false };
      const row = this.getSemesterRow(db, currentId);
      if (!row || !this.isSelectable(row)) {
        db.prepare('DELETE FROM app_meta WHERE key = ?').run(CURRENT_SEMESTER_KEY);
        return { semester: null, recoveredFromStaleCurrent: true };
      }
      return { semester: this.toSummary(row, true), recoveredFromStaleCurrent: false };
    } finally {
      db.close();
    }
  }

  selectCurrentSemester(semesterId: unknown): CurrentSemesterDto {
    if (!isUuid(semesterId)) {
      throw new SemesterSelectorError('SEMESTER_NOT_FOUND', 404, '学期不存在或不可选择');
    }
    const db = initGlobalDb();
    try {
      const row = this.getSemesterRow(db, semesterId);
      if (!row || !this.isSelectable(row)) {
        throw new SemesterSelectorError('SEMESTER_NOT_FOUND', 404, '学期不存在或不可选择');
      }
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(CURRENT_SEMESTER_KEY, semesterId, now);
      return { semester: this.toSummary(row, true), recoveredFromStaleCurrent: false };
    } finally {
      db.close();
    }
  }

  async createPreview(input: {
    semesterCode: unknown;
    teachingStartDate: unknown;
    teachingEndDate: unknown;
    finalArchiveDate?: unknown;
    studentName?: unknown;
    file?: Express.Multer.File;
  }): Promise<SemesterPreviewDto> {
    this.cleanupExpiredPreviews();
    const metadata = this.normalizeMetadata(input);
    const requiresStudentName = this.requiresStudentName();
    if (requiresStudentName && !metadata.studentName) {
      throw new SemesterSelectorError('MISSING_STUDENT_NAME', 400, '首次创建学期需要填写学生姓名');
    }
    this.ensureSemesterCodeAvailable(metadata.semesterCode);
    if (!input.file) {
      throw new SemesterSelectorError('TIMETABLE_IMAGE_REQUIRED', 400, '请上传课程表图片');
    }
    this.validateImage(input.file.buffer);

    const previewId = crypto.randomUUID();
    const tmpDir = path.join(getAppDataRoot(), 'tmp', 'semester-onboarding', previewId);
    fs.mkdirSync(tmpDir, { recursive: true });
    const extension = this.extensionFromMime(input.file.mimetype, input.file.originalname);
    const uploadPath = path.join(tmpDir, `upload.${extension}`);
    fs.writeFileSync(uploadPath, input.file.buffer, { flag: 'wx' });

    let text: string;
    try {
      text = (await this.recognizer.recognize(uploadPath)).text;
    } catch (error) {
      this.safeRemoveDir(tmpDir);
      if (error instanceof SemesterSelectorError) throw error;
      throw new SemesterSelectorError('TIMETABLE_OCR_FAILED', 422, '课程表识别失败，请更换清晰图片后重试');
    }

    const parsed = this.parseTimetableText(text);
    const expiresAtMs = Date.now() + PREVIEW_TTL_MS;
    const preview: SemesterPreviewDto = {
      previewId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      semesterCode: metadata.semesterCode,
      teachingStartDate: metadata.teachingStartDate,
      teachingEndDate: metadata.teachingEndDate,
      finalArchiveDate: metadata.finalArchiveDate ?? null,
      requiresStudentName,
      entries: parsed.entries,
      warnings: parsed.warnings,
    };
    this.previews.set(previewId, { preview, tmpDir, expiresAtMs });
    return preview;
  }

  confirmSemester(request: ConfirmSemesterRequest): CreateSemesterResponseDto {
    this.cleanupExpiredPreviews();
    const record = this.previews.get(request.previewId);
    if (!record) {
      throw new SemesterSelectorError('SEMESTER_PREVIEW_EXPIRED', 410, '预览已过期，请重新上传课程表');
    }
    const metadata = this.normalizeMetadata(request);
    if (
      metadata.semesterCode !== record.preview.semesterCode ||
      metadata.teachingStartDate !== record.preview.teachingStartDate ||
      metadata.teachingEndDate !== record.preview.teachingEndDate ||
      (metadata.finalArchiveDate ?? null) !== (record.preview.finalArchiveDate ?? null)
    ) {
      throw new SemesterSelectorError('SEMESTER_PREVIEW_MISMATCH', 409, '学期信息与预览不一致，请重新预览');
    }
    const entries = this.normalizeEntries(request.entries);
    if (entries.length === 0) {
      throw new SemesterSelectorError('TIMETABLE_ENTRIES_REQUIRED', 400, '至少需要确认一条课程表记录');
    }

    const created = this.createSemesterWithEntries({ ...metadata, entries });
    this.previews.delete(request.previewId);
    this.safeRemoveDir(record.tmpDir);
    return { semester: created, current: { semester: created, recoveredFromStaleCurrent: false } };
  }

  private createSemesterWithEntries(input: {
    studentName?: string;
    semesterCode: string;
    teachingStartDate: string;
    teachingEndDate: string;
    finalArchiveDate?: string;
    entries: TimetablePreviewEntryDto[];
  }): SemesterSummaryDto {
    this.ensureSemesterCodeAvailable(input.semesterCode);
    const appDataRoot = getAppDataRoot();
    const now = new Date().toISOString();
    const semesterId = crypto.randomUUID();
    const stagingDir = path.join(appDataRoot, 'semesters', `.staging-${semesterId}`);
    const stagingDbPath = path.join(stagingDir, 'semester.db');
    const finalDir = path.join(appDataRoot, 'semesters', semesterId);
    const finalDbPath = path.join(finalDir, 'semester.db');
    let globalDb: DatabaseType | undefined;
    let insertedGlobal = false;
    let createdStudentId: string | undefined;

    try {
      fs.mkdirSync(path.join(stagingDir, 'files'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'tmp'), { recursive: true });
      const semesterDb = initSemesterDbAtPath(stagingDbPath);
      try {
        this.writeCoursesAndSchedule(semesterDb, semesterId, input.entries, now);
        checkpointAndClose(semesterDb);
      } catch (error) {
        try {
          semesterDb.close();
        } catch {
          // ignore close failure during compensation
        }
        throw error;
      }

      globalDb = initGlobalDb();
      const student = this.resolveStudentForCreate(globalDb, input.studentName, now);
      createdStudentId = student.created ? student.id : undefined;
      globalDb.transaction(() => {
        globalDb!.prepare(
          `INSERT INTO semesters
            (id, semester_code, student_id, teaching_start_date, teaching_end_date,
             final_archive_date, status, db_relative_path, ready, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)`
        ).run(
          semesterId,
          input.semesterCode,
          student.id,
          input.teachingStartDate,
          input.teachingEndDate,
          input.finalArchiveDate ?? null,
          `semesters/${semesterId}/semester.db`,
          now,
          now
        );
        insertedGlobal = true;
      })();

      fs.renameSync(stagingDir, finalDir);

      globalDb.transaction(() => {
        globalDb!.prepare('UPDATE semesters SET ready = 1, updated_at = ? WHERE id = ?').run(now, semesterId);
        globalDb!.prepare(
          `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).run(CURRENT_SEMESTER_KEY, semesterId, now);
      })();

      return {
        id: semesterId,
        semesterCode: input.semesterCode,
        studentName: student.name,
        teachingStartDate: input.teachingStartDate,
        teachingEndDate: input.teachingEndDate,
        finalArchiveDate: input.finalArchiveDate ?? null,
        status: 'active',
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      try {
        if (globalDb && insertedGlobal) {
          globalDb.transaction(() => {
            globalDb!.prepare('DELETE FROM semesters WHERE id = ? AND ready = 0').run(semesterId);
            if (createdStudentId) {
              globalDb!.prepare('DELETE FROM students WHERE id = ? AND NOT EXISTS (SELECT 1 FROM semesters WHERE student_id = ?)').run(createdStudentId, createdStudentId);
            }
          })();
        }
      } catch {
        // compensation best effort; return stable failure below
      }
      this.safeRemoveDir(stagingDir);
      this.safeRemoveDir(finalDir);
      if (error instanceof SemesterSelectorError) throw error;
      if (error instanceof SemesterInitializationError) {
        throw new SemesterSelectorError(error.code, error.status, error.message);
      }
      throw new SemesterSelectorError('SEMESTER_CREATE_FAILED', 500, '创建学期失败，请稍后重试');
    } finally {
      globalDb?.close();
      if (!fs.existsSync(finalDbPath)) {
        // 保持 finalDbPath 变量有意使用，避免误回传绝对路径；失败补偿已完成。
      }
    }
  }

  private writeCoursesAndSchedule(
    db: DatabaseType,
    semesterId: string,
    entries: TimetablePreviewEntryDto[],
    now: string
  ): void {
    db.transaction(() => {
      const courseIds = new Map<string, string>();
      for (const entry of entries) {
        let courseId = courseIds.get(entry.courseName);
        if (!courseId) {
          courseId = crypto.randomUUID();
          courseIds.set(entry.courseName, courseId);
          db.prepare(
            'INSERT INTO course_instances (id, semester_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
          ).run(courseId, semesterId, entry.courseName, now, now);
        }
        db.prepare(
          `INSERT INTO schedule_entries
             (id, course_instance_id, weekday, start_time, end_time, location, created_at, updated_at, source, source_confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'student_confirmed', ?)`
        ).run(
          crypto.randomUUID(),
          courseId,
          entry.weekday,
          entry.startTime,
          entry.endTime,
          entry.location ?? null,
          now,
          now,
          entry.parserConfidence ?? null
        );
      }
    })();
  }

  private resolveStudentForCreate(db: DatabaseType, studentName: string | undefined, now: string): { id: string; name: string; created: boolean } {
    const rows = db.prepare('SELECT id, name FROM students ORDER BY created_at ASC, id ASC').all() as Array<{
      id: string;
      name: string;
    }>;
    if (rows.length === 0) {
      if (!studentName) throw new SemesterSelectorError('MISSING_STUDENT_NAME', 400, '首次创建学期需要填写学生姓名');
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO students (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, studentName, now, now);
      return { id, name: studentName, created: true };
    }
    if (rows.length > 1) {
      throw new SemesterSelectorError('STUDENT_STATE_UNSUPPORTED', 409, '检测到多个学生档案，请先整理数据后再创建学期');
    }
    return { ...rows[0], created: false };
  }

  private normalizeMetadata(input: {
    semesterCode?: unknown;
    teachingStartDate?: unknown;
    teachingEndDate?: unknown;
    finalArchiveDate?: unknown;
    studentName?: unknown;
  }): { studentName?: string; semesterCode: string; teachingStartDate: string; teachingEndDate: string; finalArchiveDate?: string } {
    try {
      const normalized = validateSemesterInitializationInput({
        studentName: typeof input.studentName === 'string' && input.studentName.trim() ? input.studentName : 'placeholder',
        semesterCode: String(input.semesterCode ?? ''),
        teachingStartDate: String(input.teachingStartDate ?? ''),
        teachingEndDate: String(input.teachingEndDate ?? ''),
        finalArchiveDate:
          input.finalArchiveDate === undefined || input.finalArchiveDate === null || input.finalArchiveDate === ''
            ? undefined
            : String(input.finalArchiveDate),
      });
      return {
        studentName: typeof input.studentName === 'string' && input.studentName.trim() ? input.studentName.trim() : undefined,
        semesterCode: normalized.semesterCode,
        teachingStartDate: normalized.teachingStartDate,
        teachingEndDate: normalized.teachingEndDate,
        finalArchiveDate: normalized.finalArchiveDate,
      };
    } catch (error) {
      if (error instanceof SemesterInitializationError) {
        throw new SemesterSelectorError(error.code, error.status, error.message);
      }
      throw error;
    }
  }

  private ensureSemesterCodeAvailable(semesterCode: string): void {
    const db = initGlobalDb();
    try {
      const duplicate = db.prepare('SELECT id FROM semesters WHERE semester_code = ?').get(semesterCode);
      if (duplicate) {
        throw new SemesterSelectorError('SEMESTER_CODE_EXISTS', 409, '学期已存在，请换一个名称');
      }
    } finally {
      db.close();
    }
  }

  private requiresStudentName(): boolean {
    const db = initGlobalDb();
    try {
      const row = db.prepare('SELECT COUNT(*) AS count FROM students').get() as { count: number };
      return row.count === 0;
    } finally {
      db.close();
    }
  }

  private normalizeEntries(entries: unknown): TimetablePreviewEntryDto[] {
    if (!Array.isArray(entries)) {
      throw new SemesterSelectorError('TIMETABLE_ENTRIES_INVALID', 400, '课程表记录格式不正确');
    }
    return entries.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new SemesterSelectorError('TIMETABLE_ENTRIES_INVALID', 400, '课程表记录格式不正确');
      }
      const raw = entry as Partial<TimetablePreviewEntryDto>;
      const courseName = typeof raw.courseName === 'string' ? raw.courseName.trim() : '';
      const startTime = typeof raw.startTime === 'string' ? raw.startTime : '';
      const endTime = typeof raw.endTime === 'string' ? raw.endTime : '';
      const weekday = Number(raw.weekday);
      if (!courseName || courseName.length > 100 || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime >= endTime) {
        throw new SemesterSelectorError('TIMETABLE_ENTRIES_INVALID', 400, '课程表记录包含非法课程、星期或时间');
      }
      const confidence = raw.parserConfidence === undefined || raw.parserConfidence === null ? null : Number(raw.parserConfidence);
      if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new SemesterSelectorError('TIMETABLE_ENTRIES_INVALID', 400, '规则解析置信度必须在 0 到 1 之间');
      }
      return {
        clientId: typeof raw.clientId === 'string' && raw.clientId ? raw.clientId : `entry-${index + 1}`,
        courseName,
        weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        startTime,
        endTime,
        location: typeof raw.location === 'string' && raw.location.trim() ? raw.location.trim() : null,
        parserConfidence: confidence,
        warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((value): value is string => typeof value === 'string') : undefined,
      };
    });
  }

  private parseTimetableText(text: string): { entries: TimetablePreviewEntryDto[]; warnings: string[] } {
    const weekdayMap: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
    const entries: TimetablePreviewEntryDto[] = [];
    const warnings: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = /周([日一二三四五六])\s+([0-2]?\d:[0-5]\d)\s*-\s*([0-2]?\d:[0-5]\d)\s+(.+?)(?:\s+([^\s]+))?$/.exec(trimmed);
      if (!match) {
        warnings.push('部分识别文本暂未能解析，请人工补充课程表记录');
        continue;
      }
      const startTime = this.padTime(match[2]);
      const endTime = this.padTime(match[3]);
      const courseName = match[4].trim();
      if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime >= endTime || !courseName) {
        warnings.push('部分课程时间或名称不合法，已跳过');
        continue;
      }
      entries.push({
        clientId: crypto.randomUUID(),
        courseName,
        weekday: weekdayMap[match[1]],
        startTime,
        endTime,
        location: match[5]?.trim() ?? null,
        parserConfidence: 0.8,
        warnings: [],
      });
    }
    if (entries.length === 0) warnings.push('未解析出课程，请手动补充后再确认');
    return { entries, warnings: [...new Set(warnings)] };
  }

  private padTime(value: string): string {
    const [hour, minute] = value.split(':');
    return `${hour.padStart(2, '0')}:${minute}`;
  }

  private validateImage(buffer: Buffer): void {
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw new SemesterSelectorError('TIMETABLE_IMAGE_INVALID', 400, '课程表图片大小不合法');
    }
    const dimensions = this.readImageDimensions(buffer);
    if (!dimensions) {
      throw new SemesterSelectorError('TIMETABLE_IMAGE_INVALID', 400, '仅支持 PNG、JPEG 或 WebP 课程表图片');
    }
    if (dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
      throw new SemesterSelectorError('TIMETABLE_IMAGE_INVALID', 400, '课程表图片尺寸过大或不合法');
    }
  }

  private readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length >= 10 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return { width: 1, height: 1 };
    }
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return { width: 1, height: 1 };
    }
    return null;
  }

  private extensionFromMime(mime: string | undefined, name: string | undefined): 'png' | 'jpg' | 'webp' {
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    const lower = (name ?? '').toLowerCase();
    if (lower.endsWith('.webp')) return 'webp';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
    return 'png';
  }

  private readCurrentId(db: DatabaseType): string | null {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(CURRENT_SEMESTER_KEY) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private getSemesterRow(db: DatabaseType, semesterId: string): SemesterRow | null {
    return (
      (db
        .prepare(
          `SELECT s.*, st.name AS student_name
           FROM semesters s
           JOIN students st ON st.id = s.student_id
           WHERE s.id = ?`
        )
        .get(semesterId) as SemesterRow | undefined) ?? null
    );
  }

  private isSelectable(row: SemesterRow): boolean {
    if (row.status !== 'active') return false;
    return this.isReadable(row);
  }

  private isReadable(row: SemesterRow): boolean {
    if (row.ready !== 1) return false;
    if (!isUuid(row.id)) return false;
    if (row.db_relative_path !== `semesters/${row.id}/semester.db`) return false;
    const dbPath = getSemesterDbPath(row.id);
    if (!fs.existsSync(dbPath)) return false;
    try {
      const db = openReadOnlyExistingDbAtPath(dbPath);
      try {
        return getAppliedVersion(db, 'semester') === CURRENT_SEMESTER_VERSION;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  }

  private toSummary(row: SemesterRow, isCurrent: boolean): SemesterSummaryDto {
    return {
      id: row.id,
      semesterCode: row.semester_code,
      studentName: row.student_name,
      teachingStartDate: row.teaching_start_date,
      teachingEndDate: row.teaching_end_date,
      finalArchiveDate: row.final_archive_date,
      archivedAt: row.archived_at,
      status: row.status,
      isCurrent,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private cleanupExpiredPreviews(): void {
    const now = Date.now();
    for (const [id, record] of this.previews) {
      if (record.expiresAtMs <= now) {
        this.previews.delete(id);
        this.safeRemoveDir(record.tmpDir);
      }
    }
  }

  private safeRemoveDir(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure in request path
    }
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validateIsoDateForSemesterSelector(value: string): boolean {
  return DATE_RE.test(value) && isStrictIsoDate(value);
}
