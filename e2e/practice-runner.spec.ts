import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const semesterId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const examId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const moduleId = '55555555-5555-4555-8555-555555555555';

const questions = [
  {
    id: '66666666-6666-4666-8666-666666666666',
    type: 'single_choice',
    stem: '单选题题干',
    options: ['A. 正确', 'B. 错误', 'C. 干扰项', 'D. 干扰项'],
    difficulty: 'easy',
    knowledgeModuleId: moduleId,
    questionOrder: 1,
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    type: 'multiple_choice',
    stem: '多选题题干',
    options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'],
    difficulty: 'medium',
    knowledgeModuleId: moduleId,
    questionOrder: 2,
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    type: 'fill_blank',
    stem: '填空题题干',
    difficulty: 'hard',
    knowledgeModuleId: moduleId,
    questionOrder: 3,
  },
];

const session = {
  id: sessionId,
  courseInstanceId: courseId,
  assessmentAttemptId: examId,
  status: 'in_progress',
  questionCount: 3,
  timeLimitSeconds: 1,
  difficultyPreference: 'mixed',
  startedAt: '2026-07-16T00:00:00.000Z',
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  questions,
};

function success(data: unknown) {
  return { success: true, data };
}

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathName = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET' && pathName === '/api/semesters/current')
      return json(success({
        semester: {
          id: semesterId,
          semesterCode: 'E2E 合成学期',
          studentName: 'E2E 合成学生',
          teachingStartDate: '2026-02-16',
          teachingEndDate: '2026-06-30',
          finalArchiveDate: null,
          status: 'active',
          isCurrent: true,
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
        recoveredFromStaleCurrent: false,
      }));
    if (request.method() === 'GET' && pathName === '/api/semesters')
      return json(success([{
        id: semesterId,
        semesterCode: 'E2E 合成学期',
        studentName: 'E2E 合成学生',
        teachingStartDate: '2026-02-16',
        teachingEndDate: '2026-06-30',
        finalArchiveDate: null,
        status: 'active',
        isCurrent: true,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      }]));

    if (request.method() === 'GET' && pathName === `/api/exams/${examId}`)
      return json(success({ id: examId, courseInstanceId: courseId, name: 'T03D 合成考试', attemptType: 'normal', examAt: '2026-08-01T09:00:00.000Z', confirmationStatus: 'confirmed' }));
    if (request.method() === 'GET' && pathName === '/api/courses')
      return json(success([{ id: courseId, semesterId, name: 'T03D 合成课程', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z' }]));
    if (request.method() === 'GET' && pathName === '/api/exams')
      return json(success([{ id: examId, courseInstanceId: courseId, name: 'T03D 合成考试', attemptType: 'normal', examAt: '2026-08-01T09:00:00.000Z', confirmationStatus: 'confirmed' }]));
    if (request.method() === 'GET' && pathName === '/api/study-tasks') return json(success([]));
    if (request.method() === 'GET' && pathName === '/api/knowledge-modules')
      return json(success({ items: [{ id: moduleId, courseInstanceId: courseId, title: '矩阵基础', contentSummary: '矩阵基本运算', importance: 'high', difficulty: 'medium', learnStatus: 'learning', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z' }], pagination: { page: 1, pageSize: 20, total: 1, hasMore: false } }));
    if (request.method() === 'POST' && pathName === '/api/practice-sessions') return json(success(session), 201);
    if (request.method() === 'GET' && pathName === `/api/practice-sessions/${sessionId}`) return json(success(session));
    if (request.method() === 'POST' && pathName === `/api/practice-sessions/${sessionId}/submit`)
      return json(success({ sessionId, status: 'graded', totalScore: 2, questionCount: 3, correctRate: 2 / 3, overtime: true, totalDurationSeconds: 2, answers: [
        { questionId: questions[0].id, studentAnswer: 'A', correctAnswer: 'A', isCorrect: true, explanation: '单选解析' },
        { questionId: questions[1].id, studentAnswer: 'A,C', correctAnswer: 'A,C', isCorrect: true, explanation: '多选解析' },
        { questionId: questions[2].id, studentAnswer: '错误答案', correctAnswer: '正确答案', isCorrect: false, explanation: '填空解析' },
      ] }));
    if (request.method() === 'GET' && pathName.includes('/api/practice-sessions/'))
      return json({ success: false, error: { code: 'PRACTICE_SESSION_NOT_FOUND', message: '练习不存在' } }, 404);
    return json({ success: false, error: { code: 'UNEXPECTED_REQUEST', message: '未预期的测试请求' } }, 500);
  });
});

test('学生可从工作台发起、作答、超时提交、查看并刷新恢复结果', async ({ page }) => {
  await page.goto(`/exams/${examId}`);
  await expect(page.getByTestId('workbench-practice')).toBeVisible();
  await page.getByRole('link', { name: '开始练习' }).click();

  await expect(page.getByRole('heading', { name: 'T03D 合成考试', level: 1 })).toBeVisible();
  await page.getByLabel(/矩阵基础/).check();
  await page.getByLabel('题目数量（5–20）').fill('5');
  await page.getByLabel('限时秒数（留空表示不限时）').fill('1');
  await page.getByRole('button', { name: '生成练习' }).click();

  await expect(page.getByText('单选题题干')).toBeVisible();
  await page.getByRole('radio', { name: 'A. 正确' }).check();
  await page.getByRole('button', { name: '下一题' }).click();
  await page.getByRole('checkbox', { name: 'A. 甲' }).check();
  await page.getByRole('checkbox', { name: 'C. 丙' }).check();
  await page.getByRole('button', { name: '下一题' }).click();
  await page.getByLabel('你的答案').fill('错误答案');
  await page.waitForTimeout(1_100);
  await expect(page.getByText('已超时')).toBeVisible();
  await page.getByRole('button', { name: '提交练习' }).click();

  await expect(page.getByText('练习结果', { exact: true })).toBeVisible();
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible();
  await expect(page.getByText('答错')).toBeVisible();
  await expect(page.getByText('填空解析', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('练习结果', { exact: true })).toBeVisible();
  await expect(page.getByText('关联知识模块：矩阵基础', { exact: true }).first()).toBeVisible();

  const evidenceRoot = path.join(process.env.APP_DATA_ROOT!, 'playwright');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, 'practice-runner-success.png'), fullPage: true });
});

test('不存在的练习显示中文错误且不白屏', async ({ page }) => {
  await page.goto('/practice-sessions/99999999-9999-4999-8999-999999999999');
  await expect(page.getByText('练习不存在')).toBeVisible();
});
