import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmExam,
  createExam,
  createStudyTask,
  getExam,
  getExams,
  getStudyTasks,
  updateStudyTaskStatus,
} from '../src/api/study-rhythm-api';

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

  it('can list all semester exams and tasks without a course filter', async () => {
    mockSuccess([]);
    await getExams('semester-1');
    await getStudyTasks('semester-1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/exams?semesterId=semester-1`,
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/study-tasks?semesterId=semester-1`,
      expect.any(Object)
    );
  });

  it('gets and confirms one exam with encoded path and semester boundary', async () => {
    mockSuccess({ id: 'exam/1' });
    await getExam('semester-1', 'exam/1');
    await confirmExam('semester-1', 'exam/1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/exams/exam%2F1?semesterId=semester-1`,
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/exams/exam%2F1/confirmation`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ semesterId: 'semester-1' }),
      })
    );
  });

  it('creates an exam-bound task and updates its status', async () => {
    mockSuccess({ id: 'task-1' });
    await createStudyTask({
      semesterId: 'semester-1',
      courseInstanceId: 'course-1',
      assessmentAttemptId: 'exam-1',
      type: 'custom',
      title: '复习第 1 章',
      estimatedMinutes: 30,
      deadlineAt: '2026-05-19T12:00:00.000Z',
    });
    await updateStudyTaskStatus({
      semesterId: 'semester-1',
      taskId: 'task/1',
      status: 'doing',
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/study-tasks`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          semesterId: 'semester-1',
          courseInstanceId: 'course-1',
          assessmentAttemptId: 'exam-1',
          type: 'custom',
          title: '复习第 1 章',
          estimatedMinutes: 30,
          deadlineAt: '2026-05-19T12:00:00.000Z',
        }),
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/study-tasks/task%2F1/status`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ semesterId: 'semester-1', status: 'doing' }),
      })
    );
  });
});
