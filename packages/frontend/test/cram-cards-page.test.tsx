import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CramCardsPage } from '../src/pages/cram-cards-page';
import { clearCramSession, cramSessionStorageKey, readCramSession, writeCramSession, type CramSessionSnapshot } from '../src/hooks/use-cram-session';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const getExamMock = vi.fn();
const getCramCardsMock = vi.fn();
vi.mock('../src/api/study-rhythm-api', () => ({ getExam: (...args: unknown[]) => getExamMock(...args) }));
vi.mock('../src/api/cram-cards-api', () => ({ getCramCards: (...args: unknown[]) => getCramCardsMock(...args) }));

const confirmedExam = { id: 'exam-1', courseInstanceId: 'course-1', name: '期末考试', confirmationStatus: 'confirmed' };
const cards = [
  { id: 'card-1', knowledgeModuleId: 'card-1', title: '函数', importance: 'critical', contentSummary: '函数摘要', examRelevance: '函数考点', sources: [{ kind: 'weak_point', count: 3 }, { kind: 'knowledge_module', count: 1 }] },
  { id: 'card-2', knowledgeModuleId: 'card-2', title: '方程', importance: 'high', contentSummary: '方程摘要', examRelevance: '方程考点', sources: [{ kind: 'mistake', count: 2 }, { kind: 'knowledge_module', count: 1 }] },
] as const;

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function click(element: Element) { await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }

function renderPage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/exams/exam-1/cram']}><Routes><Route path="/exams/:examId/cram" element={<CramCardsPage semesterId="semester-1" />} /></Routes></MemoryRouter>);
  });
  return { container, root };
}

describe('T04 临考速背页面与会话恢复', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    getExamMock.mockReset();
    getCramCardsMock.mockReset();
    getExamMock.mockResolvedValue(confirmedExam);
    getCramCardsMock.mockResolvedValue({ assessmentAttemptId: 'exam-1', courseInstanceId: 'course-1', cards });
  });
  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it('starts a default ten-minute session, flips safely, and persists IDs rather than card text', async () => {
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('选择本次翻阅时长');
    const start = [...container!.querySelectorAll('button')].find((button) => button.textContent === '开始速背');
    expect(start).not.toBeNull();
    await click(start!);
    expect(container!.textContent).toContain('第 1 / 2 张');
    await click([...container!.querySelectorAll('button')].find((button) => button.textContent === '翻转查看考点')!);
    expect(container!.textContent).toContain('函数考点');
    const raw = sessionStorage.getItem(cramSessionStorageKey('semester-1', 'exam-1')) ?? '';
    expect(raw).toContain('card-1');
    expect(raw).not.toContain('函数摘要');
    expect(raw).not.toContain('函数考点');
  });

  it('restores only card ID intersections and discards malformed storage safely', async () => {
    const snapshot: CramSessionSnapshot = { version: 1, assessmentAttemptId: 'exam-1', cardIds: ['card-1', 'missing-card'], currentCardId: 'card-1', viewedCardIds: ['card-1', 'missing-card'], endsAt: Date.now() + 600_000, flipped: false };
    expect(writeCramSession('semester-1', 'exam-1', snapshot)).toBe(true);
    expect(readCramSession('semester-1', 'exam-1', ['card-1', 'card-2'])).toEqual(expect.objectContaining({ cardIds: ['card-1'], viewedCardIds: ['card-1'] }));
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('第 1 / 1 张');
    sessionStorage.setItem(cramSessionStorageKey('semester-1', 'exam-1'), '{坏 JSON');
    expect(readCramSession('semester-1', 'exam-1', ['card-1'])).toBeNull();
    clearCramSession('semester-1', 'exam-1');
  });

  it('does not fetch cards for an unconfirmed exam and provides the confirmation boundary', async () => {
    getExamMock.mockResolvedValue({ ...confirmedExam, confirmationStatus: 'pending' });
    ({ container, root } = renderPage());
    await flush();
    expect(container!.textContent).toContain('请先确认考试信息');
    expect(getCramCardsMock).not.toHaveBeenCalled();
  });

  it('locks previous/next after expiry while still allowing the current card to flip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:00:00.000Z'));
    ({ container, root } = renderPage());
    await flush();
    const fiveMinutes = [...container!.querySelectorAll('button')].find((button) => button.textContent === '5 分钟');
    await click(fiveMinutes!);
    await click([...container!.querySelectorAll('button')].find((button) => button.textContent === '开始速背')!);
    await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000 + 500); });
    expect(container!.textContent).toContain('本次限时翻阅已结束');
    const next = [...container!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '下一张');
    const flip = [...container!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '翻转查看考点');
    expect(next?.disabled).toBe(true);
    expect(flip?.disabled).toBe(false);
  });
});
