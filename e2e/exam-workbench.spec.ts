import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const backendBaseUrl = 'http://127.0.0.1:4311/api';

function localInputAfterDays(days: number, hour = 9): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

test('学生完成多考试确认、切换、任务闭环并刷新读回', async ({ page, request }) => {
  const semesterResponse = await request.post(`${backendBaseUrl}/dev/init-semester`, {
    data: {
      studentName: 'T11 合成学生',
      semesterCode: `t11-${Date.now()}`,
      teachingStartDate: localInputAfterDays(-30).slice(0, 10),
      teachingEndDate: localInputAfterDays(365).slice(0, 10),
    },
  });
  expect(semesterResponse.ok()).toBe(true);
  const semesterBody = await semesterResponse.json();
  const semesterId = semesterBody.data.semesterId as string;

  await page.goto('/courses');
  await page.getByLabel('当前学期 ID').fill(semesterId);
  await page.getByRole('button', { name: '应用' }).click();
  await page.getByLabel('课程名称').fill('T11 合成课程');
  await page.getByRole('button', { name: '创建课程' }).click();
  await expect(page.getByText('课程已创建')).toBeVisible();

  const exams = [
    { name: 'T11 第一场考试', date: localInputAfterDays(5) },
    { name: 'T11 第二场考试', date: localInputAfterDays(7) },
    { name: 'T11 待确认考试', date: localInputAfterDays(20) },
  ];
  for (const exam of exams) {
    await page.getByPlaceholder('考试名称').fill(exam.name);
    await page.locator('input[type="datetime-local"]').first().fill(exam.date);
    await page.getByRole('button', { name: '添加考试' }).click();
    await expect(page.getByText('考试目标已创建，下一步请确认考试日期')).toBeVisible();
    await expect(page.getByText(exam.name, { exact: true })).toBeVisible();
  }

  for (const exam of exams.slice(0, 2)) {
    const item = page.locator('.exam-item').filter({ hasText: exam.name });
    await item.getByRole('button', { name: '确认考试日期' }).click();
    await expect(item.getByText('状态：已确认')).toBeVisible();
  }
  const pendingItem = page.locator('.exam-item').filter({ hasText: exams[2].name });
  await expect(pendingItem.getByText('状态：待确认')).toBeVisible();

  const secondItem = page.locator('.exam-item').filter({ hasText: exams[1].name });
  await secondItem.getByRole('link', { name: '进入考试项目' }).click();
  await expect(page.getByRole('heading', { name: exams[1].name, level: 1 })).toBeVisible();
  await expect(page.getByText('还没有任务，先创建第一项任务。')).toBeVisible();
  await page.getByLabel('任务标题').fill('T11 邻近考试任务');
  await page.getByLabel('任务类型').selectOption('custom');
  await page.getByLabel('截止时间').fill(localInputAfterDays(6, 20));
  await page.getByRole('button', { name: '创建任务' }).click();
  await expect(page.getByText('T11 邻近考试任务', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: exams[0].name }).click();
  await expect(page.getByRole('heading', { name: exams[0].name, level: 1 })).toBeVisible();
  const workbenchHeader = page.locator('.workbench-header');
  await expect(workbenchHeader.getByText('还有 5 天', { exact: true })).toBeVisible();
  await expect(workbenchHeader.getByText('0 / 0', { exact: true })).toBeVisible();
  const pendingOverview = page.locator(`[data-exam-id]`).filter({ hasText: exams[2].name });
  await expect(pendingOverview.getByText('待确认', { exact: true })).toBeVisible();
  await expect(pendingOverview).not.toContainText('还有');
  const nearby = page.getByTestId('nearby-items');
  await expect(nearby).toContainText(exams[1].name);
  await expect(nearby).toContainText('T11 邻近考试任务');

  await page.getByLabel('任务标题').fill('T11 当前考试任务');
  await page.getByLabel('任务类型').selectOption('custom');
  await page.getByLabel('预计分钟数（可选）').fill('30');
  await page.getByLabel('截止时间').fill(localInputAfterDays(4, 20));
  await page.getByRole('button', { name: '创建任务' }).click();
  const currentTask = page.getByTestId('current-task-list').locator('li').filter({ hasText: 'T11 当前考试任务' });
  await expect(currentTask).toBeVisible();
  await currentTask.getByRole('button', { name: '开始学习' }).click();
  await expect(currentTask.getByText('进行中')).toBeVisible();
  await currentTask.getByRole('button', { name: '标记完成' }).click();
  await expect(currentTask.getByText('已完成')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: exams[0].name, level: 1 })).toBeVisible();
  await expect(workbenchHeader.getByText('1 / 1', { exact: true })).toBeVisible();
  await expect(page.getByText('T11 当前考试任务', { exact: true })).toBeVisible();

  const materialsLink = page.getByRole('link', { name: '打开本课程资料' });
  await expect(materialsLink).toHaveAttribute('href', /courseInstanceId=/);
  await materialsLink.click();
  await expect(page).toHaveURL(/\/materials\?courseInstanceId=/);
  await expect(page.getByLabel('选择课程')).toHaveValue(/.+/);

  const evidenceRoot = path.join(process.env.APP_DATA_ROOT!, 'playwright');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, 'exam-workbench-success.png'), fullPage: true });

  await page.goto('/exams/not-a-uuid');
  await expect(page.getByText('考试不存在')).toBeVisible();
});
