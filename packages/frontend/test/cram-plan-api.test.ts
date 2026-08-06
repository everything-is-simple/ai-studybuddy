import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCramPlan } from '../src/api/cram-plan-api';

describe('cram plan API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the shared API envelope and encodes the assessment context', async () => {
    const data = {
      assessmentAttemptId: 'exam / 1',
      courseInstanceId: 'course-1',
      assessmentName: '期末',
      examAt: '2026-07-27T08:00:00.000Z',
      daysUntilExam: 6,
      availability: 'available' as const,
      days: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCramPlan('semester 1', 'exam / 1')).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/assessment-attempts/exam%20%2F%201/cram-plan?semesterId=semester%201',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) })
    );
  });

  it('preserves actionable API errors for the page retry state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, error: { code: 'ASSESSMENT_NOT_CONFIRMED', message: '请先确认考试' } }),
            { status: 409, headers: { 'content-type': 'application/json' } }
          )
        )
    );
    await expect(getCramPlan('semester-1', 'exam-1')).rejects.toEqual(
      expect.objectContaining({ code: 'ASSESSMENT_NOT_CONFIRMED', message: '请先确认考试' })
    );
  });
});
