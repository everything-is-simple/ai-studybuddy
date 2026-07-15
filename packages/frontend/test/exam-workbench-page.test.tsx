import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarDayDistance, formatExamCountdown, isWithinCalendarDayWindow } from '../src/pages/exam-workbench-date';
import { ExamWorkbenchPage } from '../src/pages/exam-workbench-page';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('考试工作台日期规则', () => {
  it('按本地日历日计算跨午夜倒计时，而不是按不足 24 小时算 0 天', () => {
    const now = new Date(2026, 6, 15, 23, 30);
    const shortlyAfterMidnight = new Date(2026, 6, 16, 0, 15).toISOString();

    expect(calendarDayDistance(shortlyAfterMidnight, now)).toBe(1);
    expect(formatExamCountdown(shortlyAfterMidnight, now)).toBe('还有 1 天');
  });

  it('今天显示 0 天，过去日期显示已到期天数', () => {
    const now = new Date(2026, 6, 15, 12, 0);
    const today = new Date(2026, 6, 15, 8, 0).toISOString();
    const twoDaysAgo = new Date(2026, 6, 13, 20, 0).toISOString();

    expect(formatExamCountdown(today, now)).toBe('今天（0 天）');
    expect(formatExamCountdown(twoDaysAgo, now)).toBe('已到期 2 天');
  });

  it('日期附近窗口包含前后第 7 天，但不包含第 8 天', () => {
    const center = new Date(2026, 6, 15, 9, 0).toISOString();
    const seventhDay = new Date(2026, 6, 22, 23, 0).toISOString();
    const eighthDay = new Date(2026, 6, 23, 0, 1).toISOString();

    expect(isWithinCalendarDayWindow(seventhDay, center, 7)).toBe(true);
    expect(isWithinCalendarDayWindow(eighthDay, center, 7)).toBe(false);
  });
});

const COURSE_A = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterId: 'semester-1',
  name: '线性代数',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};
const COURSE_B = {
  ...COURSE_A,
  id: '22222222-2222-4222-8222-222222222222',
  name: '大学英语',
};
const CURRENT_EXAM_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_EXAM_ID = '44444444-4444-4444-8444-444444444444';
const PENDING_EXAM_ID = '55555555-5555-4555-8555-555555555555';

function localIsoAfterDays(days: number, hour = 9): string {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value.toISOString();
}

let currentExam: any;
let allExams: any[];
let allTasks: any[];

function resetFixtures() {
  currentExam = {
    id: CURRENT_EXAM_ID,
    courseInstanceId: COURSE_A.id,
    name: '线性代数期中',
    attemptType: 'normal',
    examAt: localIsoAfterDays(5),
    confirmationStatus: 'confirmed',
    confirmedAt: new Date().toISOString(),
  };
  allExams = [
    currentExam,
    {
      id: OTHER_EXAM_ID,
      courseInstanceId: COURSE_B.id,
      name: '英语测验',
      attemptType: 'normal',
      examAt: localIsoAfterDays(7),
      confirmationStatus: 'confirmed',
      confirmedAt: new Date().toISOString(),
    },
    {
      id: PENDING_EXAM_ID,
      courseInstanceId: COURSE_A.id,
      name: '线性代数期末',
      attemptType: 'normal',
      examAt: localIsoAfterDays(20),
      confirmationStatus: 'pending',
    },
  ];
  allTasks = [
    {
      id: '66666666-6666-4666-8666-666666666666',
      courseInstanceId: COURSE_A.id,
      assessmentAttemptId: CURRENT_EXAM_ID,
      type: 'custom',
      title: '复习矩阵',
      status: 'todo',
      deadlineAt: localIsoAfterDays(3),
      derivedOverdue: false,
      priorityBucket: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      courseInstanceId: COURSE_A.id,
      assessmentAttemptId: CURRENT_EXAM_ID,
      type: 'material_note',
      title: '整理公式',
      status: 'done',
      deadlineAt: localIsoAfterDays(2),
      completedAt: new Date().toISOString(),
      derivedOverdue: false,
      priorityBucket: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      courseInstanceId: COURSE_B.id,
      assessmentAttemptId: OTHER_EXAM_ID,
      type: 'custom',
      title: '背诵英语词汇',
      status: 'todo',
      deadlineAt: localIsoAfterDays(6),
      derivedOverdue: false,
      priorityBucket: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

vi.mock('../src/api/study-rhythm-api', () => ({
  getExam: vi.fn(async () => currentExam),
  getCourses: vi.fn(async () => [COURSE_A, COURSE_B]),
  getExams: vi.fn(async () => allExams),
  getStudyTasks: vi.fn(async () => allTasks),
  confirmExam: vi.fn(async () => {
    currentExam = { ...currentExam, confirmationStatus: 'confirmed', confirmedAt: new Date().toISOString() };
    allExams = allExams.map((exam) => (exam.id === currentExam.id ? currentExam : exam));
    return currentExam;
  }),
  createStudyTask: vi.fn(async (data) => {
    const task = {
      id: '99999999-9999-4999-8999-999999999999',
      ...data,
      status: 'todo',
      derivedOverdue: false,
      priorityBucket: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    allTasks = [...allTasks, task];
    return task;
  }),
  updateStudyTaskStatus: vi.fn(async ({ taskId, status }) => {
    allTasks = allTasks.map((task) => (task.id === taskId ? { ...task, status } : task));
    return allTasks.find((task) => task.id === taskId);
  }),
}));

vi.mock('../src/components/app-navigation', () => ({ AppNavigation: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetFixtures();
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

async function renderWorkbench(examId = CURRENT_EXAM_ID) {
  await act(async () => {
    root.render(
      <MemoryRouter
        initialEntries={[`/exams/${examId}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/exams/:examId" element={<ExamWorkbenchPage semesterId="semester-1" />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flush();
}

function buttonContaining(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(label)
  );
  expect(button, `应找到按钮：${label}`).not.toBeNull();
  return button!;
}

async function setInput(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

describe('ExamWorkbenchPage 考试项目闭环', () => {
  it('展示确认考试上下文、进度、切换器、近期概览和隔离后的当前任务', async () => {
    await renderWorkbench();

    expect(container.textContent).toContain('线性代数期中');
    expect(container.textContent).toContain('线性代数');
    expect(container.textContent).toContain('还有 5 天');
    expect(container.textContent).toContain('1 / 2');
    expect(container.querySelector(`a[href="/exams/${OTHER_EXAM_ID}"]`)).not.toBeNull();

    const currentTaskList = container.querySelector('[data-testid="current-task-list"]');
    expect(currentTaskList?.textContent).toContain('复习矩阵');
    expect(currentTaskList?.textContent).toContain('整理公式');
    expect(currentTaskList?.textContent).not.toContain('背诵英语词汇');

    const nearby = container.querySelector('[data-testid="nearby-items"]');
    expect(nearby?.textContent).toContain('英语测验');
    expect(nearby?.textContent).toContain('背诵英语词汇');

    const pendingOverview = container.querySelector(`[data-exam-id="${PENDING_EXAM_ID}"]`);
    expect(pendingOverview?.textContent).toContain('待确认');
    expect(pendingOverview?.textContent).not.toContain('还有');
    expect(container.querySelector(`a[href="/materials?courseInstanceId=${COURSE_A.id}"]`)).not.toBeNull();
  });

  it('pending 考试只显示确认动作，确认后才显示正式计划', async () => {
    currentExam = { ...allExams.find((exam) => exam.id === PENDING_EXAM_ID) };
    await renderWorkbench(PENDING_EXAM_ID);

    expect(container.textContent).toContain('考试日期待确认');
    expect(container.querySelector('[data-testid="task-plan"]')).toBeNull();
    await act(async () => buttonContaining('确认考试日期').click());
    await flush();

    const { confirmExam } = await import('../src/api/study-rhythm-api');
    expect(confirmExam).toHaveBeenCalledWith('semester-1', PENDING_EXAM_ID);
    expect(container.querySelector('[data-testid="task-plan"]')).not.toBeNull();
  });

  it('创建任务自动绑定当前考试，并支持 todo 到 doing 到 done', async () => {
    await renderWorkbench();

    const title = container.querySelector<HTMLInputElement>('input[name="taskTitle"]')!;
    const type = container.querySelector<HTMLSelectElement>('select[name="taskType"]')!;
    const minutes = container.querySelector<HTMLInputElement>('input[name="estimatedMinutes"]')!;
    const deadline = container.querySelector<HTMLInputElement>('input[name="deadlineAt"]')!;
    await setInput(title, '复习行列式');
    await setInput(type, 'custom');
    await setInput(minutes, '25');
    await setInput(deadline, '2026-07-19T20:00');
    await act(async () => buttonContaining('创建任务').click());
    await flush();

    const { createStudyTask, updateStudyTaskStatus } = await import('../src/api/study-rhythm-api');
    expect(createStudyTask).toHaveBeenCalledWith(
      expect.objectContaining({
        semesterId: 'semester-1',
        courseInstanceId: COURSE_A.id,
        assessmentAttemptId: CURRENT_EXAM_ID,
        type: 'custom',
        title: '复习行列式',
        estimatedMinutes: 25,
      })
    );
    expect(container.textContent).toContain('复习行列式');

    await act(async () => buttonContaining('开始学习').click());
    await flush();
    expect(updateStudyTaskStatus).toHaveBeenCalledWith({
      semesterId: 'semester-1',
      taskId: '66666666-6666-4666-8666-666666666666',
      status: 'doing',
    });

    await act(async () => buttonContaining('标记完成').click());
    await flush();
    expect(updateStudyTaskStatus).toHaveBeenCalledWith({
      semesterId: 'semester-1',
      taskId: '66666666-6666-4666-8666-666666666666',
      status: 'done',
    });
  });

  it('任务创建失败时在计划区域保留可恢复错误', async () => {
    const { createStudyTask } = await import('../src/api/study-rhythm-api');
    (createStudyTask as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('任务创建失败'));
    await renderWorkbench();
    await setInput(container.querySelector<HTMLInputElement>('input[name="taskTitle"]')!, '失败任务');
    await setInput(container.querySelector<HTMLInputElement>('input[name="deadlineAt"]')!, '2026-07-19T20:00');
    await act(async () => buttonContaining('创建任务').click());
    await flush();

    expect(container.textContent).toContain('任务创建失败');
    expect(container.querySelector<HTMLInputElement>('input[name="taskTitle"]')?.value).toBe('失败任务');
  });
});
