import crypto from 'crypto';
import type { DatabaseType } from '../db/connection';

export interface ArchiveMistakesResult {
  createdMistakes: number;
  updatedMistakes: number;
  createdEvidence: number;
  createdWeakPoints: number;
  updatedWeakPoints: number;
  skippedExistingEvidence: number;
}

interface ErrorFixerServiceOptions {
  id?: () => string;
}

interface IncorrectPracticeAnswerRow {
  practice_answer_id: string;
  question_id: string;
  session_id: string;
  course_instance_id: string;
  assessment_attempt_id: string | null;
  knowledge_module_id: string;
  answer_created_at: string;
}

interface MistakeRow {
  id: string;
  error_count: number;
}

interface WeakPointRow {
  id: string;
}

export class ErrorFixerService {
  private readonly id: () => string;

  constructor(options?: ErrorFixerServiceOptions) {
    this.id = options?.id ?? crypto.randomUUID;
  }

  archiveIncorrectPracticeAnswers(
    db: DatabaseType,
    sessionId: string,
    occurredAt: string
  ): ArchiveMistakesResult {
    const result: ArchiveMistakesResult = {
      createdMistakes: 0,
      updatedMistakes: 0,
      createdEvidence: 0,
      createdWeakPoints: 0,
      updatedWeakPoints: 0,
      skippedExistingEvidence: 0,
    };

    const rows = db
      .prepare(
        `SELECT
           a.id AS practice_answer_id,
           a.question_id,
           a.session_id,
           q.course_instance_id,
           s.assessment_attempt_id,
           q.knowledge_module_id,
           a.created_at AS answer_created_at
         FROM practice_answers a
         JOIN questions q ON q.id = a.question_id
         JOIN practice_sessions s ON s.id = a.session_id
         WHERE a.session_id = ?
           AND a.is_correct = 0
         ORDER BY a.answer_order ASC`
      )
      .all(sessionId) as IncorrectPracticeAnswerRow[];

    const evidenceExists = db.prepare(
      'SELECT 1 FROM mistake_evidence WHERE source_practice_answer_id = ?'
    );
    const findMistake = db.prepare('SELECT id, error_count FROM mistakes WHERE question_id = ?');
    const insertMistake = db.prepare(
      `INSERT INTO mistakes (
        id, course_instance_id, assessment_attempt_id, knowledge_module_id, question_id,
        first_practice_answer_id, latest_practice_answer_id, status, error_count,
        first_error_at, latest_error_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', 1, ?, ?, ?, ?)`
    );
    const updateMistake = db.prepare(
      `UPDATE mistakes
       SET latest_practice_answer_id = ?,
           status = CASE WHEN status = 'mastered' THEN 'needs_review' ELSE status END,
           error_count = error_count + 1,
           latest_error_at = ?,
           updated_at = ?
       WHERE id = ?`
    );
    const insertEvidence = db.prepare(
      `INSERT INTO mistake_evidence (
        id, mistake_id, source_practice_answer_id, evidence_type,
        course_instance_id, knowledge_module_id, question_id, occurred_at, created_at
      ) VALUES (?, ?, ?, 'practice_error', ?, ?, ?, ?, ?)`
    );
    const countModuleEvidence = db.prepare(
      `SELECT COUNT(*) AS count, MIN(occurred_at) AS first_at, MAX(occurred_at) AS latest_at
       FROM mistake_evidence
       WHERE course_instance_id = ?
         AND knowledge_module_id = ?`
    );
    const findWeakPoint = db.prepare(
      'SELECT id FROM weak_points WHERE course_instance_id = ? AND knowledge_module_id = ?'
    );
    const insertWeakPoint = db.prepare(
      `INSERT INTO weak_points (
        id, course_instance_id, knowledge_module_id, status, evidence_count,
        first_detected_at, latest_detected_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`
    );
    const updateWeakPoint = db.prepare(
      `UPDATE weak_points
       SET status = 'active',
           evidence_count = ?,
           latest_detected_at = ?,
           updated_at = ?
       WHERE id = ?`
    );

    for (const row of rows) {
      if (evidenceExists.get(row.practice_answer_id)) {
        result.skippedExistingEvidence += 1;
        continue;
      }

      const evidenceAt = row.answer_created_at ?? occurredAt;
      let mistake = findMistake.get(row.question_id) as MistakeRow | undefined;
      if (!mistake) {
        const mistakeId = this.id();
        insertMistake.run(
          mistakeId,
          row.course_instance_id,
          row.assessment_attempt_id,
          row.knowledge_module_id,
          row.question_id,
          row.practice_answer_id,
          row.practice_answer_id,
          evidenceAt,
          evidenceAt,
          occurredAt,
          occurredAt
        );
        mistake = { id: mistakeId, error_count: 1 };
        result.createdMistakes += 1;
      } else {
        updateMistake.run(row.practice_answer_id, evidenceAt, occurredAt, mistake.id);
        result.updatedMistakes += 1;
      }

      insertEvidence.run(
        this.id(),
        mistake.id,
        row.practice_answer_id,
        row.course_instance_id,
        row.knowledge_module_id,
        row.question_id,
        evidenceAt,
        occurredAt
      );
      result.createdEvidence += 1;

      const evidenceStats = countModuleEvidence.get(row.course_instance_id, row.knowledge_module_id) as {
        count: number;
        first_at: string | null;
        latest_at: string | null;
      };
      if (evidenceStats.count < 2) continue;

      const weakPoint = findWeakPoint.get(row.course_instance_id, row.knowledge_module_id) as WeakPointRow | undefined;
      if (!weakPoint) {
        insertWeakPoint.run(
          this.id(),
          row.course_instance_id,
          row.knowledge_module_id,
          evidenceStats.count,
          evidenceStats.first_at ?? evidenceAt,
          evidenceStats.latest_at ?? evidenceAt,
          occurredAt,
          occurredAt
        );
        result.createdWeakPoints += 1;
      } else {
        updateWeakPoint.run(evidenceStats.count, evidenceStats.latest_at ?? evidenceAt, occurredAt, weakPoint.id);
        result.updatedWeakPoints += 1;
      }
    }

    return result;
  }
}
