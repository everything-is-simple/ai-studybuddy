import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { poisonCurrentSemesterForE2E } from '../packages/backend/test/e2e-stale-current';

const backendBaseUrl = 'http://127.0.0.1:4311/api';
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

type CreatedSemester = { semesterId: string };
type CreatedCourse = { id: string; name: string };
type CreatedExam = { id: string };

async function browserScheduleDates(page: Page) {
  return page.evaluate(() => {
    const pad = (value: number) => String(value).padStart(2, '0');
    const dateInput = (offsetDays: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 45);
    examDate.setHours(9, 0, 0, 0);
    return {
      semesterStart: dateInput(-7),
      semesterEnd: dateInput(180),
      examAt: examDate.toISOString(),
    };
  });
}

async function postData<T>(request: APIRequestContext, pathName: string, data: object): Promise<T> {
  const response = await request.post(`${backendBaseUrl}${pathName}`, { data });
  expect(response.ok(), `${pathName}: ${await response.text()}`).toBe(true);
  const body = (await response.json()) as { success: boolean; data: T };
  expect(body.success).toBe(true);
  return body.data;
}

async function createCurrentSemester(page: Page, request: APIRequestContext) {
  const dates = await browserScheduleDates(page);
  const semester = await postData<CreatedSemester>(request, '/dev/init-semester', {
    studentName: 'T09D 导航验收学生',
    semesterCode: `t09d-nav-${Date.now()}`,
    teachingStartDate: dates.semesterStart,
    teachingEndDate: dates.semesterEnd,
  });
  const semesterId = semester.semesterId;
  const selected = await request.put(`${backendBaseUrl}/semesters/current`, { data: { semesterId } });
  expect(selected.ok(), await selected.text()).toBe(true);
  const course = await postData<CreatedCourse>(request, '/courses', { semesterId, name: 'T09D 导航数学' });
  const exam = await postData<CreatedExam>(request, '/exams', {
    semesterId,
    courseInstanceId: course.id,
    name: 'T09D 导航期末考试',
    attemptType: 'normal',
    examAt: dates.examAt,
    goal: '验证全局导航与考试上下文',
  });
  const confirmed = await request.patch(`${backendBaseUrl}/exams/${exam.id}/confirmation`, { data: { semesterId } });
  expect(confirmed.ok(), await confirmed.text()).toBe(true);
  return { semesterId, course, exam };
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('T09D 全局导航覆盖桌面、窄屏、移动、考试上下文与 current/stale/404 状态', async ({ page, request }) => {
  const { semesterId, course, exam } = await createCurrentSemester(page, request);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每日学习首页', level: 1 })).toBeVisible();
  const nav = page.getByTestId('global-navigation');
  await expect(nav).toBeVisible();
  await expect(page.getByTestId('desktop-global-navigation')).toBeVisible();
  await expect(page.getByTestId('mobile-bottom-navigation')).toBeHidden();
  for (const name of ['今日', '课程', '学期', '资料', '设置']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: '今日' })).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalOverflow(page);

  await nav.getByRole('link', { name: '课程' }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(nav.getByRole('link', { name: '课程' })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(page.getByRole('heading', { name: '课程与考试目标', level: 1 })).toBeVisible();
  await expect(nav.getByRole('link', { name: '课程' })).toHaveAttribute('aria-current', 'page');

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(nav).toBeVisible();
  await expect(page.getByTestId('desktop-global-navigation')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await nav.getByRole('link', { name: '资料' }).click();
  await expect(page).toHaveURL(/\/materials$/);
  await expect(nav.getByRole('link', { name: '资料' })).toHaveAttribute('aria-current', 'page');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('desktop-global-navigation')).toBeHidden();
  await expect(page.getByTestId('mobile-bottom-navigation')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('mobile-more-navigation').locator('summary').click();
  await page.getByRole('link', { name: '设置' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('global-navigation').getByRole('link', { name: '设置' })).toHaveAttribute('aria-current', 'page');

  await page.goto(`/exams/${exam.id}`);
  await expect(page.getByRole('heading', { name: 'T09D 导航期末考试', level: 1 })).toBeVisible();
  await expect(page.getByTestId('global-navigation').getByRole('link', { name: '课程' })).toHaveAttribute('aria-current', 'page');
  const contextNav = page.getByTestId('exam-context-navigation');
  await expect(contextNav).toBeVisible();
  await expect(contextNav.getByRole('link', { name: '总览' })).toHaveAttribute('aria-current', 'page');
  await expect(contextNav.getByRole('link', { name: '资料' })).toHaveAttribute('href', `/materials?courseInstanceId=${course.id}`);
  await expect(contextNav.getByRole('link', { name: '练习' })).toHaveAttribute('href', `/exams/${exam.id}/practice`);
  await expect(contextNav.getByRole('link', { name: '错题' })).toHaveAttribute('href', `/exams/${exam.id}/mistakes`);
  await expect(contextNav.getByRole('link', { name: '时间线' })).toHaveAttribute('href', `/exams/${exam.id}#recent-study-activity`);
  await contextNav.getByRole('link', { name: '资料' }).click();
  await expect(page).toHaveURL(new RegExp(`/materials\\?courseInstanceId=${course.id}`));
  await expect(page.getByTestId('global-navigation').getByRole('link', { name: '资料' })).toHaveAttribute('aria-current', 'page');

  await page.goto('/not-a-real-entry');
  await expect(page.getByTestId('page-state').or(page.locator('[data-page-state="error"]'))).toContainText('页面不存在');
  await expect(page.locator('body')).not.toContainText(uuidPattern);

  poisonCurrentSemesterForE2E();
  await page.goto('/courses');
  await expect(page).toHaveURL(/\/semesters$/);
  await expect(page.getByRole('main').getByText('已清理失效的当前学期，请重新选择或创建学期。')).toBeVisible();
  await expect(page.getByText('尚未选择当前学期')).toBeVisible();

  const restored = await request.put(`${backendBaseUrl}/semesters/current`, { data: { semesterId } });
  expect(restored.ok(), await restored.text()).toBe(true);
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: '课程与考试目标', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('课程列表').getByText('T09D 导航数学', { exact: true })).toBeVisible();
});
