import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMockExamPaper,
  getMockExamAttempt,
  getMockExamPaper,
  startMockExamAttempt,
  submitMockExamAttempt,
} from '../src/api/mock-exam-api';

const baseUrl = 'http://127.0.0.1:3000/api';

function mockSuccess(data: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data }) })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('mock exam API client', () => {
  it('creates a mock exam paper with the existing T02 request contract', async () => {
    mockSuccess({ id: 'paper-1' });

    await createMockExamPaper({
      semesterId: 'semester-1',
      courseInstanceId: 'course-1',
      assessmentAttemptId: 'exam-1',
      knowledgeModuleIds: ['module-1'],
      questionCount: 5,
      difficultyPreference: 'mixed',
      timeLimitSeconds: 600,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${baseUrl}/mock-exam-papers`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          semesterId: 'semester-1',
          courseInstanceId: 'course-1',
          assessmentAttemptId: 'exam-1',
          knowledgeModuleIds: ['module-1'],
          questionCount: 5,
          difficultyPreference: 'mixed',
          timeLimitSeconds: 600,
        }),
      })
    );
  });

  it('uses encoded ids and semester boundary for paper and attempt reads', async () => {
    mockSuccess({ id: 'paper/1' });

    await getMockExamPaper('semester id', 'paper/1');
    await getMockExamAttempt('semester id', 'attempt/1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/mock-exam-papers/paper%2F1?semesterId=semester%20id`,
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/mock-exam-attempts/attempt%2F1?semesterId=semester%20id`,
      expect.any(Object)
    );
  });

  it('starts and submits an attempt with the existing T02 DTOs', async () => {
    mockSuccess({ id: 'attempt-1' });

    await startMockExamAttempt('paper/1', { semesterId: 'semester id' });
    await submitMockExamAttempt('attempt/1', {
      semesterId: 'semester id',
      answers: [{ questionId: 'question-1', answer: 'A', timeSpentSeconds: 8 }],
      totalDurationSeconds: 8,
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/mock-exam-papers/paper%2F1/attempts`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ semesterId: 'semester id' }),
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/mock-exam-attempts/attempt%2F1/submit`,
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

  it('delegates envelope errors and forwards AbortSignal through the shared client', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: { code: 'MOCK_EXAM_ATTEMPT_STATE_INVALID', message: '当前模拟考状态不允许提交' },
        }),
      })
    );

    await expect(
      submitMockExamAttempt(
        'attempt-1',
        { semesterId: 'semester-1', answers: [], totalDurationSeconds: 0 },
        controller.signal
      )
    ).rejects.toMatchObject({ code: 'MOCK_EXAM_ATTEMPT_STATE_INVALID' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${baseUrl}/mock-exam-attempts/attempt-1/submit`,
      expect.objectContaining({ signal: controller.signal })
    );
  });
});
