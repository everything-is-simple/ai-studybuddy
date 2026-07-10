// ============================================================
// 共享类型定义 — Phase 0.8 最小集
// ============================================================

export type UserRole = "developer" | "student" | "parent";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface Course {
  id: string;
  student_id: string;
  name: string;
  term: string;
  created_at: Date;
  updated_at: Date;
}

// Exam：考试目标，驱动考前提醒和任务优先级（Phase 0.8 必需对象）
// 一个课程可有多个考试目标；exam_at 是考试日期
export interface Exam {
  id: string;
  course_id: string;
  name: string;
  exam_at: Date;
  goal: string | null;
  daily_study_minutes: number | null;
  scope_summary: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StudyTask {
  id: string;
  student_id: string;
  course_id: string;
  exam_id: string | null;
  knowledge_module_id: string | null;
  type: "material_note" | "practice" | "error_review" | "exam_cram" | "custom";
  title: string;
  status: "todo" | "doing" | "done" | "overdue" | "skipped";
  estimated_minutes: number | null;
  deadline_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StudyEvent {
  id: string;
  student_id: string;
  course_id: string;
  task_id: string | null;
  source_system: "S1" | "S2" | "S3" | "S4" | "S5" | "S7";
  event_type: string;
  title: string;
  workload_minutes: number | null;
  parent_visible: boolean;
  occurred_at: Date;
  created_at: Date;
}

export interface Material {
  id: string;
  course_id: string;           // 资料归属课程，不是任务
  file_type: "pdf" | "image" | "text";
  storage_key: string;         // 逻辑 key，不保存绝对路径
  status: "pending" | "processing" | "done" | "error";
  created_at: Date;
  updated_at: Date;
}

// KnowledgeModule：从资料/笔记形成的可考知识模块（Phase 0.8 必需对象）
// 是资料、任务、练习、错题之间的共同语言；必须能回链到来源资料和证据
export interface KnowledgeModule {
  id: string;
  course_id: string;
  material_id: string | null;  // 来源资料
  title: string;
  importance: "high" | "medium" | "low";
  difficulty: "hard" | "medium" | "easy";
  exam_content: string | null; // 考察内容描述
  source_evidence: string | null; // 来源证据（资料页码、段落等）
  learn_status: "not_started" | "in_progress" | "mastered";
  created_at: Date;
  updated_at: Date;
}

export interface StructuredNote {
  id: string;
  material_id: string;         // 笔记从资料生成，关联 material_id
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
  format: "markmap";
  data: string;
  created_at: Date;
}

// ============================================================
// Adapter 类型约定
// ============================================================

export interface ConverterResult {
  ok: boolean;
  sourceType: "pdf" | "image" | "text";
  text?: string;
  metadata?: {
    pageCount?: number;
    charCount?: number;
    hasFormula?: boolean;
    hasTable?: boolean;
  };
  warnings?: string[];
  error?: string;
}

export interface AiRequest {
  taskType: "note_generation" | "practice_grading" | "error_analysis" | "question_generation";
  inputText: string;
  language?: "zh" | "en";
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
