import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExam, getExams, getStudyTasks } from '../src/api/study-rhythm-api';

const baseUrl = 'http://127.0.0.1:3000/api';

function mockSuccess(data: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data }),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('study-rhythm API client', () => {
  it('uses the backend exams endpoint and includes semesterId when creating an exam', async () => {
    mockSuccess({ id: 'exam-1' });
    await createExam({
      semesterId: 'semester-1',
      courseInstanceId: 'course-1',
      name: '期中考试',
      attemptType: 'normal',
      examAt: '2026-05-20T09:00:00.000Z',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${baseUrl}/exams`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          semesterId: 'semester-1',
          courseInstanceId: 'course-1',
          name: '期中考试',
          attemptType: 'normal',
          examAt: '2026-05-20T09:00:00.000Z',
        }),
      })
    );
  });

  it('uses the flat backend query endpoints for exams and study tasks', async () => {
    mockSuccess([]);
    await getExams('semester-1', 'course-1');
    await getStudyTasks('semester-1', 'course-1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/exams?semesterId=semester-1&courseInstanceId=course-1`,
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/study-tasks?semesterId=semester-1&courseInstanceId=course-1`,
      expect.any(Object)
    );
  });
});
