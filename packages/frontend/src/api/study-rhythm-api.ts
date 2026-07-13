import type { AssessmentAttemptDto, CourseInstanceDto, StudyTaskDto } from '@ai-studybuddy/shared';
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
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<AssessmentAttemptDto[]> {
  return request<AssessmentAttemptDto[]>(
    `/courses/${encodeURIComponent(courseInstanceId)}/exams?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}

export function createExam(
  data: {
    courseInstanceId: string;
    name: string;
    attemptType: string;
    examAt: string;
    goal?: string;
  },
  signal?: AbortSignal
): Promise<AssessmentAttemptDto> {
  return request<AssessmentAttemptDto>(`/courses/${encodeURIComponent(data.courseInstanceId)}/exams`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getStudyTasks(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<StudyTaskDto[]> {
  return request<StudyTaskDto[]>(
    `/courses/${encodeURIComponent(courseInstanceId)}/study-tasks?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
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
