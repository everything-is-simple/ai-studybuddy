import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, requestPage, upload, ApiClientError, normalizeApiBaseUrl } from '../src/api/api-client';

const baseUrl = 'http://127.0.0.1:3000/api';

describe('api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(response: { ok?: boolean; status?: number; json?: unknown }) {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json,
    });
  }

  it('为未带 /api 的环境地址补齐 API 前缀', () => {
    expect(normalizeApiBaseUrl('http://127.0.0.1:3011')).toBe('http://127.0.0.1:3011/api');
    expect(normalizeApiBaseUrl('http://127.0.0.1:3011/')).toBe('http://127.0.0.1:3011/api');
  });

  it('保留已包含 /api 的环境地址', () => {
    expect(normalizeApiBaseUrl('https://studybuddy.example/api')).toBe('https://studybuddy.example/api');
  });

  it('解包成功信封并返回 data', async () => {
    mockFetch({ json: { success: true, data: { id: '1' } } });
    const result = await request('/courses');
    expect(result).toEqual({ id: '1' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${baseUrl}/courses`,
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) })
    );
  });

  it('解包带 meta 的分页信封', async () => {
    mockFetch({
      json: {
        success: true,
        data: {
          items: [{ id: '1' }],
          pagination: { page: 1, pageSize: 20, total: 1, hasMore: false },
        },
      },
    });
    const page = await requestPage('/materials');
    expect(page.items).toEqual([{ id: '1' }]);
    expect(page.pagination.total).toBe(1);
  });

  it('失败信封抛出 ApiClientError 并携带 code 和 message', async () => {
    mockFetch({ ok: false, status: 400, json: { success: false, error: { code: 'INVALID', message: '参数错误' } } });
    await expect(request('/courses')).rejects.toBeInstanceOf(ApiClientError);
    await expect(request('/courses')).rejects.toMatchObject({
      code: 'INVALID',
      message: '参数错误',
    });
  });

  it('网络失败兜底为 NETWORK_ERROR', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/courses')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: '网络连接失败',
    });
  });

  it('AbortSignal 取消时抛出原生 AbortError', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    });
    const controller = new AbortController();
    controller.abort();
    await expect(request('/courses', { signal: controller.signal })).rejects.toBeInstanceOf(DOMException);
  });

  it('upload 使用 FormData 且不手动设置 Content-Type', async () => {
    mockFetch({ json: { success: true, data: { id: 'm1' } } });
    const formData = new FormData();
    formData.append('file', new Blob(['text'], { type: 'text/plain' }), 'a.txt');
    const result = await upload('/materials/upload', formData);
    expect(result).toEqual({ id: 'm1' });
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.body).toBe(formData);
    expect(options.headers).not.toHaveProperty('content-type');
  });
});
