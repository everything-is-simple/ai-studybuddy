import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiPage<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiClientError('INVALID_RESPONSE', '服务器返回了无法识别的数据');
  }
}

function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as ApiError).success === false &&
    typeof (body as ApiError).error === 'object' &&
    (body as ApiError).error !== null &&
    typeof (body as ApiError).error.code === 'string' &&
    typeof (body as ApiError).error.message === 'string'
  );
}

function isApiSuccess<T>(body: unknown): body is ApiSuccess<T> {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as ApiSuccess<T>).success === true &&
    'data' in (body as ApiSuccess<T>)
  );
}

export async function request<T>(url: string, options: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DEFAULT_BASE_URL}${url}`, {
      ...options,
      headers: {
        accept: 'application/json',
        ...options.headers,
      },
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiClientError('NETWORK_ERROR', '网络连接失败');
  }

  const body = await parseJson(response);

  if (!response.ok || isApiError(body)) {
    const errorBody = isApiError(body) ? body.error : undefined;
    throw new ApiClientError(errorBody?.code ?? 'UNKNOWN_ERROR', errorBody?.message ?? '请求失败，请稍后重试');
  }

  if (!isApiSuccess<T>(body)) {
    throw new ApiClientError('INVALID_RESPONSE', '服务器返回了无法识别的数据');
  }

  return body.data;
}

export async function requestPage<T>(
  url: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<ApiPage<T>> {
  const data = await request<{
    items: T[];
    pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  }>(url, options);
  return {
    items: data.items ?? [],
    pagination: data.pagination ?? { page: 1, pageSize: 20, total: 0, hasMore: false },
  };
}

export async function upload<T>(url: string, formData: FormData, signal?: AbortSignal): Promise<T> {
  return request<T>(url, { method: 'POST', body: formData, signal });
}
