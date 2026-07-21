import type { CramFlashcardResponseDto } from '@ai-studybuddy/shared';
import { request } from './api-client';

export function getCramCards(
  semesterId: string,
  assessmentAttemptId: string,
  signal?: AbortSignal
): Promise<CramFlashcardResponseDto> {
  return request<CramFlashcardResponseDto>(
    `/assessment-attempts/${encodeURIComponent(assessmentAttemptId)}/cram-cards?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}
