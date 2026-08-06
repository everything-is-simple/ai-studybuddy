import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MockExamAttemptDetailDto, MockExamPaperDetailDto } from '@ai-studybuddy/shared';
import { ApiClientError } from '../api/api-client';
import { getMockExamAttempt, getMockExamPaper, submitMockExamAttempt } from '../api/mock-exam-api';
import { FeedbackMessage } from '../components/feedback-message';
import { MockExamQuestion } from '../components/mock-exam-question';
import { useMockExamDraft } from '../hooks/use-mock-exam-draft';
import { usePracticeTimer } from '../hooks/use-practice-timer';
import { useApiRequest } from '../hooks/use-api-request';

interface MockExamSessionPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

interface SessionData {
  attempt: MockExamAttemptDetailDto;
  paper: MockExamPaperDetailDto;
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function MockExamSessionPage({ semesterId, onSemesterError }: MockExamSessionPageProps) {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lockedAttempt, setLockedAttempt] = useState<MockExamAttemptDetailDto | null>(null);
  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<SessionData | null> => {
      if (!semesterId || !attemptId) return null;
      const attempt = await getMockExamAttempt(semesterId, attemptId, signal);
      const paper = await getMockExamPaper(semesterId, attempt.paperId, signal);
      return { attempt, paper };
    },
    [attemptId, semesterId]
  );
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);
  const attempt = lockedAttempt ?? data?.attempt ?? null;
  const questions = attempt?.questions ?? [];
  const questionIds = useMemo(() => questions.map((question) => question.id), [questions]);
  const { draft, isHydrated, updateDraft, completeDraft, clearAnswerFields } = useMockExamDraft(
    semesterId ?? '',
    attemptId,
    questionIds,
    { canPersist: attempt?.status === 'in_progress' }
  );
  const activeIndex = Math.min(Math.max(0, draft.activeQuestionIndex), Math.max(questions.length - 1, 0));
  const activeQuestion = questions[activeIndex];
  const timer = usePracticeTimer({
    activeQuestionId: isHydrated && attempt?.status === 'in_progress' ? (activeQuestion?.id ?? null) : null,
    initialTotalSeconds: draft.totalDurationSeconds,
    initialQuestionSeconds: draft.questionSeconds,
    timeLimitSeconds: data?.paper.timeLimitSeconds ?? null,
    restoreKey: isHydrated && attempt?.status === 'in_progress' ? attempt.id : null,
  });

  useEffect(() => {
    if (!isHydrated || !attempt || attempt.status !== 'in_progress' || questions.length === 0) return;
    updateDraft((current) => ({
      ...current,
      activeQuestionIndex: activeIndex,
      totalDurationSeconds: timer.totalDurationSeconds,
      questionSeconds: timer.questionSeconds,
    }));
  }, [
    activeIndex,
    attempt?.id,
    attempt?.status,
    isHydrated,
    questions.length,
    timer.questionSeconds,
    timer.totalDurationSeconds,
    updateDraft,
  ]);

  useEffect(() => {
    if (isHydrated && attempt && attempt.status !== 'in_progress') clearAnswerFields();
  }, [attempt?.id, attempt?.status, clearAnswerFields, isHydrated]);

  const answeredCount = useMemo(
    () => questions.filter((question) => Boolean(draft.answers[question.id]?.trim())).length,
    [draft.answers, questions]
  );

  const handleSubmit = async () => {
    if (!semesterId || !isHydrated || !attempt || attempt.status !== 'in_progress' || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitMockExamAttempt(attemptId, {
        semesterId,
        answers: questions.map((question) => ({
          questionId: question.id,
          answer: draft.answers[question.id]?.trim() || null,
          timeSpentSeconds: timer.questionSeconds[question.id] ?? 0,
        })),
        totalDurationSeconds: timer.totalDurationSeconds,
      });
      completeDraft(result);
      navigate(`/mock-exam-attempts/${encodeURIComponent(attemptId)}/result`);
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.code === 'MOCK_EXAM_ATTEMPT_STATE_INVALID') {
        try {
          const refreshed = await getMockExamAttempt(semesterId, attemptId);
          if (refreshed.status !== 'in_progress') {
            setLockedAttempt(refreshed);
            clearAnswerFields();
          } else setSubmitError('提交状态已刷新，请确认后重试。');
        } catch {
          setSubmitError('提交状态刷新失败，请稍后重试。');
        }
      } else {
        const message = caughtError instanceof Error ? caughtError.message : '提交模拟考失败，请稍后重试';
        setSubmitError(message);
        if (message.includes('学期不存在')) onSemesterError?.();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setConfirming(false);
    }
  };

  if (!semesterId)
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能继续作答。" />
      </div>
    );

  return (
    <div className="page mock-exam-session-page">
      <Link to="/courses">返回课程与考试</Link>
      {loading && !data && <FeedbackMessage state="loading" message="正在读取模拟考题目…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {submitError && <FeedbackMessage state="error" message={submitError} />}
      {attempt && attempt.status !== 'in_progress' && (
        <section className="card">
          <FeedbackMessage state="empty" message="该模拟考已提交，不能再次修改答案。" />
          <Link className="button-link" to={`/mock-exam-attempts/${encodeURIComponent(attempt.id)}/result`}>
            查看结果
          </Link>
        </section>
      )}
      {data && !isHydrated && attempt?.status === 'in_progress' && (
        <FeedbackMessage state="loading" message="正在恢复本次模拟考作答进度…" />
      )}
      {data && isHydrated && attempt?.status === 'in_progress' && activeQuestion && (
        <>
          <header className="card practice-session-header">
            <div>
              <p className="workbench-eyebrow">模拟考作答</p>
              <h1>
                第 {activeIndex + 1} / {questions.length} 题
              </h1>
              <p>已作答 {answeredCount} 题</p>
            </div>
            <div className={timer.isOvertime ? 'practice-timer practice-overtime' : 'practice-timer'}>
              <span>{timer.isOvertime ? '已超时' : '剩余时间'}</span>
              <strong>{formatSeconds(timer.remainingSeconds ?? timer.totalDurationSeconds)}</strong>
              {timer.isOvertime && <small>超时后仍可提交，最终状态由服务端判定。</small>}
            </div>
          </header>
          <div className="practice-question-nav" aria-label="题目导航">
            {questions.map((question, index) => (
              <button
                type="button"
                key={question.id}
                disabled={submitting || !isHydrated}
                className={index === activeIndex ? 'active' : undefined}
                onClick={() => updateDraft((current) => ({ ...current, activeQuestionIndex: index }))}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <MockExamQuestion
            question={activeQuestion}
            value={draft.answers[activeQuestion.id] ?? ''}
            disabled={submitting || !isHydrated}
            onChange={(answer) =>
              updateDraft((current) => ({ ...current, answers: { ...current.answers, [activeQuestion.id]: answer } }))
            }
          />
          {confirming ? (
            <section className="card" aria-label="提交确认">
              <h2>确认提交</h2>
              <p>
                已答 {answeredCount} 题，未答 {questions.length - answeredCount} 题；总用时{' '}
                {formatSeconds(timer.totalDurationSeconds)}。
              </p>
              <button type="button" disabled={submitting || !isHydrated} onClick={() => void handleSubmit()}>
                {submitting ? '正在提交并批改…' : '确认提交'}
              </button>
              <button type="button" disabled={submitting || !isHydrated} onClick={() => setConfirming(false)}>
                继续作答
              </button>
            </section>
          ) : (
            <div className="practice-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={submitting || !isHydrated || activeIndex === 0}
                onClick={() => updateDraft((current) => ({ ...current, activeQuestionIndex: activeIndex - 1 }))}
              >
                上一题
              </button>
              <button
                type="button"
                disabled={submitting || !isHydrated || activeIndex === questions.length - 1}
                onClick={() => updateDraft((current) => ({ ...current, activeQuestionIndex: activeIndex + 1 }))}
              >
                下一题
              </button>
              <button type="button" disabled={submitting || !isHydrated} onClick={() => setConfirming(true)}>
                提交模拟考
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MockExamSessionPage;
