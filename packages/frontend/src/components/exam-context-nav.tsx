import { Link } from 'react-router-dom';

export type ExamContextNavEntry = 'overview' | 'materials' | 'practice' | 'mock_exam' | 'cram' | 'mistakes' | 'timeline';

interface ExamContextNavProps {
  examId: string;
  courseInstanceId?: string | null;
  active: ExamContextNavEntry;
}

type ContextItem = {
  key: ExamContextNavEntry;
  to: string;
  label: string;
};

function buildExamContextItems(examId: string, courseInstanceId?: string | null): ContextItem[] {
  const encodedExamId = encodeURIComponent(examId);
  const encodedCourseId = courseInstanceId ? encodeURIComponent(courseInstanceId) : null;
  return [
    { key: 'overview', to: `/exams/${encodedExamId}`, label: '总览' },
    { key: 'materials', to: encodedCourseId ? `/materials?courseInstanceId=${encodedCourseId}` : '/materials', label: '资料' },
    { key: 'practice', to: `/exams/${encodedExamId}/practice`, label: '练习' },
    { key: 'mock_exam', to: `/exams/${encodedExamId}/mock-exam`, label: '模拟考' },
    { key: 'cram', to: `/exams/${encodedExamId}/cram`, label: '临考速背' },
    { key: 'mistakes', to: `/exams/${encodedExamId}/mistakes`, label: '错题' },
    { key: 'timeline', to: `/exams/${encodedExamId}#recent-study-activity`, label: '时间线' },
  ];
}

export function ExamContextNav({ examId, courseInstanceId, active }: ExamContextNavProps) {
  const items = buildExamContextItems(examId, courseInstanceId);
  return (
    <nav className="exam-context-nav" aria-label="考试上下文导航" data-testid="exam-context-navigation">
      {items.map((item) => {
        const isCurrent = item.key === active;
        return (
          <Link key={item.key} to={item.to} className={isCurrent ? 'active' : undefined} aria-current={isCurrent ? 'page' : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
