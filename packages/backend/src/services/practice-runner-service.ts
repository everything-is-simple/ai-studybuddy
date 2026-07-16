import crypto from 'crypto';
import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { migrateSemesterDb } from '../db/migrations';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { ErrorFixerService } from './error-fixer-service';
import {
  AiProviderError,
  AiProviderRouter,
  AllProvidersCoolingDownError,
  AllProvidersFailedError,
} from '../adapters';
import type { AiProvider } from '../adapters';
import type {
  CreatePracticeSessionRequest,
  CreatePracticeSessionResponse,
  PracticeDifficulty,
  PracticeDifficultyPreference,
  PracticeAnswerResultDto,
  PracticeQuestionForStudentDto,
  PracticeQuestionType,
  PracticeSessionDetailDto,
  SubmitPracticeSessionRequest,
  SubmitPracticeSessionResponse,
} from '@ai-studybuddy/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_TYPES: readonly PracticeQuestionType[] = ['single_choice', 'multiple_choice', 'fill_blank'];
const DIFFICULTIES: readonly PracticeDifficulty[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_PREFERENCES: readonly PracticeDifficultyPreference[] = ['easy', 'medium', 'hard', 'mixed'];
const PROMPT_VERSION = 's3-practice-v1.0';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

interface KnowledgeModulePromptRow {
  id: string;
  title: string;
  importance: string;
  difficulty: string;
  content_summary: string | null;
  exam_relevance: string | null;
  source_evidence: string | null;
}

interface GeneratedQuestion {
  type: PracticeQuestionType;
  stem: string;
  options: string[] | null;
  correctAnswer: string;
  acceptableAnswers: string[] | null;
  difficulty: PracticeDifficulty;
  knowledgeModuleId: string;
  explanation: string | null;
}

interface RawAiQuestion {
  type?: unknown;
  stem?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  acceptable_answers?: unknown;
  difficulty?: unknown;
  knowledge_module_id?: unknown;
  explanation?: unknown;
}

interface SubmitAnswerInput {
  questionId: string;
  answer: unknown;
  timeSpentSeconds: number | null;
}

interface ValidSubmitInput {
  semesterId: string;
  answers: SubmitAnswerInput[];
  totalDurationSeconds: number;
}

interface PracticeSessionRow {
  id: string;
  course_instance_id: string;
  status: string;
  question_count: number;
  time_limit_seconds: number | null;
}

interface PracticeQuestionRow {
  id: string;
  type: PracticeQuestionType;
  options_json: string | null;
  correct_answer: string;
  acceptable_answers_json: string | null;
  explanation: string | null;
  question_order: number;
}

interface GradedAnswer {
  questionId: string;
  studentAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpentSeconds: number | null;
  answerOrder: number;
  explanation: string | null;
}

export class PracticeRunnerError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'PracticeRunnerError';
  }
}

export interface PracticeRunnerServiceOptions {
  ai?: AiProvider;
  now?: () => string;
  id?: () => string;
  retryDelayMs?: number;
  errorFixer?: ErrorFixerService;
}

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredUuid(value: unknown, code: string, message: string): string {
  const result = string(value);
  if (!UUID.test(result)) throw new PracticeRunnerError(code, 400, message);
  return result;
}

function optionalUuid(value: unknown, code: string, message: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredUuid(value, code, message);
}

function positiveIntegerOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    throw new PracticeRunnerError('PRACTICE_INPUT_INVALID', 400, 'timeLimitSeconds 必须为正整数或为空');
  return value;
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function nonNegativeInteger(value: unknown, code: string, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new PracticeRunnerError(code, 400, message);
  return value;
}

function optionalNonNegativeInteger(value: unknown, code: string, message: string): number | null {
  if (value === undefined || value === null) return null;
  return nonNegativeInteger(value, code, message);
}

function normalizeFillBlankAnswer(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
}

function parseJsonArray(value: string | null, message: string): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string'))
    throw new PracticeRunnerError('PRACTICE_ANSWER_INVALID', 400, message);
  return parsed;
}

function normalizeStudentAnswer(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string')
    throw new PracticeRunnerError('PRACTICE_ANSWER_INVALID', 400, '答案格式不合法');
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeAnswerLetters(value: unknown, min: number, max: number): string {
  const rawLetters = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
  const unique = Array.from(new Set(rawLetters.map((letter) => String(letter).trim().toUpperCase()))).sort();
  if (
    unique.length < min ||
    unique.length > max ||
    unique.some((letter) => !OPTION_LETTERS.includes(letter))
  )
    throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 生成题目答案格式不符合要求');
  return unique.join(',');
}

function sanitizeAiJson(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith('{') || !text.endsWith('}')) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }
  return text;
}

export class PracticeRunnerService {
  private readonly ai: AiProvider;
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly retryDelayMs: number;
  private readonly errorFixer: ErrorFixerService;

  constructor(options?: PracticeRunnerServiceOptions) {
    this.ai = options?.ai ?? new AiProviderRouter();
    this.now = options?.now ?? nowIso;
    this.id = options?.id ?? uuid;
    this.retryDelayMs = options?.retryDelayMs ?? 5000;
    this.errorFixer = options?.errorFixer ?? new ErrorFixerService({ id: this.id });
  }

  openReadySemesterDb(semesterId: string): DatabaseType {
    requiredUuid(semesterId, 'SEMESTER_NOT_FOUND', '学期不存在');
    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as
        | { ready: number }
        | undefined;
      if (!row) throw new PracticeRunnerError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      if (row.ready !== 1) throw new PracticeRunnerError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    } catch (error) {
      if (error instanceof PracticeRunnerError) throw error;
      throw new PracticeRunnerError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    } finally {
      globalDb?.close();
    }
    if (!fs.existsSync(getSemesterDbPath(semesterId)))
      throw new PracticeRunnerError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
    try {
      migrateSemesterDb(db);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private requireCourse(db: DatabaseType, semesterId: string, courseInstanceId: string): void {
    const row = db
      .prepare('SELECT id FROM course_instances WHERE id = ? AND semester_id = ?')
      .get(courseInstanceId, semesterId);
    if (!row) throw new PracticeRunnerError('COURSE_INSTANCE_NOT_FOUND', 404, '课程不存在');
  }

  private requireAssessment(db: DatabaseType, assessmentAttemptId: string | null, courseInstanceId: string): void {
    if (!assessmentAttemptId) return;
    const row = db
      .prepare('SELECT id FROM assessment_attempts WHERE id = ? AND course_instance_id = ?')
      .get(assessmentAttemptId, courseInstanceId);
    if (!row) throw new PracticeRunnerError('ASSESSMENT_ATTEMPT_NOT_FOUND', 404, '考试不存在或不属于该课程');
  }

  private requireKnowledgeModules(
    db: DatabaseType,
    courseInstanceId: string,
    knowledgeModuleIds: string[]
  ): KnowledgeModulePromptRow[] {
    const placeholders = knowledgeModuleIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT id, title, importance, difficulty, content_summary, exam_relevance, source_evidence
         FROM knowledge_modules
         WHERE course_instance_id = ? AND id IN (${placeholders})`
      )
      .all(courseInstanceId, ...knowledgeModuleIds) as KnowledgeModulePromptRow[];
    if (rows.length !== knowledgeModuleIds.length)
      throw new PracticeRunnerError('KNOWLEDGE_MODULE_NOT_FOUND', 404, '知识模块不存在或不属于该课程');
    const byId = new Map(rows.map((row) => [row.id, row]));
    return knowledgeModuleIds.map((id) => byId.get(id)!);
  }

  private validateInput(input: CreatePracticeSessionRequest): {
    semesterId: string;
    courseInstanceId: string;
    assessmentAttemptId: string | null;
    knowledgeModuleIds: string[];
    questionCount: number;
    difficultyPreference: PracticeDifficultyPreference;
    timeLimitSeconds: number | null;
  } {
    const semesterId = requiredUuid(input.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const courseInstanceId = requiredUuid(input.courseInstanceId, 'MISSING_REQUIRED_FIELD', 'courseInstanceId 不能为空');
    const assessmentAttemptId = optionalUuid(
      input.assessmentAttemptId,
      'PRACTICE_INPUT_INVALID',
      'assessmentAttemptId 必须是有效 UUID'
    );
    if (!Array.isArray(input.knowledgeModuleIds) || input.knowledgeModuleIds.length < 1)
      throw new PracticeRunnerError('MISSING_REQUIRED_FIELD', 400, 'knowledgeModuleIds 不能为空');
    if (input.knowledgeModuleIds.length > 10)
      throw new PracticeRunnerError('PRACTICE_INPUT_INVALID', 400, 'knowledgeModuleIds 最多选择 10 个');
    const knowledgeModuleIds = Array.from(
      new Set(
        input.knowledgeModuleIds.map((value) =>
          requiredUuid(value, 'PRACTICE_INPUT_INVALID', 'knowledgeModuleIds 必须全部是有效 UUID')
        )
      )
    );
    if (knowledgeModuleIds.length !== input.knowledgeModuleIds.length)
      throw new PracticeRunnerError('PRACTICE_INPUT_INVALID', 400, 'knowledgeModuleIds 不能重复');
    const questionCount = input.questionCount ?? 10;
    if (typeof questionCount !== 'number' || !Number.isInteger(questionCount) || questionCount < 5 || questionCount > 20)
      throw new PracticeRunnerError('PRACTICE_INPUT_INVALID', 400, 'questionCount 必须是 5 到 20 的整数');
    const difficultyPreference = input.difficultyPreference ?? 'mixed';
    if (!DIFFICULTY_PREFERENCES.includes(difficultyPreference))
      throw new PracticeRunnerError('PRACTICE_INPUT_INVALID', 400, 'difficultyPreference 非法');
    return {
      semesterId,
      courseInstanceId,
      assessmentAttemptId,
      knowledgeModuleIds,
      questionCount,
      difficultyPreference,
      timeLimitSeconds: positiveIntegerOrNull(input.timeLimitSeconds),
    };
  }

  private validateSubmitInput(input: SubmitPracticeSessionRequest): ValidSubmitInput {
    const semesterId = requiredUuid(input.semesterId, 'PRACTICE_SUBMIT_INPUT_INVALID', 'semesterId 必须是有效 UUID');
    if (!Array.isArray(input.answers))
      throw new PracticeRunnerError('PRACTICE_SUBMIT_INPUT_INVALID', 400, 'answers 必须是数组');
    const seen = new Set<string>();
    const answers = input.answers.map((item) => {
      if (!item || typeof item !== 'object')
        throw new PracticeRunnerError('PRACTICE_SUBMIT_INPUT_INVALID', 400, 'answers 格式不合法');
      const raw = item as unknown as Record<string, unknown>;
      const questionId = requiredUuid(raw.questionId, 'PRACTICE_SUBMIT_INPUT_INVALID', 'questionId 必须是有效 UUID');
      if (seen.has(questionId))
        throw new PracticeRunnerError('PRACTICE_SUBMIT_INPUT_INVALID', 400, 'answers 不能包含重复题目');
      seen.add(questionId);
      return {
        questionId,
        answer: raw.answer,
        timeSpentSeconds: optionalNonNegativeInteger(
          raw.timeSpentSeconds,
          'PRACTICE_SUBMIT_INPUT_INVALID',
          'timeSpentSeconds 必须是非负整数'
        ),
      };
    });
    return {
      semesterId,
      answers,
      totalDurationSeconds: nonNegativeInteger(
        input.totalDurationSeconds,
        'PRACTICE_SUBMIT_INPUT_INVALID',
        'totalDurationSeconds 必须是非负整数'
      ),
    };
  }

  private allowedChoiceLetters(question: PracticeQuestionRow): string[] {
    const options = parseJsonArray(question.options_json, '选择题选项格式不合法');
    return OPTION_LETTERS.slice(0, options.length);
  }

  private normalizeChoiceAnswer(
    value: unknown,
    allowedLetters: string[],
    multiple: boolean
  ): { stored: string | null; letters: string[] } {
    const raw = normalizeStudentAnswer(value);
    if (raw === null) return { stored: null, letters: [] };
    const parts = multiple ? raw.split(',').map((part) => part.trim()).filter(Boolean) : [raw.trim()];
    if (!multiple && (raw.includes(',') || parts.length !== 1))
      throw new PracticeRunnerError('PRACTICE_ANSWER_INVALID', 400, '单选题答案格式不合法');
    if (multiple && parts.length === 0) return { stored: null, letters: [] };
    const letters = parts.map((part) => part.toUpperCase());
    if (new Set(letters).size !== letters.length)
      throw new PracticeRunnerError('PRACTICE_ANSWER_INVALID', 400, '多选题答案不能重复');
    if (letters.some((letter) => !allowedLetters.includes(letter)))
      throw new PracticeRunnerError('PRACTICE_ANSWER_INVALID', 400, '答案选项不在题目范围内');
    const sorted = [...letters].sort();
    return { stored: sorted.join(','), letters: sorted };
  }

  private gradeQuestion(question: PracticeQuestionRow, input?: SubmitAnswerInput): GradedAnswer {
    const timeSpentSeconds = input?.timeSpentSeconds ?? null;
    if (question.type === 'single_choice') {
      const result = this.normalizeChoiceAnswer(input?.answer, this.allowedChoiceLetters(question), false);
      return {
        questionId: question.id,
        studentAnswer: result.stored,
        correctAnswer: question.correct_answer,
        isCorrect: result.stored !== null && result.stored === question.correct_answer.trim().toUpperCase(),
        timeSpentSeconds,
        answerOrder: question.question_order,
        explanation: question.explanation,
      };
    }
    if (question.type === 'multiple_choice') {
      const result = this.normalizeChoiceAnswer(input?.answer, this.allowedChoiceLetters(question), true);
      const correct = question.correct_answer
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean)
        .sort();
      return {
        questionId: question.id,
        studentAnswer: result.stored,
        correctAnswer: correct.join(','),
        isCorrect:
          result.letters.length > 0 &&
          result.letters.length === correct.length &&
          result.letters.every((letter, index) => letter === correct[index]),
        timeSpentSeconds,
        answerOrder: question.question_order,
        explanation: question.explanation,
      };
    }
    const studentAnswer = normalizeStudentAnswer(input?.answer);
    const acceptableAnswers = [question.correct_answer, ...parseJsonArray(question.acceptable_answers_json, '填空题答案格式不合法')];
    const normalizedStudentAnswer = studentAnswer === null ? null : normalizeFillBlankAnswer(studentAnswer);
    return {
      questionId: question.id,
      studentAnswer,
      correctAnswer: question.correct_answer,
      isCorrect:
        normalizedStudentAnswer !== null &&
        acceptableAnswers.some((answer) => normalizeFillBlankAnswer(answer) === normalizedStudentAnswer),
      timeSpentSeconds,
      answerOrder: question.question_order,
      explanation: question.explanation,
    };
  }

  private toAnswerResult(answer: GradedAnswer): PracticeAnswerResultDto {
    return {
      questionId: answer.questionId,
      studentAnswer: answer.studentAnswer,
      correctAnswer: answer.correctAnswer,
      isCorrect: answer.isCorrect,
      explanation: answer.explanation,
    };
  }

  private buildPrompt(input: {
    modules: KnowledgeModulePromptRow[];
    questionCount: number;
    difficultyPreference: PracticeDifficultyPreference;
  }): string {
    const modules = input.modules.map((module) => ({
      id: module.id,
      title: module.title,
      importance: module.importance,
      difficulty: module.difficulty,
      contentSummary: module.content_summary ?? '',
      examRelevance: module.exam_relevance ?? '',
      sourceEvidence: module.source_evidence ?? '',
    }));
    return [
      `请根据以下知识模块生成 ${input.questionCount} 道客观题。`,
      '',
      `难度偏好：${input.difficultyPreference}`,
      '题型分布：单选约 60%，多选约 20%，填空约 20%。',
      '只根据知识模块摘要和来源证据出题，不要编造超出证据范围的内容。',
      '',
      `知识模块 JSON：${JSON.stringify(modules)}`,
      '',
      '严格只返回 JSON 对象，不要 Markdown 围栏或解说。schema：',
      '{"questions":[{"type":"single_choice|multiple_choice|fill_blank","stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"A 或 [\\"A\\",\\"C\\"] 或 填空答案","acceptable_answers":null,"difficulty":"easy|medium|hard","knowledge_module_id":"uuid","explanation":"简短解析"}]}',
    ].join('\n');
  }

  private parseAiQuestions(content: string, expectedCount: number, allowedModuleIds: Set<string>): GeneratedQuestion[] {
    let parsed: { questions?: RawAiQuestion[] };
    try {
      parsed = JSON.parse(sanitizeAiJson(content)) as { questions?: RawAiQuestion[] };
    } catch {
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 输出无法解析为题目 JSON');
    }
    if (!Array.isArray(parsed.questions) || parsed.questions.length !== expectedCount)
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 输出题目数量不符合要求');
    return parsed.questions.map((question) => this.parseQuestion(question, allowedModuleIds));
  }

  private parseQuestion(question: RawAiQuestion, allowedModuleIds: Set<string>): GeneratedQuestion {
    const type = string(question.type) as PracticeQuestionType;
    if (!QUESTION_TYPES.includes(type))
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 生成题目类型不符合要求');
    const stem = string(question.stem);
    if (!stem || stem.length > 2000)
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 生成题干不符合要求');
    const difficulty = (string(question.difficulty) || 'medium') as PracticeDifficulty;
    if (!DIFFICULTIES.includes(difficulty))
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 生成题目难度不符合要求');
    const knowledgeModuleId = string(question.knowledge_module_id);
    if (!allowedModuleIds.has(knowledgeModuleId))
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 生成题目关联了未请求的知识模块');

    if (type === 'fill_blank') {
      if (question.options !== null && question.options !== undefined)
        throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, '填空题不能包含选项');
      const correctAnswer = string(question.correct_answer);
      if (!correctAnswer) throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, '填空题答案不能为空');
      const acceptableAnswers =
        question.acceptable_answers === null || question.acceptable_answers === undefined
          ? null
          : this.stringArray(question.acceptable_answers, '填空题可接受答案格式不符合要求');
      return {
        type,
        stem,
        options: null,
        correctAnswer,
        acceptableAnswers,
        difficulty,
        knowledgeModuleId,
        explanation: string(question.explanation) || null,
      };
    }

    const options = this.stringArray(question.options, '选择题选项格式不符合要求');
    const expectedOptionCount = type === 'single_choice' ? 4 : options.length;
    if (
      (type === 'single_choice' && options.length !== 4) ||
      (type === 'multiple_choice' && (options.length < 4 || options.length > 5))
    )
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, '选择题选项数量不符合要求');
    const correctAnswer =
      type === 'single_choice'
        ? normalizeAnswerLetters(question.correct_answer, 1, 1)
        : normalizeAnswerLetters(question.correct_answer, 2, Math.min(4, expectedOptionCount));
    if (correctAnswer.split(',').some((letter) => OPTION_LETTERS.indexOf(letter) >= options.length))
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, '选择题答案超出选项范围');
    return {
      type,
      stem,
      options,
      correctAnswer,
      acceptableAnswers: null,
      difficulty,
      knowledgeModuleId,
      explanation: string(question.explanation) || null,
    };
  }

  private stringArray(value: unknown, message: string): string[] {
    if (!Array.isArray(value)) throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, message);
    const result = value.map((item) => string(item));
    if (result.length === 0 || result.some((item) => !item))
      throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, message);
    return result;
  }

  private async generateWithRetry(inputText: string): Promise<{ content: string; model: string }> {
    try {
      const response = await this.ai.generate({ taskType: 'question_generation', inputText, language: 'zh' });
      return { content: response.content, model: response.model };
    } catch (error) {
      if (error instanceof AiProviderError) {
        await delay(this.retryDelayMs);
        const response = await this.ai.generate({ taskType: 'question_generation', inputText, language: 'zh' });
        return { content: response.content, model: response.model };
      }
      throw error;
    }
  }

  private mapAiError(error: unknown): never {
    if (error instanceof PracticeRunnerError) throw error;
    if (error instanceof AllProvidersCoolingDownError)
      throw new PracticeRunnerError(error.code, 503, 'AI Provider 暂时都在冷却中，请稍后再试');
    if (error instanceof AllProvidersFailedError)
      throw new PracticeRunnerError(error.code, 502, 'AI 题目生成失败，请稍后再试');
    if (error instanceof AiProviderError)
      throw new PracticeRunnerError(error.code, error.code === 'AI_NOT_CONFIGURED' ? 503 : 502, error.message);
    throw new PracticeRunnerError('PRACTICE_GENERATION_FAILED', 502, 'AI 题目生成失败，请稍后再试');
  }

  private toQuestionDto(row: Record<string, unknown>): PracticeQuestionForStudentDto {
    const optionsJson = row.options_json === null || row.options_json === undefined ? undefined : String(row.options_json);
    return {
      id: String(row.id),
      type: String(row.type) as PracticeQuestionType,
      stem: String(row.stem),
      options: optionsJson ? (JSON.parse(optionsJson) as string[]) : undefined,
      difficulty: String(row.difficulty) as PracticeDifficulty,
      knowledgeModuleId: String(row.knowledge_module_id),
      questionOrder: Number(row.question_order),
    };
  }

  private toSessionDto(db: DatabaseType, sessionId: string): PracticeSessionDetailDto {
    const session = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(sessionId) as
      | Record<string, unknown>
      | undefined;
    if (!session) throw new PracticeRunnerError('PRACTICE_SESSION_NOT_FOUND', 404, '练习不存在');
    const questions = db
      .prepare('SELECT * FROM questions WHERE practice_session_id = ? ORDER BY question_order ASC')
      .all(sessionId) as Record<string, unknown>[];
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
      difficultyPreference: String(session.difficulty_preference) as PracticeDifficultyPreference,
      startedAt: String(session.started_at),
      createdAt: String(session.created_at),
      updatedAt: String(session.updated_at),
      questions: questions.map((row) => this.toQuestionDto(row)),
    };
  }

  async createPracticeSession(input: CreatePracticeSessionRequest): Promise<CreatePracticeSessionResponse> {
    const valid = this.validateInput(input);
    const db = this.openReadySemesterDb(valid.semesterId);
    try {
      this.requireCourse(db, valid.semesterId, valid.courseInstanceId);
      this.requireAssessment(db, valid.assessmentAttemptId, valid.courseInstanceId);
      const modules = this.requireKnowledgeModules(db, valid.courseInstanceId, valid.knowledgeModuleIds);
      let generated: GeneratedQuestion[];
      let aiModel: string;
      try {
        const response = await this.generateWithRetry(
          this.buildPrompt({
            modules,
            questionCount: valid.questionCount,
            difficultyPreference: valid.difficultyPreference,
          })
        );
        aiModel = response.model;
        generated = this.parseAiQuestions(response.content, valid.questionCount, new Set(valid.knowledgeModuleIds));
      } catch (error) {
        this.mapAiError(error);
      }

      const timestamp = this.now();
      const sessionId = this.id();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO practice_sessions (
            id, course_instance_id, assessment_attempt_id, status, question_count,
            time_limit_seconds, started_at, submitted_at, graded_at, total_score,
            correct_rate, overtime, total_duration_seconds, difficulty_preference,
            created_at, updated_at
          ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, ?, ?, ?)`
        ).run(
          sessionId,
          valid.courseInstanceId,
          valid.assessmentAttemptId,
          generated.length,
          valid.timeLimitSeconds,
          timestamp,
          valid.difficultyPreference,
          timestamp,
          timestamp
        );
        const insertQuestion = db.prepare(
          `INSERT INTO questions (
            id, practice_session_id, course_instance_id, knowledge_module_id, type,
            stem, options_json, correct_answer, acceptable_answers_json, difficulty,
            explanation, source_evidence, ai_model, prompt_version, question_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const [index, question] of generated.entries()) {
          const module = modules.find((item) => item.id === question.knowledgeModuleId);
          insertQuestion.run(
            this.id(),
            sessionId,
            valid.courseInstanceId,
            question.knowledgeModuleId,
            question.type,
            question.stem,
            question.options ? JSON.stringify(question.options) : null,
            question.correctAnswer,
            question.acceptableAnswers ? JSON.stringify(question.acceptableAnswers) : null,
            question.difficulty,
            question.explanation,
            module?.source_evidence ?? null,
            aiModel,
            PROMPT_VERSION,
            index + 1,
            timestamp
          );
        }
      })();
      return this.toSessionDto(db, sessionId);
    } finally {
      db.close();
    }
  }

  submitPracticeSession(
    sessionIdValue: unknown,
    input: SubmitPracticeSessionRequest
  ): SubmitPracticeSessionResponse {
    const sessionId = requiredUuid(sessionIdValue, 'PRACTICE_SESSION_NOT_FOUND', '练习不存在');
    const valid = this.validateSubmitInput(input);
    const db = this.openReadySemesterDb(valid.semesterId);
    try {
      return db.transaction(() => {
        const session = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(sessionId) as
          | PracticeSessionRow
          | undefined;
        if (!session) throw new PracticeRunnerError('PRACTICE_SESSION_NOT_FOUND', 404, '练习不存在');
        if (session.status !== 'in_progress')
          throw new PracticeRunnerError('PRACTICE_SESSION_STATE_INVALID', 409, '当前练习状态不允许提交');

        const questions = db
          .prepare(
            `SELECT id, type, options_json, correct_answer, acceptable_answers_json, explanation, question_order
             FROM questions
             WHERE practice_session_id = ?
             ORDER BY question_order ASC`
          )
          .all(sessionId) as PracticeQuestionRow[];
        if (questions.length !== Number(session.question_count))
          throw new PracticeRunnerError('PRACTICE_QUESTION_MISMATCH', 409, '练习题目数量不一致');

        const questionById = new Map(questions.map((question) => [question.id, question]));
        for (const answer of valid.answers) {
          if (!questionById.has(answer.questionId))
            throw new PracticeRunnerError('PRACTICE_QUESTION_MISMATCH', 400, '答案引用了不属于该练习的题目');
        }

        const submittedByQuestionId = new Map(valid.answers.map((answer) => [answer.questionId, answer]));
        const gradedAnswers = questions.map((question) => this.gradeQuestion(question, submittedByQuestionId.get(question.id)));
        const totalScore = gradedAnswers.filter((answer) => answer.isCorrect).length;
        const correctRate = questions.length === 0 ? 0 : totalScore / questions.length;
        const overtime =
          session.time_limit_seconds === null || session.time_limit_seconds === undefined
            ? false
            : valid.totalDurationSeconds > Number(session.time_limit_seconds);
        const timestamp = this.now();

        const insertAnswer = db.prepare(
          `INSERT INTO practice_answers (
            id, session_id, question_id, student_answer, is_correct,
            time_spent_seconds, answer_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const answer of gradedAnswers) {
          insertAnswer.run(
            this.id(),
            sessionId,
            answer.questionId,
            answer.studentAnswer,
            answer.isCorrect ? 1 : 0,
            answer.timeSpentSeconds,
            answer.answerOrder,
            timestamp
          );
        }

        db.prepare(
          `UPDATE practice_sessions
           SET status = 'graded',
               submitted_at = ?,
               graded_at = ?,
               total_score = ?,
               correct_rate = ?,
               overtime = ?,
               total_duration_seconds = ?,
               updated_at = ?
           WHERE id = ?`
        ).run(
          timestamp,
          timestamp,
          totalScore,
          correctRate,
          overtime ? 1 : 0,
          valid.totalDurationSeconds,
          timestamp,
          sessionId
        );

        this.errorFixer.archiveIncorrectPracticeAnswers(db, sessionId, timestamp);

        db.prepare(
          `INSERT INTO study_events (
            id, course_instance_id, source_system, event_type, title,
            workload_minutes, evidence_ref, parent_visible, occurred_at, created_at
          ) VALUES (?, ?, 'S3', 'practice_completed', ?, ?, ?, 1, ?, ?)`
        ).run(
          this.id(),
          session.course_instance_id,
          `完成限时练习：${totalScore}/${questions.length}`,
          Math.ceil(valid.totalDurationSeconds / 60),
          `practice_session:${sessionId}`,
          timestamp,
          timestamp
        );

        return {
          sessionId,
          status: 'graded' as const,
          totalScore,
          questionCount: questions.length,
          correctRate,
          overtime,
          totalDurationSeconds: valid.totalDurationSeconds,
          answers: gradedAnswers.map((answer) => this.toAnswerResult(answer)),
        };
      })();
    } finally {
      db.close();
    }
  }

  getPracticeSession(semesterIdValue: unknown, sessionIdValue: unknown): PracticeSessionDetailDto {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const sessionId = requiredUuid(sessionIdValue, 'PRACTICE_SESSION_NOT_FOUND', '练习不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      return this.toSessionDto(db, sessionId);
    } finally {
      db.close();
    }
  }
}
