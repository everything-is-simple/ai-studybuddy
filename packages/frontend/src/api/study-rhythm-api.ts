import type {
  AssessmentAttemptDto,
  CourseInstanceDto,
  StudyEventDto,
  StudyTaskDto,
  StudyTaskStatus,
  StudyTaskType,
  ScheduleEntryDto,
  UpdateCourseRequest,
  UpsertScheduleEntryRequest,
  UpdateExamRequest,
} from '@ai-studybuddy/shared';
import { request } from './api-client';

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

export function deleteCourse(semesterId: string, courseId: string, signal?: AbortSignal): Promise<CourseInstanceDto> {
  return request<CourseInstanceDto>(
    '/courses/' + encodeURIComponent(courseId) + '?semesterId=' + encodeURIComponent(semesterId),
    {
      method: 'DELETE',
      signal,
    }
  );
}

export function updateCourse(
  semesterId: string,
  courseId: string,
  data: Pick<UpdateCourseRequest, 'name'>,
  signal?: AbortSignal
): Promise<CourseInstanceDto> {
  return request<CourseInstanceDto>('/courses/' + encodeURIComponent(courseId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId, ...data }),
    signal,
  });
}

export function getScheduleEntries(semesterId: string, signal?: AbortSignal): Promise<ScheduleEntryDto[]> {
  return request<ScheduleEntryDto[]>('/schedule-entries?semesterId=' + encodeURIComponent(semesterId), { signal });
}

export function createScheduleEntry(data: UpsertScheduleEntryRequest, signal?: AbortSignal): Promise<ScheduleEntryDto> {
  return request<ScheduleEntryDto>('/schedule-entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function updateScheduleEntry(
  semesterId: string,
  entryId: string,
  data: Omit<UpsertScheduleEntryRequest, 'semesterId'>,
  signal?: AbortSignal
): Promise<ScheduleEntryDto> {
  return request<ScheduleEntryDto>('/schedule-entries/' + encodeURIComponent(entryId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId, ...data }),
    signal,
  });
}

export function deleteScheduleEntry(
  semesterId: string,
  entryId: string,
  signal?: AbortSignal
): Promise<ScheduleEntryDto> {
  return request<ScheduleEntryDto>(
    '/schedule-entries/' + encodeURIComponent(entryId) + '?semesterId=' + encodeURIComponent(semesterId),
    {
      method: 'DELETE',
      signal,
    }
  );
}

export function updateExam(
  semesterId: string,
  examId: string,
  data: Omit<UpdateExamRequest, 'semesterId'>,
  signal?: AbortSignal
): Promise<AssessmentAttemptDto> {
  return request<AssessmentAttemptDto>('/exams/' + encodeURIComponent(examId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId, ...data }),
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

export function getExam(semesterId: string, examId: string, signal?: AbortSignal): Promise<AssessmentAttemptDto> {
  const params = new URLSearchParams({ semesterId });
  return request<AssessmentAttemptDto>(`/exams/${encodeURIComponent(examId)}?${params.toString()}`, { signal });
}

export function confirmExam(semesterId: string, examId: string, signal?: AbortSignal): Promise<AssessmentAttemptDto> {
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
  options: { limit?: number; courseInstanceId?: string; eventTypes?: string[] } = {},
  signal?: AbortSignal
): Promise<StudyEventDto[]> {
  const params = new URLSearchParams();
  params.set('semesterId', semesterId);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.courseInstanceId) params.set('courseInstanceId', options.courseInstanceId);
  for (const eventType of options.eventTypes ?? []) params.append('eventType', eventType);
  return request<StudyEventDto[]>(`/timeline?${params.toString()}`, { signal });
}
