import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExamContextNav } from '../src/components/exam-context-nav';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderContextNav(active: Parameters<typeof ExamContextNav>[0]['active'] = 'overview') {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/exams/exam-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ExamContextNav examId="exam-1" courseInstanceId="course-1" active={active} />
      </MemoryRouter>
    );
  });
}

describe('ExamContextNav', () => {
  it('exposes exam-scoped journey entries without changing the global nav contract', () => {
    renderContextNav('overview');

    const nav = container.querySelector('[data-testid="exam-context-navigation"]');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('考试上下文导航');

    for (const [label, href] of [
      ['总览', '/exams/exam-1'],
      ['资料', '/materials?courseInstanceId=course-1'],
      ['练习', '/exams/exam-1/practice'],
      ['模拟考', '/exams/exam-1/mock-exam'],
      ['临考速背', '/exams/exam-1/cram'],
      ['冲刺计划', '/exams/exam-1/cram-plan'],
      ['错题', '/exams/exam-1/mistakes'],
      ['时间线', '/exams/exam-1#recent-study-activity'],
    ] as const) {
      const link = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((item) => item.textContent === label);
      expect(link, `缺少考试上下文入口：${label}`).not.toBeNull();
      expect(link?.getAttribute('href')).toBe(href);
    }
  });

  it('marks the active cram-plan entry', () => {
    renderContextNav('cram_plan');

    const cramPlan = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((item) => item.textContent === '冲刺计划');
    expect(cramPlan?.getAttribute('aria-current')).toBe('page');
  });
});
