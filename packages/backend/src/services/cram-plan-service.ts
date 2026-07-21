import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { config } from '../config/env';
import type { CramPlanResponseDto, CramPlanSuggestionDto } from '@ai-studybuddy/shared';
import { ExamCrammerError } from './exam-crammer-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value: unknown, code: string, message: string): string {
  const result = String(value ?? '');
  if (!UUID.test(result)) throw new ExamCrammerError(code, 404, message);
  return result;
}

function localCalendarDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ExamCrammerError('ASSESSMENT_ATTEMPT_NOT_FOUND', 404, '考试日期不可用');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarDayDistance(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000);
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
}

export interface CramPlanServiceOptions {
  now?: () => string;
}

/** Phase 2-T05：仅聚合既有事实，不持久化计划或修改任一学习记录。 */
export class CramPlanService {
  private readonly now: () => string;

  constructor(options?: CramPlanServiceOptions) {
    this.now = options?.now ?? (() => config.cramPlanNow || new Date().toISOString());
  }

  private openReadySemesterDb(semesterId: string): DatabaseType {
    requiredUuid(semesterId, 'SEMESTER_NOT_FOUND', '学期不存在');
    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as { ready: number } | undefined;
      if (!row) throw new ExamCrammerError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      if (row.ready !== 1) throw new ExamCrammerError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    } catch (error) {
      if (error instanceof ExamCrammerError) throw error;
      throw new ExamCrammerError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    } finally {
      globalDb?.close();
    }
    if (!fs.existsSync(getSemesterDbPath(semesterId))) throw new ExamCrammerError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
    return db;
  }

  getCramPlan(semesterValue: unknown, assessmentValue: unknown): CramPlanResponseDto {
    const semesterId = requiredUuid(semesterValue, 'SEMESTER_NOT_FOUND', '学期不存在');
    const assessmentAttemptId = requiredUuid(assessmentValue, 'ASSESSMENT_ATTEMPT_NOT_FOUND', '考试不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const assessment = db.prepare(`
        SELECT a.id, a.course_instance_id, a.name, a.exam_at, a.confirmation_status
        FROM assessment_attempts a
        JOIN course_instances c ON c.id = a.course_instance_id
        WHERE a.id = ? AND c.semester_id = ?
      `).get(assessmentAttemptId, semesterId) as {
        id: string; course_instance_id: string; name: string; exam_at: string; confirmation_status: string;
      } | undefined;
      if (!assessment) throw new ExamCrammerError('ASSESSMENT_ATTEMPT_NOT_FOUND', 404, '考试不存在或不属于该学期');
      if (assessment.confirmation_status !== 'confirmed') throw new ExamCrammerError('ASSESSMENT_NOT_CONFIRMED', 409, '只有已确认考试才能生成冲刺计划');

      const today = localCalendarDate(this.now());
      const examDate = localCalendarDate(assessment.exam_at);
      const daysUntilExam = calendarDayDistance(today, examDate);
      const availability: CramPlanResponseDto['availability'] = daysUntilExam < 0 ? 'ended' : daysUntilExam > 7 ? 'not_started' : 'available';
      const base: Omit<CramPlanResponseDto, 'days'> = {
        assessmentAttemptId,
        courseInstanceId: assessment.course_instance_id,
        assessmentName: assessment.name,
        examAt: assessment.exam_at,
        daysUntilExam,
        availability,
      };
      if (availability !== 'available') return { ...base, days: [] };

      type Candidate = CramPlanSuggestionDto & { rank: number; dueAt: string; recentAt: string };
      const candidates: Candidate[] = [];
      const courseId = assessment.course_instance_id;
      const taskRows = db.prepare(`
        SELECT id, deadline_at FROM study_tasks
        WHERE course_instance_id = ?
          AND status IN ('todo', 'doing', 'pending_quality_check')
          AND deadline_at IS NOT NULL AND date(deadline_at) <= date(?)
        ORDER BY datetime(deadline_at) ASC, id ASC
      `).all(courseId, assessment.exam_at) as Array<{ id: string; deadline_at: string }>;
      for (const row of taskRows) {
        candidates.push({ id: `task:${row.id}`, priority: 1, reason: '优先完成考试前到期的未完成任务', sourceKind: 'study_task', sourceId: row.id, targetType: 'study_task', targetId: row.id, rank: 0, dueAt: row.deadline_at, recentAt: row.deadline_at });
      }
      const weakRows = db.prepare(`
        SELECT id, evidence_count, latest_detected_at FROM weak_points
        WHERE course_instance_id = ? AND status = 'active'
        ORDER BY evidence_count DESC, datetime(latest_detected_at) DESC, id ASC
      `).all(courseId) as Array<{ id: string; evidence_count: number; latest_detected_at: string }>;
      for (const row of weakRows) {
        candidates.push({ id: `weak:${row.id}`, priority: 2, reason: `薄弱点已有 ${Number(row.evidence_count)} 条证据`, sourceKind: 'weak_point', sourceId: row.id, targetType: 'weak_point', targetId: row.id, rank: -Number(row.evidence_count), dueAt: '', recentAt: row.latest_detected_at });
      }
      const mistakeRows = db.prepare(`
        SELECT id, error_count, latest_error_at FROM mistakes
        WHERE course_instance_id = ? AND status IN ('pending_review', 'needs_review')
        ORDER BY error_count DESC, datetime(latest_error_at) DESC, id ASC
      `).all(courseId) as Array<{ id: string; error_count: number; latest_error_at: string }>;
      for (const row of mistakeRows) {
        candidates.push({ id: `mistake:${row.id}`, priority: 3, reason: `错题累计 ${Number(row.error_count)} 次错误`, sourceKind: 'mistake', sourceId: row.id, targetType: 'mistake', targetId: row.id, rank: -Number(row.error_count), dueAt: '', recentAt: row.latest_error_at });
      }
      const practiceRows = db.prepare(`
        SELECT id, correct_rate, graded_at FROM practice_sessions
        WHERE course_instance_id = ? AND status = 'graded' AND session_kind = 'practice' AND correct_rate IS NOT NULL
        ORDER BY correct_rate ASC, datetime(graded_at) DESC, id ASC
      `).all(courseId) as Array<{ id: string; correct_rate: number; graded_at: string }>;
      for (const row of practiceRows) {
        if (Number(row.correct_rate) < 0.8) candidates.push({ id: `practice:${row.id}`, priority: 4, reason: `已完成练习正确率 ${Math.round(Number(row.correct_rate) * 100)}%，建议针对性复盘`, sourceKind: 'practice_performance', sourceId: row.id, targetType: 'practice_history', targetId: row.id, rank: Number(row.correct_rate), dueAt: '', recentAt: row.graded_at });
      }
      const moduleCount = (db.prepare(`
        SELECT COUNT(*) AS count FROM knowledge_modules
        WHERE course_instance_id = ? AND (TRIM(COALESCE(content_summary, '')) <> '' OR TRIM(COALESCE(exam_relevance, '')) <> '')
      `).get(courseId) as { count: number }).count;
      if (moduleCount > 0) {
        candidates.push({ id: 'cram-cards', priority: 4, reason: '可使用临考速背快速回顾已整理考点', sourceKind: 'cram_cards', sourceId: null, targetType: 'cram_cards', targetId: assessmentAttemptId, rank: 0, dueAt: '', recentAt: '' });
      }
      candidates.sort((a, b) => a.priority - b.priority || a.rank - b.rank || (a.priority === 1 ? a.dueAt.localeCompare(b.dueAt) : b.recentAt.localeCompare(a.recentAt)) || a.id.localeCompare(b.id));
      const days = Array.from({ length: Math.max(1, daysUntilExam + 1) }, (_, index) => ({ date: addCalendarDays(today, index), suggestions: [] as CramPlanSuggestionDto[] }));
      for (const [index, candidate] of candidates.entries()) {
        days[index % days.length].suggestions.push({ id: candidate.id, priority: candidate.priority, reason: candidate.reason, sourceKind: candidate.sourceKind, sourceId: candidate.sourceId, targetType: candidate.targetType, targetId: candidate.targetId });
      }
      return { ...base, days };
    } finally {
      db.close();
    }
  }
}