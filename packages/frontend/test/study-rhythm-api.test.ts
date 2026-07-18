import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmExam,
  createExam,
  createStudyTask,
  getExam,
  getExams,
  getStudyTasks,
  getTimeline,
  updateStudyTaskStatus,
  updateCourse,
  getScheduleEntries,
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  updateExam,
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

  it('uses semester-scoped course, schedule-entry, and exam editing endpoints', async () => {
    mockSuccess({ id: 'result' });
    await updateCourse('semester-1', 'course/1', { name: '高等数学' });
    await getScheduleEntries('semester-1');
    await createScheduleEntry({ semesterId: 'semester-1', courseInstanceId: 'course/1', weekday: 1, startTime: '08:00', endTime: '09:30', location: 'A101' });
    await updateScheduleEntry('semester-1', 'entry/1', { courseInstanceId: 'course/1', weekday: 2, startTime: '10:00', endTime: '11:30', location: 'B202' });
    await deleteScheduleEntry('semester-1', 'entry/1');
    await updateExam('semester-1', 'exam/1', { name: '期末考试', goal: '通过复习' });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, `${baseUrl}/courses/course%2F1`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ semesterId: 'semester-1', name: '高等数学' }) }));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/schedule-entries?semesterId=semester-1`, expect.any(Object));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, `${baseUrl}/schedule-entries`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ semesterId: 'semester-1', courseInstanceId: 'course/1', weekday: 1, startTime: '08:00', endTime: '09:30', location: 'A101' }) }));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(4, `${baseUrl}/schedule-entries/entry%2F1`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ semesterId: 'semester-1', courseInstanceId: 'course/1', weekday: 2, startTime: '10:00', endTime: '11:30', location: 'B202' }) }));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(5, `${baseUrl}/schedule-entries/entry%2F1?semesterId=semester-1`, expect.objectContaining({ method: 'DELETE' }));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(6, `${baseUrl}/exams/exam%2F1`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ semesterId: 'semester-1', name: '期末考试', goal: '通过复习' }) }));
  });
  it('returns the flat timeline array and appends repeated eventType query parameters', async () => {
    const events = [
      {
        id: 'event-1',
        sourceSystem: 'S3',
        eventType: 'practice_completed',
        title: 'private title',
        parentVisible: true,
        occurredAt: '2026-07-17T08:00:00.000Z',
        createdAt: '2026-07-17T08:00:00.000Z',
      },
    ];
    mockSuccess(events);

    const result = await getTimeline('semester-1', {
      limit: 8,
      courseInstanceId: 'course-1',
      eventTypes: ['practice_completed', 'mistake_reviewed'],
    });

    expect(result).toEqual(events);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${baseUrl}/timeline?semesterId=semester-1&limit=8&courseInstanceId=course-1&eventType=practice_completed&eventType=mistake_reviewed`,
      expect.any(Object)
    );
  });
});
