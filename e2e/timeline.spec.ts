import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

const backendBaseUrl = 'http://127.0.0.1:4311/api';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedRecord {
  id: string;
}

interface TimelineEvent {
  courseInstanceId?: string;
  eventType: string;
}

async function postData<T>(request: APIRequestContext, pathName: string, data: object): Promise<T> {
  const response = await request.post(`${backendBaseUrl}${pathName}`, { data });
  expect(response.ok(), `${pathName} should succeed: ${await response.text()}`).toBe(true);
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(body.success).toBe(true);
  return body.data;
}

async function patchData<T>(request: APIRequestContext, pathName: string, data: object): Promise<T> {
  const response = await request.patch(`${backendBaseUrl}${pathName}`, { data });
  expect(response.ok(), `${pathName} should succeed: ${await response.text()}`).toBe(true);
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(body.success).toBe(true);
  return body.data;
}

async function createEvent(
  request: APIRequestContext,
  input: {
    semesterId: string;
    courseInstanceId: string;
    sourceSystem: string;
    eventType: string;
    title: string;
    occurredAt: string;
    parentVisible?: boolean;
  }
): Promise<void> {
  await postData(request, '/study-events', input);
}

function isoAfterDays(days: number, hour = 9): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

test('T07 时间线按课程展示固定文案、保护隐私并适配移动端', async ({ page, request }) => {
  const sensitiveSentinel = 'T07-SENSITIVE-TITLE-MUST-NOT-RENDER';
  const sensitiveUuid = '123e4567-e89b-42d3-a456-426614174000';
  const semester = await postData<{ semesterId: string }>(request, '/dev/init-semester', {
    studentName: 'T07 浏览器验收学生',
    semesterCode: `t07-browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    teachingStartDate: isoAfterDays(-30).slice(0, 10),
    teachingEndDate: isoAfterDays(365).slice(0, 10),
  });
  const semesterId = semester.semesterId;

  const courseA = await postData<CreatedRecord>(request, '/courses', {
    semesterId,
    name: 'T07 课程 A',
  });
  const courseB = await postData<CreatedRecord>(request, '/courses', {
    semesterId,
    name: 'T07 课程 B',
  });

  const examA = await postData<CreatedRecord>(request, '/exams', {
    semesterId,
    courseInstanceId: courseA.id,
    name: 'T07 课程 A 期末考试',
    examAt: isoAfterDays(20),
    attemptType: 'normal',
  });
  const examB = await postData<CreatedRecord>(request, '/exams', {
    semesterId,
    courseInstanceId: courseB.id,
    name: 'T07 课程 B 期末考试',
    examAt: isoAfterDays(25),
    attemptType: 'normal',
  });
  await patchData(request, `/exams/${examA.id}/confirmation`, { semesterId });
  await patchData(request, `/exams/${examB.id}/confirmation`, { semesterId });

  const eventTitle = (label: string) => `${sensitiveSentinel}:${label}:${sensitiveUuid}`;
  const eventBaseTime = Date.now() + 60_000;
  await createEvent(request, {
    semesterId,
    courseInstanceId: courseA.id,
    sourceSystem: 'S2',
    eventType: 'material_note_completed',
    title: eventTitle('course-a-material'),
    occurredAt: new Date(eventBaseTime + 1_000).toISOString(),
    parentVisible: false,
  });
  await createEvent(request, {
    semesterId,
    courseInstanceId: courseA.id,
    sourceSystem: 'S3',
    eventType: 'practice_completed',
    title: eventTitle('course-a-practice'),
    occurredAt: new Date(eventBaseTime + 2_000).toISOString(),
  });
  await createEvent(request, {
    semesterId,
    courseInstanceId: courseA.id,
    sourceSystem: 'S4',
    eventType: 'mistake_reviewed',
    title: eventTitle('course-a-mistake'),
    occurredAt: new Date(eventBaseTime + 3_000).toISOString(),
  });
  await createEvent(request, {
    semesterId,
    courseInstanceId: courseA.id,
    sourceSystem: 'S7',
    eventType: 't07_unknown_event',
    title: eventTitle('course-a-unknown'),
    occurredAt: new Date(eventBaseTime + 4_000).toISOString(),
  });
  await createEvent(request, {
    semesterId,
    courseInstanceId: courseB.id,
    sourceSystem: 'S1',
    eventType: 'study_task_completed',
    title: eventTitle('course-b-task'),
    occurredAt: new Date(eventBaseTime + 5_000).toISOString(),
  });

  const filterParams = new URLSearchParams({
    semesterId,
    courseInstanceId: courseA.id,
  });
  filterParams.append('eventType', 'material_note_completed');
  filterParams.append('eventType', 'mistake_reviewed');
  const filteredResponse = await request.get(`${backendBaseUrl}/timeline?${filterParams.toString()}`);
  expect(filteredResponse.ok()).toBe(true);
  const filteredBody = (await filteredResponse.json()) as ApiEnvelope<TimelineEvent[]>;
  expect(filteredBody.success).toBe(true);
  expect(filteredBody.data).toHaveLength(2);
  expect(new Set(filteredBody.data.map((event) => event.eventType))).toEqual(
    new Set(['material_note_completed', 'mistake_reviewed'])
  );
  expect(filteredBody.data.every((event) => event.courseInstanceId === courseA.id)).toBe(true);

  await page.goto('/courses');
  const semesterInput = page.getByLabel('当前学期 ID');
  await semesterInput.fill(semesterId);
  await page.getByRole('button', { name: '应用' }).click();
  await expect(page.getByText('已设置', { exact: true })).toBeVisible();
  await page.goto(`/exams/${examA.id}`);

  await expect(page.getByRole('heading', { name: 'T07 课程 A 期末考试', level: 1 })).toBeVisible();
  const activity = page.getByTestId('recent-study-activity');
  await expect(activity.getByRole('heading', { name: '近期学习活动' })).toBeVisible();
  for (const label of ['资料笔记已生成', '限时练习已完成', '错题重做结果', '未分类学习活动']) {
    await expect(activity.getByText(label, { exact: true })).toBeVisible();
  }
  for (const source of ['S2资料笔记', 'S3限时练习', 'S4错题改错', 'S7课堂采集']) {
    await expect(activity.getByText(source, { exact: true })).toBeVisible();
  }
  await expect(activity.getByText('学习任务已完成', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(sensitiveSentinel);
  await expect(page.locator('body')).not.toContainText(sensitiveUuid);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'T07 课程 A 期末考试', level: 1 })).toBeVisible();
  await expect(activity.getByText('资料笔记已生成', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'T07 课程 B 期末考试' }).click();
  await expect(page.getByRole('heading', { name: 'T07 课程 B 期末考试', level: 1 })).toBeVisible();
  await expect(activity.getByText('学习任务已完成', { exact: true })).toBeVisible();
  for (const label of ['资料笔记已生成', '限时练习已完成', '错题重做结果', '未分类学习活动']) {
    await expect(activity.getByText(label, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator('body')).not.toContainText(sensitiveSentinel);
  await expect(page.locator('body')).not.toContainText(sensitiveUuid);

  const evidenceRoot = path.join(process.env.APP_DATA_ROOT!, 'playwright');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(activity).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: path.join(evidenceRoot, 'timeline-mobile.png'),
    fullPage: true,
    mask: [semesterInput],
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(activity).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: path.join(evidenceRoot, 'timeline-desktop.png'),
    fullPage: true,
    mask: [semesterInput],
  });
});
