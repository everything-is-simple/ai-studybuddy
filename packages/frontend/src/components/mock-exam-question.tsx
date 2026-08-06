import type { MockExamQuestionForStudentDto } from '@ai-studybuddy/shared';

interface MockExamQuestionProps {
  question: MockExamQuestionForStudentDto;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function optionLabel(option: string): string {
  const match = option.trim().match(/^([A-Za-z])(?:[.、:：\s]|$)/);
  return (match?.[1] ?? option.trim().slice(0, 1)).toUpperCase();
}

export function MockExamQuestion({ question, value, disabled = false, onChange }: MockExamQuestionProps) {
  const selected = new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const inputId = `mock-exam-answer-${question.id}`;

  return (
    <fieldset className="practice-question" disabled={disabled}>
      <legend>
        第 {question.questionOrder} 题 ·{' '}
        {question.type === 'single_choice' ? '单选题' : question.type === 'multiple_choice' ? '多选题' : '填空题'} ·{' '}
        {question.pointValue} 分
      </legend>
      <p className="practice-stem">{question.stem}</p>
      {question.type === 'fill_blank' ? (
        <>
          <label htmlFor={inputId}>你的答案</label>
          <input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" />
        </>
      ) : (
        <div className="practice-options" role={question.type === 'single_choice' ? 'radiogroup' : undefined}>
          {question.options?.map((option) => {
            const label = optionLabel(option);
            const checked = selected.has(label);
            if (question.type === 'single_choice') {
              return (
                <label key={option} className="practice-option">
                  <input
                    type="radio"
                    name={`mock-exam-question-${question.id}`}
                    value={label}
                    checked={value === label}
                    onChange={() => onChange(label)}
                  />
                  {option}
                </label>
              );
            }
            return (
              <label key={option} className="practice-option">
                <input
                  type="checkbox"
                  value={label}
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected);
                    if (checked) next.delete(label);
                    else next.add(label);
                    onChange([...next].sort().join(','));
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
