import { useEffect, useMemo, useRef, useState } from 'react';

interface UsePracticeTimerOptions {
  activeQuestionId: string | null;
  initialTotalSeconds: number;
  initialQuestionSeconds: Record<string, number>;
  timeLimitSeconds: number | null;
  restoreKey?: string | null;
}

export interface PracticeTimerState {
  totalDurationSeconds: number;
  questionSeconds: Record<string, number>;
  remainingSeconds: number | null;
  isOvertime: boolean;
}

export function usePracticeTimer({
  activeQuestionId,
  initialTotalSeconds,
  initialQuestionSeconds,
  timeLimitSeconds,
  restoreKey,
}: UsePracticeTimerOptions): PracticeTimerState {
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(initialTotalSeconds);
  const [questionSeconds, setQuestionSeconds] = useState(initialQuestionSeconds);
  const lastTickRef = useRef<number | null>(null);
  const activeQuestionRef = useRef(activeQuestionId);

  useEffect(() => {
    if (!restoreKey) return;
    setTotalDurationSeconds(initialTotalSeconds);
    setQuestionSeconds(initialQuestionSeconds);
    lastTickRef.current = performance.now();
  }, [restoreKey]);

  useEffect(() => {
    activeQuestionRef.current = activeQuestionId;
    lastTickRef.current = performance.now();
  }, [activeQuestionId]);

  useEffect(() => {
    if (!activeQuestionId) return;

    const tick = () => {
      const now = performance.now();
      const previous = lastTickRef.current ?? now;
      const deltaSeconds = Math.max(0, (now - previous) / 1000);
      lastTickRef.current = now;
      if (deltaSeconds === 0) return;
      setTotalDurationSeconds((value) => value + deltaSeconds);
      const questionId = activeQuestionRef.current;
      if (questionId) {
        setQuestionSeconds((value) => ({ ...value, [questionId]: (value[questionId] ?? 0) + deltaSeconds }));
      }
    };

    const intervalId = window.setInterval(tick, 250);
    return () => {
      tick();
      window.clearInterval(intervalId);
    };
  }, [activeQuestionId]);

  const roundedTotal = Math.max(0, Math.floor(totalDurationSeconds));
  const roundedQuestions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(questionSeconds).map(([id, seconds]) => [id, Math.max(0, Math.floor(seconds))])
      ),
    [questionSeconds]
  );
  const remainingSeconds = timeLimitSeconds === null ? null : Math.max(0, timeLimitSeconds - roundedTotal);

  return {
    totalDurationSeconds: roundedTotal,
    questionSeconds: roundedQuestions,
    remainingSeconds,
    isOvertime: timeLimitSeconds !== null && roundedTotal > timeLimitSeconds,
  };
}
