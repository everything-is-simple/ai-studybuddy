// T02-R4 浏览器验收：学生核心流程失败反馈矩阵
// 基于真实前端页面行为验证：前端展示脱敏中文错误（后端 message），
// 不泄露内部栈、路径、UUID 或 Provider 信息。
import { expect, test, type Page } from '@playwright/test';

const semesterId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const examId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';

function success(data: unknown) {
  return { success: true, data };
}

async function installBaseApi(page: Page): Promise<void> {
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const pathName = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathName === '/api/semesters') {
      return route.fulfill({ json: success([{ id: semesterId, name: 'E2E 合成学期', status: 'active', ready: 1 }]) });
    }
    if (request.method() === 'GET' && pathName === '/api/semesters/current') {
      // 响应结构：{ semester: {...isCurrent}, recoveredFromStaleCurrent }
      return route.fulfill({
        json: success({ semester: { id: semesterId, name: 'E2E 合成学期', status: 'active', ready: 1, isCurrent: true }, recoveredFromStaleCurrent: false }),
      });
    }
    if (request.method() === 'GET' && pathName === '/api/courses') {
      return route.fulfill({ json: success([{ id: courseId, name: '合成课程' }]) });
    }
    if (request.method() === 'GET' && pathName === '/api/exams') {
      return route.fulfill({ json: success([{ id: examId, name: '合成考试', courseInstanceId: courseId, confirmationStatus: 'confirmed' }]) });
    }
    if (request.method() === 'GET' && pathName === `/api/exams/${examId}`) {
      return route.fulfill({ json: success({ id: examId, name: '合成考试', courseInstanceId: courseId, confirmationStatus: 'confirmed' }) });
    }
    if (request.method() === 'GET' && pathName === '/api/study-tasks') {
      return route.fulfill({ json: success([]) });
    }
    if (request.method() === 'GET' && pathName === '/api/daily-study-home') {
      return route.fulfill({ json: success({}) });
    }
    if (request.method() === 'GET' && pathName === '/api/materials') {
      return route.fulfill({ json: success([]) });
    }
    if (request.method() === 'GET' && pathName === '/api/knowledge-modules') {
      return route.fulfill({ json: success([]) });
    }
    return route.fulfill({ json: { success: false, error: { code: 'UNEXPECTED_REQUEST', message: '未预期的测试请求' } }, status: 500 });
  });
}

test('T02-R4: S3 练习不存在显示后端脱敏中文错误且不泄露 UUID/路径', async ({ page }) => {
  await installBaseApi(page);
  // GET /api/practice-sessions/:id 返回 404 脱敏错误
  await page.route(`http://127.0.0.1:4311/api/practice-sessions/${sessionId}**`, async (route) => {
    return route.fulfill({
      json: { success: false, error: { code: 'PRACTICE_SESSION_NOT_FOUND', message: '练习不存在或已被删除' } },
      status: 404,
    });
  });

  await page.goto(`/practice-sessions/${sessionId}?semesterId=${semesterId}`);
  // 页面通过 FeedbackMessage state="error" 展示后端 message
  await expect(page.getByText('练习不存在或已被删除')).toBeVisible();
  const body = await page.textContent('body');
  expect(body).not.toContain(sessionId); // 不泄露完整 UUID
  expect(body).not.toContain('stack');
  expect(body).not.toContain('C:\\');
  expect(body).not.toContain('at ');
});

test('T02-R4: S5 已确认考试显示生成入口，未确认考试显示确定性边界文案', async ({ page }) => {
  await installBaseApi(page);
  // 已确认路径：显示生成入口
  await page.goto(`/exams/${examId}/mock-exam?semesterId=${semesterId}`);
  await expect(page.getByRole('button', { name: '生成模拟卷' })).toBeVisible();
  const body = await page.textContent('body');
  expect(body).not.toContain('AI_PROVIDERS');
  expect(body).not.toContain('baseUrl');
  expect(body).not.toContain('apiKey');

  // 未确认路径：覆盖 exam 详情为 pending，显示确定性文案且无生成按钮
  await page.route(`http://127.0.0.1:4311/api/exams/${examId}**`, async (route) => {
    return route.fulfill({ json: success({ id: examId, name: '合成考试', courseInstanceId: courseId, confirmationStatus: 'pending' }) });
  });
  await page.goto(`/exams/${examId}/mock-exam?semesterId=${semesterId}`);
  await expect(page.getByText('请先确认考试信息，再生成模拟卷。')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成模拟卷' })).toHaveCount(0);
});

test('T02-R4: S3 提交失败显示固定中文错误', async ({ page }) => {
  await installBaseApi(page);
  const paperId = '99999999-9999-4999-8999-999999999999';
  const questions = [
    {
      id: '66666666-6666-4666-8666-666666666666',
      type: 'single_choice',
      stem: '单选题题干',
      options: ['A. 正确', 'B. 错误'],
      difficulty: 'easy',
      knowledgeModuleId: '55555555-5555-4555-8555-555555555555',
      questionOrder: 1,
    },
  ];
  await page.route(`http://127.0.0.1:4311/api/practice-sessions/${sessionId}**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: success({
          id: sessionId,
          courseInstanceId: courseId,
          status: 'in_progress',
          questionCount: 1,
          timeLimitSeconds: 60,
          difficultyPreference: 'mixed',
          questions,
        }),
      });
    }
    if (route.request().method() === 'POST' && url.pathname.endsWith('/submit')) {
      return route.fulfill({
        json: { success: false, error: { code: 'PRACTICE_SUBMIT_INPUT_INVALID', message: '提交内容不合法，请检查作答后再试' } },
        status: 400,
      });
    }
    return route.fulfill({ json: success({}) });
  });

  await page.goto(`/practice-sessions/${sessionId}?semesterId=${semesterId}`);
  await expect(page.getByText('单选题题干')).toBeVisible();
  // 提交（不选答案直接提交触发输入错误）
  await page.getByRole('button', { name: /提交/ }).click();
  await expect(page.getByText('提交内容不合法，请检查作答后再试')).toBeVisible();
  const body = await page.textContent('body');
  expect(body).not.toContain('throw');
  expect(body).not.toContain('C:\\');
});
