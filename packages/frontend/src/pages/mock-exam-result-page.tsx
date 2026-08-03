import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMockExamAttempt } from '../api/mock-exam-api';
import { FeedbackMessage } from '../components/feedback-message';
import { MockExamModuleAnalysis } from '../components/mock-exam-module-analysis';
import { useMockExamDraft } from '../hooks/use-mock-exam-draft';
import { useApiRequest } from '../hooks/use-api-request';

interface MockExamResultPageProps { semesterId: string | null; }
function formatPercent(rate: number): string { return `${Math.round(rate * 100)}%`; }
function formatDuration(seconds: number): string { return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`; }

export function MockExamResultPage({ semesterId }: MockExamResultPageProps) {
  const { attemptId = '' } = useParams();
  const fetcher = useCallback((signal: AbortSignal) => {
    if (!semesterId || !attemptId) return Promise.resolve(null);
    return getMockExamAttempt(semesterId, attemptId, signal);
  }, [attemptId, semesterId]);
  const { data: attempt, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);
  const questionIds = useMemo(() => attempt?.questions.map((question) => question.id) ?? [], [attempt]);
  const { draft, isHydrated, clearAnswerFields } = useMockExamDraft(
    semesterId ?? '',
    attemptId,
    questionIds,
    { canPersist: attempt?.status === 'in_progress' }
  );

  useEffect(() => {
    if (isHydrated && attempt && attempt.status !== 'in_progress') clearAnswerFields();
  }, [attempt?.id, attempt?.status, clearAnswerFields, isHydrated]);

  if (!semesterId) return <div className="page"><FeedbackMessage state="empty" message="请先创建或选择当前学期，才能查看模拟考结果。" /></div>;
  const result = draft.result ?? attempt?.result ?? null;
  if (loading && !attempt) return <div className="page"><FeedbackMessage state="loading" message="正在读取模拟考状态…" /></div>;
  if (error) return <div className="page"><FeedbackMessage state="error" message={error} onRetry={refetch} /></div>;
  if (attempt?.status !== 'graded' || !result || result.status !== 'graded') {
    return <div className="page"><FeedbackMessage state="empty" message="模拟考结果暂不可用，请稍后刷新重试。" /><Link className="button-link" to={attempt ? `/exams/${encodeURIComponent(attempt.assessmentAttemptId)}/mock-exam` : '/courses'}>返回模拟考入口</Link></div>;
  }
  return (
    <div className="page mock-exam-result-page">
      <Link to={attempt ? `/exams/${encodeURIComponent(attempt.assessmentAttemptId)}/mock-exam` : '/courses'}>返回模拟考入口</Link>
      <header className="card practice-result-summary"><p className="workbench-eyebrow">模拟考结果</p><h1>{result.totalScore} / {result.totalPoints}</h1><dl><div><dt>正确率</dt><dd>{formatPercent(result.correctRate)}</dd></div><div><dt>总用时</dt><dd>{formatDuration(result.totalDurationSeconds)}</dd></div><div><dt>限时状态</dt><dd>{result.overtime ? '已超时提交' : '未超时'}</dd></div></dl></header>
      <section className="practice-result-list" aria-label="逐题批改结果">{result.answers.length === 0 ? <FeedbackMessage state="empty" message="结果详情不可用。" /> : result.answers.map((answer, index) => <article className="card" key={answer.questionId}><h2>第 {index + 1} 题 · {answer.isCorrect ? '回答正确' : '需要复盘'}</h2><p>你的答案：{answer.studentAnswer || '未作答'}</p><p>正确答案：{answer.correctAnswer}</p><p>得分：{answer.scoreAwarded} / {answer.pointValue}</p>{answer.explanation && <p>解析：{answer.explanation}</p>}</article>)}</section>
      <MockExamModuleAnalysis analyses={result.moduleAnalyses} />
    </div>
  );
}

export default MockExamResultPage;
