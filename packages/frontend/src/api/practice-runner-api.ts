import type {
  CreatePracticeSessionRequest,
  CreatePracticeSessionResponse,
  PracticeSessionDetailDto,
  SubmitPracticeSessionRequest,
  SubmitPracticeSessionResponse,
} from '@ai-studybuddy/shared';
import { request } from './api-client';

export function createPracticeSession(
  data: CreatePracticeSessionRequest,
  signal?: AbortSignal
): Promise<CreatePracticeSessionResponse> {
  return request<CreatePracticeSessionResponse>('/practice-sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getPracticeSession(
  semesterId: string,
  sessionId: string,
  signal?: AbortSignal
): Promise<PracticeSessionDetailDto> {
  return request<PracticeSessionDetailDto>(
    `/practice-sessions/${encodeURIComponent(sessionId)}?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}

export function submitPracticeSession(
  sessionId: string,
  data: SubmitPracticeSessionRequest,
  signal?: AbortSignal
): Promise<SubmitPracticeSessionResponse> {
  return request<SubmitPracticeSessionResponse>(`/practice-sessions/${encodeURIComponent(sessionId)}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}
