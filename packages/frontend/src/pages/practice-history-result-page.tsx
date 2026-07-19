import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PracticeHistoryResultDto } from '@ai-studybuddy/shared';
import { getPracticeHistoryResult } from '../api/practice-runner-api';
import { PageState } from '../components/page-state';

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function PracticeHistoryResultPage() {
  const { semesterId, sessionId } = useParams();
  const [result, setResult] = useState<PracticeHistoryResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!semesterId || !sessionId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getPracticeHistoryResult(semesterId, sessionId, controller.signal)
      .then(setResult)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '练习结果加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [semesterId, sessionId]);

  if (!semesterId || !sessionId) {
    return <PageState state="error" title="缺少练习结果" message="请从练习历史列表进入结果页。" />;
  }
  if (loading) return <PageState state="loading" title="正在加载练习结果" />;
  if (error) return <PageState state="error" title="练习结果加载失败" message={error} />;
  if (!result) return <PageState state="empty" title="没有找到练习结果" />;

  return (
    <section className="page practice-history-result-page">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Phase 1-T09E</p>
          <h1>练习结果</h1>
          <p className="page-intro">只读查看历史评分结果；归档学期不会开放重新提交或修改入口。</p>
        </div>
        <Link to={`/semesters/${semesterId}/practice-history`}>返回练习历史</Link>
      </div>

      <section className="panel">
        <h2>{result.courseName}</h2>
        <p>{result.assessmentName ?? '未关联考试'} · {result.questionCount} 题 · 正确率 {percent(result.correctRate)}</p>
        <p>只读查看：学生答案、正确答案、解析、课程/考试引用和知识模块引用会保留。</p>
      </section>

      <section className="panel">
        <h2>题目与解析</h2>
        <ol className="practice-history-answer-list">
          {result.answers.map((answer) => (
            <li key={answer.questionId}>
              <p><strong>{answer.answerOrder}. {answer.stem}</strong></p>
              <p>知识模块：{answer.knowledgeModuleTitle}</p>
              <p>你的答案：{answer.studentAnswer ?? '未作答'}</p>
              <p>正确答案：{answer.correctAnswer}</p>
              <p>{answer.isCorrect ? '答对' : '答错'}</p>
              {answer.explanation && <p>解析：{answer.explanation}</p>}
              {answer.sourceEvidence && <p>依据：{answer.sourceEvidence}</p>}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

export default PracticeHistoryResultPage;
