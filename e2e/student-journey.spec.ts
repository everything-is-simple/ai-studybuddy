import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { initSemesterDb } from '../packages/backend/src/db/migrations';

const backendBaseUrl = 'http://127.0.0.1:4311/api';
const timetableFixture = path.resolve('e2e/fixtures/synthetic-timetable.png');
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

async function browserJourneyDates(page: Page) {
  return page.evaluate(() => {
    const pad = (value: number) => String(value).padStart(2, '0');
    const localDate = (offsetDays: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    const localDateTime = (offsetDays: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      date.setHours(9, 0, 0, 0);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    return {
      semesterStart: localDate(-7),
      semesterEnd: localDate(180),
      examDateTime: localDateTime(30),
      eventNow: new Date().toISOString(),
    };
  });
}

type ApiPage<T> = { items: T[]; pagination: { total: number } };
type CurrentSemester = { semester: { id: string; semesterCode: string } | null };
type Course = { id: string; name: string };
type Exam = { id: string; name: string; courseInstanceId: string };

type SeededJourneyData = {
  noteId: string;
  sessionId: string;
};

async function getData<T>(request: APIRequestContext, pathName: string): Promise<T> {
  const response = await request.get(`${backendBaseUrl}${pathName}`);
  expect(response.ok(), `${pathName}: ${await response.text()}`).toBe(true);
  const body = (await response.json()) as { success: boolean; data: T };
  expect(body.success).toBe(true);
  return body.data;
}

async function createSemesterWithTimetable(
  page: Page,
  options: { code: string; studentName?: string; firstCourseName: string }
) {
  await page.goto('/semesters');
  if (options.studentName) {
    await page.getByLabel('学生姓名').fill(options.studentName);
  }
  await page.getByLabel('学期名称').fill(options.code);
  const dates = await browserJourneyDates(page);
  await page.getByLabel('开始日期').fill(dates.semesterStart);
  await page.getByLabel('结束日期').fill(dates.semesterEnd);
  await page.getByLabel('课程表图片').setInputFiles(timetableFixture);
  await page.getByRole('button', { name: '预览课程表' }).click();
  await expect(page.getByRole('heading', { name: '确认课程表预览', level: 2 })).toBeVisible();
  const firstPreviewRow = page.locator('.timetable-preview-row').first();
  await firstPreviewRow.getByLabel('课程').fill(options.firstCourseName);
  await page.getByRole('button', { name: '确认创建并切换' }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByLabel('课程列表').getByText(options.firstCourseName, { exact: true })).toBeVisible();
}

async function currentSemester(request: APIRequestContext) {
  const current = await getData<CurrentSemester>(request, '/semesters/current');
  expect(current.semester).toBeTruthy();
  return current.semester!;
}

async function listCourses(request: APIRequestContext, semesterId: string) {
  return getData<Course[]>(request, `/courses?semesterId=${encodeURIComponent(semesterId)}`);
}

function resetAppDataForEmptyJourney() {
  const appDataRoot = process.env.APP_DATA_ROOT;
  if (!appDataRoot) throw new Error('APP_DATA_ROOT is required');
  const resolved = path.resolve(appDataRoot);
  if (!resolved.includes(`${path.sep}ai-studybuddy-tmp${path.sep}runs${path.sep}`)) {
    throw new Error(`Refuse to reset non-isolated APP_DATA_ROOT: ${resolved}`);
  }
  for (const relativePath of [
    'studybuddy.db',
    'studybuddy.db-wal',
    'studybuddy.db-shm',
    'semesters',
    'tmp',
    'config',
  ]) {
    fs.rmSync(path.join(resolved, relativePath), { recursive: true, force: true });
  }
}

async function createAndConfirmExam(page: Page, request: APIRequestContext, semesterId: string, courseName: string) {
  await page.goto('/courses');
  const courseItem = page.locator('.course-item').filter({ hasText: courseName });
  await courseItem.getByPlaceholder('考试名称').fill('T09D 学生旅程期末考试');
  await courseItem.getByPlaceholder('考试目标（可选）').fill('完成资料、笔记、练习、错题与时间线闭环');
  const dates = await browserJourneyDates(page);
  await courseItem.locator('input[type="datetime-local"]').first().fill(dates.examDateTime);
  await courseItem.getByRole('button', { name: '添加考试' }).click();
  await expect(page.getByRole('main').getByText('考试目标已创建，下一步请确认考试日期')).toBeVisible();
  await courseItem.getByRole('button', { name: '确认考试日期' }).click();
  await expect(courseItem.getByText('状态：已确认')).toBeVisible();

  const courses = await listCourses(request, semesterId);
  const course = courses.find((item) => item.name === courseName);
  expect(course, `missing course ${courseName}`).toBeTruthy();
  const exams = await getData<Exam[]>(
    request,
    `/exams?semesterId=${encodeURIComponent(semesterId)}&courseInstanceId=${encodeURIComponent(course!.id)}`
  );
  const exam = exams.find((item) => item.name === 'T09D 学生旅程期末考试');
  expect(exam).toBeTruthy();
  return { course: course!, exam: exam! };
}

function seedJourneyData(semesterId: string, courseId: string, examId: string, now: string): SeededJourneyData {
  const db = initSemesterDb(semesterId);
  const materialId = randomUUID();
  const moduleId = randomUUID();
  const noteId = randomUUID();
  const mindMapId = randomUUID();
  const sessionId = randomUUID();
  const questionId = randomUUID();
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO materials (
          id, course_instance_id, file_type, storage_key, status,
          original_filename, title, file_size_bytes, created_at, updated_at
        ) VALUES (?, ?, 'txt', ?, 'completed', ?, ?, ?, ?, ?)`
      ).run(
        materialId,
        courseId,
        `semesters/${semesterId}/files/${courseId}/${materialId}.txt`,
        't09d-synthetic-material.txt',
        'T09D 合成学习资料',
        128,
        now,
        now
      );
      db.prepare(
        `INSERT INTO knowledge_modules (
          id, course_instance_id, material_id, title, importance, difficulty,
          source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at
        ) VALUES (?, ?, ?, 'T09D 矩阵基础', 'high', 'medium', '矩阵乘法规则', 'learning', '矩阵基础运算', '旅程考试重点', ?, ?)`
      ).run(moduleId, courseId, materialId, now, now);
      db.prepare(
        `INSERT INTO structured_notes (
          id, material_id, knowledge_module_id, markdown, highlights_json, model,
          prompt_version, token_count, generation_duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 't09d-test-model', 's2-note-v1.0', 120, 30, ?, ?)`
      ).run(
        noteId,
        materialId,
        moduleId,
        '# T09D 合成笔记\n\n## 矩阵基础\n- 旅程测试资料已经生成笔记。',
        JSON.stringify([{ content: '旅程测试资料已经生成笔记', importance: 'high', position: 'p1' }]),
        now,
        now
      );
      db.prepare('INSERT INTO mind_maps (id, note_id, format, data, created_at) VALUES (?, ?, ?, ?, ?)').run(
        mindMapId,
        noteId,
        'markmap',
        '# T09D 合成笔记\n## 矩阵基础',
        now
      );
      db.prepare(
        `INSERT INTO study_events (
          id, course_instance_id, task_id, source_system, event_type, title,
          workload_minutes, evidence_ref, source_confidence, quality_gate, parent_visible, occurred_at, created_at
        ) VALUES (?, ?, NULL, 'S2', 'material_note_completed', '资料笔记已生成', 12, ?, 1, 'passed', 1, ?, ?)`
      ).run(randomUUID(), courseId, `material:${materialId}`, now, now);
      db.prepare(
        `INSERT INTO practice_sessions (
          id, course_instance_id, assessment_attempt_id, status, question_count, time_limit_seconds,
          started_at, difficulty_preference, created_at, updated_at
        ) VALUES (?, ?, ?, 'in_progress', 1, 600, ?, 'mixed', ?, ?)`
      ).run(sessionId, courseId, examId, now, now, now);
      db.prepare(
        `INSERT INTO questions (
          id, practice_session_id, course_instance_id, knowledge_module_id, type,
          stem, options_json, correct_answer, acceptable_answers_json, difficulty,
          explanation, source_evidence, ai_model, prompt_version, question_order, created_at
        ) VALUES (?, ?, ?, ?, 'single_choice', ?, ?, 'A', NULL, 'easy', ?, '矩阵乘法规则', 't09d-test-model', 's3-practice-v1.0', 1, ?)`
      ).run(
        questionId,
        sessionId,
        courseId,
        moduleId,
        'T09D 旅程练习题：哪一个选项是正确答案？',
        JSON.stringify(['A. 正确选项', 'B. 错误选项']),
        '选择 A 才正确，本测试故意选择 B 以进入错题本。',
        now
      );
    })();
  } finally {
    db.close();
  }
  return { noteId, sessionId };
}

test('T09D 学生从空系统完成创建学期、课程考试、资料笔记、练习错题、时间线与学期切换隔离', async ({ page, request }) => {
  resetAppDataForEmptyJourney();

  await page.goto('/courses');
  await expect(page).toHaveURL(/\/semesters$/);
  await expect(page.getByText('还没有可用学期。请先创建第一个学期，之后系统会自动恢复当前学期。')).toBeVisible();

  await createSemesterWithTimetable(page, {
    code: `T09D A 学期 ${Date.now()}`,
    studentName: 'T09D 学生旅程验收',
    firstCourseName: 'T09D A 数学',
  });
  const semesterA = await currentSemester(request);
  const { course: courseA, exam } = await createAndConfirmExam(page, request, semesterA.id, 'T09D A 数学');
  const journeyDates = await browserJourneyDates(page);
  const seeded = seedJourneyData(semesterA.id, courseA.id, exam.id, journeyDates.eventNow);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每日学习首页', level: 1 })).toBeVisible();
  await expect(page.getByText('T09D 学生旅程期末考试', { exact: true })).toBeVisible();
  await expect(page.getByTestId('global-navigation').getByRole('link', { name: '今日' })).toHaveAttribute(
    'aria-current',
    'page'
  );

  await page.goto(`/exams/${exam.id}`);
  await expect(page.getByRole('heading', { name: 'T09D 学生旅程期末考试', level: 1 })).toBeVisible();
  await expect(page.getByTestId('exam-context-navigation').getByRole('link', { name: '总览' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByTestId('recent-study-activity')).toContainText('资料笔记已生成');

  await page.getByTestId('exam-context-navigation').getByRole('link', { name: '资料' }).click();
  await expect(page).toHaveURL(new RegExp(`/materials\\?courseInstanceId=${courseA.id}`));
  await expect(page.getByRole('heading', { name: '资料上传', level: 1 })).toBeVisible();
  await expect(page.getByLabel('选择课程')).toHaveValue(courseA.id);
  await expect(page.getByText('T09D 合成学习资料', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '查看笔记' }).click();
  await expect(page).toHaveURL(`/notes/${seeded.noteId}`);
  await expect(page.getByRole('heading', { name: '笔记', level: 1 })).toBeVisible();
  await expect(page.getByText('旅程测试资料已经生成笔记。', { exact: true })).toBeVisible();
  await expect(page.getByText('T09D 矩阵基础', { exact: true })).toBeVisible();

  await page.goto(`/practice-sessions/${seeded.sessionId}`);
  await expect(page.getByRole('heading', { name: '第 1 / 1 题', level: 1 })).toBeVisible();
  await expect(page.getByText('T09D 旅程练习题')).toBeVisible();
  await page.getByRole('radio', { name: 'B. 错误选项' }).check();
  await page.getByRole('button', { name: '提交练习' }).click();
  await expect(page.getByText('练习结果', { exact: true })).toBeVisible();
  await expect(page.getByText('0 / 1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('exam-context-navigation').getByRole('link', { name: '练习' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await page.getByTestId('exam-context-navigation').getByRole('link', { name: '时间线' }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${exam.id}#recent-study-activity$`));
  await expect(page.getByTestId('recent-study-activity')).toContainText('资料笔记已生成');
  await page.goto(`/practice-sessions/${seeded.sessionId}/result`);
  await expect(page.getByTestId('exam-context-navigation').getByRole('link', { name: '练习' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await page.getByRole('link', { name: '打开错题本' }).click();
  await expect(page.getByRole('heading', { name: 'T09D 学生旅程期末考试 的错题', level: 1 })).toBeVisible();
  await expect(page.getByText('T09D 旅程练习题')).toBeVisible();
  await page.getByRole('link', { name: '查看与改错' }).click();
  await expect(page.getByRole('heading', { name: '错题详情', level: 1 })).toBeVisible();
  await page.getByLabel('选择错因').selectOption('concept_unclear');
  await page.getByLabel('补充说明（可选）').fill('T09D 学生旅程错因确认');
  await page.getByRole('button', { name: '确认错因' }).click();
  await expect(page.getByText('错因已确认')).toBeVisible();

  await page.goto(`/exams/${exam.id}`);
  await expect(page.getByTestId('recent-study-activity')).toContainText('限时练习已完成');
  await expect(page.getByTestId('recent-study-activity')).toContainText('资料笔记已生成');
  await expect(page.locator('body')).not.toContainText(uuidPattern);

  await createSemesterWithTimetable(page, {
    code: `T09D B 学期 ${Date.now()}`,
    firstCourseName: 'T09D B 英语',
  });
  const semesterB = await currentSemester(request);
  expect(semesterB.id).not.toBe(semesterA.id);
  await expect(page.getByLabel('课程列表').getByText('T09D B 英语', { exact: true })).toBeVisible();
  await expect(page.getByText('T09D A 数学', { exact: true })).toHaveCount(0);
  await expect(page.getByText('T09D 学生旅程期末考试', { exact: true })).toHaveCount(0);
  await page.getByTestId('global-navigation').getByRole('link', { name: '资料' }).click();
  await expect(page.getByText('T09D 合成学习资料', { exact: true })).toHaveCount(0);
});
