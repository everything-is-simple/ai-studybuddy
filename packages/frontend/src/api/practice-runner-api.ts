import type {
  CreatePracticeSessionRequest,
  CreatePracticeSessionResponse,
  PracticeHistoryListResponseDto,
  PracticeHistoryResultDto,
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

export interface PracticeHistoryFilters {
  courseInstanceId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function getPracticeHistory(
  semesterId: string,
  filters: PracticeHistoryFilters = {},
  signal?: AbortSignal
): Promise<PracticeHistoryListResponseDto> {
  const params = new URLSearchParams({ semesterId });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return request<PracticeHistoryListResponseDto>(`/practice-sessions/history?${params.toString()}`, { signal });
}

export function getPracticeHistoryResult(
  semesterId: string,
  sessionId: string,
  signal?: AbortSignal
): Promise<PracticeHistoryResultDto> {
  return request<PracticeHistoryResultDto>(
    `/practice-sessions/${encodeURIComponent(sessionId)}/history-result?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}
