import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CramPlanSuggestionDto } from '@ai-studybuddy/shared';
import { getCramPlan } from '../api/cram-plan-api';
import { getExam } from '../api/study-rhythm-api';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';

interface CramPlanPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

const SOURCE_LABELS: Record<CramPlanSuggestionDto['sourceKind'], string> = {
  study_task: '考试前任务',
  weak_point: '薄弱点证据',
  mistake: '待复习错题',
  practice_performance: '练习表现',
  cram_cards: '临考速背',
};

function formatDate(date: string): string {
  const [, month = '', day = ''] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  return month && day ? `${Number(month)} 月 ${Number(day)} 日` : date;
}

function targetPath(
  suggestion: CramPlanSuggestionDto,
  semesterId: string,
  examId: string,
  courseInstanceId: string
): string {
  const encodedExamId = encodeURIComponent(examId);
  if (suggestion.targetType === 'study_task') return `/exams/${encodedExamId}`;
  if (suggestion.targetType === 'weak_point' || suggestion.targetType === 'mistake') return `/exams/${encodedExamId}/mistakes`;
  if (suggestion.targetType === 'practice_history') {
    return `/semesters/${encodeURIComponent(semesterId)}/practice-history?courseInstanceId=${encodeURIComponent(courseInstanceId)}`;
  }
  return `/exams/${encodedExamId}/cram`;
}

export function CramPlanPage({ semesterId, onSemesterError }: CramPlanPageProps) {
  const { examId = '' } = useParams();
  const fetcher = useCallback(async (signal: AbortSignal) => {
    if (!semesterId || !examId) return null;
    const exam = await getExam(semesterId, examId, signal);
    if (exam.confirmationStatus !== 'confirmed') return { exam, plan: null };
    const plan = await getCramPlan(semesterId, examId, signal);
    return { exam, plan };
  }, [examId, semesterId]);
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);
  const currentData = data?.exam.id === examId ? data : null;
  const daysWithSuggestions = useMemo(
    () => (currentData?.plan?.days ?? []).filter((day) => day.suggestions.length > 0),
    [currentData?.plan?.days]
  );

  if (!semesterId) {
    return <div className="page"><FeedbackMessage state="empty" message="请先创建或选择当前学期，才能查看冲刺计划。" /></div>;
  }
  if (error && (error.includes('学期不存在') || error.includes('学期尚未就绪'))) onSemesterError?.();

  const workbenchPath = examId ? `/exams/${encodeURIComponent(examId)}` : '/courses';
  const mistakePath = examId ? `/exams/${encodeURIComponent(examId)}/mistakes` : '/courses';
  const practicePath = examId ? `/exams/${encodeURIComponent(examId)}/practice` : '/courses';
  const cramPath = examId ? `/exams/${encodeURIComponent(examId)}/cram` : '/courses';
  const materialPath = currentData?.exam.courseInstanceId ? `/materials?courseInstanceId=${encodeURIComponent(currentData.exam.courseInstanceId)}` : '/materials';

  return (
    <div className="page cram-plan-page">
      <Link to={workbenchPath}>返回考试项目</Link>
      {loading && !currentData && <FeedbackMessage state="loading" message="正在生成冲刺计划…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {currentData && (
        <>
          <ExamContextNav examId={currentData.exam.id} courseInstanceId={currentData.exam.courseInstanceId} active="cram_plan" />
          <header className="card cram-plan-header">
            <p className="workbench-eyebrow">考前集中复习 · 冲刺计划</p>
            <h1>{currentData.exam.name} 的冲刺计划</h1>
            <p className="text-muted">建议只读取当前已确认考试的课程任务、练习与错题事实；所有入口仅导航，不会自动写入完成状态。</p>
          </header>
          {currentData.exam.confirmationStatus !== 'confirmed' && <FeedbackMessage state="empty" message="请先确认考试信息，确认后才能生成冲刺计划。" />}
          {currentData.exam.confirmationStatus === 'confirmed' && currentData.plan?.availability === 'not_started' && (
            <section className="card cram-plan-state" data-testid="cram-plan-not-started">
              <h2>尚未进入冲刺窗口</h2>
              <p>考试还有 {currentData.plan.daysUntilExam} 天；进入考前 7 天后会生成每日可执行建议。</p>
            </section>
          )}
          {currentData.exam.confirmationStatus === 'confirmed' && currentData.plan?.availability === 'ended' && (
            <section className="card cram-plan-state" data-testid="cram-plan-ended">
              <h2>冲刺期已结束</h2>
              <p>该考试日期已过，计划不会再生成新的复习建议。</p>
            </section>
          )}
          {currentData.exam.confirmationStatus === 'confirmed' && currentData.plan?.availability === 'available' && daysWithSuggestions.length === 0 && (
            <section className="card cram-plan-state" data-testid="cram-plan-empty">
              <h2>暂时没有可安全生成的建议</h2>
              <p>你仍可从既有学习入口开始人工复习；不会伪造建议或改写历史学习事实。</p>
              <ManualLinks practicePath={practicePath} mistakePath={mistakePath} cramPath={cramPath} materialPath={materialPath} />
            </section>
          )}
          {currentData.exam.confirmationStatus === 'confirmed' && currentData.plan?.availability === 'available' && daysWithSuggestions.length > 0 && (
            <section className="cram-plan-days" aria-label="每日冲刺建议" data-testid="cram-plan-days">
              <p className="text-muted">距离考试 {currentData.plan.daysUntilExam} 天 · 每项建议只提供前往既有学习页面的入口。</p>
              {daysWithSuggestions.map((day) => (
                <article className="card cram-plan-day" key={day.date}>
                  <h2>{formatDate(day.date)}</h2>
                  <ul>
                    {day.suggestions.map((suggestion) => (
                      <li key={suggestion.id} className="cram-plan-suggestion">
                        <div><strong>{SOURCE_LABELS[suggestion.sourceKind]}</strong><p>{suggestion.reason}</p></div>
                        <Link className="button-link" to={targetPath(suggestion, semesterId, currentData.exam.id, currentData.exam.courseInstanceId)}>前往复习</Link>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              <section className="card cram-plan-manual"><h2>需要补充复习？</h2><ManualLinks practicePath={practicePath} mistakePath={mistakePath} cramPath={cramPath} materialPath={materialPath} /></section>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ManualLinks({ practicePath, mistakePath, cramPath, materialPath }: { practicePath: string; mistakePath: string; cramPath: string; materialPath: string }) {
  return <div className="cram-manual-links"><Link className="button-link" to={practicePath}>开始练习</Link><Link className="button-link" to={mistakePath}>查看错题本</Link><Link className="button-link" to={cramPath}>临考速背</Link><Link className="button-link" to={materialPath}>查看知识资料</Link></div>;
}

export default CramPlanPage;