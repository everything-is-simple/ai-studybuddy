import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createMockExamPaper } from '../api/mock-exam-api';
import { getExam } from '../api/study-rhythm-api';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';

interface MockExamStartPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

export function MockExamStartPage({ semesterId, onSemesterError }: MockExamStartPageProps) {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId || !examId) return Promise.resolve(null);
      return getExam(semesterId, examId, signal);
    },
    [examId, semesterId]
  );
  const { data: exam, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);

  const handleCreate = async () => {
    if (!semesterId || !exam || exam.confirmationStatus !== 'confirmed' || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const paper = await createMockExamPaper({
        semesterId,
        courseInstanceId: exam.courseInstanceId,
        assessmentAttemptId: exam.id,
      });
      navigate(`/mock-exam-papers/${encodeURIComponent(paper.id)}`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '生成模拟卷失败，请稍后重试';
      setActionError(message);
      if (message.includes('学期不存在')) onSemesterError?.();
    } finally {
      setCreating(false);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能开始模拟考。" />
      </div>
    );
  }

  const workbenchPath = examId ? `/exams/${encodeURIComponent(examId)}` : '/courses';
  return (
    <div className="page mock-exam-start-page">
      <Link to={workbenchPath}>返回考试项目</Link>
      {loading && !exam && <FeedbackMessage state="loading" message="正在加载考试信息…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {actionError && <FeedbackMessage state="error" message={actionError} />}
      {exam && (
        <>
          <ExamContextNav examId={exam.id} courseInstanceId={exam.courseInstanceId} active="mock_exam" />
          <header className="card">
            <p className="workbench-eyebrow">模拟考</p>
            <h1>{exam.name}</h1>
            <p>生成一套基于当前确认考试的模拟卷，完成后查看成绩和知识模块分析。</p>
          </header>
          {exam.confirmationStatus !== 'confirmed' ? (
            <section className="card">
              <FeedbackMessage state="empty" message="请先确认考试信息，再生成模拟卷。" />
            </section>
          ) : (
            <section className="card">
              <h2>开始模拟考</h2>
              <p>将使用当前考试和课程范围生成模拟卷。生成后可开始一次新的模拟考尝试。</p>
              <button type="button" onClick={() => void handleCreate()} disabled={creating}>
                {creating ? '正在生成模拟卷…' : '生成模拟卷'}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default MockExamStartPage;
