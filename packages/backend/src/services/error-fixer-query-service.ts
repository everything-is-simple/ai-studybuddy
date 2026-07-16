// ============================================================
// S4 ErrorFixer 查询与操作服务 — Phase 1-T04B
// 前端只消费本服务暴露的 API；错题详情允许展示已批改事实。
// 归档逻辑在 error-fixer-service.ts（T04A），本文件不重复实现。
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { migrateSemesterDb } from '../db/migrations';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { FeedbackRulesService } from './feedback-rules-service';
import type {
  ConfirmMistakeErrorCauseRequest,
  CreateMistakeRedoRequest,
  MistakeDetailDto,
  MistakeErrorCauseCategory,
  MistakeEvidenceDto,
  MistakeListItemDto,
  MistakeListResponse,
  MistakeStatus,
  PracticeQuestionType,
  PracticeSessionDetailDto,
  UpdateMistakeStatusRequest,
  WeakPointListResponse,
} from '@ai-studybuddy/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CAUSE_CATEGORIES: readonly MistakeErrorCauseCategory[] = [
  'concept_unclear',
  'misread',
  'formula_error',
  'step_missing',
  'time_pressure',
  'other',
];
const MISTAKE_STATUSES: readonly MistakeStatus[] = ['pending_review', 'needs_review', 'mastered'];
const STEM_PREVIEW_LENGTH = 80;

export class ErrorFixerApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ErrorFixerApiError';
  }
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredUuid(value: unknown, code: string, message: string): string {
  const result = string(value);
  if (!UUID.test(result)) throw new ErrorFixerApiError(code, 400, message);
  return result;
}

function nowIso(): string {
  return new Date().toISOString();
}

interface MistakeRow {
  id: string;
  course_instance_id: string;
  assessment_attempt_id: string | null;
  knowledge_module_id: string;
  question_id: string;
  latest_practice_answer_id: string;
  status: MistakeStatus;
  error_count: number;
  error_cause_category: MistakeErrorCauseCategory | null;
  error_cause_note: string | null;
  error_cause_confirmed_at: string | null;
  first_error_at: string;
  latest_error_at: string;
  module_title: string;
  question_type: PracticeQuestionType;
  stem: string;
  options_json: string | null;
  correct_answer: string;
  explanation: string | null;
  student_answer: string | null;
}

const MISTAKE_SELECT = `
  SELECT
    m.id, m.course_instance_id, m.assessment_attempt_id, m.knowledge_module_id,
    m.question_id, m.latest_practice_answer_id, m.status, m.error_count,
    m.error_cause_category, m.error_cause_note, m.error_cause_confirmed_at,
    m.first_error_at, m.latest_error_at,
    km.title AS module_title,
    q.type AS question_type, q.stem, q.options_json, q.correct_answer, q.explanation,
    a.student_answer
  FROM mistakes m
  JOIN knowledge_modules km ON km.id = m.knowledge_module_id
  JOIN questions q ON q.id = m.question_id
  JOIN practice_answers a ON a.id = m.latest_practice_answer_id
`;

export interface ErrorFixerQueryServiceOptions {
  now?: () => string;
  id?: () => string;
  feedbackRules?: FeedbackRulesService;
}

export class ErrorFixerQueryService {
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly feedbackRules: FeedbackRulesService;

  constructor(options?: ErrorFixerQueryServiceOptions) {
    this.now = options?.now ?? nowIso;
    this.id = options?.id ?? crypto.randomUUID;
    this.feedbackRules = options?.feedbackRules ?? new FeedbackRulesService({ now: this.now, id: this.id });
  }

  private openReadySemesterDb(semesterIdValue: unknown): DatabaseType {
    const semesterId = requiredUuid(semesterIdValue, 'SEMESTER_NOT_FOUND', '学期不存在');
    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as
        | { ready: number }
        | undefined;
      if (!row) throw new ErrorFixerApiError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      if (row.ready !== 1) throw new ErrorFixerApiError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    } catch (error) {
      if (error instanceof ErrorFixerApiError) throw error;
      throw new ErrorFixerApiError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    } finally {
      globalDb?.close();
    }
    if (!fs.existsSync(getSemesterDbPath(semesterId)))
      throw new ErrorFixerApiError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
    migrateSemesterDb(db);
    return db;
  }

  private requireCourse(db: DatabaseType, courseInstanceIdValue: unknown): string {
    const courseInstanceId = requiredUuid(courseInstanceIdValue, 'COURSE_NOT_FOUND', '课程不存在');
    const row = db.prepare('SELECT id FROM course_instances WHERE id = ?').get(courseInstanceId);
    if (!row) throw new ErrorFixerApiError('COURSE_NOT_FOUND', 404, '课程不存在');
    return courseInstanceId;
  }

  private parseOptions(optionsJson: string | null): string[] | null {
    if (!optionsJson) return null;
    try {
      const parsed = JSON.parse(optionsJson) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null;
    } catch {
      return null;
    }
  }

  listMistakes(
    semesterIdValue: unknown,
    courseInstanceIdValue: unknown,
    filters: { knowledgeModuleId?: unknown; status?: unknown; page?: unknown; pageSize?: unknown }
  ): MistakeListResponse {
    const db = this.openReadySemesterDb(semesterIdValue);
    try {
      const courseInstanceId = this.requireCourse(db, courseInstanceIdValue);

      const conditions = ['m.course_instance_id = ?'];
      const params: unknown[] = [courseInstanceId];
      if (filters.knowledgeModuleId !== undefined && filters.knowledgeModuleId !== null && filters.knowledgeModuleId !== '') {
        conditions.push('m.knowledge_module_id = ?');
        params.push(requiredUuid(filters.knowledgeModuleId, 'MISTAKE_FILTER_INVALID', 'knowledgeModuleId 不合法'));
      }
      if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
        const status = string(filters.status);
        if (!MISTAKE_STATUSES.includes(status as MistakeStatus))
          throw new ErrorFixerApiError('MISTAKE_FILTER_INVALID', 400, 'status 筛选值不合法');
        conditions.push('m.status = ?');
        params.push(status);
      }

      const page = filters.page === undefined || filters.page === null || filters.page === '' ? 1 : Number(filters.page);
      const pageSize =
        filters.pageSize === undefined || filters.pageSize === null || filters.pageSize === ''
          ? 20
          : Number(filters.pageSize);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
        throw new ErrorFixerApiError('MISTAKE_FILTER_INVALID', 400, '分页参数不合法');

      const where = conditions.join(' AND ');
      const total = (
        db.prepare(`SELECT COUNT(*) AS count FROM mistakes m WHERE ${where}`).get(...params) as { count: number }
      ).count;

      const rows = db
        .prepare(
          `${MISTAKE_SELECT}
           WHERE ${where}
           ORDER BY CASE m.status
               WHEN 'pending_review' THEN 0
               WHEN 'needs_review' THEN 1
               ELSE 2
             END ASC,
             m.latest_error_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, (page - 1) * pageSize) as MistakeRow[];

      return {
        items: rows.map((row) => this.toListItem(row)),
        page,
        pageSize,
        total,
      };
    } finally {
      db.close();
    }
  }

  private toListItem(row: MistakeRow): MistakeListItemDto {
    const stem = String(row.stem);
    return {
      id: row.id,
      courseInstanceId: row.course_instance_id,
      assessmentAttemptId: row.assessment_attempt_id,
      knowledgeModuleId: row.knowledge_module_id,
      knowledgeModuleTitle: row.module_title,
      questionId: row.question_id,
      questionType: row.question_type,
      stemPreview: stem.length > STEM_PREVIEW_LENGTH ? `${stem.slice(0, STEM_PREVIEW_LENGTH)}…` : stem,
      status: row.status,
      errorCount: Number(row.error_count),
      errorCauseCategory: row.error_cause_category,
      firstErrorAt: row.first_error_at,
      latestErrorAt: row.latest_error_at,
    };
  }

  getMistake(semesterIdValue: unknown, mistakeIdValue: unknown): MistakeDetailDto {
    const mistakeId = requiredUuid(mistakeIdValue, 'MISTAKE_NOT_FOUND', '错题不存在');
    const db = this.openReadySemesterDb(semesterIdValue);
    try {
      const row = db.prepare(`${MISTAKE_SELECT} WHERE m.id = ?`).get(mistakeId) as MistakeRow | undefined;
      if (!row) throw new ErrorFixerApiError('MISTAKE_NOT_FOUND', 404, '错题不存在');

      const evidence = db
        .prepare(
          `SELECT id, evidence_type, occurred_at
           FROM mistake_evidence
           WHERE mistake_id = ?
           ORDER BY occurred_at DESC, created_at DESC`
        )
        .all(mistakeId) as Array<{ id: string; evidence_type: MistakeEvidenceDto['evidenceType']; occurred_at: string }>;

      return {
        id: row.id,
        courseInstanceId: row.course_instance_id,
        assessmentAttemptId: row.assessment_attempt_id,
        knowledgeModuleId: row.knowledge_module_id,
        knowledgeModuleTitle: row.module_title,
        questionId: row.question_id,
        questionType: row.question_type,
        stem: row.stem,
        options: this.parseOptions(row.options_json),
        correctAnswer: row.correct_answer,
        explanation: row.explanation,
        studentAnswer: row.student_answer,
        status: row.status,
        errorCount: Number(row.error_count),
        errorCauseCategory: row.error_cause_category,
        errorCauseNote: row.error_cause_note,
        errorCauseConfirmedAt: row.error_cause_confirmed_at,
        firstErrorAt: row.first_error_at,
        latestErrorAt: row.latest_error_at,
        evidence: evidence.map((item) => ({
          id: item.id,
          evidenceType: item.evidence_type,
          occurredAt: item.occurred_at,
        })),
      };
    } finally {
      db.close();
    }
  }

  confirmErrorCause(mistakeIdValue: unknown, input: ConfirmMistakeErrorCauseRequest): MistakeDetailDto {
    const mistakeId = requiredUuid(mistakeIdValue, 'MISTAKE_NOT_FOUND', '错题不存在');
    if (!ERROR_CAUSE_CATEGORIES.includes(input?.category as MistakeErrorCauseCategory))
      throw new ErrorFixerApiError('MISTAKE_CAUSE_INVALID', 400, '错因类别不合法');
    const note = input.note === undefined || input.note === null ? null : String(input.note).trim();
    if (note !== null && (note.length < 1 || note.length > 500))
      throw new ErrorFixerApiError('MISTAKE_CAUSE_INVALID', 400, '错因备注长度必须在 1-500 字之间');

    const db = this.openReadySemesterDb(input?.semesterId);
    try {
      const timestamp = this.now();
      db.transaction(() => {
        const row = db.prepare('SELECT id, status, course_instance_id, knowledge_module_id FROM mistakes WHERE id = ?').get(mistakeId) as
          | { id: string; status: MistakeStatus; course_instance_id: string; knowledge_module_id: string }
          | undefined;
        if (!row) throw new ErrorFixerApiError('MISTAKE_NOT_FOUND', 404, '错题不存在');
        db.prepare(
          `UPDATE mistakes
           SET error_cause_category = ?,
               error_cause_note = ?,
               error_cause_confirmed_at = ?,
               status = CASE WHEN status = 'pending_review' THEN 'needs_review' ELSE status END,
               updated_at = ?
           WHERE id = ?`
        ).run(input.category, note, timestamp, timestamp, mistakeId);
        this.feedbackRules.applyForModule(db, {
          courseInstanceId: row.course_instance_id,
          knowledgeModuleId: row.knowledge_module_id,
          reason: 'error_cause_confirmed',
          occurredAt: timestamp,
        });
      })();
      return this.getMistakeWithinDb(db, mistakeId);
    } finally {
      db.close();
    }
  }

  updateStatus(mistakeIdValue: unknown, input: UpdateMistakeStatusRequest): MistakeDetailDto {
    const mistakeId = requiredUuid(mistakeIdValue, 'MISTAKE_NOT_FOUND', '错题不存在');
    if (input?.status !== 'mastered' && input?.status !== 'needs_review')
      throw new ErrorFixerApiError('MISTAKE_STATUS_INVALID', 400, '目标状态只能是 mastered 或 needs_review');

    const db = this.openReadySemesterDb(input?.semesterId);
    try {
      const timestamp = this.now();
      db.transaction(() => {
        const row = db.prepare('SELECT id, status, course_instance_id, knowledge_module_id FROM mistakes WHERE id = ?').get(mistakeId) as
          | { id: string; status: MistakeStatus; course_instance_id: string; knowledge_module_id: string }
          | undefined;
        if (!row) throw new ErrorFixerApiError('MISTAKE_NOT_FOUND', 404, '错题不存在');

        if (input.status === 'mastered') {
          if (row.status !== 'needs_review')
            throw new ErrorFixerApiError('MISTAKE_STATUS_INVALID', 409, '只有需要复习状态的错题可以标记已掌握');
          const hasRedoCorrect = db
            .prepare(
              "SELECT 1 FROM mistake_evidence WHERE mistake_id = ? AND evidence_type = 'redo_correct'"
            )
            .get(mistakeId);
          if (!hasRedoCorrect && input.confirm !== true)
            throw new ErrorFixerApiError(
              'MISTAKE_MASTERY_EVIDENCE_REQUIRED',
              409,
              '尚无重做通过证据；如确认已掌握，请显式确认'
            );
        } else if (row.status !== 'mastered') {
          throw new ErrorFixerApiError('MISTAKE_STATUS_INVALID', 409, '只有已掌握的错题可以重新打开为需要复习');
        }

        db.prepare('UPDATE mistakes SET status = ?, updated_at = ? WHERE id = ?').run(
          input.status,
          timestamp,
          mistakeId
        );
        this.feedbackRules.applyForModule(db, {
          courseInstanceId: row.course_instance_id,
          knowledgeModuleId: row.knowledge_module_id,
          reason: input.status === 'mastered' ? 'mistake_mastered' : 'mistake_reopened',
          occurredAt: timestamp,
        });
      })();
      return this.getMistakeWithinDb(db, mistakeId);
    } finally {
      db.close();
    }
  }

  createRedoSession(mistakeIdValue: unknown, input: CreateMistakeRedoRequest): PracticeSessionDetailDto {
    const mistakeId = requiredUuid(mistakeIdValue, 'MISTAKE_NOT_FOUND', '错题不存在');
    const db = this.openReadySemesterDb(input?.semesterId);
    try {
      const timestamp = this.now();
      const sessionId = this.id();
      db.transaction(() => {
        const mistake = db
          .prepare(
            `SELECT m.id, m.course_instance_id, m.knowledge_module_id, m.question_id,
                    q.type, q.stem, q.options_json, q.correct_answer, q.acceptable_answers_json,
                    q.difficulty, q.explanation, q.source_evidence, q.ai_model, q.prompt_version
             FROM mistakes m
             JOIN questions q ON q.id = m.question_id
             WHERE m.id = ?`
          )
          .get(mistakeId) as Record<string, unknown> | undefined;
        if (!mistake) throw new ErrorFixerApiError('MISTAKE_NOT_FOUND', 404, '错题不存在');

        const activeRedo = db
          .prepare(
            `SELECT id FROM practice_sessions
             WHERE session_kind = 'mistake_redo' AND origin_mistake_id = ? AND status = 'in_progress'`
          )
          .get(mistakeId) as { id: string } | undefined;
        if (activeRedo)
          throw new ErrorFixerApiError('MISTAKE_REDO_IN_PROGRESS', 409, '该错题已有进行中的重做，请先完成或提交');

        db.prepare(
          `INSERT INTO practice_sessions (
            id, course_instance_id, assessment_attempt_id, status, question_count,
            time_limit_seconds, started_at, submitted_at, graded_at, total_score,
            correct_rate, overtime, total_duration_seconds, difficulty_preference,
            session_kind, origin_mistake_id, created_at, updated_at
          ) VALUES (?, ?, NULL, 'in_progress', 1, NULL, ?, NULL, NULL, NULL, NULL, 0, NULL, 'mixed', 'mistake_redo', ?, ?, ?)`
        ).run(sessionId, mistake.course_instance_id, timestamp, mistakeId, timestamp, timestamp);

        db.prepare(
          `INSERT INTO questions (
            id, practice_session_id, course_instance_id, knowledge_module_id, type,
            stem, options_json, correct_answer, acceptable_answers_json, difficulty,
            explanation, source_evidence, ai_model, prompt_version, question_order,
            origin_question_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).run(
          this.id(),
          sessionId,
          mistake.course_instance_id,
          mistake.knowledge_module_id,
          mistake.type,
          mistake.stem,
          mistake.options_json,
          mistake.correct_answer,
          mistake.acceptable_answers_json,
          mistake.difficulty,
          mistake.explanation,
          mistake.source_evidence,
          mistake.ai_model,
          mistake.prompt_version,
          mistake.question_id,
          timestamp
        );
      })();

      return this.toSessionDto(db, sessionId);
    } finally {
      db.close();
    }
  }

  listWeakPoints(semesterIdValue: unknown, courseInstanceIdValue: unknown): WeakPointListResponse {
    const db = this.openReadySemesterDb(semesterIdValue);
    try {
      const courseInstanceId = this.requireCourse(db, courseInstanceIdValue);
      const rows = db
        .prepare(
          `SELECT w.id, w.course_instance_id, w.knowledge_module_id, w.status,
                  w.evidence_count, w.first_detected_at, w.latest_detected_at,
                  km.title AS module_title
           FROM weak_points w
           JOIN knowledge_modules km ON km.id = w.knowledge_module_id
           WHERE w.course_instance_id = ?
           ORDER BY w.status ASC, w.latest_detected_at DESC`
        )
        .all(courseInstanceId) as Array<Record<string, unknown>>;
      return {
        items: rows.map((row) => ({
          id: String(row.id),
          courseInstanceId: String(row.course_instance_id),
          knowledgeModuleId: String(row.knowledge_module_id),
          knowledgeModuleTitle: String(row.module_title),
          status: String(row.status) as 'active' | 'mastered',
          evidenceCount: Number(row.evidence_count),
          firstDetectedAt: String(row.first_detected_at),
          latestDetectedAt: String(row.latest_detected_at),
        })),
      };
    } finally {
      db.close();
    }
  }

  private getMistakeWithinDb(db: DatabaseType, mistakeId: string): MistakeDetailDto {
    const row = db.prepare(`${MISTAKE_SELECT} WHERE m.id = ?`).get(mistakeId) as MistakeRow | undefined;
    if (!row) throw new ErrorFixerApiError('MISTAKE_NOT_FOUND', 404, '错题不存在');
    const evidence = db
      .prepare(
        `SELECT id, evidence_type, occurred_at
         FROM mistake_evidence
         WHERE mistake_id = ?
         ORDER BY occurred_at DESC, created_at DESC`
      )
      .all(mistakeId) as Array<{ id: string; evidence_type: MistakeEvidenceDto['evidenceType']; occurred_at: string }>;
    return {
      id: row.id,
      courseInstanceId: row.course_instance_id,
      assessmentAttemptId: row.assessment_attempt_id,
      knowledgeModuleId: row.knowledge_module_id,
      knowledgeModuleTitle: row.module_title,
      questionId: row.question_id,
      questionType: row.question_type,
      stem: row.stem,
      options: this.parseOptions(row.options_json),
      correctAnswer: row.correct_answer,
      explanation: row.explanation,
      studentAnswer: row.student_answer,
      status: row.status,
      errorCount: Number(row.error_count),
      errorCauseCategory: row.error_cause_category,
      errorCauseNote: row.error_cause_note,
      errorCauseConfirmedAt: row.error_cause_confirmed_at,
      firstErrorAt: row.first_error_at,
      latestErrorAt: row.latest_error_at,
      evidence: evidence.map((item) => ({
        id: item.id,
        evidenceType: item.evidence_type,
        occurredAt: item.occurred_at,
      })),
    };
  }

  private toSessionDto(db: DatabaseType, sessionId: string): PracticeSessionDetailDto {
    const session = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(sessionId) as
      | Record<string, unknown>
      | undefined;
    if (!session) throw new ErrorFixerApiError('PRACTICE_SESSION_NOT_FOUND', 404, '练习不存在');
    const questions = db
      .prepare('SELECT * FROM questions WHERE practice_session_id = ? ORDER BY question_order ASC')
      .all(sessionId) as Array<Record<string, unknown>>;
    return {
      id: String(session.id),
      courseInstanceId: String(session.course_instance_id),
      assessmentAttemptId:
        session.assessment_attempt_id === null || session.assessment_attempt_id === undefined
          ? null
          : String(session.assessment_attempt_id),
      status: String(session.status) as PracticeSessionDetailDto['status'],
      questionCount: Number(session.question_count),
      timeLimitSeconds:
        session.time_limit_seconds === null || session.time_limit_seconds === undefined
          ? null
          : Number(session.time_limit_seconds),
      difficultyPreference: String(session.difficulty_preference) as PracticeSessionDetailDto['difficultyPreference'],
      sessionKind: (session.session_kind === 'mistake_redo' ? 'mistake_redo' : 'practice') as
        | 'practice'
        | 'mistake_redo',
      originMistakeId:
        session.origin_mistake_id === null || session.origin_mistake_id === undefined
          ? null
          : String(session.origin_mistake_id),
      startedAt: String(session.started_at),
      createdAt: String(session.created_at),
      updatedAt: String(session.updated_at),
      questions: questions.map((row) => ({
        id: String(row.id),
        type: String(row.type) as PracticeQuestionType,
        stem: String(row.stem),
        ...(row.options_json ? { options: this.parseOptions(row.options_json as string) ?? undefined } : {}),
        difficulty: String(row.difficulty) as 'easy' | 'medium' | 'hard',
        knowledgeModuleId: String(row.knowledge_module_id),
        questionOrder: Number(row.question_order),
      })),
    };
  }
}
