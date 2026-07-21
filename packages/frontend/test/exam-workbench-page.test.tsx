import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarDayDistance, formatExamCountdown, isWithinCalendarDayWindow } from '../src/pages/exam-workbench-date';
import { ExamWorkbenchPage } from '../src/pages/exam-workbench-page';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function fixtureUuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

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
  id: fixtureUuid('1'),
  semesterId: 'semester-1',
  name: '线性代数',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};
const COURSE_B = {
  ...COURSE_A,
  id: fixtureUuid('2'),
  name: '大学英语',
};
const CURRENT_EXAM_ID = fixtureUuid('3');
const OTHER_EXAM_ID = fixtureUuid('4');
const PENDING_EXAM_ID = fixtureUuid('5');

function localIsoAfterDays(days: number, hour = 9): string {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value.toISOString();
}

function toLocalDateTimeInput(iso: string): string {
  const value = new Date(iso);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

let currentExam: any;
let allExams: any[];
let allTasks: any[];
let timelineEvents: any[];
let cramPlan: any;

function makeAvailableCramPlan(exam = currentExam) {
  return {
    assessmentAttemptId: exam.id,
    courseInstanceId: exam.courseInstanceId,
    assessmentName: exam.name,
    examAt: exam.examAt,
    daysUntilExam: 5,
    availability: 'available' as const,
    days: [
      {
        date: new Date().toISOString().slice(0, 10),
        suggestions: [
          {
            id: 'task-1',
            priority: 1 as const,
            reason: '优先完成考试前到期的未完成任务',
            sourceKind: 'study_task' as const,
            sourceId: 'task-1',
            targetType: 'study_task' as const,
            targetId: 'task-1',
          },
        ],
      },
    ],
  };
}

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
      id: fixtureUuid('6'),
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
      id: fixtureUuid('7'),
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
      id: fixtureUuid('8'),
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
  timelineEvents = [];
  cramPlan = makeAvailableCramPlan(currentExam);
}

vi.mock('../src/api/study-rhythm-api', () => ({
  getExam: vi.fn(async () => currentExam),
  getCourses: vi.fn(async () => [COURSE_A, COURSE_B]),
  getExams: vi.fn(async () => allExams),
  getStudyTasks: vi.fn(async () => allTasks),
  getTimeline: vi.fn(async () => timelineEvents),
  confirmExam: vi.fn(async () => {
    currentExam = { ...currentExam, confirmationStatus: 'confirmed', confirmedAt: new Date().toISOString() };
    allExams = allExams.map((exam) => (exam.id === currentExam.id ? currentExam : exam));
    return currentExam;
  }),
  createStudyTask: vi.fn(async (data) => {
    const task = {
      id: fixtureUuid('9'),
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

vi.mock('../src/api/cram-plan-api', () => ({
  getCramPlan: vi.fn(async () => cramPlan),
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
    expect(container.querySelector(`a[href="/exams/${CURRENT_EXAM_ID}/practice"]`)).not.toBeNull();

    const cramSection = container.querySelector('[data-testid="workbench-cram"]');
    expect(cramSection?.textContent).toContain('冲刺中');
    expect(cramSection?.textContent).toContain('建议天数1 天');
    expect(cramSection?.textContent).toContain('建议数量1 项');
    expect(cramSection?.textContent).toContain('优先完成考试前到期的未完成任务');
    expect(cramSection?.textContent).toContain('只读摘要');
    expect(container.querySelector(`a[href="/exams/${CURRENT_EXAM_ID}/cram"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="/exams/${CURRENT_EXAM_ID}/cram-plan"]`)).not.toBeNull();
  });

  it('pending 考试只显示确认动作，确认后才显示正式计划', async () => {
    currentExam = { ...allExams.find((exam) => exam.id === PENDING_EXAM_ID) };
    await renderWorkbench(PENDING_EXAM_ID);

    expect(container.textContent).toContain('考试日期待确认');
    expect(container.querySelector('[data-testid="task-plan"]')).toBeNull();
    expect(container.querySelector('[data-testid="workbench-practice"]')).toBeNull();
    expect(container.querySelector('[data-testid="workbench-cram"]')?.textContent).toContain('请先确认考试信息');
    const { getCramPlan } = await import('../src/api/cram-plan-api');
    expect(getCramPlan).not.toHaveBeenCalled();
    await act(async () => buttonContaining('确认考试日期').click());
    await flush();

    const { confirmExam } = await import('../src/api/study-rhythm-api');
    expect(confirmExam).toHaveBeenCalledWith('semester-1', PENDING_EXAM_ID);
    expect(container.querySelector('[data-testid="task-plan"]')).not.toBeNull();
  });
  it.each([
    ['not_started', '尚未开始', '尚未进入考前 7 天冲刺窗口'],
    ['ended', '已结束', '该考试已结束'],
    ['available', '冲刺中', '暂时没有可安全生成的建议'],
  ] as const)('冲刺摘要明确展示 %s 窗口状态和降级提示', async (availability, label, message) => {
    cramPlan = { ...makeAvailableCramPlan(), availability, days: [] };

    await renderWorkbench();

    const section = container.querySelector('[data-testid="workbench-cram"]');
    expect(section?.textContent).toContain(label);
    expect(section?.textContent).toContain(message);
    expect(section?.textContent).toContain('建议天数0 天');
    expect(section?.textContent).toContain('建议数量0 项');
  });

  it('冲刺摘要失败时只在局部显示错误，并可重试恢复', async () => {
    const { getCramPlan } = await import('../src/api/cram-plan-api');
    const cramPlanMock = getCramPlan as unknown as ReturnType<typeof vi.fn>;
    cramPlanMock.mockRejectedValueOnce(new Error('冲刺摘要暂不可用'));

    await renderWorkbench();

    expect(container.querySelector('[data-testid="workbench-cram"]')?.textContent).toContain('冲刺摘要暂不可用');
    expect(container.querySelector('[data-testid="task-plan"]')).not.toBeNull();
    await act(async () => buttonContaining('重试').click());
    await flush();

    expect(cramPlanMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="workbench-cram"]')?.textContent).toContain(
      '优先完成考试前到期的未完成任务'
    );
  });

  it('冲刺区只导航，不触发任务或考试写请求', async () => {
    await renderWorkbench();

    const section = container.querySelector('[data-testid="workbench-cram"]')!;
    expect(section.querySelectorAll('button')).toHaveLength(0);
    expect(section.querySelectorAll('a')).toHaveLength(2);

    const { confirmExam, createStudyTask, updateStudyTaskStatus } = await import('../src/api/study-rhythm-api');
    expect(confirmExam).not.toHaveBeenCalled();
    expect(createStudyTask).not.toHaveBeenCalled();
    expect(updateStudyTaskStatus).not.toHaveBeenCalled();
  });

  it('切换考试时立即隐藏旧冲刺摘要，并只接受新考试结果', async () => {
    const { getCramPlan } = await import('../src/api/cram-plan-api');
    const cramPlanMock = getCramPlan as unknown as ReturnType<typeof vi.fn>;
    const otherExam = allExams.find((exam) => exam.id === OTHER_EXAM_ID);
    let resolveOtherPlan: ((plan: any) => void) | undefined;
    cramPlanMock
      .mockResolvedValueOnce(makeAvailableCramPlan(currentExam))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOtherPlan = resolve;
          })
      );

    await renderWorkbench();
    expect(container.querySelector('[data-testid="workbench-cram"]')?.textContent).toContain(
      '优先完成考试前到期的未完成任务'
    );

    currentExam = otherExam;
    await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="/exams/${OTHER_EXAM_ID}"]`)!.click());
    await flush();

    const pendingSection = container.querySelector('[data-testid="workbench-cram"]');
    expect(pendingSection?.textContent).toContain('正在读取冲刺摘要');
    expect(pendingSection?.textContent).not.toContain('优先完成考试前到期的未完成任务');

    await act(async () =>
      resolveOtherPlan?.({
        ...makeAvailableCramPlan(otherExam),
        daysUntilExam: 7,
        days: [
          {
            date: new Date().toISOString().slice(0, 10),
            suggestions: [
              {
                id: 'task-other',
                priority: 1,
                reason: '先完成英语考试前任务',
                sourceKind: 'study_task',
                sourceId: 'task-other',
                targetType: 'study_task',
                targetId: 'task-other',
              },
            ],
          },
        ],
      })
    );
    await flush();

    const completedSection = container.querySelector('[data-testid="workbench-cram"]');
    expect(completedSection?.textContent).toContain('先完成英语考试前任务');
    expect(completedSection?.textContent).not.toContain('优先完成考试前到期的未完成任务');
    expect(cramPlanMock).toHaveBeenLastCalledWith('semester-1', OTHER_EXAM_ID, expect.any(AbortSignal));
  });

  it('切换考试项目时将任务截止时间重置为新考试日期', async () => {
    await renderWorkbench();
    const deadline = container.querySelector<HTMLInputElement>('input[name="deadlineAt"]')!;
    await setInput(deadline, '2026-07-19T20:00');
    await setInput(container.querySelector<HTMLInputElement>('input[name="taskTitle"]')!, '考试 A 草稿');
    await setInput(container.querySelector<HTMLSelectElement>('select[name="taskType"]')!, 'practice');
    await setInput(container.querySelector<HTMLInputElement>('input[name="estimatedMinutes"]')!, '45');

    const otherExam = allExams.find((exam) => exam.id === OTHER_EXAM_ID);
    currentExam = otherExam;
    const otherLink = container.querySelector<HTMLAnchorElement>(`a[href="/exams/${OTHER_EXAM_ID}"]`)!;
    await act(async () => otherLink.click());
    await flush();

    expect(container.textContent).toContain('英语测验');
    expect(container.querySelector<HTMLInputElement>('input[name="deadlineAt"]')?.value).toBe(
      toLocalDateTimeInput(otherExam.examAt)
    );
    expect(container.querySelector<HTMLInputElement>('input[name="taskTitle"]')?.value).toBe('');
    expect(container.querySelector<HTMLSelectElement>('select[name="taskType"]')?.value).toBe('custom');
    expect(container.querySelector<HTMLInputElement>('input[name="estimatedMinutes"]')?.value).toBe('');
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
      taskId: fixtureUuid('6'),
      status: 'doing',
    });

    await act(async () => buttonContaining('标记完成').click());
    await flush();
    expect(updateStudyTaskStatus).toHaveBeenCalledWith({
      semesterId: 'semester-1',
      taskId: fixtureUuid('6'),
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

  it('按当前课程读取近期活动并只展示固定文案和脱敏元信息', async () => {
    const sensitiveUuid = fixtureUuid('a');
    const occurredAt = '2026-07-17T08:30:00.000Z';
    timelineEvents = [
      timelineEvent('S1', 'assessment_attempt_confirmed', {
        title: `聊天正文 ${sensitiveUuid}`,
        evidenceRef: `chat:${sensitiveUuid}`,
      }),
      timelineEvent('S2', 'material_note_completed', {
        title: `资料正文 ${sensitiveUuid}`,
        evidenceRef: `material:${sensitiveUuid}`,
        workloadMinutes: 18,
        qualityGate: 'passed',
        occurredAt,
      }),
      timelineEvent('S3', 'practice_completed', { qualityGate: 'pending' }),
      timelineEvent('S4', 'mistake_reviewed', { qualityGate: 'failed' }),
      timelineEvent('S2', 'knowledge_module_status_changed'),
      timelineEvent('S4', 'feedback_review_required'),
      timelineEvent('S4', 'feedback_review_mastered'),
      timelineEvent('S1', 'study_task_completed'),
      timelineEvent('S7', 'unexpected_private_event', {
        title: `聊天正文 资料正文 ${sensitiveUuid}`,
        evidenceRef: sensitiveUuid,
      }),
    ];

    await renderWorkbench();

    const { getTimeline } = await import('../src/api/study-rhythm-api');
    expect(getTimeline).toHaveBeenCalledWith('semester-1', { limit: 8, courseInstanceId: COURSE_A.id }, expect.any(AbortSignal));

    const timeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(timeline?.textContent).toContain('考试日期已确认');
    expect(timeline?.textContent).toContain('学习任务已完成');
    expect(timeline?.textContent).toContain('资料笔记已生成');
    expect(timeline?.textContent).toContain('知识模块状态已更新');
    expect(timeline?.textContent).toContain('限时练习已完成');
    expect(timeline?.textContent).toContain('错题重做结果');
    expect(timeline?.textContent).toContain('知识模块需要复习');
    expect(timeline?.textContent).toContain('错题复习已掌握');
    expect(timeline?.textContent).toContain('未分类学习活动');
    expect(timeline?.textContent).toContain('S1学习节奏');
    expect(timeline?.textContent).toContain('S2资料笔记');
    expect(timeline?.textContent).toContain('S3限时练习');
    expect(timeline?.textContent).toContain('S4错题改错');
    expect(timeline?.textContent).toContain('S7课堂采集');
    expect(timeline?.textContent).toContain(new Date(occurredAt).toLocaleString('zh-CN'));
    expect(timeline?.textContent).toContain('18 分钟');
    expect(timeline?.textContent).toContain('已通过');
    expect(timeline?.textContent).toContain('待检查');
    expect(timeline?.textContent).toContain('未通过');
    expect(timeline?.textContent).not.toContain('聊天正文');
    expect(timeline?.textContent).not.toContain('资料正文');
    expect(timeline?.textContent).not.toContain(sensitiveUuid);
  });

  it('近期活动为空时显示独立空状态', async () => {
    timelineEvents = [];
    await renderWorkbench();

    expect(container.querySelector('[data-testid="recent-study-activity"]')?.textContent).toContain('暂无近期学习活动');
  });

  it('时间线失败只影响活动区，并可局部重试', async () => {
    const { getTimeline } = await import('../src/api/study-rhythm-api');
    const timelineMock = getTimeline as unknown as ReturnType<typeof vi.fn>;
    timelineMock.mockRejectedValueOnce(new Error('近期活动加载失败')).mockResolvedValueOnce([
      timelineEvent('S3', 'practice_completed'),
    ]);

    await renderWorkbench();

    expect(container.textContent).toContain('线性代数期中');
    expect(container.querySelector('[data-testid="task-plan"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workbench-practice"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workbench-mistakes"]')).not.toBeNull();
    const timeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(timeline?.textContent).toContain('近期活动加载失败');

    await act(async () => buttonContaining('重试').click());
    await flush();

    expect(timelineMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="recent-study-activity"]')?.textContent).toContain('限时练习已完成');
  });

  it('切换考试时在新请求完成前隐藏旧课程活动，完成后只显示新课程', async () => {
    const { getTimeline } = await import('../src/api/study-rhythm-api');
    const timelineMock = getTimeline as unknown as ReturnType<typeof vi.fn>;
    let resolveCourseB: ((events: any[]) => void) | undefined;
    timelineMock.mockImplementation(async (_semesterId: string, options: { courseInstanceId?: string }) => {
      if (options.courseInstanceId === COURSE_A.id) return [timelineEvent('S1', 'study_task_completed')];
      return new Promise<any[]>((resolve) => {
        resolveCourseB = resolve;
      });
    });

    await renderWorkbench();
    expect(container.querySelector('[data-testid="recent-study-activity"]')?.textContent).toContain('学习任务已完成');

    currentExam = allExams.find((exam) => exam.id === OTHER_EXAM_ID);
    await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="/exams/${OTHER_EXAM_ID}"]`)!.click());
    await flush();

    const pendingTimeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(pendingTimeline?.textContent).not.toContain('学习任务已完成');
    expect(pendingTimeline?.textContent).toContain('正在加载近期学习活动');
    expect(timelineMock).toHaveBeenLastCalledWith(
      'semester-1',
      { limit: 8, courseInstanceId: COURSE_B.id },
      expect.any(AbortSignal)
    );

    await act(async () => resolveCourseB?.([timelineEvent('S4', 'mistake_reviewed', { courseInstanceId: COURSE_B.id })]));
    await flush();

    const completedTimeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(completedTimeline?.textContent).toContain('错题重做结果');
    expect(completedTimeline?.textContent).not.toContain('学习任务已完成');
  });

  it('路由切换后在新考试主请求完成前隐藏旧考试时间线', async () => {
    const { getExam, getTimeline } = await import('../src/api/study-rhythm-api');
    const getExamMock = getExam as unknown as ReturnType<typeof vi.fn>;
    const timelineMock = getTimeline as unknown as ReturnType<typeof vi.fn>;
    const otherExam = allExams.find((exam) => exam.id === OTHER_EXAM_ID);
    let resolveOtherExam: ((exam: any) => void) | undefined;

    getExamMock.mockImplementation(async (_semesterId: string, requestedExamId: string) => {
      if (requestedExamId === CURRENT_EXAM_ID) return currentExam;
      return new Promise((resolve) => {
        resolveOtherExam = resolve;
      });
    });
    timelineMock.mockImplementation(async (_semesterId: string, options: { courseInstanceId?: string }) =>
      options.courseInstanceId === COURSE_A.id
        ? [timelineEvent('S1', 'study_task_completed')]
        : [timelineEvent('S4', 'mistake_reviewed', { courseInstanceId: COURSE_B.id })]
    );

    await renderWorkbench();
    expect(container.querySelector('[data-testid="recent-study-activity"]')?.textContent).toContain('学习任务已完成');

    await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="/exams/${OTHER_EXAM_ID}"]`)!.click());
    await flush();

    const pendingTimeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(pendingTimeline?.textContent).toContain('正在加载近期学习活动');
    expect(pendingTimeline?.textContent).not.toContain('学习任务已完成');

    await act(async () => resolveOtherExam?.(otherExam));
    await flush();

    const completedTimeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(completedTimeline?.textContent).toContain('错题重做结果');
    expect(completedTimeline?.textContent).not.toContain('学习任务已完成');
  });

  it('忽略已取消的旧课程时间线普通错误并保留新课程结果', async () => {
    const { getExam, getTimeline } = await import('../src/api/study-rhythm-api');
    const getExamMock = getExam as unknown as ReturnType<typeof vi.fn>;
    const timelineMock = getTimeline as unknown as ReturnType<typeof vi.fn>;
    let rejectCourseA: ((error: Error) => void) | undefined;
    let courseASignal: AbortSignal | undefined;
    let courseAWasAborted = false;

    getExamMock.mockImplementation(async () => currentExam);
    timelineMock.mockImplementation(
      async (_semesterId: string, options: { courseInstanceId?: string }, signal: AbortSignal) => {
        if (options.courseInstanceId === COURSE_A.id) {
          courseASignal = signal;
          signal.addEventListener('abort', () => {
            courseAWasAborted = true;
          });
          return new Promise<any[]>((_resolve, reject) => {
            rejectCourseA = reject;
          });
        }
        return [timelineEvent('S4', 'mistake_reviewed', { courseInstanceId: COURSE_B.id })];
      }
    );

    await renderWorkbench();
    expect(container.querySelector('[data-testid="recent-study-activity"]')?.textContent).toContain(
      '正在加载近期学习活动'
    );

    currentExam = allExams.find((exam) => exam.id === OTHER_EXAM_ID);
    await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="/exams/${OTHER_EXAM_ID}"]`)!.click());
    await flush();

    expect(courseASignal?.aborted).toBe(true);
    expect(courseAWasAborted).toBe(true);
    expect(container.querySelector('[data-testid="recent-study-activity"]')?.textContent).toContain('错题重做结果');

    await act(async () => rejectCourseA?.(new Error('已取消请求的包装错误')));
    await flush();

    const timeline = container.querySelector('[data-testid="recent-study-activity"]');
    expect(timeline?.textContent).toContain('错题重做结果');
    expect(timeline?.textContent).not.toContain('已取消请求的包装错误');
    expect(container.textContent).toContain('英语测验');
    expect(container.querySelector('[data-testid="task-plan"]')).not.toBeNull();
  });
});

function timelineEvent(sourceSystem: string, eventType: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `event-${sourceSystem}-${eventType}`,
    courseInstanceId: COURSE_A.id,
    sourceSystem,
    eventType,
    title: '数据库标题不得展示',
    parentVisible: true,
    occurredAt: '2026-07-17T08:00:00.000Z',
    createdAt: '2026-07-17T08:00:00.000Z',
    ...overrides,
  };
}
