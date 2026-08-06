import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMaterials } from '../src/api/note-builder-api';
import type { MaterialDto } from '@ai-studybuddy/shared';
import { useMaterialPolling } from '../src/hooks/use-material-polling';

vi.mock('../src/api/note-builder-api', () => ({
  getMaterials: vi.fn(),
}));

const mockedGetMaterials = vi.mocked(getMaterials);

let latestState: ReturnType<typeof useMaterialPolling>;

function PollingProbe({ semesterId, courseInstanceId }: { semesterId: string; courseInstanceId: string }) {
  latestState = useMaterialPolling(semesterId, courseInstanceId);
  return null;
}

function materialPage(items: MaterialDto[]) {
  return {
    items,
    pagination: { page: 1, pageSize: 20, total: items.length, hasMore: false },
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useMaterialPolling', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetMaterials.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('stops automatic polling after three consecutive errors and permits a manual retry', async () => {
    mockedGetMaterials
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(materialPage([]));

    await act(async () => {
      root.render(createElement(PollingProbe, { semesterId: 'semester-1', courseInstanceId: 'course-1' }));
    });
    await flushEffects();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(mockedGetMaterials).toHaveBeenCalledTimes(3);
    expect(latestState.error).toContain('连续失败');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockedGetMaterials).toHaveBeenCalledTimes(3);

    await act(async () => {
      await latestState.refetch();
    });

    expect(mockedGetMaterials).toHaveBeenCalledTimes(4);
    expect(latestState.error).toBeNull();
  });

  it('clears stale materials before polling a newly selected course', async () => {
    const pendingMaterial = { id: 'material-1', status: 'pending' } as MaterialDto;
    let resolveNextRequest: ((page: ReturnType<typeof materialPage>) => void) | undefined;

    mockedGetMaterials.mockResolvedValueOnce(materialPage([pendingMaterial])).mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof materialPage>>((resolve) => {
          resolveNextRequest = resolve;
        })
    );

    await act(async () => {
      root.render(createElement(PollingProbe, { semesterId: 'semester-1', courseInstanceId: 'course-1' }));
    });
    await flushEffects();
    expect(latestState.materials).toEqual([pendingMaterial]);

    await act(async () => {
      root.render(createElement(PollingProbe, { semesterId: 'semester-1', courseInstanceId: 'course-2' }));
    });

    expect(latestState.materials).toEqual([]);
    expect(mockedGetMaterials).toHaveBeenLastCalledWith('semester-1', 'course-2', expect.any(AbortSignal));

    await act(async () => {
      resolveNextRequest?.(materialPage([]));
    });
  });
});
