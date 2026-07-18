import { expect, test } from '@playwright/test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+oS7lVAAAAABJRU5ErkJggg==',
  'base64'
);

type Semester = {
  id: string;
  semesterCode: string;
  studentName: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate: null;
  status: 'active';
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

function success(data: unknown) {
  return { success: true, data };
}

test('T09A 首次创建、切换与刷新恢复当前学期，并隔离课程数据', async ({ page }) => {
  const semesters: Semester[] = [];
  const courses = new Map<string, Array<{ id: string; semesterId: string; name: string; createdAt: string; updatedAt: string }>>();
  let currentSemesterId: string | null = null;
  let previewCount = 0;

  const currentDto = () => {
    const current = semesters.find((semester) => semester.id === currentSemesterId) ?? null;
    return {
      semester: current ? { ...current, isCurrent: true } : null,
      recoveredFromStaleCurrent: false,
    };
  };

  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && url.pathname === '/api/semesters/current') return json(success(currentDto()));
    if (request.method() === 'GET' && url.pathname === '/api/semesters') {
      return json(success(semesters.map((semester) => ({ ...semester, isCurrent: semester.id === currentSemesterId }))));
    }
    if (request.method() === 'PUT' && url.pathname === '/api/semesters/current') {
      const body = request.postDataJSON() as { semesterId?: string };
      if (!body.semesterId || !semesters.some((semester) => semester.id === body.semesterId)) {
        return json({ success: false, error: { code: 'SEMESTER_NOT_FOUND', message: '学期不存在或不可选择' } }, 404);
      }
      currentSemesterId = body.semesterId;
      return json(success(currentDto()));
    }
    if (request.method() === 'POST' && url.pathname === '/api/semesters/preview') {
      previewCount += 1;
      const semesterCode = previewCount === 1 ? '2026 春季学期' : '2026 秋季学期';
      const courseName = previewCount === 1 ? '数学' : '英语';
      return json(success({
        previewId: `preview-${previewCount}`,
        expiresAt: '2026-07-18T01:00:00.000Z',
        semesterCode,
        teachingStartDate: previewCount === 1 ? '2026-02-16' : '2026-09-01',
        teachingEndDate: previewCount === 1 ? '2026-06-30' : '2027-01-20',
        finalArchiveDate: null,
        requiresStudentName: previewCount === 1,
        entries: [{
          clientId: `entry-${previewCount}`,
          courseName,
          weekday: 1,
          startTime: '08:00',
          endTime: '08:45',
          location: '101',
          parserConfidence: 0.8,
          warnings: [],
        }],
        warnings: [],
      }));
    }
    if (request.method() === 'POST' && url.pathname === '/api/semesters') {
      const body = request.postDataJSON() as {
        semesterCode: string;
        teachingStartDate: string;
        teachingEndDate: string;
        studentName?: string;
        entries: Array<{ courseName: string }>;
      };
      const id = `11111111-1111-4111-8111-${String(semesters.length + 1).padStart(12, '0')}`;
      const now = '2026-07-18T00:00:00.000Z';
      const semester: Semester = {
        id,
        semesterCode: body.semesterCode,
        studentName: body.studentName ?? semesters[0]?.studentName ?? '学生A',
        teachingStartDate: body.teachingStartDate,
        teachingEndDate: body.teachingEndDate,
        finalArchiveDate: null,
        status: 'active',
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      };
      semesters.push(semester);
      courses.set(id, body.entries.map((entry, index) => ({
        id: `22222222-2222-4222-8222-${String(semesters.length * 10 + index).padStart(12, '0')}`,
        semesterId: id,
        name: entry.courseName,
        createdAt: now,
        updatedAt: now,
      })));
      currentSemesterId = id;
      return json(success({ semester, current: currentDto() }), 201);
    }
    if (request.method() === 'GET' && url.pathname === '/api/courses') return json(success(courses.get(url.searchParams.get('semesterId') ?? '') ?? []));
    if (request.method() === 'GET' && url.pathname === '/api/schedule-entries') return json(success([]));
    if (request.method() === 'GET' && (url.pathname === '/api/exams' || url.pathname === '/api/study-tasks')) return json(success([]));
    if (request.method() === 'GET' && url.pathname === '/api/configuration/status') {
      return json(success({
        ai: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
        smtp: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
        feishu: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
        runtime: { dataDir: true, aiAvailable: true, smtpAvailable: true, feishuAvailable: true, uptime: 1, nodeVersion: 'v-test' },
      }));
    }
    return json({ success: false, error: { code: 'UNEXPECTED_REQUEST', message: '未预期的测试请求' } }, 500);
  });

  await page.goto('/courses');
  await expect(page).toHaveURL(/\/semesters$/);
  await expect(page.getByText('还没有可用学期。')).toBeVisible();
  await expect(page.getByLabel('学生姓名')).toBeVisible();

  await page.getByLabel('学生姓名').fill('学生A');
  await page.getByLabel('学期名称').fill('2026 春季学期');
  await page.getByLabel('开始日期').fill('2026-02-16');
  await page.getByLabel('结束日期').fill('2026-06-30');
  await page.getByLabel('课程表图片').setInputFiles({ name: 'spring.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: '预览课程表' }).click();
  await expect(page.getByRole('heading', { name: '确认课程表预览' })).toBeVisible();
  await expect(page.locator('input[value="数学"]')).toBeVisible();
  await page.getByRole('button', { name: '确认创建并切换' }).click();

  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator('.semester-status-card')).toContainText('2026 春季学期');
  await expect(page.getByLabel('课程列表').getByText('数学', { exact: true })).toBeVisible();
  await expect(page.getByText('输入 UUID 格式的学期 ID')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.semester-status-card')).toContainText('2026 春季学期');
  await expect(page.getByLabel('课程列表').getByText('数学', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '管理学期' }).click();
  await page.getByLabel('学期名称').fill('2026 秋季学期');
  await page.getByLabel('开始日期').fill('2026-09-01');
  await page.getByLabel('结束日期').fill('2027-01-20');
  await page.getByLabel('课程表图片').setInputFiles({ name: 'autumn.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: '预览课程表' }).click();
  await page.getByRole('button', { name: '确认创建并切换' }).click();

  await expect(page.locator('.semester-status-card')).toContainText('2026 秋季学期');
  await expect(page.getByLabel('课程列表').getByText('英语', { exact: true })).toBeVisible();
  await expect(page.getByLabel('课程列表').getByText('数学', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: '管理学期' }).click();
  const springItem = page.locator('.semester-list li').filter({ hasText: '2026 春季学期' });
  await springItem.getByRole('button', { name: '切换到此学期' }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator('.semester-status-card')).toContainText('2026 春季学期');
  await expect(page.getByLabel('课程列表').getByText('数学', { exact: true })).toBeVisible();
  await expect(page.getByLabel('课程列表').getByText('英语', { exact: true })).toHaveCount(0);
});
