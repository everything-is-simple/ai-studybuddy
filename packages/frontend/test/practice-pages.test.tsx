import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeSessionDetailDto, SubmitPracticeSessionResponse } from '@ai-studybuddy/shared';
import { PracticeQuestion } from '../src/components/practice-question';
import { readPracticeDraft, writePracticeDraft } from '../src/hooks/use-practice-draft';
import { PracticeSessionPage } from '../src/pages/practice-session-page';

const getPracticeSessionMock = vi.fn();
const submitPracticeSessionMock = vi.fn();

vi.mock('../src/api/practice-runner-api', () => ({
  getPracticeSession: (...args: unknown[]) => getPracticeSessionMock(...args),
  submitPracticeSession: (...args: unknown[]) => submitPracticeSessionMock(...args),
}));
vi.mock('../src/components/app-navigation', () => ({ AppNavigation: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const session: PracticeSessionDetailDto = {
  id: 'session-1',
  courseInstanceId: 'course-1',
  assessmentAttemptId: 'exam-1',
  status: 'in_progress',
  questionCount: 2,
  timeLimitSeconds: 30,
  difficultyPreference: 'mixed',
  startedAt: '2026-07-16T00:00:00.000Z',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  questions: [
    {
      id: 'question-1',
      type: 'single_choice',
      stem: '第一题',
      options: ['A. 正确', 'B. 错误', 'C. 干扰', 'D. 干扰'],
      difficulty: 'easy',
      knowledgeModuleId: 'module-1',
      questionOrder: 1,
    },
    {
      id: 'question-2',
      type: 'multiple_choice',
      stem: '第二题',
      options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'],
      difficulty: 'medium',
      knowledgeModuleId: 'module-1',
      questionOrder: 2,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  getPracticeSessionMock.mockResolvedValue(session);
  submitPracticeSessionMock.mockResolvedValue({
    sessionId: session.id,
    status: 'graded',
    totalScore: 1,
    questionCount: 2,
    correctRate: 0.5,
    overtime: false,
    totalDurationSeconds: 1,
    answers: [],
  } satisfies SubmitPracticeSessionResponse);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('S3 练习前端交互', () => {
  it('多选题按稳定字母顺序回传答案', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<PracticeQuestion question={session.questions[1]} value="" onChange={onChange} />);
    });
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await click(inputs[2]);
    await act(async () => {
      root.render(<PracticeQuestion question={session.questions[1]} value="C" onChange={onChange} />);
    });
    await click(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]);
    expect(onChange).toHaveBeenNthCalledWith(1, 'C');
    expect(onChange).toHaveBeenNthCalledWith(2, 'A,C');
  });

  it('答题页保留草稿并以现有提交契约提交', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/practice-sessions/session-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/practice-sessions/:sessionId" element={<PracticeSessionPage semesterId="semester-1" />} />
            <Route path="/practice-sessions/:sessionId/result" element={<p>结果页</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    const answer = container.querySelector<HTMLInputElement>('input[type="radio"]')!;
    await click(answer);
    await click([...container.querySelectorAll('button')].find((item) => item.textContent === '下一题')!);
    await click([...container.querySelectorAll('button')].find((item) => item.textContent === '提交练习')!);
    await flush();

    expect(submitPracticeSessionMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        semesterId: 'semester-1',
        answers: expect.arrayContaining([expect.objectContaining({ questionId: 'question-1', answer: 'A' })]),
      })
    );
    expect(container.textContent).toContain('结果页');
    expect(readPracticeDraft('semester-1', 'session-1').result?.totalScore).toBe(1);
  });

  it('会话缓存损坏时安全降级为空草稿', () => {
    sessionStorage.setItem('ai-studybuddy:practice:semester-1:session-1', '{坏 JSON');
    expect(readPracticeDraft('semester-1', 'session-1').answers).toEqual({});

    writePracticeDraft('semester-1', 'session-1', {
      version: 1,
      sessionId: 'session-1',
      activeQuestionIndex: 1,
      answers: { 'question-1': 'A' },
      questionSeconds: { 'question-1': 4 },
      totalDurationSeconds: 4,
    });
    expect(readPracticeDraft('semester-1', 'session-1')).toMatchObject({
      activeQuestionIndex: 1,
      answers: { 'question-1': 'A' },
    });
  });
});
