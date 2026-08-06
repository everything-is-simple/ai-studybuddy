import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDailyStudyHome } from '../src/api/daily-study-home-api';

afterEach(() => vi.unstubAllGlobals());

describe('daily study home API client', () => {
  it('passes explicit semesterId and selected local calendar date to the dedicated endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { semesterId: 'semester-1', date: '2026-07-18' } }),
      })
    );

    await getDailyStudyHome('semester-1', '2026-07-18');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/daily-study-home?semesterId=semester-1&date=2026-07-18',
      expect.any(Object)
    );
  });
});
