// ============================================================
// S1 StudyRhythm 业务服务
// - 所有业务写入通过 semesterId 打开已 ready 的学期库；
// - SQL 参数绑定，多步写入在 SQLite transaction 内完成；
// - API Router 不直接写 SQL。
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { assertSemesterWritable, SemesterAccessError } from './semester-access-service';
import type {
  AssessmentAttemptDto,
  ConfirmationStatus,
  CourseInstanceDto,
  StudyEventDto,
  StudyTaskDto,
  StudyTaskStatus,
  StudyTaskType,
  ScheduleEntryDto,
} from '@ai-studybuddy/shared';

export class StudyRhythmError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'StudyRhythmError';
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDatetime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isScheduleTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeIsoDatetime(value: string): string {
  return new Date(value).toISOString();
}
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOptionalNumberInRange(value: unknown, min: number, max: number): value is number | undefined {
  if (value === undefined) return true;
  return typeof value === 'number' && value >= min && value <= max;
}

const ALLOWED_ATTEMPT_TYPES = ['normal', 'makeup', 'other'] as const;
const ALLOWED_CONFIRMATION_STATUSES = ['pending', 'confirmed', 'rejected', 'superseded'] as const;
const ALLOWED_TASK_TYPES = ['material_note', 'practice', 'error_review', 'exam_cram', 'custom'] as const;
const ALLOWED_TASK_STATUSES = ['todo', 'doing', 'pending_quality_check', 'done', 'skipped'] as const;
const ALLOWED_SOURCE_SYSTEMS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S7'] as const;

const allowedTransitions: Record<StudyTaskStatus, readonly StudyTaskStatus[]> = {
  todo: ['doing', 'pending_quality_check', 'done', 'skipped'],
  doing: ['todo', 'pending_quality_check', 'done', 'skipped'],
  pending_quality_check: ['doing', 'done', 'skipped'],
  done: [],
  skipped: [],
};

export class StudyRhythmService {
  private openReadySemesterDb(semesterId: string): DatabaseType {
    if (!isUuid(semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }

    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT id, ready FROM semesters WHERE id = ?').get(semesterId) as
        { ready: number } | undefined;
      if (!row) {
        throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      }
      if (row.ready !== 1) {
        throw new StudyRhythmError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
      }
    } catch (error) {
      if (error instanceof StudyRhythmError) {
        throw error;
      }
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    } finally {
      globalDb?.close();
    }

    const dbPath = getSemesterDbPath(semesterId);
    if (!fs.existsSync(dbPath)) {
      throw new StudyRhythmError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    }
    return openExistingDbAtPath(dbPath);
  }

  private assertWritableSemester(semesterId: unknown): void {
    try {
      assertSemesterWritable(semesterId);
    } catch (error) {
      if (error instanceof SemesterAccessError) {
        throw new StudyRhythmError(error.code, error.status, error.message);
      }
      throw error;
    }
  }

  private requireCourse(db: DatabaseType, semesterId: string, courseInstanceId: string) {
    if (!isUuid(courseInstanceId)) {
      throw new StudyRhythmError('COURSE_NOT_FOUND', 404, '课程不存在');
    }
    const row = db
      .prepare(
        `SELECT id, semester_id, name, retake_of_course_instance_id, created_at, updated_at
         FROM course_instances
         WHERE id = ? AND semester_id = ?`
      )
      .get(courseInstanceId, semesterId);
    if (!row) {
      throw new StudyRhythmError('COURSE_NOT_FOUND', 404, '课程不存在');
    }
    return row as Record<string, unknown>;
  }

  private requireExamForCourse(db: DatabaseType, assessmentAttemptId: string, courseInstanceId: string) {
    if (!isUuid(assessmentAttemptId)) {
      throw new StudyRhythmError('EXAM_NOT_FOUND', 404, '考试不存在');
    }
    const row = db
      .prepare('SELECT id, course_instance_id FROM assessment_attempts WHERE id = ?')
      .get(assessmentAttemptId) as { id: string; course_instance_id: string } | undefined;
    if (!row || row.course_instance_id !== courseInstanceId) {
      throw new StudyRhythmError('EXAM_NOT_FOUND', 404, '考试不存在或不属于该课程');
    }
    return row;
  }

  private requireExam(db: DatabaseType, semesterId: string, assessmentAttemptId: string) {
    if (!isUuid(assessmentAttemptId)) {
      throw new StudyRhythmError('EXAM_NOT_FOUND', 404, '考试不存在');
    }
    const row = db
      .prepare(
        `SELECT a.* FROM assessment_attempts a
         JOIN course_instances c ON a.course_instance_id = c.id
         WHERE a.id = ? AND c.semester_id = ?`
      )
      .get(assessmentAttemptId, semesterId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new StudyRhythmError('EXAM_NOT_FOUND', 404, '考试不存在');
    }
    return row;
  }

  private requireTask(db: DatabaseType, taskId: string) {
    if (!isUuid(taskId)) {
      throw new StudyRhythmError('TASK_NOT_FOUND', 404, '任务不存在');
    }
    const row = db.prepare('SELECT * FROM study_tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new StudyRhythmError('TASK_NOT_FOUND', 404, '任务不存在');
    }
    return row;
  }

  private toCourseDto(row: Record<string, unknown>): CourseInstanceDto {
    return {
      id: String(row.id),
      semesterId: String(row.semester_id),
      name: String(row.name),
      retakeOfCourseInstanceId:
        row.retake_of_course_instance_id === null || row.retake_of_course_instance_id === undefined
          ? undefined
          : String(row.retake_of_course_instance_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toExamDto(row: Record<string, unknown>): AssessmentAttemptDto {
    return {
      id: String(row.id),
      courseInstanceId: String(row.course_instance_id),
      name: String(row.name),
      attemptType: String(row.attempt_type) as AssessmentAttemptDto['attemptType'],
      examAt: String(row.exam_at),
      confirmationStatus: String(row.confirmation_status) as AssessmentAttemptDto['confirmationStatus'],
      confirmedAt: row.confirmed_at === null || row.confirmed_at === undefined ? undefined : String(row.confirmed_at),
      goal: row.goal === null || row.goal === undefined ? undefined : String(row.goal),
      dailyStudyMinutes:
        row.daily_study_minutes === null || row.daily_study_minutes === undefined
          ? undefined
          : Number(row.daily_study_minutes),
      scopeSummary:
        row.scope_summary === null || row.scope_summary === undefined ? undefined : String(row.scope_summary),
      source: row.source === null || row.source === undefined ? undefined : String(row.source),
      sourceConfidence:
        row.source_confidence === null || row.source_confidence === undefined
          ? undefined
          : Number(row.source_confidence),
    };
  }

  private requireScheduleEntry(db: DatabaseType, semesterId: string, scheduleEntryId: string) {
    if (!isUuid(scheduleEntryId)) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_NOT_FOUND', 404, '课表条目不存在');
    }
    const row = db
      .prepare(
        `SELECT s.*, c.semester_id, c.name AS course_name
         FROM schedule_entries s
         JOIN course_instances c ON c.id = s.course_instance_id
         WHERE s.id = ? AND c.semester_id = ?`
      )
      .get(scheduleEntryId, semesterId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_NOT_FOUND', 404, '课表条目不存在');
    }
    return row;
  }

  private toScheduleEntryDto(row: Record<string, unknown>): ScheduleEntryDto {
    return {
      id: String(row.id),
      semesterId: String(row.semester_id),
      courseInstanceId: String(row.course_instance_id),
      courseName: String(row.course_name),
      weekday: Number(row.weekday) as ScheduleEntryDto['weekday'],
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      location: row.location === null || row.location === undefined ? undefined : String(row.location),
      source: row.source === null || row.source === undefined ? undefined : String(row.source),
      sourceConfidence:
        row.source_confidence === null || row.source_confidence === undefined
          ? undefined
          : Number(row.source_confidence),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private validateScheduleEntryInput(input: {
    courseInstanceId: unknown;
    weekday: unknown;
    startTime: unknown;
    endTime: unknown;
    location?: unknown;
  }): { courseInstanceId: string; weekday: number; startTime: string; endTime: string; location: string | null } {
    if (!isUuid(input.courseInstanceId)) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_INPUT_INVALID', 400, '课程必须是有效的 UUID');
    }
    if (!Number.isInteger(input.weekday) || Number(input.weekday) < 0 || Number(input.weekday) > 6) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_INPUT_INVALID', 400, 'weekday 必须在 0 到 6 之间');
    }
    if (!isScheduleTime(input.startTime) || !isScheduleTime(input.endTime)) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_INPUT_INVALID', 400, '课表时间必须为 HH:mm 格式');
    }
    if (input.startTime >= input.endTime) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_INPUT_INVALID', 400, '结束时间必须晚于开始时间');
    }
    if (input.location !== undefined && (!isNonEmptyString(input.location) || input.location.trim().length > 200)) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_INPUT_INVALID', 400, '上课地点必须为非空字符串且不超过 200 字符');
    }
    return {
      courseInstanceId: input.courseInstanceId,
      weekday: Number(input.weekday),
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location === undefined ? null : input.location.trim(),
    };
  }

  private rethrowScheduleWriteError(error: unknown): never {
    if (error instanceof StudyRhythmError) throw error;
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: schedule_entries')) {
      throw new StudyRhythmError('SCHEDULE_ENTRY_DUPLICATE', 409, '同一课程已有相同时间的课表条目');
    }
    throw error;
  }
  private hasActiveFeedbackPriority(db: DatabaseType, row: Record<string, unknown>): boolean {
    if (row.type !== 'error_review') return false;
    if (row.knowledge_module_id === null || row.knowledge_module_id === undefined) return false;
    const status = String(row.status) as StudyTaskStatus;
    if (status === 'done' || status === 'skipped') return false;
    const courseInstanceId = String(row.course_instance_id);
    const knowledgeModuleId = String(row.knowledge_module_id);
    const activeWeakPoint = db
      .prepare(
        `SELECT 1 FROM weak_points
         WHERE course_instance_id = ?
           AND knowledge_module_id = ?
           AND status = 'active'`
      )
      .get(courseInstanceId, knowledgeModuleId);
    if (activeWeakPoint) return true;
    const needsReviewMistake = db
      .prepare(
        `SELECT 1 FROM mistakes
         WHERE course_instance_id = ?
           AND knowledge_module_id = ?
           AND status = 'needs_review'`
      )
      .get(courseInstanceId, knowledgeModuleId);
    return !!needsReviewMistake;
  }

  private toTaskDto(db: DatabaseType, row: Record<string, unknown>): StudyTaskDto {
    const now = new Date().toISOString();
    const status = String(row.status) as StudyTaskStatus;
    const deadlineAt = row.deadline_at ? String(row.deadline_at) : undefined;
    const derivedOverdue = !!deadlineAt && deadlineAt < now && status !== 'done' && status !== 'skipped';

    let priorityBucket: 0 | 1 | 2 | 3 = 3;
    if (derivedOverdue) {
      priorityBucket = 0;
    } else if (this.hasActiveFeedbackPriority(db, row)) {
      priorityBucket = 1;
    } else if (row.assessment_attempt_id) {
      const exam = db
        .prepare('SELECT confirmation_status FROM assessment_attempts WHERE id = ?')
        .get(String(row.assessment_attempt_id)) as { confirmation_status: string } | undefined;
      if (exam?.confirmation_status === 'confirmed') {
        priorityBucket = 1;
      } else if (deadlineAt) {
        priorityBucket = 2;
      }
    } else if (deadlineAt) {
      priorityBucket = 2;
    }

    return {
      id: String(row.id),
      courseInstanceId: String(row.course_instance_id),
      assessmentAttemptId:
        row.assessment_attempt_id === null || row.assessment_attempt_id === undefined
          ? undefined
          : String(row.assessment_attempt_id),
      knowledgeModuleId:
        row.knowledge_module_id === null || row.knowledge_module_id === undefined
          ? undefined
          : String(row.knowledge_module_id),
      type: String(row.type) as StudyTaskType,
      title: String(row.title),
      status,
      estimatedMinutes:
        row.estimated_minutes === null || row.estimated_minutes === undefined
          ? undefined
          : Number(row.estimated_minutes),
      deadlineAt,
      completedAt: row.completed_at === null || row.completed_at === undefined ? undefined : String(row.completed_at),
      derivedOverdue,
      priorityBucket,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toEventDto(row: Record<string, unknown>): StudyEventDto {
    return {
      id: String(row.id),
      courseInstanceId:
        row.course_instance_id === null || row.course_instance_id === undefined
          ? undefined
          : String(row.course_instance_id),
      taskId: row.task_id === null || row.task_id === undefined ? undefined : String(row.task_id),
      sourceSystem: String(row.source_system) as StudyEventDto['sourceSystem'],
      eventType: String(row.event_type),
      title: String(row.title),
      workloadMinutes:
        row.workload_minutes === null || row.workload_minutes === undefined ? undefined : Number(row.workload_minutes),
      evidenceRef: row.evidence_ref === null || row.evidence_ref === undefined ? undefined : String(row.evidence_ref),
      sourceConfidence:
        row.source_confidence === null || row.source_confidence === undefined
          ? undefined
          : Number(row.source_confidence),
      qualityGate:
        row.quality_gate === null || row.quality_gate === undefined
          ? undefined
          : (String(row.quality_gate) as StudyEventDto['qualityGate']),
      parentVisible: row.parent_visible === 1,
      occurredAt: String(row.occurred_at),
      createdAt: String(row.created_at),
    };
  }

  updateCourse(input: { semesterId: unknown; courseInstanceId: unknown; name: unknown }): CourseInstanceDto {
    if (!isUuid(input.semesterId)) throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    if (!isNonEmptyString(input.name) || input.name.trim().length > 200) {
      throw new StudyRhythmError('COURSE_INPUT_INVALID', 400, '课程名称必须为非空字符串且不超过 200 字符');
    }
    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const course = this.requireCourse(db, input.semesterId, String(input.courseInstanceId));
      const now = new Date().toISOString();
      const name = input.name.trim();
      db.prepare('UPDATE course_instances SET name = ?, updated_at = ? WHERE id = ?').run(
        name,
        now,
        input.courseInstanceId
      );
      return this.toCourseDto({ ...course, name, updated_at: now });
    } finally {
      db.close();
    }
  }

  listScheduleEntries(semesterId: unknown): ScheduleEntryDto[] {
    if (!isUuid(semesterId)) throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const rows = db
        .prepare(
          `SELECT s.*, c.semester_id, c.name AS course_name
         FROM schedule_entries s JOIN course_instances c ON c.id = s.course_instance_id
         WHERE c.semester_id = ?
         ORDER BY s.weekday ASC, s.start_time ASC, s.end_time ASC, s.id ASC`
        )
        .all(semesterId) as Record<string, unknown>[];
      return rows.map((row) => this.toScheduleEntryDto(row));
    } finally {
      db.close();
    }
  }

  createScheduleEntry(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    weekday: unknown;
    startTime: unknown;
    endTime: unknown;
    location?: unknown;
  }): ScheduleEntryDto {
    if (!isUuid(input.semesterId)) throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    const data = this.validateScheduleEntryInput(input);
    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      this.requireCourse(db, input.semesterId, data.courseInstanceId);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      try {
        db.prepare(
          `INSERT INTO schedule_entries (id, course_instance_id, weekday, start_time, end_time, location, source, source_confidence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'student_confirmed', NULL, ?, ?)`
        ).run(id, data.courseInstanceId, data.weekday, data.startTime, data.endTime, data.location, now, now);
      } catch (error) {
        this.rethrowScheduleWriteError(error);
      }
      return this.toScheduleEntryDto(this.requireScheduleEntry(db, input.semesterId, id));
    } finally {
      db.close();
    }
  }

  updateScheduleEntry(input: {
    semesterId: unknown;
    scheduleEntryId: unknown;
    courseInstanceId: unknown;
    weekday: unknown;
    startTime: unknown;
    endTime: unknown;
    location?: unknown;
  }): ScheduleEntryDto {
    if (!isUuid(input.semesterId)) throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    const data = this.validateScheduleEntryInput(input);
    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      this.requireScheduleEntry(db, input.semesterId, String(input.scheduleEntryId));
      this.requireCourse(db, input.semesterId, data.courseInstanceId);
      const now = new Date().toISOString();
      try {
        db.prepare(
          `UPDATE schedule_entries
                    SET course_instance_id = ?, weekday = ?, start_time = ?, end_time = ?, location = ?, source = 'student_confirmed', source_confidence = NULL, updated_at = ?
                    WHERE id = ?`
        ).run(
          data.courseInstanceId,
          data.weekday,
          data.startTime,
          data.endTime,
          data.location,
          now,
          input.scheduleEntryId
        );
      } catch (error) {
        this.rethrowScheduleWriteError(error);
      }
      return this.toScheduleEntryDto(this.requireScheduleEntry(db, input.semesterId, String(input.scheduleEntryId)));
    } finally {
      db.close();
    }
  }

  deleteScheduleEntry(input: { semesterId: unknown; scheduleEntryId: unknown }): ScheduleEntryDto {
    if (!isUuid(input.semesterId)) throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const entry = this.requireScheduleEntry(db, input.semesterId, String(input.scheduleEntryId));
      db.prepare('DELETE FROM schedule_entries WHERE id = ?').run(input.scheduleEntryId);
      return this.toScheduleEntryDto(entry);
    } finally {
      db.close();
    }
  }

  updateExam(input: {
    semesterId: unknown;
    assessmentAttemptId: unknown;
    name?: unknown;
    examAt?: unknown;
    goal?: unknown;
  }): AssessmentAttemptDto {
    if (!isUuid(input.semesterId)) throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    if (input.name === undefined && input.examAt === undefined && input.goal === undefined) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, '至少需要提供一个可编辑字段');
    }
    if (input.name !== undefined && (!isNonEmptyString(input.name) || input.name.trim().length > 200)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, '考试名称必须为非空字符串且不超过 200 字符');
    }
    if (input.examAt !== undefined && !isIsoDatetime(input.examAt)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, 'examAt 必须是有效的 ISO 日期时间');
    }
    if (input.goal !== undefined && (typeof input.goal !== 'string' || input.goal.trim().length > 1000)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, '考试目标必须是字符串且不超过 1000 字符');
    }
    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const existing = this.requireExam(db, input.semesterId, String(input.assessmentAttemptId));
      const name = input.name === undefined ? String(existing.name) : input.name.trim();
      const examAt = input.examAt === undefined ? String(existing.exam_at) : normalizeIsoDatetime(input.examAt);
      const goal = input.goal === undefined ? existing.goal : input.goal.trim() || null;
      const dateChanged = input.examAt !== undefined && normalizeIsoDatetime(String(existing.exam_at)) !== examAt;
      const resetConfirmation = dateChanged && existing.confirmation_status === 'confirmed';
      const confirmationStatus = resetConfirmation ? 'pending' : String(existing.confirmation_status);
      const confirmedAt = resetConfirmation ? null : (existing.confirmed_at ?? null);
      const now = new Date().toISOString();
      const update = db.transaction(() => {
        if (resetConfirmation) {
          db.prepare(
            `INSERT INTO assessment_date_changes (id, assessment_attempt_id, previous_exam_at, next_exam_at, source, changed_at)
                      VALUES (?, ?, ?, ?, 'student_confirmed', ?)`
          ).run(crypto.randomUUID(), input.assessmentAttemptId, existing.exam_at, examAt, now);
        }
        db.prepare(
          `UPDATE assessment_attempts SET name = ?, exam_at = ?, goal = ?, confirmation_status = ?, confirmed_at = ? WHERE id = ?`
        ).run(name, examAt, goal, confirmationStatus, confirmedAt, input.assessmentAttemptId);
        return db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(input.assessmentAttemptId) as Record<
          string,
          unknown
        >;
      });
      return this.toExamDto(update());
    } finally {
      db.close();
    }
  }
  createCourse(input: { semesterId: unknown; name: unknown; retakeOfCourseInstanceId?: unknown }): CourseInstanceDto {
    if (!isNonEmptyString(input.name) || input.name.trim().length > 200) {
      throw new StudyRhythmError('COURSE_INPUT_INVALID', 400, '课程名称必须为非空字符串且不超过 200 字符');
    }
    if (input.retakeOfCourseInstanceId !== undefined && !isUuid(input.retakeOfCourseInstanceId)) {
      throw new StudyRhythmError('COURSE_INPUT_INVALID', 400, 'retakeOfCourseInstanceId 必须是有效的 UUID');
    }
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }

    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const name = input.name.trim();
      db.prepare(
        `INSERT INTO course_instances (
          id, semester_id, name, retake_of_course_instance_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, input.semesterId, name, input.retakeOfCourseInstanceId ?? null, now, now);
      return this.toCourseDto({
        id,
        semester_id: input.semesterId,
        name,
        retake_of_course_instance_id: input.retakeOfCourseInstanceId ?? null,
        created_at: now,
        updated_at: now,
      });
    } finally {
      db.close();
    }
  }

  deleteCourse(input: { semesterId: unknown; courseInstanceId: unknown }): CourseInstanceDto {
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const course = this.requireCourse(db, input.semesterId, String(input.courseInstanceId));
      try {
        db.prepare('DELETE FROM course_instances WHERE id = ? AND semester_id = ?').run(
          input.courseInstanceId,
          input.semesterId
        );
      } catch (error) {
        if (error instanceof Error && /constraint/i.test(error.message)) {
          throw new StudyRhythmError('COURSE_HAS_DEPENDENCIES', 409, '课程已有课表、考试或学习资料，不能直接删除');
        }
        throw error;
      }
      return this.toCourseDto(course);
    } finally {
      db.close();
    }
  }

  listCourses(semesterId: unknown): CourseInstanceDto[] {
    if (!isUuid(semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    const db = this.openReadySemesterDb(semesterId);
    try {
      const rows = db
        .prepare(
          `SELECT id, semester_id, name, retake_of_course_instance_id, created_at, updated_at
           FROM course_instances
           WHERE semester_id = ?
           ORDER BY created_at ASC, id ASC`
        )
        .all(semesterId) as Record<string, unknown>[];
      return rows.map((row) => this.toCourseDto(row));
    } finally {
      db.close();
    }
  }

  createExam(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    name: unknown;
    examAt: unknown;
    attemptType?: unknown;
    confirmationStatus?: unknown;
    goal?: unknown;
    dailyStudyMinutes?: unknown;
    scopeSummary?: unknown;
    source?: unknown;
    sourceConfidence?: unknown;
  }): AssessmentAttemptDto {
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    if (!isNonEmptyString(input.name) || input.name.trim().length > 200) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, '考试名称必须为非空字符串且不超过 200 字符');
    }
    if (!isIsoDatetime(input.examAt)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, 'examAt 必须是有效的 ISO 日期时间');
    }
    const attemptType = input.attemptType === undefined ? 'normal' : String(input.attemptType);
    if (!ALLOWED_ATTEMPT_TYPES.includes(attemptType as never)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, 'attemptType 必须是 normal、makeup 或 other');
    }
    const confirmationStatus: ConfirmationStatus =
      input.confirmationStatus === undefined ? 'pending' : (String(input.confirmationStatus) as ConfirmationStatus);
    if (!ALLOWED_CONFIRMATION_STATUSES.includes(confirmationStatus as never)) {
      throw new StudyRhythmError(
        'EXAM_INPUT_INVALID',
        400,
        'confirmationStatus 必须是 pending、confirmed、rejected 或 superseded'
      );
    }
    if (input.dailyStudyMinutes !== undefined && !isPositiveInteger(input.dailyStudyMinutes)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, 'dailyStudyMinutes 必须是正整数');
    }
    if (!isOptionalNumberInRange(input.sourceConfidence, 0, 1)) {
      throw new StudyRhythmError('EXAM_INPUT_INVALID', 400, 'sourceConfidence 必须在 0 到 1 之间');
    }

    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      this.requireCourse(db, input.semesterId, String(input.courseInstanceId));
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const confirmedAt = confirmationStatus === 'confirmed' ? now : null;
      db.prepare(
        `INSERT INTO assessment_attempts (
          id, course_instance_id, name, attempt_type, exam_at,
          goal, daily_study_minutes, scope_summary, source, source_confidence,
          confirmation_status, confirmed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.courseInstanceId,
        input.name.trim(),
        attemptType,
        input.examAt,
        input.goal === undefined ? null : String(input.goal),
        input.dailyStudyMinutes === undefined ? null : input.dailyStudyMinutes,
        input.scopeSummary === undefined ? null : String(input.scopeSummary),
        input.source === undefined ? null : String(input.source),
        input.sourceConfidence === undefined ? null : input.sourceConfidence,
        confirmationStatus,
        confirmedAt,
        now,
        now
      );
      return this.toExamDto({
        id,
        course_instance_id: input.courseInstanceId,
        name: input.name.trim(),
        attempt_type: attemptType,
        exam_at: input.examAt,
        confirmation_status: confirmationStatus,
        confirmed_at: confirmedAt,
        goal: input.goal ?? null,
        daily_study_minutes: input.dailyStudyMinutes ?? null,
        scope_summary: input.scopeSummary ?? null,
        source: input.source ?? null,
        source_confidence: input.sourceConfidence ?? null,
      });
    } finally {
      db.close();
    }
  }

  listExams(semesterId: unknown, courseInstanceId?: unknown): AssessmentAttemptDto[] {
    if (!isUuid(semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    const db = this.openReadySemesterDb(semesterId);
    try {
      if (courseInstanceId !== undefined) {
        this.requireCourse(db, semesterId, String(courseInstanceId));
      }
      let rows: Record<string, unknown>[];
      if (courseInstanceId !== undefined) {
        rows = db
          .prepare(
            `SELECT * FROM assessment_attempts
             WHERE course_instance_id = ?
             ORDER BY exam_at ASC, id ASC`
          )
          .all(courseInstanceId) as Record<string, unknown>[];
      } else {
        rows = db
          .prepare(
            `SELECT a.* FROM assessment_attempts a
             JOIN course_instances c ON a.course_instance_id = c.id
             WHERE c.semester_id = ?
             ORDER BY a.exam_at ASC, a.id ASC`
          )
          .all(semesterId) as Record<string, unknown>[];
      }
      return rows.map((row) => this.toExamDto(row));
    } finally {
      db.close();
    }
  }

  getExam(semesterId: unknown, assessmentAttemptId: string): AssessmentAttemptDto {
    if (!isUuid(semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    const db = this.openReadySemesterDb(semesterId);
    try {
      return this.toExamDto(this.requireExam(db, semesterId, assessmentAttemptId));
    } finally {
      db.close();
    }
  }

  confirmExam(input: { semesterId: unknown; assessmentAttemptId: string }): AssessmentAttemptDto {
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    const semesterId = input.semesterId;
    const db = this.openReadySemesterDb(semesterId);
    try {
      return db.transaction(() => {
        const row = this.requireExam(db, semesterId, input.assessmentAttemptId);
        const status = String(row.confirmation_status) as ConfirmationStatus;
        if (status === 'confirmed') {
          return this.toExamDto(row);
        }
        if (status !== 'pending') {
          throw new StudyRhythmError('EXAM_CONFIRMATION_INVALID', 409, '当前考试状态不允许确认');
        }

        const now = new Date().toISOString();
        db.prepare(
          `UPDATE assessment_attempts
           SET confirmation_status = 'confirmed', confirmed_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(now, now, input.assessmentAttemptId);
        db.prepare(
          `INSERT INTO study_events (
            id, course_instance_id, source_system, event_type, title,
            evidence_ref, parent_visible, occurred_at, created_at
          ) VALUES (?, ?, 'S1', 'assessment_attempt_confirmed', '考试日期已确认', ?, 1, ?, ?)`
        ).run(crypto.randomUUID(), row.course_instance_id, `assessment_attempt:${input.assessmentAttemptId}`, now, now);

        return this.toExamDto({
          ...row,
          confirmation_status: 'confirmed',
          confirmed_at: now,
          updated_at: now,
        });
      })();
    } finally {
      db.close();
    }
  }

  listTasks(semesterId: unknown, courseInstanceId?: unknown): StudyTaskDto[] {
    if (!isUuid(semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    const db = this.openReadySemesterDb(semesterId);
    try {
      if (courseInstanceId !== undefined) {
        this.requireCourse(db, semesterId, String(courseInstanceId));
      }
      let rows: Record<string, unknown>[];
      if (courseInstanceId !== undefined) {
        rows = db
          .prepare(
            `SELECT * FROM study_tasks
             WHERE course_instance_id = ?
             ORDER BY CASE WHEN deadline_at IS NULL THEN 1 ELSE 0 END, deadline_at ASC, created_at DESC, id DESC`
          )
          .all(courseInstanceId) as Record<string, unknown>[];
      } else {
        rows = db
          .prepare(
            `SELECT t.* FROM study_tasks t
             JOIN course_instances c ON t.course_instance_id = c.id
             WHERE c.semester_id = ?
             ORDER BY CASE WHEN t.deadline_at IS NULL THEN 1 ELSE 0 END, t.deadline_at ASC, t.created_at DESC, t.id DESC`
          )
          .all(semesterId) as Record<string, unknown>[];
      }
      return rows.map((row) => this.toTaskDto(db, row));
    } finally {
      db.close();
    }
  }
  createTask(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    type: unknown;
    title: unknown;
    assessmentAttemptId?: unknown;
    knowledgeModuleId?: unknown;
    estimatedMinutes?: unknown;
    deadlineAt?: unknown;
  }): StudyTaskDto {
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    if (!isNonEmptyString(input.title) || input.title.trim().length > 200) {
      throw new StudyRhythmError('TASK_INPUT_INVALID', 400, '任务标题必须为非空字符串且不超过 200 字符');
    }
    if (!ALLOWED_TASK_TYPES.includes(String(input.type) as never)) {
      throw new StudyRhythmError(
        'TASK_INPUT_INVALID',
        400,
        '任务类型必须是 material_note、practice、error_review、exam_cram 或 custom'
      );
    }
    if (input.estimatedMinutes !== undefined && !isPositiveInteger(input.estimatedMinutes)) {
      throw new StudyRhythmError('TASK_INPUT_INVALID', 400, 'estimatedMinutes 必须是正整数');
    }
    if (input.deadlineAt !== undefined && !isIsoDatetime(input.deadlineAt)) {
      throw new StudyRhythmError('TASK_INPUT_INVALID', 400, 'deadlineAt 必须是有效的 ISO 日期时间');
    }
    if (input.knowledgeModuleId !== undefined && !isUuid(input.knowledgeModuleId)) {
      throw new StudyRhythmError('TASK_INPUT_INVALID', 400, 'knowledgeModuleId 必须是有效的 UUID');
    }

    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      this.requireCourse(db, input.semesterId, String(input.courseInstanceId));
      if (input.assessmentAttemptId !== undefined) {
        this.requireExamForCourse(db, String(input.assessmentAttemptId), String(input.courseInstanceId));
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const status = 'todo';
      db.prepare(
        `INSERT INTO study_tasks (
          id, course_instance_id, assessment_attempt_id, knowledge_module_id,
          type, title, status, estimated_minutes, deadline_at, completed_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.courseInstanceId,
        input.assessmentAttemptId ?? null,
        input.knowledgeModuleId ?? null,
        input.type,
        input.title.trim(),
        status,
        input.estimatedMinutes === undefined ? null : input.estimatedMinutes,
        input.deadlineAt === undefined ? null : input.deadlineAt,
        null,
        now,
        now
      );
      return this.toTaskDto(db, {
        id,
        course_instance_id: input.courseInstanceId,
        assessment_attempt_id: input.assessmentAttemptId ?? null,
        knowledge_module_id: input.knowledgeModuleId ?? null,
        type: input.type,
        title: input.title.trim(),
        status,
        estimated_minutes: input.estimatedMinutes ?? null,
        deadline_at: input.deadlineAt ?? null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
    } finally {
      db.close();
    }
  }

  updateTaskStatus(input: {
    semesterId: unknown;
    taskId: string;
    status: unknown;
    occurredAt?: unknown;
  }): StudyTaskDto {
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    if (!ALLOWED_TASK_STATUSES.includes(String(input.status) as never)) {
      throw new StudyRhythmError('TASK_STATUS_INVALID', 409, '状态值不合法');
    }
    if (input.occurredAt !== undefined && !isIsoDatetime(input.occurredAt)) {
      throw new StudyRhythmError('TASK_STATUS_INVALID', 409, 'occurredAt 必须是有效的 ISO 日期时间');
    }
    const newStatus = String(input.status) as StudyTaskStatus;
    const occurredAt = input.occurredAt === undefined ? new Date().toISOString() : String(input.occurredAt);

    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const row = this.requireTask(db, input.taskId);
      const oldStatus = String(row.status) as StudyTaskStatus;

      if (oldStatus === newStatus) {
        return this.toTaskDto(db, row);
      }

      if (!allowedTransitions[oldStatus].includes(newStatus)) {
        throw new StudyRhythmError('TASK_STATUS_INVALID', 409, `不允许从 ${oldStatus} 转换为 ${newStatus}`);
      }

      const now = new Date().toISOString();
      const completedAt = newStatus === 'done' ? (row.completed_at ?? occurredAt) : row.completed_at;

      db.transaction(() => {
        db.prepare(
          `UPDATE study_tasks
           SET status = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(newStatus, completedAt, now, input.taskId);

        if (newStatus === 'done') {
          db.prepare(
            `INSERT INTO study_events (
              id, course_instance_id, task_id, source_system, event_type, title,
              workload_minutes, parent_visible, occurred_at, created_at
            ) VALUES (?, ?, ?, 'S1', 'study_task_completed', ?, ?, 1, ?, ?)`
          ).run(
            crypto.randomUUID(),
            row.course_instance_id,
            input.taskId,
            row.title,
            row.estimated_minutes ?? null,
            occurredAt,
            now
          );
        }
      })();

      return this.toTaskDto(db, {
        ...row,
        status: newStatus,
        completed_at: completedAt,
        updated_at: now,
      });
    } finally {
      db.close();
    }
  }

  createEvent(input: {
    semesterId: unknown;
    sourceSystem: unknown;
    eventType: unknown;
    title: unknown;
    courseInstanceId?: unknown;
    taskId?: unknown;
    workloadMinutes?: unknown;
    parentVisible?: unknown;
    occurredAt?: unknown;
  }): StudyEventDto {
    if (!isUuid(input.semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    if (!ALLOWED_SOURCE_SYSTEMS.includes(String(input.sourceSystem) as never)) {
      throw new StudyRhythmError('EVENT_INPUT_INVALID', 400, 'sourceSystem 必须是 S1、S2、S3、S4、S5 或 S7');
    }
    if (!isNonEmptyString(input.eventType)) {
      throw new StudyRhythmError('EVENT_INPUT_INVALID', 400, 'eventType 不能为空');
    }
    if (!isNonEmptyString(input.title) || input.title.trim().length > 200) {
      throw new StudyRhythmError('EVENT_INPUT_INVALID', 400, '标题必须为非空字符串且不超过 200 字符');
    }
    if (input.workloadMinutes !== undefined && !isNonNegativeInteger(input.workloadMinutes)) {
      throw new StudyRhythmError('EVENT_INPUT_INVALID', 400, 'workloadMinutes 必须为非负整数');
    }
    if (input.occurredAt !== undefined && !isIsoDatetime(input.occurredAt)) {
      throw new StudyRhythmError('EVENT_INPUT_INVALID', 400, 'occurredAt 必须是有效的 ISO 日期时间');
    }

    this.assertWritableSemester(input.semesterId);
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      let courseInstanceId: string | undefined;
      if (input.courseInstanceId !== undefined) {
        this.requireCourse(db, input.semesterId, String(input.courseInstanceId));
        courseInstanceId = String(input.courseInstanceId);
      }

      let taskId: string | undefined;
      if (input.taskId !== undefined) {
        const taskRow = this.requireTask(db, String(input.taskId));
        if (courseInstanceId !== undefined && taskRow.course_instance_id !== courseInstanceId) {
          throw new StudyRhythmError('EVENT_INPUT_INVALID', 400, 'taskId 对应的课程与 courseInstanceId 不一致');
        }
        taskId = String(input.taskId);
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const parentVisible = input.parentVisible === undefined ? true : Boolean(input.parentVisible);
      const occurredAt = input.occurredAt === undefined ? now : String(input.occurredAt);

      db.prepare(
        `INSERT INTO study_events (
          id, course_instance_id, task_id, source_system, event_type, title,
          workload_minutes, parent_visible, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        courseInstanceId ?? null,
        taskId ?? null,
        input.sourceSystem,
        input.eventType,
        input.title.trim(),
        input.workloadMinutes === undefined ? null : input.workloadMinutes,
        parentVisible ? 1 : 0,
        occurredAt,
        now
      );
      return this.toEventDto({
        id,
        course_instance_id: courseInstanceId ?? null,
        task_id: taskId ?? null,
        source_system: input.sourceSystem,
        event_type: input.eventType,
        title: input.title.trim(),
        workload_minutes: input.workloadMinutes ?? null,
        parent_visible: parentVisible ? 1 : 0,
        occurred_at: occurredAt,
        created_at: now,
      });
    } finally {
      db.close();
    }
  }

  getTimeline(
    semesterId: unknown,
    courseInstanceId?: unknown,
    limitInput?: unknown,
    eventTypeInput?: unknown
  ): StudyEventDto[] {
    if (!isUuid(semesterId)) {
      throw new StudyRhythmError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    const limit =
      limitInput === undefined ? 50 : typeof limitInput === 'string' ? Number(limitInput) : Number(limitInput);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new StudyRhythmError('TIMELINE_QUERY_INVALID', 400, 'limit 必须是 1 到 200 之间的整数');
    }

    let eventTypes: string[] | undefined;
    if (eventTypeInput !== undefined) {
      const values = Array.isArray(eventTypeInput) ? eventTypeInput : [eventTypeInput];
      if (values.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
        throw new StudyRhythmError('TIMELINE_QUERY_INVALID', 400, 'eventType 必须是非空字符串');
      }
      eventTypes = [...new Set(values as string[])];
      if (eventTypes.length > 20) {
        throw new StudyRhythmError('TIMELINE_QUERY_INVALID', 400, 'eventType 最多接受 20 个不同值');
      }
    }

    const db = this.openReadySemesterDb(semesterId);
    try {
      if (courseInstanceId !== undefined) {
        this.requireCourse(db, semesterId, String(courseInstanceId));
      }

      let sql = 'SELECT * FROM study_events';
      const params: (string | number)[] = [];
      const conditions: string[] = [];
      if (courseInstanceId !== undefined) {
        conditions.push('course_instance_id = ?');
        params.push(String(courseInstanceId));
      }
      if (eventTypes !== undefined) {
        conditions.push(`event_type IN (${eventTypes.map(() => '?').join(', ')})`);
        params.push(...eventTypes);
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ' ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT ?';
      params.push(limit);

      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      return rows.map((row) => this.toEventDto(row));
    } finally {
      db.close();
    }
  }
}
