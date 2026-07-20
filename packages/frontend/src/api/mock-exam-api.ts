import type {
  CreateMockExamPaperRequest,
  MockExamAttemptDetailDto,
  MockExamPaperDetailDto,
  StartMockExamAttemptRequest,
  SubmitMockExamAttemptRequest,
  SubmitMockExamAttemptResponse,
} from '@ai-studybuddy/shared';
import { request } from './api-client';

export function createMockExamPaper(
  data: CreateMockExamPaperRequest,
  signal?: AbortSignal
): Promise<MockExamPaperDetailDto> {
  return request<MockExamPaperDetailDto>('/mock-exam-papers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getMockExamPaper(
  semesterId: string,
  paperId: string,
  signal?: AbortSignal
): Promise<MockExamPaperDetailDto> {
  return request<MockExamPaperDetailDto>(
    `/mock-exam-papers/${encodeURIComponent(paperId)}?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}

export function startMockExamAttempt(
  paperId: string,
  data: StartMockExamAttemptRequest,
  signal?: AbortSignal
): Promise<MockExamAttemptDetailDto> {
  return request<MockExamAttemptDetailDto>(`/mock-exam-papers/${encodeURIComponent(paperId)}/attempts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export function getMockExamAttempt(
  semesterId: string,
  attemptId: string,
  signal?: AbortSignal
): Promise<MockExamAttemptDetailDto> {
  return request<MockExamAttemptDetailDto>(
    `/mock-exam-attempts/${encodeURIComponent(attemptId)}?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}

export function submitMockExamAttempt(
  attemptId: string,
  data: SubmitMockExamAttemptRequest,
  signal?: AbortSignal
): Promise<SubmitMockExamAttemptResponse> {
  return request<SubmitMockExamAttemptResponse>(`/mock-exam-attempts/${encodeURIComponent(attemptId)}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}
