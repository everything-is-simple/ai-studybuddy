import type { PracticeAnswerResultDto, PracticeQuestionForStudentDto } from '@ai-studybuddy/shared';

interface PracticeResultItemProps {
  question: PracticeQuestionForStudentDto;
  answer: PracticeAnswerResultDto;
  moduleTitle?: string;
}

export function PracticeResultItem({ question, answer, moduleTitle }: PracticeResultItemProps) {
  return (
    <article className={`practice-result-item ${answer.isCorrect ? 'practice-correct' : 'practice-incorrect'}`}>
      <h2>
        第 {question.questionOrder} 题 · {answer.isCorrect ? '回答正确' : '答错'}
      </h2>
      <p className="practice-stem">{question.stem}</p>
      {moduleTitle && <p className="text-muted">关联知识模块：{moduleTitle}</p>}
      <dl>
        <div>
          <dt>你的答案</dt>
          <dd>{answer.studentAnswer || '未作答'}</dd>
        </div>
        <div>
          <dt>正确答案</dt>
          <dd>{answer.correctAnswer}</dd>
        </div>
        {answer.explanation && (
          <div>
            <dt>解析</dt>
            <dd>{answer.explanation}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}
