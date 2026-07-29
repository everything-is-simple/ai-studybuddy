import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentSemesterDto, SemesterSummaryDto } from '@ai-studybuddy/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  listSemesters: vi.fn(),
  listArchivedSemesters: vi.fn(),
  archiveSemester: vi.fn(),
  selectCurrentSemester: vi.fn(),
  previewSemesterTimetable: vi.fn(),
  confirmSemester: vi.fn(),
}));

const firstSemester: SemesterSummaryDto = {
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

const secondSemester: SemesterSummaryDto = {
  ...firstSemester,
  id: '22222222-2222-4222-8222-222222222222',
  semesterCode: '2026 秋季学期',
  teachingStartDate: '2026-09-01',
  teachingEndDate: '2027-01-20',
  isCurrent: false,
};

const archivedSemester: SemesterSummaryDto = {
  ...firstSemester,
  id: '33333333-3333-4333-8333-333333333333',
  semesterCode: '2025 秋季学期',
  teachingStartDate: '2025-09-01',
  teachingEndDate: '2026-01-20',
  status: 'archived',
  isCurrent: false,
  archivedAt: '2026-02-01T00:00:00.000Z',
};

vi.mock('../src/api/semester-api', () => ({
  listSemesters: mocks.listSemesters,
  listArchivedSemesters: mocks.listArchivedSemesters,
  archiveSemester: mocks.archiveSemester,
  selectCurrentSemester: mocks.selectCurrentSemester,
  previewSemesterTimetable: mocks.previewSemesterTimetable,
  confirmSemester: mocks.confirmSemester,
}));

let container: HTMLDivElement;
let root: Root;
let onCurrentChange: ReturnType<typeof vi.fn<(current: CurrentSemesterDto) => void>>;

beforeEach(() => {
  mocks.listSemesters.mockResolvedValue([]);
  mocks.listArchivedSemesters.mockResolvedValue([]);
  mocks.archiveSemester.mockResolvedValue(archivedSemester);
  mocks.selectCurrentSemester.mockResolvedValue({ semester: secondSemester, recoveredFromStaleCurrent: false });
  mocks.previewSemesterTimetable.mockResolvedValue({
    previewId: 'preview-1',
    expiresAt: '2026-07-18T01:00:00.000Z',
    semesterCode: '2026 春季学期',
    teachingStartDate: '2026-02-16',
    teachingEndDate: '2026-06-30',
    finalArchiveDate: null,
    requiresStudentName: true,
    entries: [
      {
        clientId: 'entry-1',
        courseName: '数学',
        weekday: 1,
        startTime: '08:00',
        endTime: '08:45',
        location: '101',
        parserConfidence: 0.8,
        warnings: [],
      },
    ],
    warnings: ['请确认课程表预览'],
  });
  mocks.confirmSemester.mockResolvedValue({
    semester: firstSemester,
    current: { semester: firstSemester, recoveredFromStaleCurrent: false },
  });
  onCurrentChange = vi.fn();
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

async function renderPage(current: SemesterSummaryDto | null = null) {
  const { SemesterPage } = await import('../src/pages/semester-page');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/semesters']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/semesters" element={<SemesterPage current={current} onCurrentChange={onCurrentChange} />} />
          <Route path="/semesters/:semesterId/practice-history" element={<p>练习历史占位</p>} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flush();
}

async function setInputByLabel(labelText: string, value: string) {
  const label = [...container.querySelectorAll('label')].find((item) => item.textContent?.includes(labelText));
  expect(label, `应找到字段：${labelText}`).not.toBeNull();
  const input = label!.querySelector<HTMLInputElement>('input');
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input!;
}

async function setFileByLabel(labelText: string, file: File) {
  const label = [...container.querySelectorAll('label')].find((item) => item.textContent?.includes(labelText));
  expect(label, `应找到字段：${labelText}`).not.toBeNull();
  const input = label!.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('SemesterPage', () => {
  it('shows first-use empty state and creates a semester from editable preview', async () => {
    await renderPage(null);

    expect(container.textContent).toContain('还没有可用学期');
    expect(container.textContent).toContain('首次创建需要填写');

    await setInputByLabel('学生姓名', '学生A');
    await setInputByLabel('学期名称', '2026 春季学期');
    await setInputByLabel('开始日期', '2026-02-16');
    await setInputByLabel('结束日期', '2026-06-30');
    await setFileByLabel('课程表图片', new File([new Uint8Array([1, 2, 3])], 'timetable.png', { type: 'image/png' }));

    const createForm = container.querySelector<HTMLFormElement>('form.semester-form');
    expect(createForm).not.toBeNull();
    await act(async () => {
      createForm!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(mocks.previewSemesterTimetable).toHaveBeenCalledWith(
      expect.objectContaining({ semesterCode: '2026 春季学期', studentName: '学生A' })
    );
    expect(container.textContent).toContain('确认课程表预览');
    expect(container.textContent).toContain('规则解析置信度：80%');

    const previewCourseInput = container.querySelector<HTMLInputElement>('.timetable-preview-row input');
    expect(previewCourseInput).not.toBeNull();
    const previewSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      previewSetter.call(previewCourseInput, '数学强化');
      previewCourseInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const confirmButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('确认创建并切换'));
    expect(confirmButton).not.toBeNull();
    await act(async () => confirmButton!.click());
    await flush();

    expect(mocks.confirmSemester).toHaveBeenCalledWith(
      expect.objectContaining({
        previewId: 'preview-1',
        studentName: '学生A',
        entries: [expect.objectContaining({ courseName: '数学强化' })],
      })
    );
    expect(onCurrentChange).toHaveBeenCalledWith({ semester: firstSemester, recoveredFromStaleCurrent: false });
  });


  it('adds a manual timetable record when OCR preview has no parsed entries', async () => {
    mocks.previewSemesterTimetable.mockResolvedValueOnce({
      previewId: 'preview-empty',
      expiresAt: '2026-07-18T01:00:00.000Z',
      semesterCode: '2026 春季学期',
      teachingStartDate: '2026-02-16',
      teachingEndDate: '2026-06-30',
      finalArchiveDate: null,
      requiresStudentName: true,
      entries: [],
      warnings: ['未解析出课程，请手动补充后再确认'],
    });
    await renderPage(null);

    await setInputByLabel('学生姓名', '学生A');
    await setInputByLabel('学期名称', '2026 春季学期');
    await setInputByLabel('开始日期', '2026-02-16');
    await setInputByLabel('结束日期', '2026-06-30');
    await setFileByLabel('课程表图片', new File([new Uint8Array([1, 2, 3])], 'timetable.png', { type: 'image/png' }));
    const createForm = container.querySelector<HTMLFormElement>('form.semester-form');
    await act(async () => createForm!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();

    const addButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('新增课程表条目'));
    expect(addButton).not.toBeNull();
    await act(async () => addButton!.click());

    const courseInput = container.querySelector<HTMLInputElement>('.timetable-preview-row input');
    expect(courseInput).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(courseInput, '手动补录课程');
      courseInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const confirmButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('确认创建并切换'));
    expect(confirmButton?.disabled).toBe(false);
    await act(async () => confirmButton!.click());
    await flush();

    expect(mocks.confirmSemester).toHaveBeenCalledWith(expect.objectContaining({
      previewId: 'preview-empty',
      entries: [expect.objectContaining({ courseName: '手动补录课程', weekday: 1, startTime: '08:00', endTime: '09:00' })],
    }));
  });



  it('shows archived semesters, history links, and archives only non-current active semesters', async () => {
    mocks.listSemesters.mockResolvedValue([firstSemester, secondSemester]);
    mocks.listArchivedSemesters.mockResolvedValue([archivedSemester]);
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);

    await renderPage(firstSemester);

    expect(container.textContent).toContain('归档学期');
    expect(container.textContent).toContain('2025 秋季学期');
    expect([...container.querySelectorAll<HTMLAnchorElement>('a')].some((item) => item.href.endsWith(`/semesters/${firstSemester.id}/practice-history`))).toBe(true);
    expect([...container.querySelectorAll<HTMLAnchorElement>('a')].some((item) => item.href.endsWith(`/semesters/${archivedSemester.id}/practice-history`))).toBe(true);

    const currentItem = [...container.querySelectorAll('li')].find((item) => item.textContent?.includes(firstSemester.semesterCode));
    expect(currentItem?.textContent).not.toContain('归档此学期');

    const archivedItem = [...container.querySelectorAll('li')].find((item) => item.textContent?.includes(archivedSemester.semesterCode));
    expect(archivedItem?.textContent).toContain('只读');
    expect(archivedItem?.textContent).not.toContain('切换到此学期');

    const archiveButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('归档此学期'));
    expect(archiveButton).not.toBeNull();
    await act(async () => archiveButton!.click());
    await flush();

    expect(confirmMock).toHaveBeenCalled();
    expect(mocks.archiveSemester).toHaveBeenCalledWith(secondSemester.id);
    expect(mocks.listArchivedSemesters).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('lists semesters and switches current semester without asking for student name again', async () => {
    mocks.listSemesters.mockResolvedValue([firstSemester, secondSemester]);
    await renderPage(firstSemester);

    expect(container.textContent).toContain('当前学期：2026 春季学期');
    expect(container.textContent).toContain('2026 秋季学期');
    expect(container.textContent).not.toContain('首次创建需要填写');

    const switchButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('切换到此学期'));
    expect(switchButton).not.toBeNull();
    await act(async () => switchButton!.click());
    await flush();

    expect(mocks.selectCurrentSemester).toHaveBeenCalledWith(secondSemester.id);
    expect(onCurrentChange).toHaveBeenCalledWith({ semester: secondSemester, recoveredFromStaleCurrent: false });
  });
});
