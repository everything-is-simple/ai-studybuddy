import type {
  ConfirmMistakeErrorCauseRequest,
  CreateMistakeRedoRequest,
  MistakeDetailDto,
  MistakeListResponse,
  MistakeStatus,
  PracticeSessionDetailDto,
  UpdateMistakeStatusRequest,
  WeakPointListResponse,
} from '@ai-studybuddy/shared';
import { request } from './api-client';

export interface MistakeListFilters {
  knowledgeModuleId?: string;
  status?: MistakeStatus;
  page?: number;
  pageSize?: number;
}

export function getMistakes(
  semesterId: string,
  courseInstanceId: string,
  filters?: MistakeListFilters,
  signal?: AbortSignal
): Promise<MistakeListResponse> {
  const params = new URLSearchParams({ semesterId, courseInstanceId });
  if (filters?.knowledgeModuleId) params.set('knowledgeModuleId', filters.knowledgeModuleId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  return request<MistakeListResponse>(`/mistakes?${params.toString()}`, { signal });
}

export function getMistake(semesterId: string, mistakeId: string, signal?: AbortSignal): Promise<MistakeDetailDto> {
  return request<MistakeDetailDto>(
    `/mistakes/${encodeURIComponent(mistakeId)}?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}

export function confirmMistakeErrorCause(
  mistakeId: string,
  data: ConfirmMistakeErrorCauseRequest,
  signal?: AbortSignal
): Promise<MistakeDetailDto> {
  return request<MistakeDetailDto>(`/mistakes/${encodeURIComponent(mistakeId)}/error-cause`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function updateMistakeStatus(
  mistakeId: string,
  data: UpdateMistakeStatusRequest,
  signal?: AbortSignal
): Promise<MistakeDetailDto> {
  return request<MistakeDetailDto>(`/mistakes/${encodeURIComponent(mistakeId)}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function createMistakeRedo(
  mistakeId: string,
  data: CreateMistakeRedoRequest,
  signal?: AbortSignal
): Promise<PracticeSessionDetailDto> {
  return request<PracticeSessionDetailDto>(`/mistakes/${encodeURIComponent(mistakeId)}/redo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getWeakPoints(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<WeakPointListResponse> {
  return request<WeakPointListResponse>(
    `/weak-points?semesterId=${encodeURIComponent(semesterId)}&courseInstanceId=${encodeURIComponent(courseInstanceId)}`,
    { signal }
  );
}
