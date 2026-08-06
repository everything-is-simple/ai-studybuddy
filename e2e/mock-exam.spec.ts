import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const semesterId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const examId = '33333333-3333-4333-8333-333333333333';
const unconfirmedExamId = '34343434-3434-4343-8343-343434343434';
const paperId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const moduleId = '66666666-6666-4666-8666-666666666666';

const questions = [
  {
    id: '77777777-7777-4777-8777-777777777777',
    type: 'single_choice',
    stem: '合成单选题题干',
    options: ['A. 正确', 'B. 错误'],
    difficulty: 'easy',
    knowledgeModuleId: moduleId,
    questionOrder: 1,
    pointValue: 2,
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    type: 'fill_blank',
    stem: '合成填空题题干',
    difficulty: 'medium',
    knowledgeModuleId: moduleId,
    questionOrder: 2,
    pointValue: 1,
  },
];

const paper = {
  id: paperId,
  courseInstanceId: courseId,
  assessmentAttemptId: examId,
  status: 'generated',
  title: 'E2E 合成模拟卷',
  questionCount: questions.length,
  timeLimitSeconds: 600,
  totalPoints: 3,
  difficultyPreference: 'mixed',
  sourceSummary: { moduleCount: 1, weakPointCount: 0, activeMistakeCount: 0, assessmentName: 'E2E 合成考试' },
  generatedAt: '2026-07-20T00:00:00.000Z',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  questions,
};

function success(data: unknown) {
  return { success: true, data };
}

type SubmitMode = 'success' | 'failure' | 'conflict';

interface MockApiState {
  confirmationStatus: 'confirmed' | 'pending';
  attemptStatus: 'in_progress' | 'submitted' | 'graded';
  submitMode: SubmitMode;
  createPaperCalls: number;
  lastSubmitPayload: {
    totalDurationSeconds?: number;
    answers?: Array<{ questionId?: string; timeSpentSeconds?: number }>;
  } | null;
}

function createState(overrides: Partial<MockApiState> = {}): MockApiState {
  return {
    confirmationStatus: 'confirmed',
    attemptStatus: 'in_progress',
    submitMode: 'success',
    createPaperCalls: 0,
    lastSubmitPayload: null,
    ...overrides,
  };
}

function attemptFor(status: MockApiState['attemptStatus']) {
  return {
    id: attemptId,
    paperId,
    courseInstanceId: courseId,
    assessmentAttemptId: examId,
    status,
    startedAt: '2026-07-20T00:00:00.000Z',
    submittedAt: status === 'in_progress' ? null : '2026-07-20T00:05:00.000Z',
    gradedAt: status === 'graded' ? '2026-07-20T00:05:01.000Z' : null,
    totalScore: status === 'graded' ? 2 : null,
    totalPoints: 3,
    correctRate: status === 'graded' ? 2 / 3 : null,
    overtime: false,
    totalDurationSeconds: status === 'graded' ? 12 : null,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:05:01.000Z',
    questions,
  };
}

const gradedResult = {
  attemptId,
  status: 'graded',
  totalScore: 2,
  totalPoints: 3,
  questionCount: 2,
  correctRate: 2 / 3,
  overtime: false,
  totalDurationSeconds: 12,
  answers: [
    {
      questionId: questions[0].id,
      studentAnswer: 'A',
      correctAnswer: 'A',
      isCorrect: true,
      scoreAwarded: 2,
      pointValue: 2,
      explanation: '合成单选解析',
      knowledgeModuleId: moduleId,
    },
    {
      questionId: questions[1].id,
      studentAnswer: '错误答案',
      correctAnswer: '正确答案',
      isCorrect: false,
      scoreAwarded: 0,
      pointValue: 1,
      explanation: '合成填空解析',
      knowledgeModuleId: moduleId,
    },
  ],
  moduleAnalyses: [
    {
      knowledgeModuleId: moduleId,
      questionCount: 2,
      correctCount: 1,
      scoreAwarded: 2,
      totalPoints: 3,
      correctRate: 0.5,
      weakSignal: true,
    },
  ],
};

async function installMockApi(page: Page, state: MockApiState): Promise<void> {
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathName = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && pathName === '/api/semesters/current') {
      return json(
        success({
          semester: {
            id: semesterId,
            semesterCode: 'E2E 合成学期',
            studentName: 'E2E 合成学生',
            teachingStartDate: '2026-02-16',
            teachingEndDate: '2026-06-30',
            finalArchiveDate: null,
            status: 'active',
            isCurrent: true,
            createdAt: '2026-07-20T00:00:00.000Z',
            updatedAt: '2026-07-20T00:00:00.000Z',
          },
          recoveredFromStaleCurrent: false,
        })
      );
    }
    if (request.method() === 'GET' && pathName === '/api/semesters') {
      return json(
        success([
          {
            id: semesterId,
            semesterCode: 'E2E 合成学期',
            studentName: 'E2E 合成学生',
            teachingStartDate: '2026-02-16',
            teachingEndDate: '2026-06-30',
            finalArchiveDate: null,
            status: 'active',
            isCurrent: true,
            createdAt: '2026-07-20T00:00:00.000Z',
            updatedAt: '2026-07-20T00:00:00.000Z',
          },
        ])
      );
    }
    if (
      request.method() === 'GET' &&
      (pathName === `/api/exams/${examId}` || pathName === `/api/exams/${unconfirmedExamId}`)
    ) {
      const requestedExamId = pathName.endsWith(unconfirmedExamId) ? unconfirmedExamId : examId;
      return json(
        success({
          id: requestedExamId,
          courseInstanceId: courseId,
          name: requestedExamId === unconfirmedExamId ? '未确认 E2E 考试' : 'E2E 合成考试',
          attemptType: 'normal',
          examAt: '2026-08-01T09:00:00.000Z',
          confirmationStatus: requestedExamId === unconfirmedExamId ? 'pending' : state.confirmationStatus,
        })
      );
    }
    if (request.method() === 'GET' && pathName === '/api/courses') return json(success([]));
    if (request.method() === 'GET' && pathName === '/api/exams') return json(success([]));
    if (request.method() === 'GET' && pathName === '/api/study-tasks') return json(success([]));
    if (request.method() === 'POST' && pathName === '/api/mock-exam-papers') {
      state.createPaperCalls += 1;
      return json(success({ id: paperId }), 201);
    }
    if (request.method() === 'GET' && pathName === `/api/mock-exam-papers/${paperId}`) return json(success(paper));
    if (request.method() === 'POST' && pathName === `/api/mock-exam-papers/${paperId}/attempts`)
      return json(success(attemptFor(state.attemptStatus)), 201);
    if (request.method() === 'GET' && pathName === `/api/mock-exam-attempts/${attemptId}`)
      return json(success(attemptFor(state.attemptStatus)));
    if (request.method() === 'POST' && pathName === `/api/mock-exam-attempts/${attemptId}/submit`) {
      state.lastSubmitPayload = request.postDataJSON() as MockApiState['lastSubmitPayload'];
      if (state.submitMode === 'failure')
        return json({ success: false, error: { code: 'MOCK_EXAM_SUBMIT_FAILED', message: '合成提交失败' } }, 503);
      if (state.submitMode === 'conflict') {
        state.attemptStatus = 'graded';
        return json(
          { success: false, error: { code: 'MOCK_EXAM_ATTEMPT_STATE_INVALID', message: '该尝试已经提交' } },
          409
        );
      }
      state.attemptStatus = 'graded';
      return json(success(gradedResult));
    }
    return json(
      {
        success: false,
        error: { code: 'UNEXPECTED_REQUEST', message: `未预期的测试请求：${request.method()} ${pathName}` },
      },
      500
    );
  });
}

async function startAttempt(page: Page): Promise<void> {
  await page.goto(`/exams/${examId}/mock-exam`);
  await page.getByRole('button', { name: '生成模拟卷' }).click();
  await expect(page.getByRole('heading', { name: paper.title })).toBeVisible();
  await page.getByRole('button', { name: '开始答题' }).click();
  await expect(page.getByText('合成单选题题干')).toBeVisible();
}

test('确认考试可生成、刷新恢复作答、提交后在宽屏和窄屏查看结果与模块分析', async ({ page }) => {
  const state = createState();
  await installMockApi(page, state);

  await page.setViewportSize({ width: 1440, height: 900 });
  await startAttempt(page);
  await expect(page.getByText('正确答案：A')).toHaveCount(0);
  await page.waitForTimeout(1_100);
  await page.getByLabel('A. 正确').check();
  await page.reload();
  await expect(page.getByLabel('A. 正确')).toBeChecked();
  const restoredDraft = await page.evaluate(
    (key) => JSON.parse(window.sessionStorage.getItem(key) ?? '{}'),
    `ai-studybuddy:mock-exam:${semesterId}:${attemptId}`
  );
  expect(restoredDraft.totalDurationSeconds).toBeGreaterThanOrEqual(1);
  expect(restoredDraft.questionSeconds[questions[0].id]).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: '提交模拟考' }).click();
  await page.getByRole('button', { name: '确认提交' }).click();
  await expect(page.getByRole('heading', { name: '2 / 3' })).toBeVisible();
  expect(state.lastSubmitPayload?.totalDurationSeconds).toBeGreaterThanOrEqual(1);
  expect(
    state.lastSubmitPayload?.answers?.find((answer) => answer.questionId === questions[0].id)?.timeSpentSeconds
  ).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('正确答案：A')).toBeVisible();
  await expect(page.getByLabel('模块分析')).toContainText('需要重点复习');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByLabel('模块分析')).toBeVisible();

  const evidenceRoot = path.join(process.env.APP_DATA_ROOT!, 'playwright');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, 'mock-exam-success-narrow.png'), fullPage: true });
  expect(state.createPaperCalls).toBe(1);
});

test('未确认考试不能生成模拟卷，且提交失败后刷新仍可恢复答案', async ({ page }) => {
  const state = createState({ submitMode: 'failure' });
  await installMockApi(page, state);

  await page.goto(`/exams/${unconfirmedExamId}/mock-exam`);
  await expect(page.getByText('请先确认考试信息，再生成模拟卷。')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成模拟卷' })).toHaveCount(0);
  expect(state.createPaperCalls).toBe(0);

  await startAttempt(page);
  await page.getByLabel('A. 正确').check();
  await page.getByRole('button', { name: '提交模拟考' }).click();
  await page.getByRole('button', { name: '确认提交' }).click();
  await expect(page.getByText('合成提交失败')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('A. 正确')).toBeChecked();
});

test('409 提交冲突后锁定已提交尝试，并且结果缓存缺失时不泄露答案或解析', async ({ page }) => {
  const state = createState({ submitMode: 'conflict' });
  await installMockApi(page, state);

  await startAttempt(page);
  await page.getByRole('button', { name: '提交模拟考' }).click();
  await page.getByRole('button', { name: '确认提交' }).click();
  await expect(page.getByText('该模拟考已提交，不能再次修改答案。')).toBeVisible();
  await expect(page.getByRole('button', { name: '提交模拟考' })).toHaveCount(0);
  await page.getByRole('link', { name: '查看结果' }).click();
  await expect(page.getByText('模拟考结果暂不可用，请稍后刷新重试。')).toBeVisible();
  await expect(page.getByText('正确答案：A')).toHaveCount(0);
});
