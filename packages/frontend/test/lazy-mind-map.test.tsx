import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { lazy } from 'react';
import { LazyMindMapSection, type MindMapRenderer } from '../src/components/lazy-mind-map';

// React 18 需要该标记，避免测试中出现 act 环境警告。
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
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('LazyMindMapSection', () => {
  it('在异步渲染器加载期间展示中文反馈，完成后展示导图', async () => {
    let resolveRenderer: ((module: { default: MindMapRenderer }) => void) | undefined;
    const DeferredRenderer = lazy(
      () =>
        new Promise<{ default: MindMapRenderer }>((resolve) => {
          resolveRenderer = resolve;
        })
    );
    const RenderedMindMap: MindMapRenderer = ({ data }) => <div data-testid="mind-map-rendered">{data}</div>;

    await act(async () => {
      root.render(<LazyMindMapSection data="# 数学" renderer={DeferredRenderer} />);
    });
    expect(container.textContent).toContain('正在加载思维导图…');

    await act(async () => {
      resolveRenderer?.({ default: RenderedMindMap });
    });
    await flush();

    expect(container.querySelector('[data-testid="mind-map-rendered"]')?.textContent).toBe('# 数学');
    expect(container.textContent).not.toContain('正在加载思维导图…');
  });

  it('异步导入失败时显示中文降级，而不会让页面白屏', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const RejectedRenderer = lazy(async () => {
      throw new Error('mind-map import failed');
    });

    await act(async () => {
      root.render(<LazyMindMapSection data="# 物理" renderer={RejectedRenderer} />);
    });
    await flush();

    expect(container.textContent).toContain('暂无法展示思维导图');
    expect(consoleError).toHaveBeenCalled();
  });

  it('渲染器抛错时显示中文降级', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ThrowingRenderer: MindMapRenderer = () => {
      throw new Error('mind-map render failed');
    };

    await act(async () => {
      root.render(<LazyMindMapSection data="# 化学" renderer={ThrowingRenderer} />);
    });

    expect(container.textContent).toContain('暂无法展示思维导图');
    expect(consoleError).toHaveBeenCalled();
  });
});
