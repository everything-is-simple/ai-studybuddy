import { useCallback, useEffect, useState } from 'react';
import type { SubmitMockExamAttemptResponse } from '@ai-studybuddy/shared';

export interface MockExamDraft {
  version: 1;
  attemptId: string;
  activeQuestionIndex: number;
  answers: Record<string, string>;
  questionSeconds: Record<string, number>;
  totalDurationSeconds: number;
  result?: SubmitMockExamAttemptResponse;
}

interface UseMockExamDraftOptions {
  canPersist?: boolean;
}

function storageKey(semesterId: string, attemptId: string): string {
  return `ai-studybuddy:mock-exam:${semesterId}:${attemptId}`;
}

export function createEmptyMockExamDraft(attemptId: string): MockExamDraft {
  return {
    version: 1,
    attemptId,
    activeQuestionIndex: 0,
    answers: {},
    questionSeconds: {},
    totalDurationSeconds: 0,
  };
}

function isStringRecord(value: unknown, allowedIds: Set<string>): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.entries(value).every(([questionId, answer]) => allowedIds.has(questionId) && typeof answer === 'string')
  );
}

function isSecondsRecord(value: unknown, allowedIds: Set<string>): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.entries(value).every(
      ([questionId, seconds]) =>
        allowedIds.has(questionId) && typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    )
  );
}

function isResult(value: unknown): value is SubmitMockExamAttemptResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SubmitMockExamAttemptResponse).status === 'graded' &&
    Array.isArray((value as SubmitMockExamAttemptResponse).answers) &&
    Array.isArray((value as SubmitMockExamAttemptResponse).moduleAnalyses)
  );
}

function isDraft(value: unknown, attemptId: string, questionIds: readonly string[]): value is MockExamDraft {
  const allowedIds = new Set(questionIds);
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MockExamDraft>;
  return (
    candidate.version === 1 &&
    candidate.attemptId === attemptId &&
    typeof candidate.activeQuestionIndex === 'number' &&
    Number.isInteger(candidate.activeQuestionIndex) &&
    candidate.activeQuestionIndex >= 0 &&
    candidate.activeQuestionIndex < Math.max(questionIds.length, 1) &&
    isStringRecord(candidate.answers, allowedIds) &&
    isSecondsRecord(candidate.questionSeconds, allowedIds) &&
    typeof candidate.totalDurationSeconds === 'number' &&
    Number.isFinite(candidate.totalDurationSeconds) &&
    candidate.totalDurationSeconds >= 0 &&
    (candidate.result === undefined || isResult(candidate.result))
  );
}

export function readMockExamDraft(
  semesterId: string,
  attemptId: string,
  questionIds: readonly string[]
): MockExamDraft {
  if (!semesterId || !attemptId) return createEmptyMockExamDraft(attemptId);
  try {
    const raw = window.sessionStorage.getItem(storageKey(semesterId, attemptId));
    if (!raw) return createEmptyMockExamDraft(attemptId);
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed, attemptId, questionIds) ? parsed : createEmptyMockExamDraft(attemptId);
  } catch {
    return createEmptyMockExamDraft(attemptId);
  }
}

export function writeMockExamDraft(semesterId: string, attemptId: string, draft: MockExamDraft): void {
  if (!semesterId || !attemptId) return;
  try {
    window.sessionStorage.setItem(storageKey(semesterId, attemptId), JSON.stringify(draft));
  } catch {
    // 存储不可用时保留页面内状态；不把浏览器存储问题暴露给学生。
  }
}

export function clearMockExamDraft(semesterId: string, attemptId: string): void {
  if (!semesterId || !attemptId) return;
  try {
    window.sessionStorage.removeItem(storageKey(semesterId, attemptId));
  } catch {
    // 与写入一样，存储不可用不应阻断页面退出或提交成功后的导航。
  }
}

function withoutAnswerFields(draft: MockExamDraft): MockExamDraft {
  return {
    ...createEmptyMockExamDraft(draft.attemptId),
    ...(draft.result ? { result: draft.result } : {}),
  };
}

export function useMockExamDraft(
  semesterId: string,
  attemptId: string,
  questionIds: readonly string[],
  { canPersist = true }: UseMockExamDraftOptions = {}
) {
  const questionIdsKey = questionIds.join('');
  const [draft, setDraft] = useState<MockExamDraft>(() => createEmptyMockExamDraft(attemptId));
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
    if (!semesterId || !attemptId || questionIds.length === 0) {
      setDraft(createEmptyMockExamDraft(attemptId));
      return;
    }
    setDraft(readMockExamDraft(semesterId, attemptId, questionIds));
    setIsHydrated(true);
  }, [semesterId, attemptId, questionIdsKey]);

  useEffect(() => {
    if (isHydrated && canPersist && questionIds.length > 0) writeMockExamDraft(semesterId, attemptId, draft);
  }, [attemptId, canPersist, draft, isHydrated, questionIdsKey, semesterId]);

  const replaceDraft = useCallback(
    (next: MockExamDraft) => {
      setDraft(next);
      writeMockExamDraft(semesterId, attemptId, next);
    },
    [semesterId, attemptId]
  );

  const updateDraft = useCallback((updater: (current: MockExamDraft) => MockExamDraft) => {
    setDraft(updater);
  }, []);

  const completeDraft = useCallback(
    (result: SubmitMockExamAttemptResponse) => {
      replaceDraft({ ...createEmptyMockExamDraft(attemptId), result });
    },
    [attemptId, replaceDraft]
  );

  const clearAnswerFields = useCallback(() => {
    setDraft((current) => {
      const next = withoutAnswerFields(current);
      writeMockExamDraft(semesterId, attemptId, next);
      return next;
    });
  }, [semesterId, attemptId]);

  return { draft, isHydrated, replaceDraft, updateDraft, completeDraft, clearAnswerFields };
}
