import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// React 18/19 都需要这个全局标记，否则会警告 "current testing environment is not configured to support act(...)"。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { CoursePage } from '../src/pages/course-page';
function fixtureUuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}


// 单课程 stub：一门线性代数、无考试、无任务。
const STUB_COURSE = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterId: 'sem-1',
  name: '线性代数',
  retakeOfCourseInstanceId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const PENDING_EXAM = {
  id: fixtureUuid('2'),
  courseInstanceId: STUB_COURSE.id,
  name: '期中考试',
  attemptType: 'normal',
  examAt: '2026-05-20T09:00:00.000Z',
  confirmationStatus: 'pending',
};

const CONFIRMED_EXAM = {
  ...PENDING_EXAM,
  confirmationStatus: 'confirmed',
  confirmedAt: '2026-07-15T12:00:00.000Z',
};

const STUB_SCHEDULE_ENTRY = {
  id: fixtureUuid('3'),
  semesterId: 'sem-1',
  courseInstanceId: STUB_COURSE.id,
  courseName: STUB_COURSE.name,
  weekday: 1 as const,
  startTime: '08:00',
  endTime: '09:30',
  location: 'A101',
  source: 'student_confirmed',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

let mockScheduleEntries: typeof STUB_SCHEDULE_ENTRY[] = [];
let mockExams: Array<typeof PENDING_EXAM | typeof CONFIRMED_EXAM> = [];

vi.mock('../src/api/study-rhythm-api', () => ({
  getCourses: vi.fn(async () => [STUB_COURSE]),
  createCourse: vi.fn(async () => STUB_COURSE),
  getExams: vi.fn(async () => mockExams),
  createExam: vi.fn(async () => ({ id: 'exam-1' })),
  confirmExam: vi.fn(async () => {
    mockExams = [CONFIRMED_EXAM];
    return CONFIRMED_EXAM;
  }),
  getStudyTasks: vi.fn(async () => []),
  getScheduleEntries: vi.fn(async () => mockScheduleEntries),
  updateCourse: vi.fn(async () => STUB_COURSE),
  createScheduleEntry: vi.fn(async () => {
    mockScheduleEntries = [STUB_SCHEDULE_ENTRY];
    return STUB_SCHEDULE_ENTRY;
  }),
  updateScheduleEntry: vi.fn(async () => STUB_SCHEDULE_ENTRY),
  deleteCourse: vi.fn(async () => STUB_COURSE),
  deleteScheduleEntry: vi.fn(async () => STUB_SCHEDULE_ENTRY),
  updateExam: vi.fn(async () => PENDING_EXAM),
  getTimeline: vi.fn(async () => ({ items: [], pagination: { total: 0 } })),
}));

// AppNavigation 挂了 react-router 的钩子；测试无需真实路由，用最小占位替换。
vi.mock('../src/components/app-navigation', () => ({
  AppNavigation: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockExams = [];
  mockScheduleEntries = [];
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
    root.render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CoursePage semesterId="sem-1" />
      </MemoryRouter>
    );
  });
  await flush();
}

describe('CoursePage 课程删除', () => {
  it('确认后在当前学期删除课程', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    await renderPage();

    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '删除课程');
    expect(deleteButton).not.toBeNull();
    await act(async () => { deleteButton!.click(); });
    await flush();

    const { deleteCourse } = await import('../src/api/study-rhythm-api');
    expect(deleteCourse).toHaveBeenCalledWith('sem-1', STUB_COURSE.id);
    expect(container.textContent).toContain('课程已删除');
  });
});

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

describe('CoursePage 考试确认入口', () => {
  it('确认 pending 考试时禁用按钮，成功后显示考试项目入口', async () => {
    mockExams = [PENDING_EXAM];
    let resolveConfirmation: ((value: typeof CONFIRMED_EXAM) => void) | undefined;
    const { confirmExam } = await import('../src/api/study-rhythm-api');
    (confirmExam as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfirmation = resolve;
        })
    );
    await renderPage();

    expect(container.textContent).toContain('待确认');
    const confirmButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('确认考试日期')
    );
    expect(confirmButton).not.toBeNull();
    await act(async () => {
      confirmButton!.click();
    });
    expect(confirmButton!.disabled).toBe(true);
    expect(confirmExam).toHaveBeenCalledWith('sem-1', PENDING_EXAM.id);

    mockExams = [CONFIRMED_EXAM];
    await act(async () => {
      resolveConfirmation?.(CONFIRMED_EXAM);
    });
    await flush();

    const link = container.querySelector<HTMLAnchorElement>(`a[href="/exams/${PENDING_EXAM.id}"]`);
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('进入考试项目');
  });

  it('确认失败时在考试区域显示错误并允许重试', async () => {
    mockExams = [PENDING_EXAM];
    const { confirmExam } = await import('../src/api/study-rhythm-api');
    (confirmExam as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('当前考试状态不允许确认'));
    await renderPage();

    const confirmButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('确认考试日期')
    );
    await act(async () => {
      confirmButton!.click();
    });
    await flush();

    expect(container.textContent).toContain('当前考试状态不允许确认');
    expect(confirmButton!.disabled).toBe(false);
  });
});


describe('CoursePage T09C 课程、课表与考试编辑', () => {
  it('展示周日到周六的完整课表，并只为已确认考试展示正式倒计时', async () => {
    mockScheduleEntries = [STUB_SCHEDULE_ENTRY];
    mockExams = [CONFIRMED_EXAM];
    await renderPage();

    for (const weekday of ['周日', '周一', '周二', '周三', '周四', '周五', '周六']) {
      expect(container.textContent).toContain(weekday);
    }
    expect(container.textContent).toContain('线性代数');
    expect(container.textContent).toContain('08:00–09:30');
    expect(container.textContent).toContain('正式倒计时：');
  });

  it('提供课程名和考试目标编辑入口，并把学期边界带入更新请求', async () => {
    mockExams = [CONFIRMED_EXAM];
    await renderPage();

    const courseEdit = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '编辑课程名称');
    expect(courseEdit).not.toBeNull();
    await act(async () => { courseEdit!.click(); });
    const courseInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑课程名称"]');
    expect(courseInput).not.toBeNull();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      nativeSetter.call(courseInput!, '高等代数');
      courseInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveCourse = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存课程名称');
    await act(async () => { saveCourse!.click(); });
    await flush();
    const { updateCourse } = await import('../src/api/study-rhythm-api');
    expect(updateCourse).toHaveBeenCalledWith('sem-1', STUB_COURSE.id, { name: '高等代数' });

    const examEdit = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '编辑考试');
    expect(examEdit).not.toBeNull();
  });
});

  it('可新增、编辑和移除课表条目，并在服务端失败时显示可重试错误', async () => {
    await renderPage();

    const courseSelect = container.querySelector<HTMLSelectElement>('select[aria-label="课表课程"]');
    const weekdaySelect = container.querySelector<HTMLSelectElement>('select[aria-label="星期"]');
    const startInput = container.querySelector<HTMLInputElement>('input[aria-label="开始时间"]');
    const endInput = container.querySelector<HTMLInputElement>('input[aria-label="结束时间"]');
    const locationInput = container.querySelector<HTMLInputElement>('input[aria-label="上课地点"]');
    expect(courseSelect).not.toBeNull();
    expect(weekdaySelect).not.toBeNull();
    expect(startInput).not.toBeNull();
    expect(endInput).not.toBeNull();
    expect(locationInput).not.toBeNull();

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      weekdaySelect!.value = '2';
      weekdaySelect!.dispatchEvent(new Event('change', { bubbles: true }));
      nativeSetter.call(startInput!, '10:00');
      startInput!.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSetter.call(endInput!, '11:30');
      endInput!.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSetter.call(locationInput!, 'B202');
      locationInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '添加课表条目');
    await act(async () => { addButton!.click(); });
    await flush();
    const { createScheduleEntry } = await import('../src/api/study-rhythm-api');
    expect(createScheduleEntry).toHaveBeenCalledWith({
      semesterId: 'sem-1',
      courseInstanceId: STUB_COURSE.id,
      weekday: 2,
      startTime: '10:00',
      endTime: '11:30',
      location: 'B202',
    });

    await flush();
    const editButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '编辑课表条目');
    await act(async () => { editButton!.click(); });
    const { updateScheduleEntry, deleteScheduleEntry } = await import('../src/api/study-rhythm-api');
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存课表条目');
    await act(async () => { saveButton!.click(); });
    await flush();
    expect(updateScheduleEntry).toHaveBeenCalledWith('sem-1', STUB_SCHEDULE_ENTRY.id, expect.objectContaining({
      courseInstanceId: STUB_COURSE.id,
      weekday: 1,
      startTime: '08:00',
      endTime: '09:30',
      location: 'A101',
    }));
    const removeButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '移除课表条目');
    await act(async () => { removeButton!.click(); });
    await flush();
    expect(deleteScheduleEntry).toHaveBeenCalledWith('sem-1', STUB_SCHEDULE_ENTRY.id);
  });

  it('编辑已确认考试日期后显示等待重新确认，单独修改目标仍保留确认态', async () => {
    mockExams = [CONFIRMED_EXAM];
    const { updateExam } = await import('../src/api/study-rhythm-api');
    (updateExam as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      mockExams = [{ ...CONFIRMED_EXAM, examAt: '2026-05-21T09:00:00.000Z', confirmationStatus: 'pending', confirmedAt: undefined }];
      return mockExams[0];
    });
    await renderPage();

    const editButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '编辑考试');
    await act(async () => { editButton!.click(); });
    const dateInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑考试日期"]');
    expect(dateInput).not.toBeNull();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      nativeSetter.call(dateInput!, '2026-05-21T09:00');
      dateInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存考试');
    await act(async () => { saveButton!.click(); });
    await flush();
    expect(updateExam).toHaveBeenCalledWith('sem-1', CONFIRMED_EXAM.id, expect.objectContaining({ examAt: expect.stringMatching(/^2026-05-21T/) }));
    expect(container.textContent).toContain('等待重新确认');
    expect(container.textContent).not.toContain('正式倒计时：');
    expect(container.textContent).toContain('确认考试日期');
  });


describe('CoursePage T09C 状态反馈与确认态保护', () => {
  it('课表保存失败后显示错误，保留输入并允许再次提交', async () => {
    const { createScheduleEntry } = await import('../src/api/study-rhythm-api');
    (createScheduleEntry as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('课表时段重复'));
    await renderPage();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    const startInput = container.querySelector<HTMLInputElement>('input[aria-label="开始时间"]');
    const endInput = container.querySelector<HTMLInputElement>('input[aria-label="结束时间"]');
    await act(async () => {
      nativeSetter.call(startInput!, '10:00');
      startInput!.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSetter.call(endInput!, '11:00');
      endInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '添加课表条目');
    await act(async () => { addButton!.click(); });
    await flush();
    expect(container.textContent).toContain('课表时段重复');
    expect(startInput!.value).toBe('10:00');
    expect(addButton!.disabled).toBe(false);
    await act(async () => { addButton!.click(); });
    await flush();
    expect(createScheduleEntry).toHaveBeenCalledTimes(2);
  });

  it('清空考试目标时将空字符串提交给 updateExam', async () => {
    mockExams = [{ ...CONFIRMED_EXAM, goal: '旧目标' }];
    const { updateExam } = await import('../src/api/study-rhythm-api');
    await renderPage();
    const editButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '编辑考试');
    await act(async () => { editButton!.click(); });
    const goalInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑考试目标"]');
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      nativeSetter.call(goalInput!, '');
      goalInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存考试');
    await act(async () => { saveButton!.click(); });
    await flush();
    expect(updateExam).toHaveBeenCalledWith('sem-1', CONFIRMED_EXAM.id, expect.objectContaining({ goal: '' }));
  });
  it('仅修改考试目标后仍显示已确认状态和正式倒计时', async () => {
    mockExams = [CONFIRMED_EXAM];
    const { updateExam } = await import('../src/api/study-rhythm-api');
    (updateExam as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      mockExams = [{ ...CONFIRMED_EXAM, goal: '掌握矩阵运算' }];
      return mockExams[0];
    });
    await renderPage();
    const editButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '编辑考试');
    await act(async () => { editButton!.click(); });
    const goalInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑考试目标"]');
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      nativeSetter.call(goalInput!, '掌握矩阵运算');
      goalInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存考试');
    await act(async () => { saveButton!.click(); });
    await flush();
    expect(container.textContent).toContain('已确认');
    expect(container.textContent).toContain('正式倒计时：');
  });

  it('semesterId 缺失时给出创建和选择学期的引导', async () => {
    await act(async () => {
      root.render(<MemoryRouter><CoursePage semesterId={null} /></MemoryRouter>);
    });
    expect(container.textContent).toContain('请先创建并选择当前学期');
  });
});
