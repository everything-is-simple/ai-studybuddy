import { expect, test, type APIRequestContext } from '@playwright/test';

const backendBaseUrl = 'http://127.0.0.1:4311/api';

type CreatedSemester = { semesterId: string };
type CreatedCourse = { id: string; name: string };
type CreatedExam = { id: string };
type ScheduleEntry = { id: string };

async function postData<T>(request: APIRequestContext, pathName: string, data: object): Promise<T> {
  const response = await request.post(`${backendBaseUrl}${pathName}`, { data });
  expect(response.ok(), `${pathName}: ${await response.text()}`).toBe(true);
  const body = await response.json() as { success: boolean; data: T };
  expect(body.success).toBe(true);
  return body.data;
}

async function expectFailure(response: Awaited<ReturnType<APIRequestContext['fetch']>>) {
  expect(response.ok(), await response.text()).toBe(false);
  const body = await response.json() as { success: boolean; error?: { code?: string } };
  expect(body.success).toBe(false);
}

test('T09C 在当前学期维护课程、完整周课表和考试目标，并隔离另一学期资源', async ({ page, request }) => {
  await page.goto('/courses');
  await expect(page).toHaveURL(/\/semesters$/);

  const firstSemester = await postData<CreatedSemester>(request, '/dev/init-semester', {
    studentName: 'T09C 浏览器验收学生',
    semesterCode: `t09c-a-${Date.now()}`,
    teachingStartDate: '2026-08-01',
    teachingEndDate: '2027-01-31',
  });
  const firstSemesterId = firstSemester.semesterId;
  const selected = await request.put(`${backendBaseUrl}/semesters/current`, { data: { semesterId: firstSemesterId } });
  expect(selected.ok(), await selected.text()).toBe(true);
  const firstCourse = await postData<CreatedCourse>(request, '/courses', { semesterId: firstSemesterId, name: 'T09C 原课程名称' });

  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: '课程与考试目标', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '完整周课表', level: 2 })).toBeVisible();
  for (const weekday of ['周日', '周一', '周二', '周三', '周四', '周五', '周六']) {
    await expect(page.getByRole('heading', { name: weekday, level: 3 })).toBeVisible();
  }
  await expect(page.getByText('暂无已登记课表')).toBeVisible();

  await page.getByRole('button', { name: '编辑课程名称' }).click();
  await page.getByLabel('编辑课程名称').fill('T09C 线性代数');
  await page.getByRole('button', { name: '保存课程名称' }).click();
  await expect(page.getByText('课程名称已更新')).toBeVisible();
  await expect(page.getByLabel('课程列表').getByText('T09C 线性代数', { exact: true })).toBeVisible();

  await page.getByLabel('课表课程').selectOption(firstCourse.id);
  await page.getByLabel('星期').selectOption('2');
  await page.getByLabel('开始时间').fill('10:00');
  await page.getByLabel('结束时间').fill('11:30');
  await page.getByLabel('上课地点').fill('B202');
  await page.getByRole('button', { name: '添加课表条目' }).click();
  await expect(page.getByText('课表条目已添加')).toBeVisible();
  await expect(page.getByText('10:00–11:30')).toBeVisible();
  await expect(page.getByText('B202', { exact: true })).toBeVisible();

  const entriesResponse = await request.get(`${backendBaseUrl}/schedule-entries?semesterId=${encodeURIComponent(firstSemesterId)}`);
  expect(entriesResponse.ok(), await entriesResponse.text()).toBe(true);
  const entriesBody = await entriesResponse.json() as { success: boolean; data: ScheduleEntry[] };
  expect(entriesBody.success).toBe(true);
  const firstEntry = entriesBody.data[0];
  expect(firstEntry).toBeTruthy();

  await page.getByRole('button', { name: '编辑课表条目' }).click();
  await page.getByLabel('上课地点').fill('B303');
  await page.getByRole('button', { name: '保存课表条目' }).click();
  await expect(page.getByText('课表条目已更新')).toBeVisible();
  await expect(page.getByText('B303', { exact: true })).toBeVisible();

  await page.getByPlaceholder('考试名称').fill('T09C 期末考试');
  await page.getByPlaceholder('考试目标（可选）').fill('完成矩阵与行列式复习');
  await page.locator('input[type="datetime-local"]').first().fill('2026-12-20T09:00');
  await page.getByRole('button', { name: '添加考试' }).click();
  await expect(page.getByText('考试目标已创建，下一步请确认考试日期')).toBeVisible();
  await expect(page.getByText('T09C 期末考试', { exact: true })).toBeVisible();
  await expect(page.getByText('等待重新确认')).toBeVisible();

  const examsResponse = await request.get(`${backendBaseUrl}/exams?semesterId=${encodeURIComponent(firstSemesterId)}&courseInstanceId=${encodeURIComponent(firstCourse.id)}`);
  expect(examsResponse.ok(), await examsResponse.text()).toBe(true);
  const examsBody = await examsResponse.json() as { success: boolean; data: CreatedExam[] };
  expect(examsBody.success).toBe(true);
  const firstExam = examsBody.data[0];
  expect(firstExam).toBeTruthy();

  await page.getByRole('button', { name: '确认考试日期' }).click();
  await expect(page.getByText('考试日期已确认，可以进入考试项目')).toBeVisible();
  await expect(page.getByText(/正式倒计时：/)).toBeVisible();

  await page.getByRole('button', { name: '编辑考试' }).click();
  await page.getByLabel('编辑考试目标').fill('完成矩阵、行列式与特征值复习');
  await page.getByRole('button', { name: '保存考试' }).click();
  await expect(page.getByText('考试目标已更新')).toBeVisible();
  await expect(page.getByText(/正式倒计时：/)).toBeVisible();

  await page.getByRole('button', { name: '编辑考试' }).click();
  await page.getByLabel('编辑考试日期').fill('2026-12-21T09:00');
  await page.getByRole('button', { name: '保存考试' }).click();
  await expect(page.getByText('等待重新确认')).toBeVisible();
  await expect(page.getByText(/正式倒计时：/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认考试日期' })).toBeVisible();
  await page.getByRole('button', { name: '确认考试日期' }).click();
  await expect(page.getByText(/正式倒计时：/)).toBeVisible();

  const secondSemester = await postData<CreatedSemester>(request, '/dev/init-semester', {
    studentName: 'T09C 浏览器验收学生',
    semesterCode: `t09c-b-${Date.now()}`,
    teachingStartDate: '2027-02-20',
    teachingEndDate: '2027-06-30',
  });
  const secondSemesterId = secondSemester.semesterId;
  const secondCourse = await postData<CreatedCourse>(request, '/courses', { semesterId: secondSemesterId, name: 'T09C 第二学期课程' });

  await expectFailure(await request.patch(`${backendBaseUrl}/courses/${firstCourse.id}`, { data: { semesterId: secondSemesterId, name: '越权课程名' } }));
  await expectFailure(await request.patch(`${backendBaseUrl}/schedule-entries/${firstEntry.id}`, { data: { semesterId: secondSemesterId, courseInstanceId: secondCourse.id, weekday: 2, startTime: '10:00', endTime: '11:30', location: '越权地点' } }));
  await expectFailure(await request.get(`${backendBaseUrl}/exams/${firstExam.id}?semesterId=${encodeURIComponent(secondSemesterId)}`));

  await page.getByRole('button', { name: '移除课表条目' }).click();
  await expect(page.getByText('课表条目已移除')).toBeVisible();
  await expect(page.getByText('暂无已登记课表')).toBeVisible();

  const selectSecond = await request.put(`${backendBaseUrl}/semesters/current`, { data: { semesterId: secondSemesterId } });
  expect(selectSecond.ok(), await selectSecond.text()).toBe(true);
  await page.goto('/courses');
  await expect(page.getByLabel('课程列表').getByText('T09C 第二学期课程', { exact: true })).toBeVisible();
  await expect(page.getByText('T09C 线性代数', { exact: true })).toHaveCount(0);
  await expect(page.getByText('T09C 期末考试', { exact: true })).toHaveCount(0);
});
