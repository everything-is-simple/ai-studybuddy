import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../src/api/api-client';
import type { DailyStudyHomeDto } from '@ai-studybuddy/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ getDailyStudyHome: vi.fn() }));

vi.mock('../src/api/daily-study-home-api', () => ({
  getDailyStudyHome: mocks.getDailyStudyHome,
}));

const SEMESTER_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const BASE_DTO: DailyStudyHomeDto = {
  semesterId: SEMESTER_ID,
  date: '2026-07-18',
  todayTasks: [
    {
      id: 'task-1',
      title: '完成函数练习',
      courseName: '数学',
      deadlineAt: '2026-07-18T20:00:00.000Z',
      type: 'practice',
    },
  ],
  tomorrowTasks: [],
  tomorrowSchedule: [
    {
      id: 'schedule-1',
      courseInstanceId: COURSE_ID,
      courseName: '数学',
      startTime: '08:00',
      endTime: '09:40',
      location: 'A-101',
    },
  ],
  upcomingExams: [
    { id: 'exam-1', name: '期中考试', courseName: '数学', examAt: '2026-07-20T08:00:00.000Z', daysUntil: 2 },
  ],
  pendingQualityMaterials: [
    {
      id: 'material-1',
      courseInstanceId: COURSE_ID,
      courseName: '数学',
      title: '失败讲义',
      status: 'conversion_failed',
    },
  ],
  errorReviews: [],
  nextAction: {
    kind: 'quality_material',
    title: '修正资料：失败讲义',
    path: `/materials?courseInstanceId=${COURSE_ID}`,
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.getDailyStudyHome.mockResolvedValue(BASE_DTO);
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

async function renderPage(onSemesterError = vi.fn()) {
  const { DailyStudyHomePage } = await import('../src/pages/daily-study-home-page');
  await act(async () => {
    root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DailyStudyHomePage semesterId={SEMESTER_ID} onSemesterError={onSemesterError} /></MemoryRouter>);
  });
  await flush();
  return onSemesterError;
}

describe('DailyStudyHomePage', () => {
  it('请求当前学期和本地日期，并渲染受控内部链接与下一步理由', async () => {
    await renderPage();

    expect(mocks.getDailyStudyHome).toHaveBeenCalledWith(SEMESTER_ID, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(container.textContent).toContain('每日学习首页');
    expect(container.textContent).toContain('资料需要先人工处理');
    expect(container.textContent).toContain('转换失败，待修正');
    expect(
      container.querySelector('a[href="/materials?courseInstanceId=22222222-2222-4222-8222-222222222222"]')
    ).not.toBeNull();
    expect(container.querySelector('a[href="/courses/22222222-2222-4222-8222-222222222222"]')).not.toBeNull();
  });

  it('空 DTO 显示空状态而不是错误', async () => {
    mocks.getDailyStudyHome.mockResolvedValue({
      ...BASE_DTO,
      todayTasks: [],
      tomorrowTasks: [],
      tomorrowSchedule: [],
      upcomingExams: [],
      pendingQualityMaterials: [],
      errorReviews: [],
      nextAction: null,
    });
    await renderPage();

    expect(container.textContent).toContain('当前学期暂时没有待办');
    expect(container.querySelector('.error-message')).toBeNull();
  });

  it('普通加载失败可重试且不改变当前学期', async () => {
    mocks.getDailyStudyHome.mockRejectedValueOnce(new Error('网络连接失败')).mockResolvedValueOnce(BASE_DTO);
    const onSemesterError = await renderPage();

    expect(container.textContent).toContain('网络连接失败');
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === '重新加载');
    expect(retry).toBeDefined();
    await act(async () => retry!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();

    expect(mocks.getDailyStudyHome).toHaveBeenCalledTimes(2);
    expect(onSemesterError).not.toHaveBeenCalled();
    expect(container.textContent).toContain('完成函数练习');
  });

  it('stale 学期错误交给既有应用壳回退，且不渲染旧首页数据', async () => {
    mocks.getDailyStudyHome.mockRejectedValue(new ApiClientError('SEMESTER_NOT_FOUND', '学期不存在'));
    const onSemesterError = await renderPage();

    expect(onSemesterError).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('完成函数练习');
  });
});
