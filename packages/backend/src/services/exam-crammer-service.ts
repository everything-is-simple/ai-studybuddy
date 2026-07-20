import crypto from 'crypto';
import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { migrateSemesterDb } from '../db/migrations';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { assertSemesterWritable, SemesterAccessError } from './semester-access-service';
import { AiProviderError, AiRouterProxy, AllProvidersCoolingDownError, AllProvidersFailedError } from '../adapters';
import type { AiProvider } from '../adapters';
import type {
  CreateMockExamPaperRequest,
  MockExamAttemptDetailDto,
  MockExamAttemptStatus,
  MockExamAnswerResultDto,
  MockExamDifficultyPreference,
  MockExamModuleAnalysisDto,
  MockExamPaperDetailDto,
  MockExamQuestionForStudentDto,
  PracticeDifficulty,
  PracticeQuestionType,
  SubmitMockExamAttemptRequest,
  SubmitMockExamAttemptResponse,
} from '@ai-studybuddy/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_TYPES: readonly PracticeQuestionType[] = ['single_choice', 'multiple_choice', 'fill_blank'];
const DIFFICULTIES: readonly PracticeDifficulty[] = ['easy', 'medium', 'hard'];
const PREFERENCES: readonly MockExamDifficultyPreference[] = ['easy', 'medium', 'hard', 'mixed'];
const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
const PROMPT_VERSION = 's5-mock-exam-v1.0';

type RawQuestion = {
  type?: unknown; stem?: unknown; options?: unknown; correct_answer?: unknown;
  acceptable_answers?: unknown; difficulty?: unknown; knowledge_module_id?: unknown;
  explanation?: unknown; source_evidence?: unknown; point_value?: unknown;
};
type ModuleRow = {
  id: string; title: string; importance: string; difficulty: string;
  content_summary: string | null; exam_relevance: string | null; source_evidence: string | null;
};
type QuestionRow = {
  id: string; type: PracticeQuestionType; stem: string; options_json: string | null;
  correct_answer: string; acceptable_answers_json: string | null; difficulty: PracticeDifficulty;
  explanation: string | null; knowledge_module_id: string; question_order: number; point_value: number;
};
type PaperRow = {
  id: string; course_instance_id: string; assessment_attempt_id: string; status: MockExamPaperDetailDto['status'];
  title: string; question_count: number; time_limit_seconds: number; total_points: number;
  difficulty_preference: MockExamDifficultyPreference; source_summary_json: string; generated_at: string;
  created_at: string; updated_at: string; assessment_name?: string | null;
};
type AttemptRow = {
  id: string; paper_id: string; course_instance_id: string; assessment_attempt_id: string;
  status: MockExamAttemptStatus; started_at: string; submitted_at: string | null; graded_at: string | null;
  total_score: number | null; total_points: number; correct_rate: number | null; overtime: number;
  total_duration_seconds: number | null; created_at: string; updated_at: string;
};
type GeneratedQuestion = {
  type: PracticeQuestionType; stem: string; options: string[] | null; correctAnswer: string;
  acceptableAnswers: string[] | null; difficulty: PracticeDifficulty; knowledgeModuleId: string;
  explanation: string | null; sourceEvidence: string | null; pointValue: number;
};

export class ExamCrammerError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ExamCrammerError';
  }
}

export interface ExamCrammerServiceOptions {
  ai?: AiProvider;
  now?: () => string;
  id?: () => string;
  retryDelayMs?: number;
}

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function requiredUuid(value: unknown, code: string, message: string): string {
  const result = text(value);
  if (!UUID.test(result)) throw new ExamCrammerError(code, 400, message);
  return result;
}
function positiveInteger(value: unknown, code: string, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    throw new ExamCrammerError(code, 400, message);
  return value;
}
function nonNegativeInteger(value: unknown, code: string, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new ExamCrammerError(code, 400, message);
  return value;
}
function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}
function sanitizeJson(raw: string): string {
  let value = raw.trim();
  const fence = value.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) value = fence[1].trim();
  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  return first >= 0 && last > first ? value.slice(first, last + 1) : value;
}
function parseStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value)) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, message);
  const result = value.map(text);
  if (result.length === 0 || result.some((item) => !item))
    throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, message);
  return result;
}
function normalizeFill(value: string): string { return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ''); }
function normalizeStudent(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ExamCrammerError('MOCK_EXAM_ANSWER_INVALID', 400, '答案格式不合法');
  const result = value.trim();
  return result || null;
}
function parseStoredArray(value: string | null): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}
function normalizeLetters(value: unknown, min: number, max: number): string {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，\s]+/).filter(Boolean) : [];
  const letters = [...new Set(values.map((item) => text(item).toUpperCase()))].sort();
  if (letters.length < min || letters.length > max || letters.some((item) => !OPTIONS.includes(item)))
    throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成选择题答案格式不符合要求');
  return letters.join(',');
}
function sourceHash(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }

export class ExamCrammerService {
  private readonly ai: AiProvider;
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly retryDelayMs: number;
  constructor(options?: ExamCrammerServiceOptions) {
    this.ai = options?.ai ?? new AiRouterProxy();
    this.now = options?.now ?? nowIso;
    this.id = options?.id ?? uuid;
    this.retryDelayMs = options?.retryDelayMs ?? 5000;
  }

  openReadySemesterDb(semesterId: string): DatabaseType {
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
    } finally { globalDb?.close(); }
    if (!fs.existsSync(getSemesterDbPath(semesterId))) throw new ExamCrammerError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
    try { migrateSemesterDb(db); return db; } catch (error) { db.close(); throw error; }
  }

  private assertWritable(semesterId: string): void {
    try { assertSemesterWritable(semesterId); }
    catch (error) {
      if (error instanceof SemesterAccessError) throw new ExamCrammerError(error.code, error.status, error.message);
      throw error;
    }
  }  private requireCourse(db: DatabaseType, semesterId: string, courseId: string): void {
    if (!db.prepare('SELECT 1 FROM course_instances WHERE id = ? AND semester_id = ?').get(courseId, semesterId))
      throw new ExamCrammerError('COURSE_INSTANCE_NOT_FOUND', 404, '课程不存在');
  }

  private requireConfirmedAssessment(db: DatabaseType, assessmentId: string, courseId: string): Record<string, unknown> {
    const row = db.prepare('SELECT * FROM assessment_attempts WHERE id = ? AND course_instance_id = ?').get(assessmentId, courseId) as Record<string, unknown> | undefined;
    if (!row) throw new ExamCrammerError('ASSESSMENT_ATTEMPT_NOT_FOUND', 404, '考试不存在或不属于该课程');
    if (row.confirmation_status !== 'confirmed') throw new ExamCrammerError('ASSESSMENT_NOT_CONFIRMED', 409, '只有已确认考试才能生成模拟卷');
    return row;
  }

  private selectModules(db: DatabaseType, courseId: string, ids: string[] | null): ModuleRow[] {
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.prepare(
        'SELECT id, title, importance, difficulty, content_summary, exam_relevance, source_evidence ' +
        'FROM knowledge_modules WHERE course_instance_id = ? AND id IN (' + placeholders + ')'
      ).all(courseId, ...ids) as ModuleRow[];
      if (rows.length !== ids.length) throw new ExamCrammerError('KNOWLEDGE_MODULE_NOT_FOUND', 404, '知识模块不存在或不属于该课程');
      const map = new Map(rows.map((row) => [row.id, row]));
      return ids.map((id) => map.get(id)!);
    }
    return db.prepare(
      "SELECT id, title, importance, difficulty, content_summary, exam_relevance, source_evidence " +
      "FROM knowledge_modules WHERE course_instance_id = ? " +
      "ORDER BY CASE importance WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id LIMIT 30"
    ).all(courseId) as ModuleRow[];
  }

  private sourceSummary(db: DatabaseType, courseId: string, modules: ModuleRow[], assessmentName: string) {
    const weakPointCount = Number((db.prepare("SELECT count(*) AS count FROM weak_points WHERE course_instance_id = ? AND status = 'active'").get(courseId) as { count: number }).count);
    const activeMistakeCount = Number((db.prepare("SELECT count(*) AS count FROM mistakes WHERE course_instance_id = ? AND status <> 'mastered'").get(courseId) as { count: number }).count);
    return { moduleCount: modules.length, weakPointCount, activeMistakeCount, assessmentName };
  }

  private buildPrompt(
    modules: ModuleRow[],
    assessment: Record<string, unknown>,
    summary: { moduleCount: number; weakPointCount: number; activeMistakeCount: number; assessmentName: string },
    count: number,
    difficulty: string
  ): string {
    const safeModules = modules.map((module) => ({
      id: module.id,
      title: module.title,
      importance: module.importance,
      difficulty: module.difficulty,
      contentSummary: module.content_summary ?? '',
      examRelevance: module.exam_relevance ?? '',
      sourceEvidence: module.source_evidence ?? '',
    }));
    return [
      '请根据已确认考试“' + text(assessment.name) + '”和以下知识模块摘要生成 ' + count + ' 道模拟考客观题。',
      '难度偏好：' + difficulty + '；每题 point_value 为 1。',
      '只使用知识模块摘要与来源证据，不读取或输出资料原文；不要依赖 S3/S4 原题和作答历史。',
      '来源摘要：' + JSON.stringify(summary),
      '知识模块：' + JSON.stringify(safeModules),
      '严格只返回 JSON：{"questions":[{"type":"single_choice|multiple_choice|fill_blank","stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"A 或 A,C 或 填空答案","acceptable_answers":null,"difficulty":"easy|medium|hard","knowledge_module_id":"模块 UUID","explanation":"简短解析"}]}'
    ].join('\n');
  }

  private parseQuestion(raw: RawQuestion, allowed: Set<string>): GeneratedQuestion {
    const type = text(raw.type) as PracticeQuestionType;
    if (!QUESTION_TYPES.includes(type)) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成题型不符合要求');
    const stem = text(raw.stem);
    if (!stem || stem.length > 2000) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成题干不符合要求');
    const moduleId = text(raw.knowledge_module_id);
    if (!allowed.has(moduleId)) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成题目关联了未选择的知识模块');
    const difficulty = (text(raw.difficulty) || 'medium') as PracticeDifficulty;
    if (!DIFFICULTIES.includes(difficulty)) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成题目难度不符合要求');
    const pointValue = raw.point_value === undefined ? 1 : positiveInteger(raw.point_value, 'MOCK_EXAM_GENERATION_FAILED', 'AI 生成分值不符合要求');
    if (pointValue > 10) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成分值不符合要求');
    if (type === 'fill_blank') {
      if (raw.options !== undefined && raw.options !== null) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, '填空题不能包含选项');
      const correct = text(raw.correct_answer);
      if (!correct) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, '填空题答案不能为空');
      const acceptable = raw.acceptable_answers == null ? null : parseStringArray(raw.acceptable_answers, '填空题可接受答案格式不符合要求');
      return { type, stem, options: null, correctAnswer: correct, acceptableAnswers: acceptable, difficulty, knowledgeModuleId: moduleId, explanation: text(raw.explanation) || null, sourceEvidence: text(raw.source_evidence) || null, pointValue };
    }
    const options = parseStringArray(raw.options, '选择题选项格式不符合要求');
    if (options.length < 4 || options.length > 5) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, '选择题选项数量不符合要求');
    const correct = type === 'single_choice' ? normalizeLetters(raw.correct_answer, 1, 1) : normalizeLetters(raw.correct_answer, 2, Math.min(4, options.length));
    if (correct.split(',').some((item) => OPTIONS.indexOf(item) >= options.length)) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, '选择题答案超出选项范围');
    return { type, stem, options, correctAnswer: correct, acceptableAnswers: null, difficulty, knowledgeModuleId: moduleId, explanation: text(raw.explanation) || null, sourceEvidence: text(raw.source_evidence) || null, pointValue };
  }

  private async generate(prompt: string): Promise<{ content: string; model: string }> {
    try {
      const response = await this.ai.generate({ taskType: 'question_generation', inputText: prompt, language: 'zh' });
      return { content: response.content, model: response.model };
    } catch (error) {
      if (error instanceof AiProviderError) {
        await delay(this.retryDelayMs);
        const response = await this.ai.generate({ taskType: 'question_generation', inputText: prompt, language: 'zh' });
        return { content: response.content, model: response.model };
      }
      throw error;
    }
  }

  private mapAiError(error: unknown): never {
    if (error instanceof ExamCrammerError) throw error;
    if (error instanceof AllProvidersCoolingDownError) throw new ExamCrammerError(error.code, 503, 'AI Provider 暂时都在冷却中，请稍后再试');
    if (error instanceof AllProvidersFailedError) throw new ExamCrammerError(error.code, 502, 'AI 题目生成失败，请稍后再试');
    if (error instanceof AiProviderError) throw new ExamCrammerError(error.code, error.code === 'AI_NOT_CONFIGURED' ? 503 : 502, error.message);
    throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 题目生成失败，请稍后再试');
  }

  private parseGenerated(content: string, count: number, allowed: Set<string>): GeneratedQuestion[] {
    let parsed: { questions?: RawQuestion[] };
    try { parsed = JSON.parse(sanitizeJson(content)) as { questions?: RawQuestion[] }; }
    catch { throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 输出无法解析为题目 JSON'); }
    if (!Array.isArray(parsed.questions) || parsed.questions.length !== count) throw new ExamCrammerError('MOCK_EXAM_GENERATION_FAILED', 502, 'AI 输出题目数量不符合要求');
    return parsed.questions.map((question) => this.parseQuestion(question, allowed));
  }
  private parseRequest(input: CreateMockExamPaperRequest) {
    const body = (input ?? {}) as CreateMockExamPaperRequest;
    const semesterId = requiredUuid(body.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const courseInstanceId = requiredUuid(body.courseInstanceId, 'MISSING_REQUIRED_FIELD', 'courseInstanceId 不能为空');
    const assessmentAttemptId = requiredUuid(body.assessmentAttemptId, 'MISSING_REQUIRED_FIELD', 'assessmentAttemptId 不能为空');
    const ids = body.knowledgeModuleIds == null ? null : body.knowledgeModuleIds;
    if (ids !== null && (!Array.isArray(ids) || ids.length < 1 || ids.length > 30)) throw new ExamCrammerError('MOCK_EXAM_INPUT_INVALID', 400, 'knowledgeModuleIds 必须选择 1 到 30 个模块');
    const moduleIds = ids === null ? null : [...new Set(ids.map((id) => requiredUuid(id, 'MOCK_EXAM_INPUT_INVALID', 'knowledgeModuleIds 必须全部是有效 UUID')))];
    if (moduleIds && ids !== null && moduleIds.length !== ids.length) throw new ExamCrammerError('MOCK_EXAM_INPUT_INVALID', 400, 'knowledgeModuleIds 不能重复');
    const count = body.questionCount ?? 10;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 5 || count > 50) throw new ExamCrammerError('MOCK_EXAM_INPUT_INVALID', 400, 'questionCount 必须是 5 到 50 的整数');
    const difficulty = body.difficultyPreference ?? 'mixed';
    if (!PREFERENCES.includes(difficulty)) throw new ExamCrammerError('MOCK_EXAM_INPUT_INVALID', 400, 'difficultyPreference 非法');
    const timeLimit = body.timeLimitSeconds == null ? count * 90 : positiveInteger(body.timeLimitSeconds, 'MOCK_EXAM_INPUT_INVALID', 'timeLimitSeconds 必须为正整数');
    return { semesterId, courseInstanceId, assessmentAttemptId, moduleIds, count, difficulty, timeLimit };
  }

  async createMockExamPaper(input: CreateMockExamPaperRequest): Promise<MockExamPaperDetailDto> {
    const valid = this.parseRequest(input);
    this.assertWritable(valid.semesterId);
    const db = this.openReadySemesterDb(valid.semesterId);
    try {
      this.requireCourse(db, valid.semesterId, valid.courseInstanceId);
      const assessment = this.requireConfirmedAssessment(db, valid.assessmentAttemptId, valid.courseInstanceId);
      const modules = this.selectModules(db, valid.courseInstanceId, valid.moduleIds);
      if (modules.length === 0) throw new ExamCrammerError('KNOWLEDGE_MODULE_NOT_FOUND', 404, '该课程尚无可用于生成模拟卷的知识模块');
      const summary = this.sourceSummary(db, valid.courseInstanceId, modules, text(assessment.name));
      const prompt = this.buildPrompt(modules, assessment, summary, valid.count, valid.difficulty);
      let generated: GeneratedQuestion[];
      let model: string;
      try {
        const response = await this.generate(prompt);
        model = response.model;
        generated = this.parseGenerated(response.content, valid.count, new Set(modules.map((item) => item.id)));
      } catch (error) {
        this.mapAiError(error);
      }
      const timestamp = this.now();
      const paperId = this.id();
      const totalPoints = generated!.reduce((sum, question) => sum + question.pointValue, 0);
      const sourceSummaryJson = JSON.stringify({ ...summary, moduleIds: modules.map((item) => item.id) });
      db.transaction(() => {
        db.prepare(
          'INSERT INTO mock_exam_papers (id, course_instance_id, assessment_attempt_id, status, title, question_count, time_limit_seconds, total_points, difficulty_preference, source_summary_json, generation_prompt_version, ai_model, source_hash, generated_at, created_at, updated_at) ' +
          "VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(paperId, valid.courseInstanceId, valid.assessmentAttemptId, text(assessment.name) + '模拟考', generated!.length, valid.timeLimit, totalPoints, valid.difficulty, sourceSummaryJson, PROMPT_VERSION, model!, sourceHash(prompt), timestamp, timestamp, timestamp);
        const insert = db.prepare(
          'INSERT INTO mock_exam_questions (id, paper_id, course_instance_id, knowledge_module_id, type, stem, options_json, correct_answer, acceptable_answers_json, difficulty, explanation, source_evidence, point_value, question_order, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        generated!.forEach((question, index) => insert.run(
          this.id(), paperId, valid.courseInstanceId, question.knowledgeModuleId, question.type, question.stem,
          question.options ? JSON.stringify(question.options) : null, question.correctAnswer,
          question.acceptableAnswers ? JSON.stringify(question.acceptableAnswers) : null, question.difficulty,
          question.explanation, question.sourceEvidence ?? modules.find((item) => item.id === question.knowledgeModuleId)?.source_evidence ?? null,
          question.pointValue, index + 1, timestamp
        ));
      })();
      return this.getPaper(valid.semesterId, paperId);
    } finally { db.close(); }
  }

  private questionDto(row: QuestionRow): MockExamQuestionForStudentDto {
    return {
      id: row.id,
      type: row.type,
      stem: row.stem,
      options: row.options_json ? parseStoredArray(row.options_json) : undefined,
      difficulty: row.difficulty,
      knowledgeModuleId: row.knowledge_module_id,
      questionOrder: Number(row.question_order),
      pointValue: Number(row.point_value),
    };
  }

  private paperRow(db: DatabaseType, paperId: string, semesterId: string): PaperRow {
    const row = db.prepare(
      'SELECT p.*, a.name AS assessment_name FROM mock_exam_papers p ' +
      'JOIN course_instances c ON c.id = p.course_instance_id ' +
      'JOIN assessment_attempts a ON a.id = p.assessment_attempt_id ' +
      'WHERE p.id = ? AND c.semester_id = ?'
    ).get(paperId, semesterId) as PaperRow | undefined;
    if (!row) throw new ExamCrammerError('MOCK_EXAM_PAPER_NOT_FOUND', 404, '模拟卷不存在');
    return row;
  }

  getPaper(semesterIdValue: unknown, paperIdValue: unknown): MockExamPaperDetailDto {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const paperId = requiredUuid(paperIdValue, 'MOCK_EXAM_PAPER_NOT_FOUND', '模拟卷不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const row = this.paperRow(db, paperId, semesterId);
      const questions = db.prepare('SELECT * FROM mock_exam_questions WHERE paper_id = ? ORDER BY question_order').all(paperId) as QuestionRow[];
      const summary = JSON.parse(row.source_summary_json) as MockExamPaperDetailDto['sourceSummary'];
      return {
        id: row.id, courseInstanceId: row.course_instance_id, assessmentAttemptId: row.assessment_attempt_id,
        status: row.status, title: row.title, questionCount: Number(row.question_count),
        timeLimitSeconds: Number(row.time_limit_seconds), totalPoints: Number(row.total_points),
        difficultyPreference: row.difficulty_preference, sourceSummary: summary, generatedAt: row.generated_at,
        createdAt: row.created_at, updatedAt: row.updated_at, questions: questions.map((question) => this.questionDto(question)),
      };
    } finally { db.close(); }
  }
  startAttempt(input: { semesterId: unknown; paperId: unknown }): MockExamAttemptDetailDto {
    const semesterId = requiredUuid(input.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const paperId = requiredUuid(input.paperId, 'MOCK_EXAM_PAPER_NOT_FOUND', '模拟卷不存在');
    this.assertWritable(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    try {
      const paper = this.paperRow(db, paperId, semesterId);
      const timestamp = this.now();
      const id = this.id();
      db.prepare(
        "INSERT INTO mock_exam_attempts (id, paper_id, course_instance_id, assessment_attempt_id, status, started_at, total_points, overtime, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?, 0, ?, ?)"
      ).run(id, paper.id, paper.course_instance_id, paper.assessment_attempt_id, timestamp, paper.total_points, timestamp, timestamp);
      return this.getAttempt(semesterId, id);
    } finally { db.close(); }
  }

  private attemptRow(db: DatabaseType, attemptId: string, semesterId: string): AttemptRow {
    const row = db.prepare(
      'SELECT a.* FROM mock_exam_attempts a JOIN course_instances c ON c.id = a.course_instance_id WHERE a.id = ? AND c.semester_id = ?'
    ).get(attemptId, semesterId) as AttemptRow | undefined;
    if (!row) throw new ExamCrammerError('MOCK_EXAM_ATTEMPT_NOT_FOUND', 404, '模拟考尝试不存在');
    return row;
  }

  getAttempt(semesterIdValue: unknown, attemptIdValue: unknown): MockExamAttemptDetailDto {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const attemptId = requiredUuid(attemptIdValue, 'MOCK_EXAM_ATTEMPT_NOT_FOUND', '模拟考尝试不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const row = this.attemptRow(db, attemptId, semesterId);
      const questions = db.prepare('SELECT * FROM mock_exam_questions WHERE paper_id = ? ORDER BY question_order').all(row.paper_id) as QuestionRow[];
      return {
        id: row.id, paperId: row.paper_id, courseInstanceId: row.course_instance_id,
        assessmentAttemptId: row.assessment_attempt_id, status: row.status, startedAt: row.started_at,
        submittedAt: row.submitted_at, gradedAt: row.graded_at, totalScore: row.total_score,
        totalPoints: row.total_points, correctRate: row.correct_rate, overtime: row.overtime === 1,
        totalDurationSeconds: row.total_duration_seconds, createdAt: row.created_at, updatedAt: row.updated_at,
        questions: questions.map((question) => this.questionDto(question)),
      };
    } finally { db.close(); }
  }

  private normalizeChoice(value: unknown, optionsJson: string | null, multiple: boolean): string | null {
    const raw = normalizeStudent(value);
    if (raw === null) return null;
    const allowed = OPTIONS.slice(0, parseStoredArray(optionsJson).length);
    const parts = raw.split(/[,，\s]+/).filter(Boolean).map((item) => item.toUpperCase());
    if (!multiple && parts.length !== 1) throw new ExamCrammerError('MOCK_EXAM_ANSWER_INVALID', 400, '单选题答案格式不合法');
    const unique = [...new Set(parts)].sort();
    if (unique.some((item) => !allowed.includes(item))) throw new ExamCrammerError('MOCK_EXAM_ANSWER_INVALID', 400, '答案选项不在题目范围内');
    if (multiple && unique.length === 0) return null;
    return unique.join(',');
  }

  private grade(question: QuestionRow, submitted?: { answer: unknown; timeSpentSeconds: number | null }): MockExamAnswerResultDto & { answerOrder: number; timeSpentSeconds: number | null } {
    const student = submitted?.answer;
    const timeSpentSeconds = submitted?.timeSpentSeconds ?? null;
    let stored: string | null;
    let correct: boolean;
    if (question.type === 'single_choice') {
      stored = this.normalizeChoice(student, question.options_json, false);
      correct = stored !== null && stored === question.correct_answer.trim().toUpperCase();
    } else if (question.type === 'multiple_choice') {
      stored = this.normalizeChoice(student, question.options_json, true);
      const expected = question.correct_answer.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean).sort().join(',');
      correct = stored !== null && stored === expected;
    } else {
      stored = normalizeStudent(student);
      const answers = [question.correct_answer, ...parseStoredArray(question.acceptable_answers_json)];
      correct = stored !== null && answers.some((answer) => normalizeFill(answer) === normalizeFill(stored!));
    }
    return {
      questionId: question.id, studentAnswer: stored, correctAnswer: question.correct_answer,
      isCorrect: correct, scoreAwarded: correct ? Number(question.point_value) : 0,
      pointValue: Number(question.point_value), explanation: question.explanation,
      knowledgeModuleId: question.knowledge_module_id, answerOrder: Number(question.question_order), timeSpentSeconds,
    };
  }

  private parseSubmit(input: SubmitMockExamAttemptRequest) {
    const semesterId = requiredUuid(input?.semesterId, 'MOCK_EXAM_SUBMIT_INPUT_INVALID', 'semesterId 必须是有效 UUID');
    if (!Array.isArray(input?.answers)) throw new ExamCrammerError('MOCK_EXAM_SUBMIT_INPUT_INVALID', 400, 'answers 必须是数组');
    const seen = new Set<string>();
    const answers = input.answers.map((raw) => {
      if (!raw || typeof raw !== 'object') throw new ExamCrammerError('MOCK_EXAM_SUBMIT_INPUT_INVALID', 400, 'answers 格式不合法');
      const questionId = requiredUuid(raw.questionId, 'MOCK_EXAM_SUBMIT_INPUT_INVALID', 'questionId 必须是有效 UUID');
      if (seen.has(questionId)) throw new ExamCrammerError('MOCK_EXAM_SUBMIT_INPUT_INVALID', 400, 'answers 不能包含重复题目');
      seen.add(questionId);
      const time = raw.timeSpentSeconds == null ? null : nonNegativeInteger(raw.timeSpentSeconds, 'MOCK_EXAM_SUBMIT_INPUT_INVALID', 'timeSpentSeconds 必须是非负整数');
      return { questionId, answer: raw.answer, timeSpentSeconds: time };
    });
    return {
      semesterId,
      answers,
      totalDurationSeconds: nonNegativeInteger(input.totalDurationSeconds, 'MOCK_EXAM_SUBMIT_INPUT_INVALID', 'totalDurationSeconds 必须是非负整数'),
    };
  }
  submitAttempt(attemptIdValue: unknown, input: SubmitMockExamAttemptRequest): SubmitMockExamAttemptResponse {
    const attemptId = requiredUuid(attemptIdValue, 'MOCK_EXAM_ATTEMPT_NOT_FOUND', '模拟考尝试不存在');
    const valid = this.parseSubmit(input);
    this.assertWritable(valid.semesterId);
    const db = this.openReadySemesterDb(valid.semesterId);
    try {
      return db.transaction(() => {
        const attempt = this.attemptRow(db, attemptId, valid.semesterId);
        if (attempt.status !== 'in_progress') throw new ExamCrammerError('MOCK_EXAM_ATTEMPT_STATE_INVALID', 409, '当前模拟考状态不允许提交');
        const questions = db.prepare('SELECT * FROM mock_exam_questions WHERE paper_id = ? ORDER BY question_order').all(attempt.paper_id) as QuestionRow[];
        const paper = db.prepare('SELECT question_count, time_limit_seconds FROM mock_exam_papers WHERE id = ?').get(attempt.paper_id) as { question_count: number; time_limit_seconds: number } | undefined;
        if (!paper || questions.length === 0 || questions.length !== Number(paper.question_count)) throw new ExamCrammerError('MOCK_EXAM_QUESTION_MISMATCH', 409, '模拟卷题目数量不一致');
        const byId = new Map(questions.map((question) => [question.id, question]));
        for (const item of valid.answers) if (!byId.has(item.questionId)) throw new ExamCrammerError('MOCK_EXAM_QUESTION_MISMATCH', 400, '答案引用了不属于该模拟考的题目');
        const submitted = new Map(valid.answers.map((item) => [item.questionId, item]));
        const graded = questions.map((question) => this.grade(question, submitted.get(question.id)));
        const totalScore = graded.reduce((sum, item) => sum + item.scoreAwarded, 0);
        const correctRate = questions.length ? graded.filter((item) => item.isCorrect).length / questions.length : 0;
        const overtime = valid.totalDurationSeconds > Number(paper.time_limit_seconds);
        const timestamp = this.now();
        const insert = db.prepare('INSERT INTO mock_exam_answers (id, attempt_id, question_id, student_answer, is_correct, score_awarded, time_spent_seconds, answer_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        graded.forEach((item) => insert.run(this.id(), attemptId, item.questionId, item.studentAnswer, item.isCorrect ? 1 : 0, item.scoreAwarded, item.timeSpentSeconds, item.answerOrder, timestamp));
        db.prepare("UPDATE mock_exam_attempts SET status = 'graded', submitted_at = ?, graded_at = ?, total_score = ?, correct_rate = ?, overtime = ?, total_duration_seconds = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, totalScore, correctRate, overtime ? 1 : 0, valid.totalDurationSeconds, timestamp, attemptId);
        const grouped = new Map<string, typeof graded>();
        graded.forEach((item) => { const items = grouped.get(item.knowledgeModuleId) ?? []; items.push(item); grouped.set(item.knowledgeModuleId, items); });
        const analyses: MockExamModuleAnalysisDto[] = [];
        const insertAnalysis = db.prepare('INSERT INTO mock_exam_module_analyses (id, attempt_id, knowledge_module_id, question_count, correct_count, score_awarded, total_points, correct_rate, weak_signal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const [moduleId, items] of grouped) {
          const moduleScore = items.reduce((sum, item) => sum + item.scoreAwarded, 0);
          const modulePoints = items.reduce((sum, item) => sum + item.pointValue, 0);
          const moduleCorrect = items.filter((item) => item.isCorrect).length;
          const rate = moduleCorrect / items.length;
          const weak = rate < 0.6;
          insertAnalysis.run(this.id(), attemptId, moduleId, items.length, moduleCorrect, moduleScore, modulePoints, rate, weak ? 1 : 0, timestamp);
          analyses.push({ knowledgeModuleId: moduleId, questionCount: items.length, correctCount: moduleCorrect, scoreAwarded: moduleScore, totalPoints: modulePoints, correctRate: rate, weakSignal: weak });
        }
        db.prepare("INSERT INTO study_events (id, course_instance_id, source_system, event_type, title, workload_minutes, evidence_ref, parent_visible, occurred_at, created_at) VALUES (?, ?, 'S5', 'mock_exam_completed', '模拟考已完成', ?, ?, 1, ?, ?)").run(this.id(), attempt.course_instance_id, Math.ceil(valid.totalDurationSeconds / 60), 'mock_exam_attempt:' + attemptId, timestamp, timestamp);
        return {
          attemptId,
          status: 'graded' as const,
          totalScore,
          totalPoints: Number(attempt.total_points),
          questionCount: questions.length,
          correctRate,
          overtime,
          totalDurationSeconds: valid.totalDurationSeconds,
          answers: graded.map(({ answerOrder, timeSpentSeconds, ...answer }) => answer),
          moduleAnalyses: analyses,
        };
      })();
    } finally { db.close(); }
  }
}