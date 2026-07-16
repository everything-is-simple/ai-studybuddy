import crypto from 'crypto';
import type { DatabaseType } from '../db/connection';

export type FeedbackRuleReason =
  | 'practice_error'
  | 'error_cause_confirmed'
  | 'weak_point_active'
  | 'redo_incorrect'
  | 'mistake_mastered'
  | 'mistake_reopened';

interface FeedbackRulesServiceOptions {
  now?: () => string;
  id?: () => string;
}

interface ApplyForModuleInput {
  courseInstanceId: string;
  knowledgeModuleId: string;
  reason: FeedbackRuleReason;
  occurredAt?: string;
}

interface ModuleRow {
  id: string;
  course_instance_id: string;
  title: string;
  learn_status: string;
}

interface FeedbackStatus {
  needsReviewCount: number;
  pendingReviewCount: number;
  activeWeakPoint: boolean;
  latestAssessmentAttemptId: string | null;
}

const OPEN_TASK_STATUSES = ['todo', 'doing', 'pending_quality_check'] as const;

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

export class FeedbackRulesService {
  private readonly now: () => string;
  private readonly id: () => string;

  constructor(options?: FeedbackRulesServiceOptions) {
    this.now = options?.now ?? nowIso;
    this.id = options?.id ?? uuid;
  }

  applyForModule(db: DatabaseType, input: ApplyForModuleInput): void {
    const occurredAt = input.occurredAt ?? this.now();
    const module = this.getModule(db, input.courseInstanceId, input.knowledgeModuleId);
    const status = this.getFeedbackStatus(db, input.courseInstanceId, input.knowledgeModuleId);

    if (this.shouldMarkMastered(input.reason, status)) {
      this.applyMastered(db, module, occurredAt);
      return;
    }

    if (this.shouldRequireReview(input.reason, status)) {
      this.applyReviewRequired(db, module, status, input.reason, occurredAt);
    }
  }

  private getModule(db: DatabaseType, courseInstanceId: string, knowledgeModuleId: string): ModuleRow {
    const row = db
      .prepare(
        `SELECT id, course_instance_id, title, learn_status
         FROM knowledge_modules
         WHERE id = ? AND course_instance_id = ?`
      )
      .get(knowledgeModuleId, courseInstanceId) as ModuleRow | undefined;
    if (!row) throw new Error('[T05] knowledge module not found for feedback rules');
    return row;
  }

  private getFeedbackStatus(db: DatabaseType, courseInstanceId: string, knowledgeModuleId: string): FeedbackStatus {
    const counts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review_count,
           SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending_review_count
         FROM mistakes
         WHERE course_instance_id = ? AND knowledge_module_id = ?`
      )
      .get(courseInstanceId, knowledgeModuleId) as {
      needs_review_count: number | null;
      pending_review_count: number | null;
    };
    const activeWeakPoint = !!db
      .prepare(
        `SELECT 1 FROM weak_points
         WHERE course_instance_id = ? AND knowledge_module_id = ? AND status = 'active'`
      )
      .get(courseInstanceId, knowledgeModuleId);
    const latestMistake = db
      .prepare(
        `SELECT assessment_attempt_id
         FROM mistakes
         WHERE course_instance_id = ?
           AND knowledge_module_id = ?
           AND assessment_attempt_id IS NOT NULL
         ORDER BY latest_error_at DESC, updated_at DESC
         LIMIT 1`
      )
      .get(courseInstanceId, knowledgeModuleId) as { assessment_attempt_id: string | null } | undefined;
    return {
      needsReviewCount: Number(counts.needs_review_count ?? 0),
      pendingReviewCount: Number(counts.pending_review_count ?? 0),
      activeWeakPoint,
      latestAssessmentAttemptId: latestMistake?.assessment_attempt_id ?? null,
    };
  }

  private shouldRequireReview(reason: FeedbackRuleReason, status: FeedbackStatus): boolean {
    if (status.needsReviewCount > 0 || status.activeWeakPoint) return true;
    return reason === 'redo_incorrect' || reason === 'weak_point_active' || reason === 'mistake_reopened';
  }

  private shouldMarkMastered(reason: FeedbackRuleReason, status: FeedbackStatus): boolean {
    return reason === 'mistake_mastered' && status.needsReviewCount === 0 && status.pendingReviewCount === 0;
  }

  private applyReviewRequired(
    db: DatabaseType,
    module: ModuleRow,
    status: FeedbackStatus,
    reason: FeedbackRuleReason,
    occurredAt: string
  ): void {
    if (module.learn_status !== 'learning') {
      db.prepare(
        `UPDATE knowledge_modules
         SET learn_status = 'learning', updated_at = ?
         WHERE id = ?`
      ).run(occurredAt, module.id);
    }
    db.prepare(
      `UPDATE weak_points
       SET status = 'active', updated_at = ?
       WHERE course_instance_id = ? AND knowledge_module_id = ?`
    ).run(occurredAt, module.course_instance_id, module.id);

    const urgent = status.activeWeakPoint || reason === 'redo_incorrect' || reason === 'weak_point_active';
    const deadlineAt = addHours(occurredAt, urgent ? 24 : 72);
    this.ensureOpenReviewTask(db, module, status.latestAssessmentAttemptId, deadlineAt, occurredAt);
    this.writeTransitionEvent(db, {
      courseInstanceId: module.course_instance_id,
      eventType: 'feedback_review_required',
      title: '知识模块需要复习',
      evidenceRef: `km:${module.id}`,
      occurredAt,
    });
  }

  private ensureOpenReviewTask(
    db: DatabaseType,
    module: ModuleRow,
    assessmentAttemptId: string | null,
    deadlineAt: string,
    occurredAt: string
  ): void {
    const openTask = db
      .prepare(
        `SELECT id, deadline_at
         FROM study_tasks
         WHERE course_instance_id = ?
           AND knowledge_module_id = ?
           AND type = 'error_review'
           AND status IN (${OPEN_TASK_STATUSES.map(() => '?').join(', ')})
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(module.course_instance_id, module.id, ...OPEN_TASK_STATUSES) as
      | { id: string; deadline_at: string | null }
      | undefined;

    if (openTask) {
      if (openTask.deadline_at === null || deadlineAt < openTask.deadline_at) {
        db.prepare('UPDATE study_tasks SET deadline_at = ?, updated_at = ? WHERE id = ?').run(
          deadlineAt,
          occurredAt,
          openTask.id
        );
      }
      return;
    }

    db.prepare(
      `INSERT INTO study_tasks (
        id, course_instance_id, assessment_attempt_id, knowledge_module_id,
        type, title, status, estimated_minutes, deadline_at, completed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'error_review', ?, 'todo', 20, ?, NULL, ?, ?)`
    ).run(
      this.id(),
      module.course_instance_id,
      assessmentAttemptId,
      module.id,
      `复习薄弱点：${module.title}`,
      deadlineAt,
      occurredAt,
      occurredAt
    );
  }

  private applyMastered(db: DatabaseType, module: ModuleRow, occurredAt: string): void {
    db.prepare(
      `UPDATE weak_points
       SET status = 'mastered', updated_at = ?
       WHERE course_instance_id = ? AND knowledge_module_id = ?`
    ).run(occurredAt, module.course_instance_id, module.id);
    if (module.learn_status !== 'mastered') {
      db.prepare(
        `UPDATE knowledge_modules
         SET learn_status = 'mastered', last_reviewed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(occurredAt, occurredAt, module.id);
    }
    db.prepare(
      `UPDATE study_tasks
       SET status = 'done', completed_at = COALESCE(completed_at, ?), updated_at = ?
       WHERE course_instance_id = ?
         AND knowledge_module_id = ?
         AND type = 'error_review'
         AND status IN (${OPEN_TASK_STATUSES.map(() => '?').join(', ')})`
    ).run(occurredAt, occurredAt, module.course_instance_id, module.id, ...OPEN_TASK_STATUSES);
    this.writeTransitionEvent(db, {
      courseInstanceId: module.course_instance_id,
      eventType: 'feedback_review_mastered',
      title: '错题复习已掌握',
      evidenceRef: `km:${module.id}`,
      occurredAt,
    });
  }

  private writeTransitionEvent(
    db: DatabaseType,
    input: { courseInstanceId: string; eventType: string; title: string; evidenceRef: string; occurredAt: string }
  ): void {
    const last = db
      .prepare(
        `SELECT event_type
         FROM study_events
         WHERE evidence_ref = ?
           AND event_type IN ('feedback_review_required', 'feedback_review_mastered')
         ORDER BY occurred_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(input.evidenceRef) as { event_type: string } | undefined;
    if (last?.event_type === input.eventType) return;

    db.prepare(
      `INSERT INTO study_events (
        id, course_instance_id, source_system, event_type, title,
        workload_minutes, evidence_ref, source_confidence, quality_gate,
        parent_visible, occurred_at, created_at
      ) VALUES (?, ?, 'S4', ?, ?, NULL, ?, 1, 'passed', 1, ?, ?)`
    ).run(
      this.id(),
      input.courseInstanceId,
      input.eventType,
      input.title,
      input.evidenceRef,
      input.occurredAt,
      input.occurredAt
    );
  }
}
