import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MistakeDetailDto,
  MistakeListResponse,
  PracticeSessionDetailDto,
  WeakPointListResponse,
} from '@ai-studybuddy/shared';
import { MistakeListPage } from '../src/pages/mistake-list-page';
import { MistakeDetailPage } from '../src/pages/mistake-detail-page';

const getMistakesMock = vi.fn();
const getMistakeMock = vi.fn();
const getWeakPointsMock = vi.fn();
const confirmMistakeErrorCauseMock = vi.fn();
const updateMistakeStatusMock = vi.fn();
const createMistakeRedoMock = vi.fn();
const getExamMock = vi.fn();

vi.mock('../src/api/error-fixer-api', () => ({
  getMistakes: (...args: unknown[]) => getMistakesMock(...args),
  getMistake: (...args: unknown[]) => getMistakeMock(...args),
  getWeakPoints: (...args: unknown[]) => getWeakPointsMock(...args),
  confirmMistakeErrorCause: (...args: unknown[]) => confirmMistakeErrorCauseMock(...args),
  updateMistakeStatus: (...args: unknown[]) => updateMistakeStatusMock(...args),
  createMistakeRedo: (...args: unknown[]) => createMistakeRedoMock(...args),
}));
vi.mock('../src/api/study-rhythm-api', () => ({
  getExam: (...args: unknown[]) => getExamMock(...args),
}));
vi.mock('../src/components/app-navigation', () => ({ AppNavigation: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mistakeList: MistakeListResponse = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      courseInstanceId: 'course-1',
      assessmentAttemptId: 'exam-1',
      knowledgeModuleId: 'module-1',
      knowledgeModuleTitle: '向量空间定义',
      questionId: 'question-1',
      questionType: 'single_choice',
      stemPreview: '向量空间封闭性指什么？',
      status: 'pending_review',
      errorCount: 2,
      errorCauseCategory: null,
      firstErrorAt: '2026-07-16T00:10:00.000Z',
      latestErrorAt: '2026-07-16T01:10:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};

const weakPoints: WeakPointListResponse = {
  items: [
    {
      id: 'weak-1',
      courseInstanceId: 'course-1',
      knowledgeModuleId: 'module-1',
      knowledgeModuleTitle: '向量空间定义',
      status: 'active',
      evidenceCount: 2,
      firstDetectedAt: '2026-07-16T00:10:00.000Z',
      latestDetectedAt: '2026-07-16T01:10:00.000Z',
    },
  ],
};

const mistakeDetail: MistakeDetailDto = {
  id: '11111111-1111-4111-8111-111111111111',
  courseInstanceId: 'course-1',
  assessmentAttemptId: 'exam-1',
  knowledgeModuleId: 'module-1',
  knowledgeModuleTitle: '向量空间定义',
  questionId: 'question-1',
  questionType: 'single_choice',
  stem: '向量空间封闭性指什么？',
  options: ['A. 加法数乘封闭', 'B. 只能加法', 'C. 只能数乘', 'D. 无限制'],
  correctAnswer: 'A',
  explanation: '封闭性是向量空间的核心。',
  studentAnswer: 'B',
  status: 'pending_review',
  errorCount: 2,
  errorCauseCategory: null,
  errorCauseNote: null,
  errorCauseConfirmedAt: null,
  firstErrorAt: '2026-07-16T00:10:00.000Z',
  latestErrorAt: '2026-07-16T01:10:00.000Z',
  evidence: [{ id: 'evidence-1', evidenceType: 'practice_error', occurredAt: '2026-07-16T00:10:00.000Z' }],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  getExamMock.mockResolvedValue({
    id: 'exam-1',
    courseInstanceId: 'course-1',
    name: '线性代数期末',
    examAt: '2026-08-01T00:00:00.000Z',
    confirmationStatus: 'confirmed',
  });
  getMistakesMock.mockResolvedValue(mistakeList);
  getWeakPointsMock.mockResolvedValue(weakPoints);
  getMistakeMock.mockResolvedValue(mistakeDetail);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function renderListPage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/exams/exam-1/mistakes']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/exams/:examId/mistakes"
            element={<MistakeListPage semesterId="22222222-2222-4222-8222-222222222222" />}
          />
        </Routes>
      </MemoryRouter>
    );
  });
}

async function renderDetailPage() {
  // MemoryRouter 的 initialEntries 只在首挂载生效，重复渲染前先重建 root
  await act(async () => {
    root.unmount();
  });
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/mistakes/11111111-1111-4111-8111-111111111111?examId=exam-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/mistakes/:mistakeId"
            element={<MistakeDetailPage semesterId="22222222-2222-4222-8222-222222222222" />}
          />
          <Route path="/practice-sessions/:sessionId" element={<div data-testid="redo-session-page">重做作答页</div>} />
        </Routes>
      </MemoryRouter>
    );
  });
}

describe('S4 错题本前端交互', () => {
  it('错题列表展示状态、薄弱点与空态筛选', async () => {
    await renderListPage();

    expect(container.textContent).toContain('线性代数期末 的错题');
    expect(container.textContent).toContain('待复盘');
    expect(container.textContent).toContain('向量空间封闭性指什么？');
    expect(container.textContent).toContain('错误 2 次');
    expect(container.querySelector('[data-testid="weak-points"]')?.textContent).toContain('证据 2 条');

    // 状态筛选为 mastered 时返回空并展示筛选空态
    getMistakesMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const select = container.querySelector('#statusFilter') as HTMLSelectElement;
    await act(async () => {
      select.value = 'mastered';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('当前筛选条件下没有错题');
  });

  it('错题详情展示原题事实并可确认错因', async () => {
    confirmMistakeErrorCauseMock.mockResolvedValue({
      ...mistakeDetail,
      status: 'needs_review',
      errorCauseCategory: 'concept_unclear',
      errorCauseNote: '封闭性没吃透',
      errorCauseConfirmedAt: '2026-07-16T02:00:00.000Z',
    });
    await renderDetailPage();

    const detailHeading = container.querySelector('h1.workbench-eyebrow');
    expect(detailHeading?.textContent).toBe('错题详情');

    expect(container.textContent).toContain('我的答案');
    expect(container.textContent).toContain('B');
    expect(container.textContent).toContain('正确答案');
    expect(container.textContent).toContain('封闭性是向量空间的核心');
    expect(container.textContent).toContain('还没有确认错因');

    const select = container.querySelector('#causeCategory') as HTMLSelectElement;
    await act(async () => {
      select.value = 'concept_unclear';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const form = container.querySelector('.mistake-cause-form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(confirmMistakeErrorCauseMock).toHaveBeenCalledWith(
      mistakeDetail.id,
      expect.objectContaining({ category: 'concept_unclear' })
    );
    expect(container.textContent).toContain('错因已确认');
  });

  it('原题重做跳转到作答页；操作失败展示中文错误', async () => {
    const redoSession: PracticeSessionDetailDto = {
      id: 'redo-session-1',
      courseInstanceId: 'course-1',
      assessmentAttemptId: null,
      status: 'in_progress',
      questionCount: 1,
      timeLimitSeconds: null,
      difficultyPreference: 'mixed',
      sessionKind: 'mistake_redo',
      originMistakeId: mistakeDetail.id,
      startedAt: '2026-07-16T03:00:00.000Z',
      createdAt: '2026-07-16T03:00:00.000Z',
      updatedAt: '2026-07-16T03:00:00.000Z',
      questions: [
        {
          id: 'redo-question-1',
          type: 'single_choice',
          stem: '向量空间封闭性指什么？',
          options: ['A. 加法数乘封闭', 'B. 只能加法', 'C. 只能数乘', 'D. 无限制'],
          difficulty: 'medium',
          knowledgeModuleId: 'module-1',
          questionOrder: 1,
        },
      ],
    };
    createMistakeRedoMock.mockResolvedValue(redoSession);
    await renderDetailPage();

    const redoButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('原题重做')
    ) as HTMLButtonElement;
    await act(async () => {
      redoButton.click();
    });
    expect(createMistakeRedoMock).toHaveBeenCalledWith(mistakeDetail.id, {
      semesterId: '22222222-2222-4222-8222-222222222222',
    });
    expect(container.querySelector('[data-testid="redo-session-page"]')).not.toBeNull();

    // 失败路径：重做冲突时在当前页内联展示中文错误
    await renderDetailPage();
    createMistakeRedoMock.mockRejectedValue(new Error('该错题已有进行中的重做，请先完成或提交'));
    const redoButton2 = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('原题重做')
    ) as HTMLButtonElement;
    await act(async () => {
      redoButton2.click();
    });
    expect(container.textContent).toContain('该错题已有进行中的重做');
  });

  it('needs_review 无重做证据时以学生确认方式标掌握；mastered 可重开', async () => {
    getMistakeMock.mockResolvedValue({ ...mistakeDetail, status: 'needs_review' });
    updateMistakeStatusMock.mockResolvedValue({ ...mistakeDetail, status: 'mastered' });
    await renderDetailPage();

    const masterButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('我确认已掌握')
    ) as HTMLButtonElement;
    expect(masterButton).toBeTruthy();
    await act(async () => {
      masterButton.click();
    });
    expect(updateMistakeStatusMock).toHaveBeenCalledWith(
      mistakeDetail.id,
      expect.objectContaining({ status: 'mastered', confirm: true })
    );

    // mastered 状态展示重开按钮
    getMistakeMock.mockResolvedValue({ ...mistakeDetail, status: 'mastered' });
    updateMistakeStatusMock.mockResolvedValue({ ...mistakeDetail, status: 'needs_review' });
    await renderDetailPage();
    const reopenButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('重新打开复习')
    ) as HTMLButtonElement;
    expect(reopenButton).toBeTruthy();
    await act(async () => {
      reopenButton.click();
    });
    expect(updateMistakeStatusMock).toHaveBeenLastCalledWith(
      mistakeDetail.id,
      expect.objectContaining({ status: 'needs_review' })
    );
  });
});
