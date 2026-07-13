import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/api-client';

export interface UseApiRequestState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApiRequest<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = []
): UseApiRequestState<T> & { refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);

  fetcherRef.current = fetcher;

  const execute = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('未知错误');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    execute();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: execute };
}
