import type { DailyStudyHomeDto } from '@ai-studybuddy/shared';
import { request } from './api-client';

export function getDailyStudyHome(semesterId: string, date: string, signal?: AbortSignal): Promise<DailyStudyHomeDto> {
  const params = new URLSearchParams({ semesterId, date });
  return request<DailyStudyHomeDto>(`/daily-study-home?${params.toString()}`, { signal });
}
