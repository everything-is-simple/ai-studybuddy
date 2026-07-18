import type {
  ConfirmSemesterRequest,
  CreateSemesterResponseDto,
  CurrentSemesterDto,
  SemesterPreviewDto,
  SemesterSummaryDto,
} from '@ai-studybuddy/shared';
import { request, upload } from './api-client';

export function listSemesters(signal?: AbortSignal): Promise<SemesterSummaryDto[]> {
  return request<SemesterSummaryDto[]>('/semesters', { signal });
}

export function getCurrentSemester(signal?: AbortSignal): Promise<CurrentSemesterDto> {
  return request<CurrentSemesterDto>('/semesters/current', { signal });
}

export function selectCurrentSemester(semesterId: string, signal?: AbortSignal): Promise<CurrentSemesterDto> {
  return request<CurrentSemesterDto>('/semesters/current', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId }),
    signal,
  });
}

export function previewSemesterTimetable(data: {
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate?: string;
  studentName?: string;
  timetableImage: File;
}, signal?: AbortSignal): Promise<SemesterPreviewDto> {
  const form = new FormData();
  form.set('semesterCode', data.semesterCode);
  form.set('teachingStartDate', data.teachingStartDate);
  form.set('teachingEndDate', data.teachingEndDate);
  if (data.finalArchiveDate) form.set('finalArchiveDate', data.finalArchiveDate);
  if (data.studentName) form.set('studentName', data.studentName);
  form.set('timetableImage', data.timetableImage);
  return upload<SemesterPreviewDto>('/semesters/preview', form, signal);
}

export function confirmSemester(data: ConfirmSemesterRequest, signal?: AbortSignal): Promise<CreateSemesterResponseDto> {
  return request<CreateSemesterResponseDto>('/semesters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}
