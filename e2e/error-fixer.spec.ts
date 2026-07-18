import { expect, test } from '@playwright/test';

// Phase 1-T04B：S4 错题本前端闭环 e2e
// 与既有 spec 相同模式：真实前端 + mock 后端 API（带状态，覆盖完整改错流程）。

const semesterId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const examId = '33333333-3333-4333-8333-333333333333';
const mistakeId = '99999999-9999-4999-8999-999999999999';
const moduleId = '55555555-5555-4555-8555-555555555555';
const redoSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const redoQuestionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function success(data: unknown) {
  return { success: true, data };
}

interface MistakeState {
  status: 'pending_review' | 'needs_review' | 'mastered';
  errorCauseCategory: string | null;
  errorCauseNote: string | null;
  errorCauseConfirmedAt: string | null;
  evidence: Array<{ id: string; evidenceType: string; occurredAt: string }>;
  redoAttempt: number;
}

test.beforeEach(async ({ page }) => {
  const state: MistakeState = {
    status: 'pending_review',
    errorCauseCategory: null,
    errorCauseNote: null,
    errorCauseConfirmedAt: null,
    evidence: [{ id: 'evidence-1', evidenceType: 'practice_error', occurredAt: '2026-07-16T00:10:00.000Z' }],
    redoAttempt: 0,
  };

  const listItem = () => ({
    id: mistakeId,
    courseInstanceId: courseId,
    assessmentAttemptId: examId,
    knowledgeModuleId: moduleId,
    knowledgeModuleTitle: '矩阵基础',
    questionId: '66666666-6666-4666-8666-666666666666',
    questionType: 'single_choice',
    stemPreview: '矩阵乘法满足哪条性质？',
    status: state.status,
    errorCount: 1,
    errorCauseCategory: state.errorCauseCategory,
    firstErrorAt: '2026-07-16T00:10:00.000Z',
    latestErrorAt: '2026-07-16T00:10:00.000Z',
  });

  const detail = () => ({
    ...listItem(),
    stem: '矩阵乘法满足哪条性质？',
    options: ['A. 结合律', 'B. 交换律', 'C. 都不满足', 'D. 只对方阵成立'],
    correctAnswer: 'A',
    explanation: '矩阵乘法满足结合律，但一般不满足交换律。',
    studentAnswer: 'B',
    errorCauseNote: state.errorCauseNote,
    errorCauseConfirmedAt: state.errorCauseConfirmedAt,
    evidence: [...state.evidence].reverse(),
  });

  const redoSession = () => ({
    id: redoSessionId,
    courseInstanceId: courseId,
    assessmentAttemptId: null,
    status: 'in_progress',
    questionCount: 1,
    timeLimitSeconds: null,
    difficultyPreference: 'mixed',
    sessionKind: 'mistake_redo',
    originMistakeId: mistakeId,
    startedAt: '2026-07-16T03:00:00.000Z',
    createdAt: '2026-07-16T03:00:00.000Z',
    updatedAt: '2026-07-16T03:00:00.000Z',
    questions: [
      {
        id: redoQuestionId,
        type: 'single_choice',
        stem: '矩阵乘法满足哪条性质？',
        options: ['A. 结合律', 'B. 交换律', 'C. 都不满足', 'D. 只对方阵成立'],
        difficulty: 'medium',
        knowledgeModuleId: moduleId,
        questionOrder: 1,
      },
    ],
  });
  await page.route('http://127.0.0.1:4311/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathName = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && pathName === '/api/semesters/current')
      return json(success({
        semester: {
          id: semesterId,
          semesterCode: 'E2E 合成学期',
          studentName: 'E2E 合成学生',
          teachingStartDate: '2026-02-16',
          teachingEndDate: '2026-06-30',
          finalArchiveDate: null,
          status: 'active',
          isCurrent: true,
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
        recoveredFromStaleCurrent: false,
      }));
    if (request.method() === 'GET' && pathName === '/api/semesters')
      return json(success([{
        id: semesterId,
        semesterCode: 'E2E 合成学期',
        studentName: 'E2E 合成学生',
        teachingStartDate: '2026-02-16',
        teachingEndDate: '2026-06-30',
        finalArchiveDate: null,
        status: 'active',
        isCurrent: true,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      }]));

    if (request.method() === 'GET' && pathName === `/api/exams/${examId}`)
      return json(success({ id: examId, courseInstanceId: courseId, name: 'T04B 合成考试', attemptType: 'normal', examAt: '2026-08-01T09:00:00.000Z', confirmationStatus: 'confirmed' }));
    if (request.method() === 'GET' && pathName === '/api/courses')
      return json(success([{ id: courseId, semesterId, name: 'T04B 合成课程', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z' }]));
    if (request.method() === 'GET' && pathName === '/api/exams')
      return json(success([{ id: examId, courseInstanceId: courseId, name: 'T04B 合成考试', attemptType: 'normal', examAt: '2026-08-01T09:00:00.000Z', confirmationStatus: 'confirmed' }]));
    if (request.method() === 'GET' && pathName === '/api/study-tasks') return json(success([]));

    if (request.method() === 'GET' && pathName === '/api/mistakes') {
      const statusFilter = url.searchParams.get('status');
      const items = statusFilter && statusFilter !== state.status ? [] : [listItem()];
      return json(success({ items, page: 1, pageSize: 20, total: items.length }));
    }
    if (request.method() === 'GET' && pathName === `/api/mistakes/${mistakeId}`) return json(success(detail()));
    if (request.method() === 'GET' && pathName === '/api/weak-points')
      return json(
        success({
          items: [
            {
              id: 'weak-1',
              courseInstanceId: courseId,
              knowledgeModuleId: moduleId,
              knowledgeModuleTitle: '矩阵基础',
              status: 'active',
              evidenceCount: 2,
              firstDetectedAt: '2026-07-16T00:10:00.000Z',
              latestDetectedAt: '2026-07-16T00:10:00.000Z',
            },
          ],
        })
      );
    if (request.method() === 'PATCH' && pathName === `/api/mistakes/${mistakeId}/error-cause`) {
      const body = request.postDataJSON() as { category: string; note?: string | null };
      state.errorCauseCategory = body.category;
      state.errorCauseNote = body.note ?? null;
      state.errorCauseConfirmedAt = '2026-07-16T02:00:00.000Z';
      if (state.status === 'pending_review') state.status = 'needs_review';
      return json(success(detail()));
    }
    if (request.method() === 'PATCH' && pathName === `/api/mistakes/${mistakeId}/status`) {
      const body = request.postDataJSON() as { status: 'mastered' | 'needs_review' };
      state.status = body.status;
      return json(success(detail()));
    }
    if (request.method() === 'POST' && pathName === `/api/mistakes/${mistakeId}/redo`) {
      state.redoAttempt += 1;
      return json(success(redoSession()), 201);
    }
    if (request.method() === 'GET' && pathName === `/api/practice-sessions/${redoSessionId}`)
      return json(success(redoSession()));
    if (request.method() === 'POST' && pathName === `/api/practice-sessions/${redoSessionId}/submit`) {
      const body = request.postDataJSON() as { answers: Array<{ answer?: string | null }> };
      const isCorrect = body.answers[0]?.answer === 'A';
      state.evidence.push({
        id: `evidence-redo-${state.redoAttempt}`,
        evidenceType: isCorrect ? 'redo_correct' : 'redo_incorrect',
        occurredAt: '2026-07-16T03:10:00.000Z',
      });
      if (!isCorrect) state.status = 'needs_review';
      return json(
        success({
          sessionId: redoSessionId,
          status: 'graded',
          totalScore: isCorrect ? 1 : 0,
          questionCount: 1,
          correctRate: isCorrect ? 1 : 0,
          overtime: false,
          totalDurationSeconds: 5,
          answers: [
            {
              questionId: redoQuestionId,
              studentAnswer: body.answers[0]?.answer ?? null,
              correctAnswer: 'A',
              isCorrect,
              explanation: '矩阵乘法满足结合律，但一般不满足交换律。',
            },
          ],
        })
      );
    }
    if (request.method() === 'GET' && pathName === '/api/knowledge-modules')
      return json(success({ items: [{ id: moduleId, courseInstanceId: courseId, title: '矩阵基础', contentSummary: '矩阵基本运算', importance: 'high', difficulty: 'medium', learnStatus: 'learning', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z' }], pagination: { page: 1, pageSize: 20, total: 1, hasMore: false } }));
    return json({ success: false, error: { code: 'UNEXPECTED_REQUEST', message: '未预期的测试请求' } }, 500);
  });
});

test('学生可从工作台进入错题本，确认错因、原题重做并标记掌握', async ({ page }) => {
  // 工作台"查漏补缺"入口
  await page.goto(`/exams/${examId}`);
  await expect(page.getByTestId('workbench-mistakes')).toBeVisible();
  await page.getByRole('link', { name: '进入错题本' }).click();

  // 错题列表 + 薄弱点
  await expect(page.getByRole('heading', { name: 'T04B 合成考试 的错题' })).toBeVisible();
  await expect(page.getByTestId('weak-points')).toContainText('矩阵基础');
  await expect(page.getByTestId('weak-points')).toContainText('证据 2 条');
  await expect(page.getByTestId('mistake-list')).toContainText('待复盘');
  await expect(page.getByTestId('mistake-list')).toContainText('矩阵乘法满足哪条性质？');

  // 进入详情：原题事实可见
  await page.getByRole('link', { name: '查看与改错' }).click();
  await expect(page.getByTestId('mistake-question')).toContainText('矩阵乘法满足哪条性质？');
  await expect(page.getByTestId('mistake-question')).toContainText('我的答案');
  await expect(page.getByTestId('mistake-question')).toContainText('正确答案');
  await expect(page.getByTestId('mistake-question')).toContainText('矩阵乘法满足结合律');

  // 确认错因 → 状态进入需要复习
  await page.getByLabel('选择错因').selectOption('concept_unclear');
  await page.getByLabel('补充说明（可选）').fill('矩阵乘法性质没记牢');
  await page.getByRole('button', { name: '确认错因' }).click();
  await expect(page.getByText('错因已确认')).toBeVisible();
  await expect(page.getByTestId('mistake-cause')).toContainText('概念不清');
  await expect(page.locator('.status-badge')).toContainText('需要复习');

  // 第一次重做：答错 → 结果页提示未通过并回链错题详情
  await page.getByRole('button', { name: '原题重做' }).click();
  await expect(page.getByText('矩阵乘法满足哪条性质？')).toBeVisible();
  await page.getByRole('radio', { name: 'B. 交换律' }).check();
  await page.getByRole('button', { name: '提交练习' }).click();
  await expect(page.getByTestId('redo-result-nav')).toContainText('重做未通过');
  await page.getByRole('link', { name: '返回错题详情' }).click();
  await expect(page.getByTestId('mistake-evidence')).toContainText('重做未通过');
  await expect(page.locator('.status-badge')).toContainText('需要复习');

  // 第二次重做：答对 → 掌握证据入库
  await page.getByRole('button', { name: '原题重做' }).click();
  await page.getByRole('radio', { name: 'A. 结合律' }).check();
  await page.getByRole('button', { name: '提交练习' }).click();
  await expect(page.getByTestId('redo-result-nav')).toContainText('重做通过');
  await page.getByRole('link', { name: '返回错题详情' }).click();
  await expect(page.getByTestId('mistake-evidence')).toContainText('重做通过');

  // 有重做通过证据 → 标记已掌握
  await page.getByRole('button', { name: '标记已掌握' }).click();
  await expect(page.getByText('已标记为已掌握')).toBeVisible();
  await expect(page.locator('.status-badge')).toContainText('已掌握');

  // 刷新后状态保持（URL 直达可恢复）
  await page.reload();
  await expect(page.locator('.status-badge')).toContainText('已掌握');
  await expect(page.getByRole('button', { name: '重新打开复习' })).toBeVisible();

  // 返回列表：状态筛选生效
  await page.getByRole('link', { name: '返回错题本' }).click();
  await page.getByLabel('状态筛选').selectOption('needs_review');
  await expect(page.getByText('当前筛选条件下没有错题。')).toBeVisible();
  await page.getByLabel('状态筛选').selectOption('mastered');
  await expect(page.getByTestId('mistake-list')).toContainText('已掌握');
});
