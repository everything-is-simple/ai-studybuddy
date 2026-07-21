import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CramPlanPage } from '../src/pages/cram-plan-page';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const getExamMock = vi.fn();
const getCramPlanMock = vi.fn();
vi.mock('../src/api/study-rhythm-api', () => ({ getExam: (...args: unknown[]) => getExamMock(...args) }));
vi.mock('../src/api/cram-plan-api', () => ({ getCramPlan: (...args: unknown[]) => getCramPlanMock(...args) }));

const confirmedExam = { id: 'exam-1', courseInstanceId: 'course-1', name: '期末考试', confirmationStatus: 'confirmed' };
const availablePlan = {
  assessmentAttemptId: 'exam-1', courseInstanceId: 'course-1', assessmentName: '期末考试', examAt: '2026-07-27T08:00:00.000Z', daysUntilExam: 6, availability: 'available' as const,
  days: [{ date: '2026-07-21', suggestions: [
    { id: 'task-1', priority: 1, reason: '优先完成考试前到期的未完成任务', sourceKind: 'study_task' as const, sourceId: 'task-1', targetType: 'study_task' as const, targetId: 'task-1' },
    { id: 'weak-1', priority: 2, reason: '薄弱点已有 3 条证据', sourceKind: 'weak_point' as const, sourceId: 'weak-1', targetType: 'weak_point' as const, targetId: 'weak-1' },
    { id: 'mistake-1', priority: 3, reason: '错题累计 2 次错误', sourceKind: 'mistake' as const, sourceId: 'mistake-1', targetType: 'mistake' as const, targetId: 'mistake-1' },
    { id: 'practice-1', priority: 4, reason: '已完成练习正确率 40%，建议针对性复盘', sourceKind: 'practice_performance' as const, sourceId: 'practice-1', targetType: 'practice_history' as const, targetId: 'practice-1' },
    { id: 'cram-cards', priority: 4, reason: '可使用临考速背快速回顾已整理考点', sourceKind: 'cram_cards' as const, sourceId: null, targetType: 'cram_cards' as const, targetId: 'exam-1' },
  ] }],
};

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
async function click(element: Element) { await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }

function Switcher() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/exams/exam-2/cram-plan')}>切换考试</button>;
}

function renderPage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/exams/exam-1/cram-plan']}><Routes><Route path="/exams/:examId/cram-plan" element={<><Switcher /><CramPlanPage semesterId="semester-1" /></>} /></Routes></MemoryRouter>);
  });
  return { container, root };
}

function linkHref(container: HTMLElement, label: string) {
  return [...container.querySelectorAll<HTMLAnchorElement>('a')].find((link) => link.textContent === label)?.getAttribute('href');
}

describe('T05 冲刺计划页面', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    getExamMock.mockReset();
    getCramPlanMock.mockReset();
    getExamMock.mockResolvedValue(confirmedExam);
    getCramPlanMock.mockResolvedValue(availablePlan);
  });
  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it('renders daily read-only suggestions, navigation and actionable deep links', async () => {
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('期末考试 的冲刺计划');
    expect(container!.textContent).toContain('考试前任务');
    expect(container!.textContent).toContain('薄弱点证据');
    expect(linkHref(container!, '前往复习')).toBe('/exams/exam-1');
    const links = [...container!.querySelectorAll<HTMLAnchorElement>('a')].map((link) => link.getAttribute('href'));
    expect(links).toContain('/exams/exam-1/mistakes');
    expect(links).toContain('/semesters/semester-1/practice-history?courseInstanceId=course-1');
    expect(links).toContain('/exams/exam-1/cram');
    const planNav = [...container!.querySelectorAll<HTMLAnchorElement>('a')].find((link) => link.textContent === '冲刺计划');
    expect(planNav?.getAttribute('aria-current')).toBe('page');
    expect([...container!.querySelectorAll<HTMLAnchorElement>('a')].filter((link) => link.textContent === '前往复习').every((link) => link.getAttribute('href'))).toBe(true);
  });

  it('does not fetch a plan for an unconfirmed exam', async () => {
    getExamMock.mockResolvedValue({ ...confirmedExam, confirmationStatus: 'pending' });
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('请先确认考试信息');
    expect(getCramPlanMock).not.toHaveBeenCalled();
  });

  it('renders explicit window states and the safe empty manual-review state', async () => {
    for (const [availability, message] of [['not_started', '尚未进入冲刺窗口'], ['ended', '冲刺期已结束'], ['available', '暂时没有可安全生成的建议']] as const) {
      getCramPlanMock.mockResolvedValue({ ...availablePlan, availability, days: [] });
      ({ container, root } = renderPage());
      await flush();
      expect(container!.textContent).toContain(message);
      if (availability === 'available') {
        expect(linkHref(container!, '开始练习')).toBe('/exams/exam-1/practice');
        expect(linkHref(container!, '查看知识资料')).toBe('/materials?courseInstanceId=course-1');
      }
      act(() => root?.unmount()); container?.remove(); root = null; container = null;
    }
  });

  it('shows a retry action after request failure and refreshes suggestions', async () => {
    getCramPlanMock.mockRejectedValueOnce(new Error('计划暂不可用')).mockResolvedValueOnce(availablePlan);
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('计划暂不可用');
    const retry = [...container!.querySelectorAll('button')].find((button) => button.textContent?.includes('重试'));
    expect(retry).not.toBeNull();
    await click(retry!);
    await flush();
    expect(container!.textContent).toContain('考试前任务');
    expect(getCramPlanMock).toHaveBeenCalledTimes(2);
  });

  it('clears stale suggestions immediately while switching examinations', async () => {
    let resolveExam2: ((value: typeof confirmedExam) => void) | null = null;
    getExamMock.mockImplementation((_: string, id: string) => {
      if (id === 'exam-2') return new Promise((resolve) => { resolveExam2 = resolve; });
      return Promise.resolve(confirmedExam);
    });
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('期末考试 的冲刺计划');
    const switcher = [...container!.querySelectorAll('button')].find((button) => button.textContent === '切换考试');
    await click(switcher!);
    expect(container!.textContent).not.toContain('期末考试 的冲刺计划');
    expect(container!.textContent).toContain('正在生成冲刺计划');
    await act(async () => { resolveExam2?.({ ...confirmedExam, id: 'exam-2', name: '另一场考试' }); });
    getCramPlanMock.mockResolvedValue({ ...availablePlan, assessmentAttemptId: 'exam-2', assessmentName: '另一场考试' });
    await flush();
    expect(container!.textContent).toContain('另一场考试 的冲刺计划');
  });
});