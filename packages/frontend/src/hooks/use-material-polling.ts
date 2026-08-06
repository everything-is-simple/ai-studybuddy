import { useCallback, useEffect, useRef, useState } from 'react';
import type { MaterialDto, MaterialStatus } from '@ai-studybuddy/shared';

import { getMaterials } from '../api/note-builder-api';

const POLL_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
const MAX_CONSECUTIVE_ERRORS = 3;
const TERMINAL_STATUSES = new Set<MaterialStatus>(['completed', 'conversion_failed', 'pending_quality_check']);

interface UseMaterialPollingResult {
  materials: MaterialDto[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function hasPendingMaterials(materials: MaterialDto[]) {
  return materials.some((material) => !TERMINAL_STATUSES.has(material.status));
}

export function useMaterialPolling(
  semesterId: string | null,
  courseInstanceId: string,
  enabled = true
): UseMaterialPollingResult {
  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refetchCurrent = useRef<() => Promise<void>>(async () => {});
  const enabledRef = useRef(enabled);

  enabledRef.current = enabled;

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let delayIndex = 0;
    let consecutiveErrors = 0;

    const clearPendingWork = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      controller?.abort();
      controller = undefined;
    };

    const scheduleNext = (refresh: () => Promise<void>) => {
      const delay = POLL_DELAYS_MS[Math.min(delayIndex, POLL_DELAYS_MS.length - 1)];
      delayIndex += 1;
      timer = setTimeout(() => {
        void refresh();
      }, delay);
    };

    const refresh = async () => {
      clearPendingWork();

      if (!enabled || !semesterId || !courseInstanceId || disposed) {
        return;
      }

      controller = new AbortController();
      setLoading(true);

      try {
        const page = await getMaterials(semesterId, courseInstanceId, controller.signal);
        const nextMaterials = page.items;
        if (disposed) {
          return;
        }

        setMaterials(nextMaterials);
        setError(null);
        consecutiveErrors = 0;

        if (hasPendingMaterials(nextMaterials)) {
          scheduleNext(refresh);
        }
      } catch (caughtError) {
        if (disposed || (caughtError instanceof DOMException && caughtError.name === 'AbortError')) {
          return;
        }

        consecutiveErrors += 1;
        const message = caughtError instanceof Error ? caughtError.message : '资料状态请求失败';
        setError(
          consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
            ? `资料状态请求连续失败，已停止自动刷新，请手动重试。${message ? `（${message}）` : ''}`
            : message
        );

        if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
          scheduleNext(refresh);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    const refetch = async () => {
      delayIndex = 0;
      consecutiveErrors = 0;
      setError(null);
      await refresh();
    };

    refetchCurrent.current = refetch;
    setMaterials([]);
    setError(null);
    void refetch();

    return () => {
      disposed = true;
      clearPendingWork();
    };
  }, [courseInstanceId, enabled, semesterId]);

  const refetch = useCallback(async () => {
    await refetchCurrent.current();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && enabledRef.current) {
        void refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetch]);

  return { materials, loading, error, refetch };
}
