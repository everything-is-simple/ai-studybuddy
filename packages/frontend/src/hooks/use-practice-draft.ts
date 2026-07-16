import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PracticeSessionDetailDto, SubmitPracticeSessionResponse } from '@ai-studybuddy/shared';

export interface PracticeDraft {
  version: 1;
  sessionId: string;
  activeQuestionIndex: number;
  answers: Record<string, string>;
  questionSeconds: Record<string, number>;
  totalDurationSeconds: number;
  session?: PracticeSessionDetailDto;
  result?: SubmitPracticeSessionResponse;
}

function storageKey(semesterId: string, sessionId: string): string {
  return `ai-studybuddy:practice:${semesterId}:${sessionId}`;
}

function emptyDraft(sessionId: string): PracticeDraft {
  return {
    version: 1,
    sessionId,
    activeQuestionIndex: 0,
    answers: {},
    questionSeconds: {},
    totalDurationSeconds: 0,
  };
}

function isDraft(value: unknown, sessionId: string): value is PracticeDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PracticeDraft).version === 1 &&
    (value as PracticeDraft).sessionId === sessionId &&
    typeof (value as PracticeDraft).answers === 'object' &&
    typeof (value as PracticeDraft).questionSeconds === 'object' &&
    typeof (value as PracticeDraft).totalDurationSeconds === 'number'
  );
}

export function readPracticeDraft(semesterId: string, sessionId: string): PracticeDraft {
  if (!semesterId || !sessionId) return emptyDraft(sessionId);
  try {
    const raw = window.sessionStorage.getItem(storageKey(semesterId, sessionId));
    if (!raw) return emptyDraft(sessionId);
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed, sessionId) ? parsed : emptyDraft(sessionId);
  } catch {
    return emptyDraft(sessionId);
  }
}

export function writePracticeDraft(semesterId: string, sessionId: string, draft: PracticeDraft): void {
  if (!semesterId || !sessionId) return;
  try {
    window.sessionStorage.setItem(storageKey(semesterId, sessionId), JSON.stringify(draft));
  } catch {
    // 浏览器禁用存储时仍可完成当前页面内的练习；不把存储错误暴露给学生。
  }
}

export function usePracticeDraft(semesterId: string, sessionId: string) {
  const initial = useMemo(() => readPracticeDraft(semesterId, sessionId), [semesterId, sessionId]);
  const [draft, setDraft] = useState<PracticeDraft>(initial);

  useEffect(() => setDraft(readPracticeDraft(semesterId, sessionId)), [semesterId, sessionId]);
  useEffect(() => writePracticeDraft(semesterId, sessionId, draft), [draft, semesterId, sessionId]);

  const replaceDraft = useCallback(
    (next: PracticeDraft) => {
      setDraft(next);
      writePracticeDraft(semesterId, sessionId, next);
    },
    [semesterId, sessionId]
  );

  const updateDraft = useCallback(
    (updater: (current: PracticeDraft) => PracticeDraft) => {
      setDraft((current) => {
        const next = updater(current);
        writePracticeDraft(semesterId, sessionId, next);
        return next;
      });
    },
    [semesterId, sessionId]
  );

  return { draft, replaceDraft, updateDraft };
}
