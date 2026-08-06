import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageState } from '../src/components/page-state';

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

describe('PageState', () => {
  it('renders loading, empty and error states with stable semantics', () => {
    act(() => root.render(<PageState state="loading" title="正在加载课程" />));
    expect(container.querySelector('[data-testid="page-state"][data-page-state="loading"]')?.textContent).toContain(
      '正在加载课程'
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();

    act(() => root.render(<PageState state="empty" title="暂无课程" message="先创建课程或切换学期。" />));
    expect(container.querySelector('[data-page-state="empty"]')?.textContent).toContain('暂无课程');
    expect(container.textContent).toContain('先创建课程或切换学期。');

    const retry = vi.fn();
    act(() =>
      root.render(
        <PageState state="error" title="课程加载失败" message="网络异常" actionLabel="重新加载" onAction={retry} />
      )
    );
    expect(container.querySelector('[data-page-state="error"]')?.textContent).toContain('网络异常');
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('重新加载');
    act(() => button!.click());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders success content without losing the state hook', () => {
    act(() =>
      root.render(
        <PageState state="success" title="课程已就绪">
          <p>数学</p>
        </PageState>
      )
    );
    expect(container.querySelector('[data-page-state="success"]')?.textContent).toContain('数学');
  });
});
