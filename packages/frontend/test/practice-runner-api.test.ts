import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPracticeSession,
  getPracticeHistory,
  getPracticeHistoryResult,
  getPracticeSession,
  submitPracticeSession,
} from '../src/api/practice-runner-api';

const baseUrl = 'http://127.0.0.1:3000/api';

function mockSuccess(data: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data }) })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('practice-runner API client', () => {
  it('creates a session with the existing S3 request contract', async () => {
    mockSuccess({ id: 'session-1' });
    await createPracticeSession({
      semesterId: 'semester-1',
      courseInstanceId: 'course-1',
      assessmentAttemptId: 'exam-1',
      knowledgeModuleIds: ['module-1'],
      questionCount: 5,
      difficultyPreference: 'mixed',
      timeLimitSeconds: null,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${baseUrl}/practice-sessions`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          semesterId: 'semester-1',
          courseInstanceId: 'course-1',
          assessmentAttemptId: 'exam-1',
          knowledgeModuleIds: ['module-1'],
          questionCount: 5,
          difficultyPreference: 'mixed',
          timeLimitSeconds: null,
        }),
      })
    );
  });

  it('uses encoded session id and semester boundary when loading and submitting', async () => {
    mockSuccess({ id: 'session/1' });
    await getPracticeSession('semester id', 'session/1');
    await submitPracticeSession('session/1', {
      semesterId: 'semester id',
      answers: [{ questionId: 'question-1', answer: 'A', timeSpentSeconds: 8 }],
      totalDurationSeconds: 8,
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/practice-sessions/session%2F1?semesterId=semester%20id`,
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/practice-sessions/session%2F1/submit`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          semesterId: 'semester id',
          answers: [{ questionId: 'question-1', answer: 'A', timeSpentSeconds: 8 }],
          totalDurationSeconds: 8,
        }),
      })
    );
  });

  it('loads practice history with explicit semester and filter query', async () => {
    mockSuccess({ items: [], pagination: { page: 1, pageSize: 20, total: 0, hasMore: false } });
    await getPracticeHistory('semester id', { courseInstanceId: 'course/1', status: 'graded', page: 2, pageSize: 10 });
    await getPracticeHistoryResult('semester id', 'session/1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/practice-sessions/history?semesterId=semester+id&courseInstanceId=course%2F1&status=graded&page=2&pageSize=10`,
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/practice-sessions/session%2F1/history-result?semesterId=semester%20id`,
      expect.any(Object)
    );
  });
});
