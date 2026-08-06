import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  AssessmentAttemptDto,
  MockExamAttemptDetailDto,
  MockExamPaperDetailDto,
  MockExamQuestionForStudentDto,
  SubmitMockExamAttemptResponse,
} from '@ai-studybuddy/shared';
import { MockExamStartPage } from '../src/pages/mock-exam-start-page';
import { MockExamPaperPage } from '../src/pages/mock-exam-paper-page';
import { MockExamSessionPage } from '../src/pages/mock-exam-session-page';
import { MockExamResultPage } from '../src/pages/mock-exam-result-page';
import { MockExamQuestion } from '../src/components/mock-exam-question';
import { ApiClientError } from '../src/api/api-client';
import { readMockExamDraft, writeMockExamDraft, type MockExamDraft } from '../src/hooks/use-mock-exam-draft';

const getExamMock = vi.fn();
const createMockExamPaperMock = vi.fn();
const getMockExamPaperMock = vi.fn();
const startMockExamAttemptMock = vi.fn();
const getMockExamAttemptMock = vi.fn();
const submitMockExamAttemptMock = vi.fn();

vi.mock('../src/api/study-rhythm-api', () => ({
  getExam: (...args: unknown[]) => getExamMock(...args),
}));
vi.mock('../src/api/mock-exam-api', () => ({
  createMockExamPaper: (...args: unknown[]) => createMockExamPaperMock(...args),
  getMockExamPaper: (...args: unknown[]) => getMockExamPaperMock(...args),
  startMockExamAttempt: (...args: unknown[]) => startMockExamAttemptMock(...args),
  getMockExamAttempt: (...args: unknown[]) => getMockExamAttemptMock(...args),
  submitMockExamAttempt: (...args: unknown[]) => submitMockExamAttemptMock(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const question: MockExamQuestionForStudentDto = {
  id: 'question-1',
  type: 'multiple_choice',
  stem: '下列哪些属于模拟考作答？',
  options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'],
  difficulty: 'medium',
  knowledgeModuleId: 'module-1',
  questionOrder: 1,
  pointValue: 2,
};

const confirmedExam: AssessmentAttemptDto = {
  id: 'exam-1',
  courseInstanceId: 'course-1',
  name: '期末考试',
  attemptType: 'normal',
  examAt: '2026-07-25T09:00:00.000Z',
  confirmationStatus: 'confirmed',
};

const paper: MockExamPaperDetailDto = {
  id: 'paper-1',
  courseInstanceId: 'course-1',
  assessmentAttemptId: 'exam-1',
  status: 'generated',
  title: '期末模拟卷',
  questionCount: 1,
  timeLimitSeconds: 600,
  totalPoints: 2,
  difficultyPreference: 'mixed',
  sourceSummary: { moduleCount: 1, weakPointCount: 0, activeMistakeCount: 0, assessmentName: '期末考试' },
  generatedAt: '2026-07-20T00:00:00.000Z',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  questions: [question],
};

const attempt: MockExamAttemptDetailDto = {
  id: 'attempt-1',
  paperId: 'paper-1',
  courseInstanceId: 'course-1',
  assessmentAttemptId: 'exam-1',
  status: 'in_progress',
  startedAt: '2026-07-20T00:00:00.000Z',
  totalPoints: 2,
  overtime: false,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  questions: [question],
};

const gradedResult: SubmitMockExamAttemptResponse = {
  attemptId: 'attempt-1',
  status: 'graded',
  totalScore: 2,
  totalPoints: 2,
  questionCount: 1,
  correctRate: 1,
  overtime: false,
  totalDurationSeconds: 8,
  answers: [
    {
      questionId: 'question-1',
      studentAnswer: 'A',
      correctAnswer: 'A',
      isCorrect: true,
      scoreAwarded: 2,
      pointValue: 2,
      explanation: '因为 A 符合题意。',
      knowledgeModuleId: 'module-1',
    },
  ],
  moduleAnalyses: [
    {
      knowledgeModuleId: 'module-1',
      questionCount: 1,
      correctCount: 1,
      scoreAwarded: 2,
      totalPoints: 2,
      correctRate: 1,
      weakSignal: false,
    },
  ],
};
const emptyDraft: MockExamDraft = {
  version: 1,
  attemptId: 'attempt-1',
  activeQuestionIndex: 0,
  answers: {},
  questionSeconds: {},
  totalDurationSeconds: 0,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  getExamMock.mockResolvedValue(confirmedExam);
  createMockExamPaperMock.mockResolvedValue({ id: 'paper-1' });
  getMockExamPaperMock.mockResolvedValue(paper);
  startMockExamAttemptMock.mockResolvedValue({ id: 'attempt-1' });
  getMockExamAttemptMock.mockResolvedValue(attempt);
  submitMockExamAttemptMock.mockResolvedValue(gradedResult);
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

describe('T03 模拟考草稿与作答控件', () => {
  it('对损坏 JSON、错误尝试、越界题号和无效答案安全降级为空草稿', () => {
    sessionStorage.setItem('ai-studybuddy:mock-exam:semester-1:attempt-1', '{坏 JSON');
    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1'])).toEqual(emptyDraft);

    sessionStorage.setItem(
      'ai-studybuddy:mock-exam:semester-1:attempt-1',
      JSON.stringify({ ...emptyDraft, attemptId: 'another-attempt', answers: { 'question-1': 'A' } })
    );
    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1'])).toEqual(emptyDraft);

    sessionStorage.setItem(
      'ai-studybuddy:mock-exam:semester-1:attempt-1',
      JSON.stringify({ ...emptyDraft, activeQuestionIndex: 9, answers: { unknown: 'A' } })
    );
    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1'])).toEqual(emptyDraft);
  });

  it('仅持久化当前尝试的最小答案与计时状态', () => {
    writeMockExamDraft('semester-1', 'attempt-1', {
      ...emptyDraft,
      answers: { 'question-1': 'A,C' },
      questionSeconds: { 'question-1': 8 },
      totalDurationSeconds: 8,
    });

    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1'])).toMatchObject({
      answers: { 'question-1': 'A,C' },
      questionSeconds: { 'question-1': 8 },
      totalDurationSeconds: 8,
    });
  });

  it('多选题按稳定字母顺序回传学生答案，且作答前不显示答案或解析', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<MockExamQuestion question={question} value="" onChange={onChange} />);
    });

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await click(inputs[2]);
    await act(async () => {
      root.render(<MockExamQuestion question={question} value="C" onChange={onChange} />);
    });
    await click(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]);

    expect(onChange).toHaveBeenNthCalledWith(1, 'C');
    expect(onChange).toHaveBeenNthCalledWith(2, 'A,C');
    expect(container.textContent).not.toContain('正确答案');
    expect(container.textContent).not.toContain('解析');
  });
});

describe('T03 模拟考入口', () => {
  it('仅为已确认考试生成模拟卷，并使用既有 T02 默认请求', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/exams/exam-1/mock-exam']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/exams/:examId/mock-exam" element={<MockExamStartPage semesterId="semester-1" />} />
            <Route path="/mock-exam-papers/:paperId" element={<p>模拟卷详情</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    const createButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '生成模拟卷'
    );
    expect(createButton).not.toBeNull();
    await click(createButton!);
    await flush();

    expect(createMockExamPaperMock).toHaveBeenCalledWith({
      semesterId: 'semester-1',
      courseInstanceId: 'course-1',
      assessmentAttemptId: 'exam-1',
    });
    expect(container.textContent).toContain('模拟卷详情');
  });

  it('未确认考试不允许生成模拟卷', async () => {
    getExamMock.mockResolvedValue({ ...confirmedExam, confirmationStatus: 'pending' });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/exams/exam-1/mock-exam']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/exams/:examId/mock-exam" element={<MockExamStartPage semesterId="semester-1" />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.textContent).toContain('请先确认考试信息');
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '生成模拟卷')
    ).toBeUndefined();
    expect(createMockExamPaperMock).not.toHaveBeenCalled();
  });
});

describe('T03 模拟卷详情', () => {
  it('读取既有试卷 DTO 并开始新的模拟考尝试', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-papers/paper-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/mock-exam-papers/:paperId" element={<MockExamPaperPage semesterId="semester-1" />} />
            <Route path="/mock-exam-attempts/:attemptId" element={<p>模拟考作答页</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.textContent).toContain('期末模拟卷');
    expect(container.textContent).toContain('1 题');
    const startButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '开始答题'
    );
    expect(startButton).not.toBeNull();
    await click(startButton!);
    await flush();

    expect(startMockExamAttemptMock).toHaveBeenCalledWith('paper-1', { semesterId: 'semester-1' });
    expect(container.textContent).toContain('模拟考作答页');
  });

  it('开始答题时覆盖同一尝试残留的答案和计时草稿', async () => {
    writeMockExamDraft('semester-1', 'attempt-1', {
      ...emptyDraft,
      answers: { 'question-1': 'A' },
      questionSeconds: { 'question-1': 13 },
      totalDurationSeconds: 17,
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-papers/paper-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/mock-exam-papers/:paperId" element={<MockExamPaperPage semesterId="semester-1" />} />
            <Route path="/mock-exam-attempts/:attemptId" element={<p>模拟考作答页</p>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '开始答题')!
    );
    await flush();

    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1'])).toEqual(emptyDraft);
  });
});

describe('T03 模拟考会话与结果', () => {
  it('确认后提交作答并在结果页显示成绩和模块分析', async () => {
    getMockExamAttemptMock.mockReset();
    getMockExamAttemptMock.mockResolvedValueOnce(attempt).mockResolvedValueOnce({ ...attempt, status: 'graded' });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/mock-exam-attempts/:attemptId" element={<MockExamSessionPage semesterId="semester-1" />} />
            <Route
              path="/mock-exam-attempts/:attemptId/result"
              element={<MockExamResultPage semesterId="semester-1" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '提交模拟考')!
    );
    expect(container.textContent).toContain('确认提交');
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '确认提交')!
    );
    await flush();

    expect(submitMockExamAttemptMock).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({
        semesterId: 'semester-1',
        answers: [expect.objectContaining({ questionId: 'question-1', answer: 'A' })],
      })
    );
    expect(container.textContent).toContain('2 / 2');
    expect(container.textContent).toContain('模块分析');
    expect(container.textContent).toContain('正确答案：A');
  });

  it('确认提交在同一渲染帧内重复点击时只请求一次', async () => {
    let resolveSubmission: ((value: SubmitMockExamAttemptResponse) => void) | null = null;
    submitMockExamAttemptMock.mockImplementation(
      () =>
        new Promise<SubmitMockExamAttemptResponse>((resolve) => {
          resolveSubmission = resolve;
        })
    );
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/mock-exam-attempts/:attemptId" element={<MockExamSessionPage semesterId="semester-1" />} />
            <Route
              path="/mock-exam-attempts/:attemptId/result"
              element={<MockExamResultPage semesterId="semester-1" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();
    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '提交模拟考')!
    );

    const confirmButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '确认提交'
    );
    expect(confirmButton).not.toBeNull();
    await act(async () => {
      confirmButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      confirmButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(submitMockExamAttemptMock).toHaveBeenCalledTimes(1);
    resolveSubmission?.(gradedResult);
    await flush();
  });

  it('刷新后恢复当前尝试的作答草稿', async () => {
    writeMockExamDraft('semester-1', 'attempt-1', {
      ...emptyDraft,
      answers: { 'question-1': 'A' },
      questionSeconds: { 'question-1': 7 },
      totalDurationSeconds: 7,
    });
    await act(async () => {
      root.render(
<MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes><Route path="/mock-exam-attempts/:attemptId" element={<MockExamSessionPage semesterId="semester-1" />} /></Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(container.textContent).toContain('已作答 1 题');
  });

  it('刷新后提交不低报已恢复的总用时和题目用时', async () => {
    writeMockExamDraft('semester-1', 'attempt-1', {
      ...emptyDraft,
      answers: { 'question-1': 'A' },
      questionSeconds: { 'question-1': 13 },
      totalDurationSeconds: 17,
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/mock-exam-attempts/:attemptId" element={<MockExamSessionPage semesterId="semester-1" />} />
            <Route
              path="/mock-exam-attempts/:attemptId/result"
              element={<MockExamResultPage semesterId="semester-1" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '提交模拟考')!
    );
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '确认提交')!
    );
    await flush();

    const [, payload] = submitMockExamAttemptMock.mock.calls[0] as [
      string,
      { totalDurationSeconds: number; answers: Array<{ timeSpentSeconds: number }> },
    ];
    expect(payload.totalDurationSeconds).toBeGreaterThanOrEqual(17);
    expect(payload.answers[0].timeSpentSeconds).toBeGreaterThanOrEqual(13);
  });

  it('已批改尝试清除答案和计时草稿，但保留合法结果缓存', async () => {
    writeMockExamDraft('semester-1', 'attempt-1', {
      ...emptyDraft,
      answers: { 'question-1': 'A' },
      questionSeconds: { 'question-1': 13 },
      totalDurationSeconds: 17,
      result: gradedResult,
    });
    getMockExamAttemptMock.mockResolvedValue({ ...attempt, status: 'graded' });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1/result']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes><Route path="/mock-exam-attempts/:attemptId/result" element={<MockExamResultPage semesterId="semester-1" />} /></Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1'])).toEqual({
      ...emptyDraft,
      result: gradedResult,
    });
  });

  it('普通提交失败时保留答案草稿并允许重试', async () => {
    submitMockExamAttemptMock.mockRejectedValue(new Error('网络暂不可用'));
    await act(async () => {
      root.render(
<MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes><Route path="/mock-exam-attempts/:attemptId" element={<MockExamSessionPage semesterId="semester-1" />} /></Routes>
        </MemoryRouter>
      );
    });
    await flush();
    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '提交模拟考')!
    );
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '确认提交')!
    );
    await flush();

    expect(container.textContent).toContain('网络暂不可用');
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(readMockExamDraft('semester-1', 'attempt-1', ['question-1']).answers).toEqual({ 'question-1': 'A' });
  });

  it('提交冲突后刷新为已批改尝试时锁定输入并提供结果入口', async () => {
    getMockExamAttemptMock.mockReset();
    getMockExamAttemptMock.mockResolvedValueOnce(attempt).mockResolvedValueOnce({ ...attempt, status: 'graded' });
    submitMockExamAttemptMock.mockRejectedValue(
      new ApiClientError('MOCK_EXAM_ATTEMPT_STATE_INVALID', '模拟考状态已变化')
    );
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/mock-exam-attempts/:attemptId" element={<MockExamSessionPage semesterId="semester-1" />} />
            <Route
              path="/mock-exam-attempts/:attemptId/result"
              element={<MockExamResultPage semesterId="semester-1" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();
    await click(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '提交模拟考')!
    );
    await click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '确认提交')!
    );
    await flush();

    expect(container.textContent).toContain('该模拟考已提交，不能再次修改答案。');
    expect(
      [...container.querySelectorAll<HTMLAnchorElement>('a')].some((item) => item.textContent === '查看结果')
    ).toBe(true);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('服务端尝试尚未批改时不展示缓存的正确答案或解析', async () => {
    writeMockExamDraft('semester-1', 'attempt-1', { ...emptyDraft, result: gradedResult });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1/result']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route
              path="/mock-exam-attempts/:attemptId/result"
              element={<MockExamResultPage semesterId="semester-1" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.textContent).toContain('结果暂不可用');
    expect(container.textContent).not.toContain('正确答案：A');
    expect(container.textContent).not.toContain('因为 A 符合题意。');
  });

  it('结果缓存缺失时从已批改尝试接口重取结果', async () => {
    getMockExamAttemptMock.mockResolvedValue({ ...attempt, status: 'graded', result: gradedResult });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/mock-exam-attempts/attempt-1/result']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route
              path="/mock-exam-attempts/:attemptId/result"
              element={<MockExamResultPage semesterId="semester-1" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.textContent).toContain('2 / 2');
    expect(container.textContent).toContain('正确答案：A');
    expect(container.textContent).toContain('因为 A 符合题意。');
  });
});
