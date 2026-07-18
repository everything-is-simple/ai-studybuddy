import { expect, test, type Page } from '@playwright/test';

const semester = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterCode: '2026 秋季学期',
  studentName: '学生A',
  teachingStartDate: '2026-09-01',
  teachingEndDate: '2027-01-20',
  finalArchiveDate: null,
  status: 'active',
  isCurrent: true,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

function success(data: unknown) {
  return { success: true, data };
}

async function mockNoteApis(page: Page, withMindMap: boolean) {
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const url = new URL(route.request().url());
    const fulfill = (data: unknown) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(success(data)) });

    if (url.pathname === '/api/semesters/current') {
      return fulfill({ semester, recoveredFromStaleCurrent: false });
    }
    if (url.pathname === '/api/configuration/status') {
      return fulfill({
        ai: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
        smtp: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
        feishu: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
        runtime: { dataDir: true, aiAvailable: true, smtpAvailable: true, feishuAvailable: true, uptime: 1, nodeVersion: 'v-test' },
      });
    }
    if (url.pathname.startsWith('/api/notes/')) {
      return fulfill({
        id: url.pathname.split('/').at(-1),
        materialId: '22222222-2222-4222-8222-222222222222',
        markdown: '这里保留 Markdown 内容。',
        highlights: ['重点一'],
        mindMap: withMindMap
          ? {
              id: '33333333-3333-4333-8333-333333333333',
              noteId: url.pathname.split('/').at(-1),
              format: 'markmap',
              data: '# 章节\n## 重点',
              createdAt: '2026-07-18T00:00:00.000Z',
            }
          : null,
        knowledgeModules: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            courseInstanceId: '55555555-5555-4555-8555-555555555555',
            materialId: '22222222-2222-4222-8222-222222222222',
            title: '章节重点',
            contentSummary: '知识模块摘要',
            importance: 'high',
            difficulty: 'medium',
            examContent: '核心概念',
            evidence: [],
            learningStatus: 'not_started',
          },
        ],
      });
    }
    if (url.pathname === '/api/knowledge-modules') {
      return fulfill({ items: [], pagination: { page: 1, pageSize: 20, total: 0 } });
    }
    if (url.pathname === '/api/study-tasks') return fulfill([]);

    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { code: 'UNEXPECTED_REQUEST', message: url.pathname } }),
    });
  });
}

function isMindMapRequest(url: string) {
  return /\/src\/components\/mind-map\.tsx$/i.test(new URL(url).pathname);
}

test('无思维导图的笔记不会加载 Markmap 模块，正文和知识模块仍可见', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await mockNoteApis(page, false);

  await page.goto('/notes/no-mind-map');

  await expect(page.getByRole('heading', { name: '笔记正文' })).toBeVisible();
  await expect(page.getByText('这里保留 Markdown 内容。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '知识模块' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '思维导图' })).toHaveCount(0);
  await page.waitForTimeout(300);

  expect(requests.filter(isMindMapRequest)).toEqual([]);
});

test('有思维导图的笔记才加载 Markmap 模块并展示导图', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await mockNoteApis(page, true);

  await page.goto('/notes/with-mind-map');

  await expect(page.getByRole('heading', { name: '思维导图' })).toBeVisible();
  await expect(page.locator('.mind-map svg')).toBeVisible();
  await expect.poll(() => requests.some(isMindMapRequest)).toBe(true);
});
