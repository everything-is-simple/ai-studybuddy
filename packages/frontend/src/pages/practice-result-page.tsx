import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPracticeSession } from '../api/practice-runner-api';
import { getKnowledgeModules } from '../api/note-builder-api';
import { AppNavigation } from '../components/app-navigation';
import { FeedbackMessage } from '../components/feedback-message';
import { PracticeResultItem } from '../components/practice-result-item';
import { usePracticeDraft } from '../hooks/use-practice-draft';
import { useApiRequest } from '../hooks/use-api-request';

interface PracticeResultPageProps {
  semesterId: string | null;
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

export function PracticeResultPage({ semesterId }: PracticeResultPageProps) {
  const { sessionId = '' } = useParams();
  const { draft } = usePracticeDraft(semesterId ?? '', sessionId);
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!semesterId || !sessionId || !draft.result) return null;
      const session = await getPracticeSession(semesterId, sessionId, signal);
      const modules = await getKnowledgeModules(semesterId, session.courseInstanceId, signal);
      return { session, modules: modules.items };
    },
    [draft.result, semesterId, sessionId]
  );
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);

  if (!semesterId) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能查看练习结果。" />
      </div>
    );
  }

  if (!draft.result) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage state="empty" message="未找到本次练习结果。结果仅在同一浏览器会话内可恢复。" />
        <Link className="button-link" to="/courses">
          返回课程与考试
        </Link>
      </div>
    );
  }

  const result = draft.result;
  const answerByQuestionId = new Map(result.answers.map((answer) => [answer.questionId, answer]));
  const moduleById = new Map((data?.modules ?? []).map((module) => [module.id, module]));
  return (
    <div className="page practice-result-page">
      <AppNavigation />
      <Link to="/courses">返回课程与考试</Link>
      <header className="card practice-result-summary">
        <p className="workbench-eyebrow">练习结果</p>
        <h1>
          {result.totalScore} / {result.questionCount}
        </h1>
        <dl>
          <div>
            <dt>正确率</dt>
            <dd>{formatPercent(result.correctRate)}</dd>
          </div>
          <div>
            <dt>总用时</dt>
            <dd>{formatDuration(result.totalDurationSeconds)}</dd>
          </div>
          <div>
            <dt>限时状态</dt>
            <dd>{result.overtime ? '已超时提交' : '未超时'}</dd>
          </div>
        </dl>
      </header>
      {loading && <FeedbackMessage state="loading" message="正在补充题目详情…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {data && data.session.sessionKind === 'mistake_redo' && data.session.originMistakeId && (
        <section className="card" data-testid="redo-result-nav">
          <p>
            这是一次错题重做。
            {result.totalScore === result.questionCount
              ? '重做通过，掌握证据已记录。'
              : '重做未通过，这道题会保持需要复习状态。'}
          </p>
          <Link className="button-link" to={`/mistakes/${data.session.originMistakeId}`}>
            返回错题详情
          </Link>
        </section>
      )}
      {data &&
        data.session.sessionKind !== 'mistake_redo' &&
        result.totalScore < result.questionCount &&
        data.session.assessmentAttemptId && (
          <section className="card" data-testid="mistake-entry">
            <p>{result.questionCount - result.totalScore} 道错题已进入错题本，建议尽快复盘。</p>
            <Link className="button-link" to={`/exams/${data.session.assessmentAttemptId}/mistakes`}>
              打开错题本
            </Link>
          </section>
        )}
      {data && (
        <section className="practice-result-list" aria-label="逐题批改结果">
          {data.session.questions.map((question) => {
            const answer = answerByQuestionId.get(question.id);
            return answer ? (
              <PracticeResultItem key={question.id} question={question} answer={answer} moduleTitle={moduleById.get(question.knowledgeModuleId)?.title} />
            ) : null;
          })}
        </section>
      )}
    </div>
  );
}

export default PracticeResultPage;
