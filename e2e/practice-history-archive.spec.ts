import { expect, test } from '@playwright/test';

type Semester = {
  id: string;
  semesterCode: string;
  studentName: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate: string | null;
  archivedAt?: string | null;
  status: 'active' | 'archived';
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

const now = '2026-07-19T00:00:00.000Z';
const semesterA: Semester = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterCode: '2026 春季学期',
  studentName: '学生A',
  teachingStartDate: '2026-02-16',
  teachingEndDate: '2026-06-30',
  finalArchiveDate: null,
  archivedAt: null,
  status: 'active',
  isCurrent: true,
  createdAt: now,
  updatedAt: now,
};
const semesterB: Semester = {
  ...semesterA,
  id: '22222222-2222-4222-8222-222222222222',
  semesterCode: '2025 秋季学期',
  teachingStartDate: '2025-09-01',
  teachingEndDate: '2026-01-20',
  isCurrent: false,
};
const sessionId = '99999999-9999-4999-8999-999999999999';

function success(data: unknown) {
  return { success: true, data };
}

test('T09E 归档非当前学期并只读查看练习历史结果', async ({ page }) => {
  let activeSemesters: Semester[] = [semesterA, semesterB];
  let archivedSemesters: Semester[] = [];

  page.on('dialog', (dialog) => dialog.accept());

  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && url.pathname === '/api/semesters/current') {
      return json(success({ semester: semesterA, recoveredFromStaleCurrent: false }));
    }
    if (request.method() === 'GET' && url.pathname === '/api/semesters') {
      return json(success(activeSemesters));
    }
    if (request.method() === 'GET' && url.pathname === '/api/semesters/archived') {
      return json(success(archivedSemesters));
    }
    if (request.method() === 'POST' && url.pathname === `/api/semesters/${semesterB.id}/archive`) {
      const archived = { ...semesterB, status: 'archived' as const, archivedAt: '2026-07-19T08:00:00.000Z' };
      activeSemesters = activeSemesters.filter((semester) => semester.id !== semesterB.id);
      archivedSemesters = [archived];
      return json(success(archived));
    }
    if (request.method() === 'GET' && url.pathname === '/api/practice-sessions/history') {
      expect(url.searchParams.get('semesterId')).toBe(semesterB.id);
      return json(
        success({
          items: [
            {
              id: sessionId,
              semesterId: semesterB.id,
              courseInstanceId: 'course-1',
              courseName: '数学',
              assessmentAttemptId: 'exam-1',
              assessmentName: '期末考试',
              status: 'graded',
              sessionKind: 'practice',
              originMistakeId: null,
              questionCount: 2,
              totalScore: 1,
              correctRate: 0.5,
              overtime: false,
              totalDurationSeconds: 120,
              timeLimitSeconds: 300,
              startedAt: '2026-01-10T08:00:00.000Z',
              submittedAt: '2026-01-10T08:02:00.000Z',
              gradedAt: '2026-01-10T08:02:01.000Z',
              createdAt: '2026-01-10T08:00:00.000Z',
              updatedAt: '2026-01-10T08:02:01.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, hasMore: false },
        })
      );
    }
    if (request.method() === 'GET' && url.pathname === `/api/practice-sessions/${sessionId}/history-result`) {
      expect(url.searchParams.get('semesterId')).toBe(semesterB.id);
      return json(
        success({
          id: sessionId,
          semesterId: semesterB.id,
          courseInstanceId: 'course-1',
          courseName: '数学',
          assessmentAttemptId: 'exam-1',
          assessmentName: '期末考试',
          status: 'graded',
          sessionKind: 'practice',
          originMistakeId: null,
          questionCount: 2,
          totalScore: 1,
          correctRate: 0.5,
          overtime: false,
          totalDurationSeconds: 120,
          timeLimitSeconds: 300,
          startedAt: '2026-01-10T08:00:00.000Z',
          submittedAt: '2026-01-10T08:02:00.000Z',
          gradedAt: '2026-01-10T08:02:01.000Z',
          createdAt: '2026-01-10T08:00:00.000Z',
          updatedAt: '2026-01-10T08:02:01.000Z',
          answers: [
            {
              questionId: 'question-1',
              answerOrder: 1,
              knowledgeModuleId: 'module-1',
              knowledgeModuleTitle: '函数基础',
              stem: '一次函数图像是什么？',
              type: 'single_choice',
              difficulty: 'easy',
              sourceEvidence: '课堂笔记',
              studentAnswer: 'A',
              correctAnswer: 'B',
              isCorrect: false,
              explanation: '一次函数图像是一条直线。',
              timeSpentSeconds: 45,
            },
          ],
        })
      );
    }
    if (request.method() === 'GET' && url.pathname === '/api/configuration/status') {
      return json(
        success({
          ai: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
          smtp: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
          feishu: { status: 'verified_pass', lastVerified: null, summary: null, errorCode: null },
          runtime: {
            dataDir: true,
            aiAvailable: true,
            smtpAvailable: true,
            feishuAvailable: true,
            uptime: 1,
            nodeVersion: 'v-test',
          },
        })
      );
    }
    return json(
      { success: false, error: { code: 'UNEXPECTED_REQUEST', message: `${request.method()} ${url.pathname}` } },
      500
    );
  });

  await page.goto('/semesters');
  await expect(page.getByRole('heading', { name: '学期管理' })).toBeVisible();
  const currentItem = page.locator('.semester-list li').filter({ hasText: semesterA.semesterCode });
  await expect(currentItem.getByText('当前')).toBeVisible();
  await expect(currentItem.getByRole('button', { name: '归档此学期' })).toHaveCount(0);

  const oldItem = page.locator('.semester-list li').filter({ hasText: semesterB.semesterCode });
  await oldItem.getByRole('button', { name: '归档此学期' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已归档' })).toBeVisible();

  const archivedItem = page.locator('.archived-semester-list li').filter({ hasText: semesterB.semesterCode });
  await expect(archivedItem.getByText('只读')).toBeVisible();
  await archivedItem.getByRole('link', { name: '查看练习历史' }).click();

  await expect(page).toHaveURL(`/semesters/${semesterB.id}/practice-history`);
  await expect(page.getByRole('heading', { name: '练习历史' })).toBeVisible();
  await expect(page.getByText('期末考试')).toBeVisible();
  await page.getByRole('link', { name: '查看结果' }).click();

  await expect(page).toHaveURL(`/semesters/${semesterB.id}/practice-history/${sessionId}`);
  await expect(page.getByRole('heading', { name: '练习结果' })).toBeVisible();
  await expect(page.getByText('只读查看：学生答案、正确答案、解析、课程/考试引用和知识模块引用会保留。')).toBeVisible();
  await expect(page.getByText('函数基础')).toBeVisible();
  await expect(page.getByText('正确答案：B')).toBeVisible();
});
