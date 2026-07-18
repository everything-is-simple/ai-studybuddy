import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmSemester,
  getCurrentSemester,
  listSemesters,
  previewSemesterTimetable,
  selectCurrentSemester,
} from '../src/api/semester-api';

function mockFetchJson(data: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('semester-api', () => {
  it('uses formal semester selector endpoints instead of browser UUID storage', async () => {
    const fetchMock = mockFetchJson([]);
    await listSemesters();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3000/api/semesters', expect.any(Object));
  });

  it('reads and selects current semester through backend current API', async () => {
    const fetchMock = mockFetchJson({ semester: null, recoveredFromStaleCurrent: false });

    await getCurrentSemester();
    await selectCurrentSemester('11111111-1111-4111-8111-111111111111');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3000/api/semesters/current', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3000/api/semesters/current',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ semesterId: '11111111-1111-4111-8111-111111111111' }),
      })
    );
  });

  it('uploads preview image and confirms edited timetable entries', async () => {
    const fetchMock = mockFetchJson({ ok: true });
    const file = new File([new Uint8Array([1, 2, 3])], 'timetable.png', { type: 'image/png' });

    await previewSemesterTimetable({
      semesterCode: '2026 春季学期',
      teachingStartDate: '2026-02-16',
      teachingEndDate: '2026-06-30',
      studentName: '学生A',
      timetableImage: file,
    });
    await confirmSemester({
      previewId: 'preview-1',
      semesterCode: '2026 春季学期',
      teachingStartDate: '2026-02-16',
      teachingEndDate: '2026-06-30',
      entries: [],
    });

    const previewCall = fetchMock.mock.calls[0] as unknown[];
    expect(previewCall[0]).toBe('http://127.0.0.1:3000/api/semesters/preview');
    expect(previewCall[1]).toEqual(expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3000/api/semesters',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('preview-1') })
    );
  });
});
