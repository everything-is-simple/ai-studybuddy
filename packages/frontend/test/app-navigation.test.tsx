import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppNavigation } from '../src/components/app-navigation';

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

function renderNavigation(path = '/') {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppNavigation />
      </MemoryRouter>
    );
  });
}

describe('AppNavigation', () => {
  it('exposes the frozen global navigation entries', () => {
    renderNavigation('/courses');

    const nav = container.querySelector('[data-testid="global-navigation"]');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('全局导航');

    for (const [label, href] of [
      ['今日', '/'],
      ['课程', '/courses'],
      ['学期', '/semesters'],
      ['资料', '/materials'],
      ['设置', '/settings'],
    ] as const) {
      const link = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((item) => item.textContent === label);
      expect(link, `缺少导航入口：${label}`).not.toBeNull();
      expect(link?.getAttribute('href')).toBe(href);
    }
  });

  it('maps note routes to the materials global entry', () => {
    renderNavigation('/notes/note-1');
    const materials = [...container.querySelectorAll<HTMLAnchorElement>('a')].find(
      (item) => item.textContent === '资料'
    );
    expect(materials?.getAttribute('aria-current')).toBe('page');
  });

  it('maps exam and practice routes to the courses global entry', () => {
    renderNavigation('/exams/exam-1/practice');
    const courses = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((item) => item.textContent === '课程');
    expect(courses?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps a mobile bottom navigation with a more menu for secondary entries', () => {
    renderNavigation('/settings');

    expect(container.querySelector('[data-testid="mobile-bottom-navigation"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mobile-more-navigation"]')?.textContent).toContain('更多');
    const settings = [...container.querySelectorAll<HTMLAnchorElement>('a')].find(
      (item) => item.textContent === '设置'
    );
    expect(settings?.getAttribute('aria-current')).toBe('page');
  });
});
