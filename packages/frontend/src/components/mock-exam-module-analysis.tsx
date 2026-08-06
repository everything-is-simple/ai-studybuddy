import type { MockExamModuleAnalysisDto } from '@ai-studybuddy/shared';

interface MockExamModuleAnalysisProps {
  analyses: MockExamModuleAnalysisDto[];
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function MockExamModuleAnalysis({ analyses }: MockExamModuleAnalysisProps) {
  if (analyses.length === 0) {
    return <p className="feedback feedback-empty">模块分析暂不可用。</p>;
  }

  return (
    <section className="card" aria-label="模块分析">
      <h2>模块分析</h2>
      <ul className="mock-exam-module-analysis">
        {analyses.map((analysis) => (
          <li key={analysis.knowledgeModuleId}>
            <strong>{analysis.knowledgeModuleId}</strong>
            <span>
              {analysis.correctCount}/{analysis.questionCount} 题 · {analysis.scoreAwarded}/{analysis.totalPoints} 分 ·
              正确率 {formatPercent(analysis.correctRate)}
            </span>
            {analysis.weakSignal && <em>需要重点复习</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}
