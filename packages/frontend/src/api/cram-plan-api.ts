import type { CramPlanResponseDto } from '@ai-studybuddy/shared';
import { request } from './api-client';

export function getCramPlan(
  semesterId: string,
  assessmentAttemptId: string,
  signal?: AbortSignal
): Promise<CramPlanResponseDto> {
  return request<CramPlanResponseDto>(
    `/assessment-attempts/${encodeURIComponent(assessmentAttemptId)}/cram-plan?semesterId=${encodeURIComponent(semesterId)}`,
    { signal }
  );
}
