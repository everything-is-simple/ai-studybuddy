import { useCallback, useEffect, useRef, useState } from 'react';
import type { MaterialDto } from '@ai-studybuddy/shared';
import { ApiClientError } from '../api/api-client';
import { getMaterials } from '../api/note-builder-api';

const TERMINAL_STATUSES = new Set<string>(['completed', 'conversion_failed', 'pending_quality_check']);

const POLL_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

function isTerminal(material: MaterialDto): boolean {
  return TERMINAL_STATUSES.has(material.status);
}

export interface UseMaterialPollingState {
  materials: MaterialDto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMaterialPolling(
  semesterId: string | null,
  courseInstanceId: string | null,
  enabled: boolean
): UseMaterialPollingState {
  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const delayIndexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = useCallback(async () => {
    if (!semesterId || !courseInstanceId || !enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const page = await getMaterials(semesterId, courseInstanceId, controller.signal);
      if (!controller.signal.aborted) {
        setMaterials(page.items);
        const allTerminal = page.items.length === 0 || page.items.every(isTerminal);
        if (allTerminal) {
          delayIndexRef.current = 0;
        } else {
          delayIndexRef.current = Math.min(delayIndexRef.current + 1, POLL_DELAYS_MS.length - 1);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('未知错误');
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [semesterId, courseInstanceId, enabled]);

  const schedule = useCallback(() => {
    if (!semesterId || !courseInstanceId || !enabled) return;
    const delay = POLL_DELAYS_MS[delayIndexRef.current];
    timeoutRef.current = setTimeout(() => {
      fetch().then(() => {
        const allTerminal = materials.length === 0 || materials.every(isTerminal);
        if (!allTerminal) {
          schedule();
        }
      });
    }, delay);
  }, [semesterId, courseInstanceId, enabled, materials, fetch]);

  useEffect(() => {
    if (!enabled) return;
    delayIndexRef.current = 0;
    fetch();
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, semesterId, courseInstanceId, fetch]);

  useEffect(() => {
    if (!enabled) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const allTerminal = materials.length === 0 || materials.every(isTerminal);
    if (!allTerminal) {
      schedule();
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, materials, schedule]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden && enabled) {
        delayIndexRef.current = 0;
        fetch();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, fetch]);

  return { materials, loading, error, refetch: fetch };
}
