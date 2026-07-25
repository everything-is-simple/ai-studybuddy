import type { ClassCaptureSavedMaterialDto, ClassCaptureTranscriptDto } from '@ai-studybuddy/shared';
import { request, upload } from './api-client';

export function transcribeClassCapture(
  data: { semesterId: string; courseInstanceId: string; title: string; permissionConfirmed: boolean; file: File },
  signal?: AbortSignal
): Promise<ClassCaptureTranscriptDto> {
  const formData = new FormData();
  formData.append('semesterId', data.semesterId);
  formData.append('courseInstanceId', data.courseInstanceId);
  formData.append('title', data.title);
  formData.append('permissionConfirmed', String(data.permissionConfirmed));
  formData.append('file', data.file);
  return upload<ClassCaptureTranscriptDto>('/class-captures/transcribe', formData, signal);
}

export function saveClassCaptureToNotes(
  data: { semesterId: string; courseInstanceId: string; title: string; permissionConfirmed: boolean; text: string },
  signal?: AbortSignal
): Promise<ClassCaptureSavedMaterialDto> {
  return request<ClassCaptureSavedMaterialDto>('/class-captures/save-to-notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}
