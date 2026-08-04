import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeHistoryListResponseDto, PracticeHistoryResultDto } from '@ai-studybuddy/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getPracticeHistory: vi.fn(),
  getPracticeHistoryResult: vi.fn(),
}));

vi.mock('../src/api/practice-runner-api', () => ({
  getPracticeHistory: mocks.getPracticeHistory,
  getPracticeHistoryResult: mocks.getPracticeHistoryResult,
}));

const semesterId = '11111111-1111-4111-8111-111111111111';
const sessionId = '99999999-9999-4999-8999-999999999999';

const historyResponse: PracticeHistoryListResponseDto = {
  items: [
    {
      id: sessionId,
      semesterId,
      courseInstanceId: 'course-1',
      courseName: '数学',
      assessmentAttemptId: 'exam-1',
      assessmentName: '期中考试',
      status: 'graded',
      sessionKind: 'practice',
      originMistakeId: null,
      questionCount: 2,
      totalScore: 1,
      correctRate: 0.5,
      overtime: false,
      totalDurationSeconds: 120,
      timeLimitSeconds: 300,
      startedAt: '2026-07-18T08:00:00.000Z',
      submittedAt: '2026-07-18T08:02:00.000Z',
      gradedAt: '2026-07-18T08:02:01.000Z',
      createdAt: '2026-07-18T08:00:00.000Z',
      updatedAt: '2026-07-18T08:02:01.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, hasMore: false },
};

const resultResponse: PracticeHistoryResultDto = {
  ...historyResponse.items[0],
  correctRate: 0.5,
  answers: [
    {
      questionId: 'question-1',
      answerOrder: 1,
      knowledgeModuleId: 'module-1',
      knowledgeModuleTitle: '一元二次方程',
      stem: 'x²=1 的解是什么？',
      type: 'single_choice',
      difficulty: 'easy',
      sourceEvidence: '教材第 12 页',
      studentAnswer: 'A',
      correctAnswer: 'B',
      isCorrect: false,
      explanation: 'x 可以等于 1 或 -1。',
      timeSpentSeconds: 45,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.getPracticeHistory.mockResolvedValue(historyResponse);
  mocks.getPracticeHistoryResult.mockResolvedValue(resultResponse);
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
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

describe('PracticeHistory pages', () => {
  it('loads a semester-scoped history list with filters and result link', async () => {
    const { PracticeHistoryPage } = await import('../src/pages/practice-history-page');
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/semesters/${semesterId}/practice-history?status=graded&courseInstanceId=course-1`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/semesters/:semesterId/practice-history" element={<PracticeHistoryPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(mocks.getPracticeHistory).toHaveBeenCalledWith(
      semesterId,
      expect.objectContaining({ status: 'graded', courseInstanceId: 'course-1', page: 1, pageSize: 20 }),
      expect.any(AbortSignal)
    );
    expect(container.textContent).toContain('练习历史');
    expect(container.textContent).toContain('数学');
    expect(container.textContent).toContain('期中考试');
    const resultLink = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((item) => item.textContent?.includes('查看结果'));
    expect(resultLink?.href).toContain(`/semesters/${semesterId}/practice-history/${sessionId}`);
  });

  it('loads a read-only graded result from archived or active semester context', async () => {
    const { PracticeHistoryResultPage } = await import('../src/pages/practice-history-result-page');
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/semesters/${semesterId}/practice-history/${sessionId}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/semesters/:semesterId/practice-history/:sessionId" element={<PracticeHistoryResultPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(mocks.getPracticeHistoryResult).toHaveBeenCalledWith(semesterId, sessionId, expect.any(AbortSignal));
    expect(container.textContent).toContain('练习结果');
    expect(container.textContent).toContain('只读查看');
    expect(container.textContent).toContain('一元二次方程');
    expect(container.textContent).toContain('x²=1 的解是什么？');
    expect(container.textContent).toContain('正确答案：B');
    expect(container.textContent).toContain('x 可以等于 1 或 -1。');
  });
});
