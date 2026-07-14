import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 18/19 都需要这个全局标记，否则会警告 "current testing environment is not configured to support act(...)"。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { CoursePage } from '../src/pages/course-page';

// 单课程 stub：一门线性代数、无考试、无任务。
const STUB_COURSE = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterId: 'sem-1',
  name: '线性代数',
  retakeOfCourseInstanceId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

vi.mock('../src/api/study-rhythm-api', () => ({
  getCourses: vi.fn(async () => [STUB_COURSE]),
  createCourse: vi.fn(async () => STUB_COURSE),
  getExams: vi.fn(async () => []),
  createExam: vi.fn(async () => ({ id: 'exam-1' })),
  getStudyTasks: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], pagination: { total: 0 } })),
}));

// AppNavigation 挂了 react-router 的钩子；测试无需真实路由，用最小占位替换。
vi.mock('../src/components/app-navigation', () => ({
  AppNavigation: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function flush() {
  // 让 useApiRequest 里的 Promise + setState 有机会 commit。
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderPage() {
  await act(async () => {
    root.render(<CoursePage semesterId="sem-1" />);
  });
  await flush();
}

describe('CoursePage 考试表单受控值', () => {
  it('输入框显示用户键入的内容，并把正确 payload 传给 createExam', async () => {
    await renderPage();

    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="考试名称"]');
    const dateInput = container.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    const goalInput = container.querySelector<HTMLInputElement>('input[placeholder="考试目标（可选）"]');
    const form = container.querySelector('form.form-inline');
    expect(nameInput, '考试名称输入框应渲染').not.toBeNull();
    expect(dateInput).not.toBeNull();
    expect(goalInput).not.toBeNull();
    expect(form).not.toBeNull();

    // React 用受控输入时会追踪 value 的 setter，直接 `.value = ...` 会被 React 检测为「值未变」而忽略。
    // 需要用 HTMLInputElement 原型上的原生 setter，再 dispatch input 事件。
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;
    const typeInto = async (el: HTMLInputElement, value: string) => {
      await act(async () => {
        nativeSetter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await typeInto(nameInput!, '期中考试');
    await typeInto(dateInput!, '2026-05-20T09:00');
    await typeInto(goalInput!, '通过第 1-3 章');

    expect(nameInput!.value).toBe('期中考试');
    expect(dateInput!.value).toBe('2026-05-20T09:00');
    expect(goalInput!.value).toBe('通过第 1-3 章');

    // 提交表单：点击 submit 按钮以触发 React 事件系统。
    const { createExam } = await import('../src/api/study-rhythm-api');
    const submitButton = form!.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submitButton).not.toBeNull();
    await act(async () => {
      submitButton!.click();
    });
    await flush();

    expect(createExam).toHaveBeenCalledTimes(1);
    const call = (createExam as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      semesterId: 'sem-1',
      courseInstanceId: STUB_COURSE.id,
      name: '期中考试',
      attemptType: 'normal',
      goal: '通过第 1-3 章',
    });
    // examAt 会经过 new Date(...).toISOString()：只断言是有效 ISO 且指向 2026-05-20。
    expect(typeof call.examAt).toBe('string');
    expect(call.examAt).toMatch(/^2026-05-20T/);
  });
});
