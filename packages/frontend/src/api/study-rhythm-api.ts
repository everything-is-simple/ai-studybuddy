import type {
  AssessmentAttemptDto,
  CourseInstanceDto,
  StudyTaskDto,
  StudyTaskStatus,
  StudyTaskType,
} from '@ai-studybuddy/shared';
import { request, requestPage, type ApiPage } from './api-client';

export function getCourses(semesterId: string, signal?: AbortSignal): Promise<CourseInstanceDto[]> {
  return request<CourseInstanceDto[]>(`/courses?semesterId=${encodeURIComponent(semesterId)}`, {
    signal,
  });
}

export function createCourse(
  data: { semesterId: string; name: string; retakeOfCourseInstanceId?: string },
  signal?: AbortSignal
): Promise<CourseInstanceDto> {
  return request<CourseInstanceDto>('/courses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getExams(
  semesterId: string,
  courseInstanceId?: string,
  signal?: AbortSignal
): Promise<AssessmentAttemptDto[]> {
  const params = new URLSearchParams({ semesterId });
  if (courseInstanceId) params.set('courseInstanceId', courseInstanceId);
  return request<AssessmentAttemptDto[]>(`/exams?${params.toString()}`, { signal });
}

export function getExam(
  semesterId: string,
  examId: string,
  signal?: AbortSignal
): Promise<AssessmentAttemptDto> {
  const params = new URLSearchParams({ semesterId });
  return request<AssessmentAttemptDto>(`/exams/${encodeURIComponent(examId)}?${params.toString()}`, { signal });
}

export function confirmExam(
  semesterId: string,
  examId: string,
  signal?: AbortSignal
): Promise<AssessmentAttemptDto> {
  return request<AssessmentAttemptDto>(`/exams/${encodeURIComponent(examId)}/confirmation`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId }),
    signal,
  });
}

export function createExam(
  data: {
    semesterId: string;
    courseInstanceId: string;
    name: string;
    attemptType: string;
    examAt: string;
    goal?: string;
  },
  signal?: AbortSignal
): Promise<AssessmentAttemptDto> {
  return request<AssessmentAttemptDto>('/exams', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getStudyTasks(
  semesterId: string,
  courseInstanceId?: string,
  signal?: AbortSignal
): Promise<StudyTaskDto[]> {
  const params = new URLSearchParams({ semesterId });
  if (courseInstanceId) params.set('courseInstanceId', courseInstanceId);
  return request<StudyTaskDto[]>(`/study-tasks?${params.toString()}`, { signal });
}

export function createStudyTask(
  data: {
    semesterId: string;
    courseInstanceId: string;
    assessmentAttemptId?: string;
    knowledgeModuleId?: string;
    type: StudyTaskType;
    title: string;
    estimatedMinutes?: number;
    deadlineAt?: string;
  },
  signal?: AbortSignal
): Promise<StudyTaskDto> {
  return request<StudyTaskDto>('/study-tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function updateStudyTaskStatus(
  data: { semesterId: string; taskId: string; status: StudyTaskStatus; occurredAt?: string },
  signal?: AbortSignal
): Promise<StudyTaskDto> {
  const { taskId, ...body } = data;
  return request<StudyTaskDto>(`/study-tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function getTimeline(
  semesterId: string,
  options: { limit?: number; courseInstanceId?: string } = {},
  signal?: AbortSignal
): Promise<ApiPage<unknown>> {
  const params = new URLSearchParams();
  params.set('semesterId', semesterId);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.courseInstanceId) params.set('courseInstanceId', options.courseInstanceId);
  return requestPage<unknown>(`/timeline?${params.toString()}`, { signal });
}
