import { expect, test, type APIRequestContext } from '@playwright/test';

const backendBaseUrl = 'http://127.0.0.1:4311/api';

async function postData<T>(request: APIRequestContext, pathName: string, data: object): Promise<T> {
  const response = await request.post(`${backendBaseUrl}${pathName}`, { data });
  expect(response.ok(), `${pathName}: ${await response.text()}`).toBe(true);
  const body = await response.json() as { success: boolean; data: T };
  expect(body.success).toBe(true);
  return body.data;
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

test('T09B 每日学习首页复用当前学期并展示只读聚合', async ({ page, request }) => {
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const semester = await postData<{ semesterId: string }>(request, '/dev/init-semester', {
    studentName: 'T09B 浏览器验收学生',
    semesterCode: `t09b-${Date.now()}`,
    teachingStartDate: addCalendarDays(today, -30),
    teachingEndDate: addCalendarDays(today, 365),
  });
  const semesterId = semester.semesterId;
  const selected = await request.put(`${backendBaseUrl}/semesters/current`, { data: { semesterId } });
  expect(selected.ok(), await selected.text()).toBe(true);
  const course = await postData<{ id: string }>(request, '/courses', { semesterId, name: 'T09B 数学' });
  await postData(request, '/study-tasks', {
    semesterId,
    courseInstanceId: course.id,
    type: 'practice',
    title: 'T09B 今日函数练习',
    deadlineAt: `${today}T20:00:00.000Z`,
  });
  const exam = await postData<{ id: string }>(request, '/exams', {
    semesterId,
    courseInstanceId: course.id,
    name: 'T09B 期中考试',
    attemptType: 'normal',
    examAt: `${addCalendarDays(today, 2)}T08:00:00.000Z`,
  });
  const confirmed = await request.patch(`${backendBaseUrl}/exams/${exam.id}/confirmation`, { data: { semesterId } });
  expect(confirmed.ok(), await confirmed.text()).toBe(true);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每日学习首页', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日待办', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'T09B 今日函数练习' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '临近考试', level: 2 })).toBeVisible();
  await expect(page.getByText('T09B 期中考试', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '下一步', level: 2 })).toBeVisible();
});
