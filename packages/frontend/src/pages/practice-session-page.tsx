import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PracticeSessionDetailDto } from '@ai-studybuddy/shared';
import { getPracticeSession, submitPracticeSession } from '../api/practice-runner-api';
import { FeedbackMessage } from '../components/feedback-message';
import { PracticeQuestion } from '../components/practice-question';
import { usePracticeDraft } from '../hooks/use-practice-draft';
import { usePracticeTimer } from '../hooks/use-practice-timer';
import { useApiRequest } from '../hooks/use-api-request';

interface PracticeSessionPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function PracticeSessionPage({ semesterId, onSemesterError }: PracticeSessionPageProps) {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { draft, updateDraft, replaceDraft } = usePracticeDraft(semesterId ?? '', sessionId);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fetcher = useCallback(
    (signal: AbortSignal): Promise<PracticeSessionDetailDto | null> => {
      if (!semesterId || !sessionId) return Promise.resolve(null);
      return getPracticeSession(semesterId, sessionId, signal);
    },
    [semesterId, sessionId]
  );
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);
  const questions = data?.questions ?? [];
  const activeIndex = Math.min(Math.max(0, draft.activeQuestionIndex), Math.max(questions.length - 1, 0));
  const activeQuestion = questions[activeIndex];
  const timer = usePracticeTimer({
    activeQuestionId: activeQuestion?.id ?? null,
    initialTotalSeconds: draft.totalDurationSeconds,
    initialQuestionSeconds: draft.questionSeconds,
    timeLimitSeconds: data?.timeLimitSeconds ?? null,
  });

  useEffect(() => {
    if (!data) return;
    updateDraft((current) => ({ ...current, session: data, activeQuestionIndex: activeIndex }));
    // 仅在读取到新的服务端题目时写入，避免计时器刷新时覆盖本地草稿。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  useEffect(() => {
    if (!data) return;
    updateDraft((current) => ({
      ...current,
      activeQuestionIndex: activeIndex,
      totalDurationSeconds: timer.totalDurationSeconds,
      questionSeconds: timer.questionSeconds,
    }));
  }, [activeIndex, data, timer.questionSeconds, timer.totalDurationSeconds, updateDraft]);

  const answeredCount = useMemo(
    () => questions.filter((question) => Boolean(draft.answers[question.id]?.trim())).length,
    [draft.answers, questions]
  );

  const handleSubmit = async () => {
    if (!semesterId || !data || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitPracticeSession(sessionId, {
        semesterId,
        answers: questions.map((question) => ({
          questionId: question.id,
          answer: draft.answers[question.id]?.trim() || null,
          timeSpentSeconds: timer.questionSeconds[question.id] ?? 0,
        })),
        totalDurationSeconds: timer.totalDurationSeconds,
      });
      replaceDraft({
        ...draft,
        activeQuestionIndex: activeIndex,
        totalDurationSeconds: timer.totalDurationSeconds,
        questionSeconds: timer.questionSeconds,
        session: data,
        result,
      });
      navigate(`/practice-sessions/${encodeURIComponent(sessionId)}/result`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '提交练习失败，请稍后重试';
      setSubmitError(message);
      if (message.includes('学期不存在')) onSemesterError?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能继续作答。" />
      </div>
    );
  }

  return (
    <div className="page practice-session-page">
      <Link to="/courses">返回课程与考试</Link>
      {loading && !data && <FeedbackMessage state="loading" message="正在读取练习题目…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {submitError && <FeedbackMessage state="error" message={submitError} />}
      {data && data.status !== 'in_progress' && (
        <FeedbackMessage state="empty" message="这套练习已提交，不能再次修改答案。" />
      )}
      {data && data.status === 'in_progress' && activeQuestion && (
        <>
          <header className="card practice-session-header">
            <div>
              <p className="workbench-eyebrow">限时练习</p>
              <h1>
                第 {activeIndex + 1} / {questions.length} 题
              </h1>
              <p>已作答 {answeredCount} 题</p>
            </div>
            <div className={timer.isOvertime ? 'practice-timer practice-overtime' : 'practice-timer'}>
              <span>{data.timeLimitSeconds === null ? '已用时间' : timer.isOvertime ? '已超时' : '剩余时间'}</span>
              <strong>{formatSeconds(data.timeLimitSeconds === null ? timer.totalDurationSeconds : timer.remainingSeconds ?? 0)}</strong>
              {timer.isOvertime && <small>超时后仍可继续作答并提交</small>}
            </div>
          </header>
          <div className="practice-question-nav" aria-label="题目导航">
            {questions.map((question, index) => (
              <button
                type="button"
                key={question.id}
                className={index === activeIndex ? 'active' : undefined}
                aria-label={`第 ${index + 1} 题${draft.answers[question.id]?.trim() ? '，已作答' : '，未作答'}`}
                onClick={() => updateDraft((current) => ({ ...current, activeQuestionIndex: index }))}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <PracticeQuestion
            question={activeQuestion}
            value={draft.answers[activeQuestion.id] ?? ''}
            disabled={submitting}
            onChange={(answer) =>
              updateDraft((current) => ({ ...current, answers: { ...current.answers, [activeQuestion.id]: answer } }))
            }
          />
          <div className="practice-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={submitting || activeIndex === 0}
              onClick={() => updateDraft((current) => ({ ...current, activeQuestionIndex: activeIndex - 1 }))}
            >
              上一题
            </button>
            {activeIndex < questions.length - 1 ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => updateDraft((current) => ({ ...current, activeQuestionIndex: activeIndex + 1 }))}
              >
                下一题
              </button>
            ) : (
              <button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
                {submitting ? '正在提交并批改…' : '提交练习'}
              </button>
            )}
          </div>
          {activeIndex < questions.length - 1 && (
            <button type="button" className="practice-submit-link" disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? '正在提交并批改…' : '现在提交练习'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default PracticeSessionPage;
