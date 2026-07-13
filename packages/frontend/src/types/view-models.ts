import type {
  AssessmentAttemptDto,
  CourseInstanceDto,
  KnowledgeModuleDto,
  MaterialDto,
  StudyTaskDto,
} from '@ai-studybuddy/shared';

export interface CourseWithExams {
  course: CourseInstanceDto;
  exams: AssessmentAttemptDto[];
  tasks: StudyTaskDto[];
}

export interface MaterialWithNote extends MaterialDto {
  courseName?: string;
}

export interface NoteViewModel {
  noteId: string;
  materialId: string;
  markdown: string;
  highlights: Array<{ content: string; importance: string; position: string }>;
  mindMapData?: string;
  knowledgeModules: KnowledgeModuleDto[];
  tasks: StudyTaskDto[];
}

export type FeedbackState = 'loading' | 'empty' | 'error' | 'success';
