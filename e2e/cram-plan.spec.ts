import { expect, test, type Page } from '@playwright/test';

const semesterId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const examIds = {
  normal: '33333333-3333-4333-8333-333333333333',
  pending: '34343434-3434-4343-8343-343434343434',
  notStarted: '35353535-3535-4353-8353-353535353535',
  ended: '36363636-3636-4363-8363-363636363636',
  empty: '37373737-3737-4373-8373-373737373737',
  switched: '38383838-3838-4383-8383-383838383838',
} as const;

type ExamKey = keyof typeof examIds;

const suggestions = [
  {
    id: 'task:task-1',
    priority: 1,
    reason: '优先完成考试前到期的未完成任务',
    sourceKind: 'study_task',
    sourceId: 'task-1',
    targetType: 'study_task',
    targetId: 'task-1',
  },
  {
    id: 'weak:weak-1',
    priority: 2,
    reason: '薄弱点已有 4 条证据',
    sourceKind: 'weak_point',
    sourceId: 'weak-1',
    targetType: 'weak_point',
    targetId: 'weak-1',
  },
  {
    id: 'mistake:mistake-1',
    priority: 3,
    reason: '错题累计 3 次错误',
    sourceKind: 'mistake',
    sourceId: 'mistake-1',
    targetType: 'mistake',
    targetId: 'mistake-1',
  },
  {
    id: 'practice:practice-1',
    priority: 4,
    reason: '已完成练习正确率 40%，建议针对性复盘',
    sourceKind: 'practice_performance',
    sourceId: 'practice-1',
    targetType: 'practice_history',
    targetId: 'practice-1',
  },
  {
    id: 'cram-cards',
    priority: 4,
    reason: '可使用临考速背快速回顾已整理考点',
    sourceKind: 'cram_cards',
    sourceId: null,
    targetType: 'cram_cards',
    targetId: examIds.normal,
  },
] as const;

function success(data: unknown) {
  return { success: true, data };
}

function examFor(key: ExamKey) {
  const names: Record<ExamKey, string> = {
    normal: 'T05 正常建议考试',
    pending: 'T05 未确认考试',
    notStarted: 'T05 尚未进入窗口考试',
    ended: 'T05 已结束冲刺期考试',
    empty: 'T05 空建议考试',
    switched: 'T05 切换后考试',
  };
  const examAt: Record<ExamKey, string> = {
    normal: '2026-07-27T08:00:00.000Z',
    pending: '2026-07-27T08:00:00.000Z',
    notStarted: '2026-08-01T08:00:00.000Z',
    ended: '2026-07-20T08:00:00.000Z',
    empty: '2026-07-25T08:00:00.000Z',
    switched: '2026-07-26T08:00:00.000Z',
  };
  return {
    id: examIds[key],
    courseInstanceId: courseId,
    name: names[key],
    attemptType: 'normal',
    examAt: examAt[key],
    confirmationStatus: key === 'pending' ? 'pending' : 'confirmed',
  };
}

function planFor(key: ExamKey) {
  if (key === 'notStarted')
    return {
      assessmentAttemptId: examIds[key],
      courseInstanceId: courseId,
      assessmentName: examFor(key).name,
      examAt: examFor(key).examAt,
      daysUntilExam: 11,
      availability: 'not_started',
      days: [],
    };
  if (key === 'ended')
    return {
      assessmentAttemptId: examIds[key],
      courseInstanceId: courseId,
      assessmentName: examFor(key).name,
      examAt: examFor(key).examAt,
      daysUntilExam: -1,
      availability: 'ended',
      days: [],
    };
  if (key === 'empty')
    return {
      assessmentAttemptId: examIds[key],
      courseInstanceId: courseId,
      assessmentName: examFor(key).name,
      examAt: examFor(key).examAt,
      daysUntilExam: 4,
      availability: 'available',
      days: [{ date: '2026-07-21', suggestions: [] }],
    };
  return {
    assessmentAttemptId: examIds[key],
    courseInstanceId: courseId,
    assessmentName: examFor(key).name,
    examAt: examFor(key).examAt,
    daysUntilExam: key === 'switched' ? 5 : 6,
    availability: 'available',
    days: [{ date: '2026-07-21', suggestions: key === 'switched' ? [suggestions[0]] : suggestions }],
  };
}

async function installCramPlanApi(page: Page, options: { failOnce?: boolean } = {}) {
  let planCalls = 0;
  const methods: string[] = [];
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    methods.push(request.method());
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && path === '/api/semesters/current') {
      return json(
        success({
          semester: {
            id: semesterId,
            semesterCode: 'T05 E2E',
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
    if (request.method() === 'GET' && path.startsWith('/api/exams/')) {
      const key = (Object.keys(examIds) as ExamKey[]).find((candidate) => path.endsWith(examIds[candidate]));
      if (key) return json(success(examFor(key)));
    }
    if (request.method() === 'GET' && path.startsWith('/api/assessment-attempts/')) {
      const key = (Object.keys(examIds) as ExamKey[]).find((candidate) => path.includes(examIds[candidate]));
      if (key) {
        planCalls += 1;
        if (options.failOnce && planCalls === 1)
          return json({ success: false, error: { code: 'CRAM_PLAN_FAILED', message: '合成请求失败' } }, 503);
        return json(success(planFor(key)));
      }
    }
    return route.continue();
  });
  return { methods, getPlanCalls: () => planCalls };
}

test('T05 冲刺计划在真实 Chromium 中展示建议、深链、切换清理和窄屏布局', async ({ page }) => {
  const state = await installCramPlanApi(page);
  await page.goto(`/exams/${examIds.normal}/cram-plan`);

  await expect(page.getByRole('heading', { name: 'T05 正常建议考试 的冲刺计划' })).toBeVisible();
  await expect(page.getByTestId('cram-plan-days')).toContainText('距离考试 6 天');
  await expect(page.getByRole('link', { name: '冲刺计划' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('考试前任务')).toBeVisible();
  await expect(page.getByText('薄弱点证据')).toBeVisible();
  await expect(page.getByText('待复习错题')).toBeVisible();
  await expect(page.getByText('练习表现')).toBeVisible();
  await expect(page.getByTestId('exam-context-navigation').getByRole('link', { name: '临考速背' })).toBeVisible();
  await expect(
    page.getByTestId('cram-plan-days').locator('.cram-plan-suggestion strong').filter({ hasText: '临考速背' })
  ).toBeVisible();

  const links = await page
    .locator('.cram-plan-suggestion .button-link')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLAnchorElement).getAttribute('href')));
  expect(links).toEqual([
    `/exams/${examIds.normal}`,
    `/exams/${examIds.normal}/mistakes`,
    `/exams/${examIds.normal}/mistakes`,
    `/semesters/${semesterId}/practice-history?courseInstanceId=${courseId}`,
    `/exams/${examIds.normal}/cram`,
  ]);
  expect(state.methods.every((method) => method === 'GET')).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto(`/exams/${examIds.switched}/cram-plan`);
  await expect(page.getByRole('heading', { name: 'T05 切换后考试 的冲刺计划' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'T05 正常建议考试 的冲刺计划' })).toHaveCount(0);
});

test('T05 冲刺计划展示未确认、窗口状态和空建议降级', async ({ page }) => {
  await installCramPlanApi(page);

  await page.goto(`/exams/${examIds.pending}/cram-plan`);
  await expect(page.getByText('请先确认考试信息，确认后才能生成冲刺计划。')).toBeVisible();
  await expect(page.getByTestId('cram-plan-days')).toHaveCount(0);

  await page.goto(`/exams/${examIds.notStarted}/cram-plan`);
  await expect(page.getByTestId('cram-plan-not-started')).toContainText('尚未进入冲刺窗口');

  await page.goto(`/exams/${examIds.ended}/cram-plan`);
  await expect(page.getByTestId('cram-plan-ended')).toContainText('冲刺期已结束');

  await page.goto(`/exams/${examIds.empty}/cram-plan`);
  await expect(page.getByTestId('cram-plan-empty')).toBeVisible();
  await expect(page.getByRole('link', { name: '开始练习' })).toHaveAttribute(
    'href',
    `/exams/${examIds.empty}/practice`
  );
  await expect(page.getByRole('link', { name: '查看错题本' })).toHaveAttribute(
    'href',
    `/exams/${examIds.empty}/mistakes`
  );
  await expect(page.getByTestId('cram-plan-empty').getByRole('link', { name: '临考速背' })).toHaveAttribute(
    'href',
    `/exams/${examIds.empty}/cram`
  );
});

test('T05 冲刺计划请求失败后可重试且重试仍为只读导航', async ({ page }) => {
  const state = await installCramPlanApi(page, { failOnce: true });
  await page.goto(`/exams/${examIds.normal}/cram-plan`);
  await expect(page.getByText('合成请求失败')).toBeVisible();
  await page.getByRole('button', { name: /重试/ }).click();
  await expect(page.getByTestId('cram-plan-days')).toBeVisible();
  expect(state.getPlanCalls()).toBe(2);
  expect(state.methods.every((method) => method === 'GET')).toBe(true);
});
