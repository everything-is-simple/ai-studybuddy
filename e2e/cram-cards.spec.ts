import { expect, test, type Page } from '@playwright/test';

const semesterId = 'synthetic-semester';
const courseId = 'synthetic-course';
const examId = 'synthetic-exam';
const cards = [
  {
    id: 'synthetic-card-1',
    knowledgeModuleId: 'synthetic-card-1',
    title: '函数概念',
    importance: 'critical',
    contentSummary: '合成摘要：先确认输入与输出关系。',
    examRelevance: '合成考点：辨析函数定义。',
    sources: [
      { kind: 'weak_point', count: 3 },
      { kind: 'knowledge_module', count: 1 },
    ],
  },
  {
    id: 'synthetic-card-2',
    knowledgeModuleId: 'synthetic-card-2',
    title: '方程关系',
    importance: 'high',
    contentSummary: '合成摘要：先整理等式条件。',
    examRelevance: '合成考点：检查解的条件。',
    sources: [
      { kind: 'mistake', count: 2 },
      { kind: 'knowledge_module', count: 1 },
    ],
  },
];

function success(data: unknown) {
  return { success: true, data };
}

async function installCramApi(page: Page): Promise<void> {
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET' && path === '/api/semesters/current') {
      return json(
        success({
          semester: {
            id: semesterId,
            semesterCode: 'E2E',
            studentName: '合成学生',
            teachingStartDate: '2026-02-16',
            teachingEndDate: '2026-06-30',
            finalArchiveDate: null,
            status: 'active',
            isCurrent: true,
            createdAt: '2026-07-21T00:00:00.000Z',
            updatedAt: '2026-07-21T00:00:00.000Z',
          },
          recoveredFromStaleCurrent: false,
        })
      );
    }
    if (request.method() === 'GET' && path === `/api/exams/${examId}`) {
      return json(
        success({
          id: examId,
          courseInstanceId: courseId,
          name: '合成临考考试',
          attemptType: 'normal',
          examAt: '2026-08-01T09:00:00.000Z',
          confirmationStatus: 'confirmed',
        })
      );
    }
    if (request.method() === 'GET' && path === `/api/assessment-attempts/${examId}/cram-cards`) {
      return json(success({ assessmentAttemptId: examId, courseInstanceId: courseId, cards }));
    }
    return route.continue();
  });
}

test('T04 临考速背在 Chrome 中支持翻卡、刷新恢复、超时锁定与窄屏', async ({ page }) => {
  await installCramApi(page);
  await page.goto(`/exams/${examId}/cram`);
  await expect(page.getByTestId('cram-setup')).toBeVisible();
  await page.getByRole('button', { name: '开始速背' }).click();
  await expect(page.getByTestId('cram-session')).toContainText('第 1 / 2 张');
  await page.locator('.cram-flashcard').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('cram-session')).toContainText('第 2 / 2 张');
  const stored = await page.evaluate(() =>
    sessionStorage.getItem('ai-studybuddy:cram:synthetic-semester:synthetic-exam')
  );
  expect(stored).toContain('synthetic-card-2');
  expect(stored).not.toContain('合成摘要');
  expect(stored).not.toContain('合成考点');

  await page.reload();
  await expect(page.getByTestId('cram-session')).toContainText('第 2 / 2 张');
  await page.evaluate(() => {
    const key = 'ai-studybuddy:cram:synthetic-semester:synthetic-exam';
    const value = JSON.parse(sessionStorage.getItem(key) ?? '{}');
    value.endsAt = Date.now() - 1;
    sessionStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  await expect(page.getByText('本次限时翻阅已结束。当前卡片仍可翻转，但不能继续切换。')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一张' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /翻转查看考点|查看摘要面/ })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('cram-session')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
