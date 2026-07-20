import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getMockExamPaper, startMockExamAttempt } from '../api/mock-exam-api';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';
import { createEmptyMockExamDraft, writeMockExamDraft } from '../hooks/use-mock-exam-draft';

interface MockExamPaperPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

export function MockExamPaperPage({ semesterId, onSemesterError }: MockExamPaperPageProps) {
  const { paperId = '' } = useParams();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId || !paperId) return Promise.resolve(null);
      return getMockExamPaper(semesterId, paperId, signal);
    },
    [paperId, semesterId]
  );
  const { data: paper, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);

  const handleStart = async () => {
    if (!semesterId || !paper || paper.questions.length === 0 || starting) return;
    setStarting(true);
    setActionError(null);
    try {
      const attempt = await startMockExamAttempt(paper.id, { semesterId });
      writeMockExamDraft(semesterId, attempt.id, createEmptyMockExamDraft(attempt.id));
      navigate(`/mock-exam-attempts/${encodeURIComponent(attempt.id)}`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '开始模拟考失败，请稍后重试';
      setActionError(message);
      if (message.includes('学期不存在')) onSemesterError?.();
    } finally {
      setStarting(false);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能查看模拟卷。" />
      </div>
    );
  }

  return (
    <div className="page mock-exam-paper-page">
      {loading && !paper && <FeedbackMessage state="loading" message="正在加载模拟卷…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {actionError && <FeedbackMessage state="error" message={actionError} />}
      {paper && (
        <>
          <Link to={`/exams/${encodeURIComponent(paper.assessmentAttemptId)}/mock-exam`}>返回模拟考入口</Link>
          <ExamContextNav examId={paper.assessmentAttemptId} courseInstanceId={paper.courseInstanceId} active="mock_exam" />
          <header className="card">
            <p className="workbench-eyebrow">模拟卷</p>
            <h1>{paper.title}</h1>
            <p>
              {paper.questionCount} 题 · 共 {paper.totalPoints} 分 · 限时 {paper.timeLimitSeconds} 秒
            </p>
            <p>覆盖 {paper.sourceSummary.moduleCount} 个知识模块；本次作答开始后将进入独立尝试。</p>
          </header>
          {paper.questions.length === 0 ? (
            <section className="card">
              <FeedbackMessage state="empty" message="该模拟卷暂无可作答题目，请返回入口重新生成。" />
            </section>
          ) : (
            <section className="card">
              <h2>开始作答</h2>
              <p>题目答案和解析将在提交批改后显示。</p>
              <button type="button" onClick={() => void handleStart()} disabled={starting}>
                {starting ? '正在开始模拟考…' : '开始答题'}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default MockExamPaperPage;
