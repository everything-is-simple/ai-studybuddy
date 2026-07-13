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
