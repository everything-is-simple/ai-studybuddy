// ============================================================
// 共享类型定义 — Phase 0.8 最小集
// ============================================================

export type UserRole = 'developer' | 'student' | 'parent';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

// ============================================================
// S1 StudyRhythm API DTO（与学期库列对应，字段采用 camelCase）
// ============================================================

export interface CourseInstanceDto {
  id: string;
  semesterId: string;
  name: string;
  retakeOfCourseInstanceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEntryDto {
  id: string;
  semesterId: string;
  courseInstanceId: string;
  courseName: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  location?: string;
  source?: string;
  sourceConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCourseRequest {
  semesterId: string;
  name: string;
}

export interface UpsertScheduleEntryRequest {
  semesterId: string;
  courseInstanceId: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface UpdateExamRequest {
  semesterId: string;
  name?: string;
  examAt?: string;
  goal?: string;
}
export type AttemptType = 'normal' | 'makeup' | 'other';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'rejected' | 'superseded';

export interface AssessmentAttemptDto {
  id: string;
  courseInstanceId: string;
  name: string;
  attemptType: AttemptType;
  examAt: string;
  confirmationStatus: ConfirmationStatus;
  confirmedAt?: string;
  goal?: string;
  dailyStudyMinutes?: number;
  scopeSummary?: string;
  source?: string;
  sourceConfidence?: number;
}

export type StudyTaskType = 'material_note' | 'practice' | 'error_review' | 'exam_cram' | 'custom';
export type StudyTaskStatus = 'todo' | 'doing' | 'pending_quality_check' | 'done' | 'skipped';

export interface StudyTaskDto {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string;
  knowledgeModuleId?: string;
  type: StudyTaskType;
  title: string;
  status: StudyTaskStatus;
  estimatedMinutes?: number;
  deadlineAt?: string;
  completedAt?: string;
  derivedOverdue: boolean;
  priorityBucket: 0 | 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
}

export interface StudyEventDto {
  id: string;
  courseInstanceId?: string;
  taskId?: string;
  sourceSystem: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S7';
  eventType: string;
  title: string;
  workloadMinutes?: number;
  evidenceRef?: string;
  sourceConfidence?: number;
  qualityGate?: 'passed' | 'pending' | 'failed';
  parentVisible: boolean;
  occurredAt: string;
  createdAt: string;
}

export interface Material {
  id: string;
  course_id: string; // 资料归属课程，不是任务
  file_type: 'pdf' | 'image' | 'text';
  storage_key: string; // 逻辑 key，不保存绝对路径
  status: 'pending' | 'processing' | 'done' | 'error';
  created_at: Date;
  updated_at: Date;
}

// KnowledgeModule：从资料/笔记形成的可考知识模块（Phase 0.8 必需对象）
// 是资料、任务、练习、错题之间的共同语言；必须能回链到来源资料和证据
export interface KnowledgeModule {
  id: string;
  course_id: string;
  material_id: string | null; // 来源资料
  title: string;
  importance: 'high' | 'medium' | 'low';
  difficulty: 'hard' | 'medium' | 'easy';
  exam_content: string | null; // 考察内容描述
  source_evidence: string | null; // 来源证据（资料页码、段落等）
  learn_status: 'not_started' | 'in_progress' | 'mastered';
  created_at: Date;
  updated_at: Date;
}

export interface StructuredNote {
  id: string;
  material_id: string; // 笔记从资料生成，关联 material_id
  knowledge_module_id: string | null;
  markdown: string;
  highlights: string[];
  model: string;
  created_at: Date;
  updated_at: Date;
}

export interface MindMap {
  id: string;
  note_id: string;
  format: 'markmap';
  data: string;
  created_at: Date;
}

// ============================================================
// Adapter 类型约定
// ============================================================

export interface DocxMetadata {
  embeddedVisualCount?: number;
}

export interface PptxMetadata {
  slideCount?: number;
  textSlideCount?: number;
  imageSlideCount?: number;
}

export interface UrlMetadata {
  title?: string;
  byline?: string;
  finalUrl?: string;
  redirectCount?: number;
  byteCount?: number;
}

export type ConverterSourceType = 'pdf' | 'image' | 'text' | 'docx' | 'url' | 'html' | 'pptx';

export interface ConverterResult {
  ok: boolean;
  sourceType: ConverterSourceType;
  text?: string;
  metadata?: {
    pageCount?: number;
    charCount?: number;
    hasFormula?: boolean;
    hasTable?: boolean;
  } & DocxMetadata &
    PptxMetadata &
    UrlMetadata;
  warnings?: string[];
  error?: string;
}

export interface AiRequest {
  taskType: 'note_generation' | 'practice_grading' | 'error_analysis' | 'question_generation';
  inputText: string;
  language?: 'zh' | 'en';
  options?: Record<string, unknown>;
}

export interface AiResponse {
  content: string;
  provider: string;
  model: string;
  tokenUsed: number;
  latencyMs: number;
  fallbackUsed: boolean;
}

// ============================================================
// API 响应信封
// ============================================================

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ============================================================
// S2 NoteBuilder DTO
// ============================================================

export type MaterialStatus =
  | 'pending'
  | 'converting'
  | 'converted'
  | 'note_generating'
  | 'completed'
  | 'conversion_failed'
  | 'pending_quality_check';

export type MaterialFileType = 'pdf' | 'image' | 'text' | 'docx' | 'pptx';
export type KnowledgeImportance = 'low' | 'medium' | 'high' | 'critical';
export type KnowledgeDifficulty = 'easy' | 'medium' | 'hard';
export type KnowledgeLearnStatus = 'not_started' | 'learning' | 'mastered';

export interface HighlightDto {
  content: string;
  importance: 'low' | 'medium' | 'high';
  position: string;
}

export interface MaterialDto {
  id: string;
  courseInstanceId: string;
  fileType: MaterialFileType;
  status: MaterialStatus;
  title?: string;
  originalFilename?: string;
  fileSizeBytes?: number;
  storageKey?: string;
  hasNote?: boolean;
  noteId?: string; // 存在已生成结构化笔记时有值
  knowledgeModuleCount?: number;
  conversionRetryCount?: number;
  aiRetryCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface KnowledgeModuleDto {
  id: string;
  courseInstanceId: string;
  materialId?: string;
  title: string;
  contentSummary?: string;
  importance: KnowledgeImportance;
  difficulty: KnowledgeDifficulty;
  examRelevance?: string;
  sourceEvidence?: string;
  learnStatus: KnowledgeLearnStatus;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}
// ============================================================
// S3 PracticeRunner 存储/领域记录（非公开 API DTO）
// ============================================================

export type PracticeQuestionType = 'single_choice' | 'multiple_choice' | 'fill_blank';
export type PracticeDifficulty = 'easy' | 'medium' | 'hard';
export type PracticeDifficultyPreference = PracticeDifficulty | 'mixed';
export type PracticeSessionStatus = 'in_progress' | 'submitted' | 'graded';

export interface PracticeQuestionRecord {
  id: string;
  practiceSessionId: string;
  courseInstanceId: string;
  knowledgeModuleId: string;
  type: PracticeQuestionType;
  stem: string;
  options?: string[];
  correctAnswer: string;
  acceptableAnswers?: string[];
  difficulty: PracticeDifficulty;
  explanation?: string;
  sourceEvidence?: string;
  aiModel: string;
  promptVersion: string;
  questionOrder: number;
  createdAt: string;
}

export interface PracticeSessionRecord {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string;
  status: PracticeSessionStatus;
  questionCount: number;
  timeLimitSeconds?: number;
  startedAt: string;
  submittedAt?: string;
  gradedAt?: string;
  totalScore?: number;
  correctRate?: number;
  overtime: boolean;
  totalDurationSeconds?: number;
  difficultyPreference: PracticeDifficultyPreference;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeAnswerRecord {
  id: string;
  sessionId: string;
  questionId: string;
  studentAnswer?: string;
  isCorrect?: boolean;
  timeSpentSeconds?: number;
  answerOrder: number;
  createdAt: string;
}

// ============================================================
// S4 ErrorFixer 存储/领域记录（非公开 API DTO）
// ============================================================

export type MistakeStatus = 'pending_review' | 'needs_review' | 'mastered';
export type MistakeEvidenceType = 'practice_error' | 'redo_correct' | 'redo_incorrect';
export type WeakPointStatus = 'active' | 'mastered';

export interface MistakeRecord {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string;
  knowledgeModuleId: string;
  questionId: string;
  firstPracticeAnswerId: string;
  latestPracticeAnswerId: string;
  status: MistakeStatus;
  errorCount: number;
  errorCauseCategory?: string | null;
  errorCauseNote?: string | null;
  errorCauseConfirmedAt?: string | null;
  firstErrorAt: string;
  latestErrorAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MistakeEvidenceRecord {
  id: string;
  mistakeId: string;
  sourcePracticeAnswerId: string;
  evidenceType: MistakeEvidenceType;
  courseInstanceId: string;
  knowledgeModuleId: string;
  questionId: string;
  occurredAt: string;
  createdAt: string;
}

export interface WeakPointRecord {
  id: string;
  courseInstanceId: string;
  knowledgeModuleId: string;
  status: WeakPointStatus;
  evidenceCount: number;
  firstDetectedAt: string;
  latestDetectedAt: string;
  createdAt: string;
  updatedAt: string;
}
// ============================================================
// S3 PracticeRunner 公开 API DTO
// 作答前 DTO 不包含正确答案、可接受答案、解析或 AI 元数据。
// ============================================================

export interface CreatePracticeSessionRequest {
  semesterId: string;
  courseInstanceId: string;
  assessmentAttemptId?: string | null;
  knowledgeModuleIds: string[];
  questionCount?: number;
  difficultyPreference?: PracticeDifficultyPreference;
  timeLimitSeconds?: number | null;
}

export interface PracticeQuestionForStudentDto {
  id: string;
  type: PracticeQuestionType;
  stem: string;
  options?: string[];
  difficulty: PracticeDifficulty;
  knowledgeModuleId: string;
  questionOrder: number;
}

export interface PracticeSessionDetailDto {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string | null;
  status: PracticeSessionStatus;
  questionCount: number;
  timeLimitSeconds: number | null;
  difficultyPreference: PracticeDifficultyPreference;
  sessionKind?: 'practice' | 'mistake_redo';
  originMistakeId?: string | null;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
  questions: PracticeQuestionForStudentDto[];
}

export type CreatePracticeSessionResponse = PracticeSessionDetailDto;

export interface SubmitPracticeAnswerInputDto {
  questionId: string;
  answer?: string | null;
  timeSpentSeconds?: number | null;
}

export interface SubmitPracticeSessionRequest {
  semesterId: string;
  answers: SubmitPracticeAnswerInputDto[];
  totalDurationSeconds: number;
}

export interface PracticeAnswerResultDto {
  questionId: string;
  studentAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string | null;
}

export interface SubmitPracticeSessionResponse {
  sessionId: string;
  status: 'graded';
  totalScore: number;
  questionCount: number;
  correctRate: number;
  overtime: boolean;
  totalDurationSeconds: number;
  answers: PracticeAnswerResultDto[];
}

// ============================================================
// S4 ErrorFixer 公开 API DTO（Phase 1-T04B）
// 错题详情允许展示已批改事实（正确答案/解析）；
// 重做作答前仍走 S3 作答前 DTO，不泄露答案。
// ============================================================

export type MistakeErrorCauseCategory =
  | 'concept_unclear'
  | 'misread'
  | 'formula_error'
  | 'step_missing'
  | 'time_pressure'
  | 'other';

export interface MistakeListItemDto {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string | null;
  knowledgeModuleId: string;
  knowledgeModuleTitle: string;
  questionId: string;
  questionType: PracticeQuestionType;
  stemPreview: string;
  status: MistakeStatus;
  errorCount: number;
  errorCauseCategory?: MistakeErrorCauseCategory | null;
  firstErrorAt: string;
  latestErrorAt: string;
}

export interface MistakeListResponse {
  items: MistakeListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MistakeEvidenceDto {
  id: string;
  evidenceType: MistakeEvidenceType;
  occurredAt: string;
}

export interface MistakeDetailDto {
  id: string;
  courseInstanceId: string;
  assessmentAttemptId?: string | null;
  knowledgeModuleId: string;
  knowledgeModuleTitle: string;
  questionId: string;
  questionType: PracticeQuestionType;
  stem: string;
  options?: string[] | null;
  correctAnswer: string;
  explanation?: string | null;
  studentAnswer: string | null;
  status: MistakeStatus;
  errorCount: number;
  errorCauseCategory?: MistakeErrorCauseCategory | null;
  errorCauseNote?: string | null;
  errorCauseConfirmedAt?: string | null;
  firstErrorAt: string;
  latestErrorAt: string;
  evidence: MistakeEvidenceDto[];
}

export interface ConfirmMistakeErrorCauseRequest {
  semesterId: string;
  category: MistakeErrorCauseCategory;
  note?: string | null;
}

export interface UpdateMistakeStatusRequest {
  semesterId: string;
  status: Extract<MistakeStatus, 'needs_review' | 'mastered'>;
  confirm?: boolean;
}

export interface CreateMistakeRedoRequest {
  semesterId: string;
}

export interface WeakPointListItemDto {
  id: string;
  courseInstanceId: string;
  knowledgeModuleId: string;
  knowledgeModuleTitle: string;
  status: WeakPointStatus;
  evidenceCount: number;
  firstDetectedAt: string;
  latestDetectedAt: string;
}

export interface WeakPointListResponse {
  items: WeakPointListItemDto[];
}
export type SemesterStatus = 'active' | 'archived';

export interface SemesterSummaryDto {
  id: string;
  semesterCode: string;
  studentName: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string | null;
  status: SemesterStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentSemesterDto {
  semester: SemesterSummaryDto | null;
  recoveredFromStaleCurrent: boolean;
}

export interface TimetablePreviewEntryDto {
  clientId: string;
  courseName: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  location?: string | null;
  parserConfidence?: number | null;
  warnings?: string[];
}

export interface SemesterPreviewDto {
  previewId: string;
  expiresAt: string;
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string | null;
  requiresStudentName: boolean;
  entries: TimetablePreviewEntryDto[];
  warnings: string[];
}

export interface ConfirmSemesterRequest {
  previewId: string;
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string | null;
  studentName?: string | null;
  entries: TimetablePreviewEntryDto[];
}

export interface CreateSemesterResponseDto {
  semester: SemesterSummaryDto;
  current: CurrentSemesterDto;
}
export interface DailyStudyHomeTaskDto {
  id: string;
  title: string;
  courseName: string;
  deadlineAt?: string;
  type: StudyTaskType;
}

export interface DailyStudyHomeExamDto {
  id: string;
  name: string;
  courseName: string;
  examAt: string;
  daysUntil: number;
}

export interface DailyStudyHomeScheduleDto {
  id: string;
  courseInstanceId: string;
  courseName: string;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface DailyStudyHomeMaterialDto {
  id: string;
  courseInstanceId: string;
  courseName: string;
  title: string;
  status: 'pending_quality_check' | 'conversion_failed';
}

export interface DailyStudyHomeNextActionDto {
  kind: 'quality_material' | 'today_task' | 'tomorrow_task' | 'error_review' | 'upcoming_exam';
  title: string;
  path: string;
}

export interface DailyStudyHomeDto {
  semesterId: string;
  date: string;
  todayTasks: DailyStudyHomeTaskDto[];
  tomorrowTasks: DailyStudyHomeTaskDto[];
  tomorrowSchedule: DailyStudyHomeScheduleDto[];
  upcomingExams: DailyStudyHomeExamDto[];
  pendingQualityMaterials: DailyStudyHomeMaterialDto[];
  errorReviews: DailyStudyHomeTaskDto[];
  nextAction: DailyStudyHomeNextActionDto | null;
}
