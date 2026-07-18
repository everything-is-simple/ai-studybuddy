import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentSemesterDto, SemesterSummaryDto } from '@ai-studybuddy/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getConfigurationStatus: vi.fn(),
  getCurrentSemester: vi.fn(),
  semesterPageProps: [] as Array<{ current: SemesterSummaryDto | null; onCurrentChange: (current: CurrentSemesterDto) => void }>,
  courseSemesterIds: [] as Array<string | null>,
}));

const currentSemester: SemesterSummaryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterCode: '2026 春季学期',
  studentName: '学生A',
  teachingStartDate: '2026-02-16',
  teachingEndDate: '2026-06-30',
  finalArchiveDate: null,
  status: 'active',
  isCurrent: true,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

vi.mock('../src/api/configuration-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/configuration-api')>()),
  getConfigurationStatus: mocks.getConfigurationStatus,
}));

vi.mock('../src/api/semester-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/semester-api')>()),
  getCurrentSemester: mocks.getCurrentSemester,
}));

vi.mock('../src/pages/course-page', () => ({
  CoursePage: ({ semesterId }: { semesterId: string | null }) => {
    mocks.courseSemesterIds.push(semesterId);
    return <div className="page">课程页 semester={semesterId}</div>;
  },
}));

vi.mock('../src/pages/material-upload-page', () => ({
  MaterialUploadPage: ({ semesterId }: { semesterId: string | null }) => <div className="page">资料页 semester={semesterId}</div>,
}));

vi.mock('../src/pages/semester-page', () => ({
  SemesterPage: (props: { current: SemesterSummaryDto | null; onCurrentChange: (current: CurrentSemesterDto) => void }) => {
    mocks.semesterPageProps.push(props);
    return (
      <div className="page">
        <h1>学期管理</h1>
        <button type="button" onClick={() => props.onCurrentChange({ semester: currentSemester, recoveredFromStaleCurrent: false })}>
          模拟选择学期
        </button>
      </div>
    );
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.getConfigurationStatus.mockResolvedValue({
    ai: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
    smtp: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
    feishu: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
    runtime: { dataDir: true, aiAvailable: true, smtpAvailable: true, feishuAvailable: true, uptime: 1, nodeVersion: 'v-test' },
  });
  mocks.getCurrentSemester.mockResolvedValue({ semester: currentSemester, recoveredFromStaleCurrent: false });
  mocks.semesterPageProps.length = 0;
  mocks.courseSemesterIds.length = 0;
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

async function renderApp(initialEntry = '/courses') {
  const { App } = await import('../src/app');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    );
  });
  await flush();
}

describe('App current semester shell', () => {
  it('restores current semester from backend and removes manual UUID input', async () => {
    await renderApp('/courses');

    expect(container.textContent).toContain('当前学期');
    expect(container.textContent).toContain('2026 春季学期');
    expect(container.textContent).toContain('课程页 semester=11111111-1111-4111-8111-111111111111');
    expect(mocks.courseSemesterIds.at(-1)).toBe('11111111-1111-4111-8111-111111111111');
    expect(container.querySelector('#semesterId')).toBeNull();
    expect(container.textContent).not.toContain('输入 UUID 格式的学期 ID');
    expect(container.textContent).not.toContain('应用');
    expect(container.textContent).not.toContain('清除');
  });

  it('redirects first-use no-semester state to semester management', async () => {
    mocks.getCurrentSemester.mockResolvedValue({ semester: null, recoveredFromStaleCurrent: false });
    await renderApp('/courses');

    expect(container.textContent).toContain('尚未选择当前学期');
    expect(container.textContent).toContain('学期管理');
    expect(mocks.courseSemesterIds).toHaveLength(0);
  });

  it('shows stale-current recovery once without looping back to protected pages', async () => {
    mocks.getCurrentSemester.mockResolvedValue({ semester: null, recoveredFromStaleCurrent: true });
    await renderApp('/courses');

    expect(mocks.getCurrentSemester).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('已清理失效的当前学期');
    expect(container.textContent).toContain('学期管理');
  });

  it('keeps protected routes on current semester read failure and supports retry', async () => {
    mocks.getCurrentSemester.mockRejectedValueOnce(new Error('接口不可用')).mockResolvedValueOnce({
      semester: currentSemester,
      recoveredFromStaleCurrent: false,
    });
    await renderApp('/courses');

    expect(mocks.getCurrentSemester).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('当前学期恢复失败');
    expect(container.textContent).toContain('接口不可用');
    expect(mocks.courseSemesterIds).toHaveLength(0);

    const retryButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('重新读取当前学期')
    );
    expect(retryButton).not.toBeNull();
    await act(async () => retryButton!.click());
    await flush();

    expect(mocks.getCurrentSemester).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('课程页 semester=11111111-1111-4111-8111-111111111111');
  });

  it('updates current semester after semester page selects or creates one', async () => {
    mocks.getCurrentSemester.mockResolvedValue({ semester: null, recoveredFromStaleCurrent: false });
    await renderApp('/semesters');

    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('模拟选择学期'));
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    await flush();

    expect(container.textContent).toContain('2026 春季学期');
    expect(mocks.semesterPageProps.at(-1)?.current?.id).toBe(currentSemester.id);
  });
});
