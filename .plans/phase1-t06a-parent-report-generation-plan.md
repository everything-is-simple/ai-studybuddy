# Phase 1-T06A S6 家长报告生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 S6 家长观察的报告生成能力：基于既有 S1/S2/S3/S4/T05 事实生成脱敏日报、周报、月报与考前 7/3/1 天提醒，并在 AI 不可用时保留规则报告。

**Architecture:** 新增后端纯服务 `ParentReportService`，只读取现有学期库事实并返回内存 DTO，不新增数据库 Schema、HTTP API、前端页面或推送渠道。规则报告是主路径；AI 只消费脱敏规则报告做摘要/润色，失败时返回规则报告和脱敏错误摘要。T06B 后续再复用该服务做 QQ SMTP / 飞书 Webhook 发送、渠道去重和失败隔离。

**Tech Stack:** TypeScript、Node.js、better-sqlite3、现有 `StudyRhythmService`/学期库迁移、现有 AI Provider Router、`node:test` 后端集成测试、PowerShell 文档治理脚本。

---

## 0. 当前事实与边界

### 已确认前置

- `docs/04-开发任务清单-Todo-List.md` 已登记 T05 回流规则完成，`FeedbackRulesService` 已合入当前 `origin/master` 历史。
- `docs/subsystems/06-S6-家长观察子系统PRD-ParentReport.md` 已创建；当前下一门禁是 T06A。
- 现有后端事实来源：
  - `packages/backend/src/services/study-rhythm-service.ts`：课程、考试、任务、StudyEvent。
  - `packages/backend/src/services/note-builder-service.ts`：资料、转换状态、知识模块、笔记完成事件。
  - `packages/backend/src/services/practice-runner-service.ts`：练习会话、题目、作答和批改结果。
  - `packages/backend/src/services/error-fixer-query-service.ts`：错题、错因确认状态、重做证据、薄弱点查询。
  - `packages/backend/src/services/feedback-rules-service.ts`：T05 `error_review` 任务、知识模块状态和薄弱点状态回流。
- 现有学期库已包含 `report_deliveries` 表，但 T06A 不使用它；`report_deliveries` 属于 T06B 渠道发送/去重。

### 本轮 T06A 实现范围

- 生成四类报告：`daily`、`weekly`、`monthly`、`exam_reminder`。
- 考前提醒只覆盖已确认考试的 7/3/1 天窗口。
- 输出规则报告内容块：学习节奏、资料处理、练习表现、错题回流、考试提醒、数据质量说明。
- AI 只做脱敏摘要/润色；AI 失败、超时、未配置或返回空内容时仍返回规则报告。
- 后端专项测试使用真实 SQLite 和隔离 `APP_DATA_ROOT`，不 mock DB。

### 非目标

- 不实现 T06B：不发送 QQ SMTP、不发飞书 Webhook、不写渠道发送重试、不消费 `report_deliveries`。
- 不新增前端页面、家长账号、家长 Web 面板、远程登录、公网入口、移动端 App 或云同步。
- 不新增数据库 Schema / migration，除非实现中发现无法用现有表满足 T06A；若需要 Schema，必须停止并重新审查计划。
- 不输出资料原文、笔记正文、完整题干、完整答案、学生作答、错因正文、聊天内容、真实渠道地址或完整 UUID。
- 不运行真实 Provider smoke；AI 测试使用注入 fake provider/router。
- 不触碰 S5、S7、Phase 3。

---

## 1. 文件结构

### 创建

- `packages/backend/src/services/parent-report-service.ts`
  - T06A 核心服务。
  - 打开 ready semester DB。
  - 聚合 S1/S2/S3/S4/T05 脱敏统计。
  - 生成规则报告 DTO。
  - 可选调用 AI 摘要/润色。
  - 不写发送渠道，不写 `report_deliveries`。

- `packages/backend/test/parent-report-service.test.mjs`
  - 后端集成测试。
  - 使用隔离 `APP_DATA_ROOT` 和真实 SQLite。
  - 覆盖日报、周报、月报、考前提醒、AI 成功、AI 失败、隐私边界、数据不足和未确认考试。

### 修改

- `docs/04-开发任务清单-Todo-List.md`
  - 实现完成后才勾选 T06A 子项。
  - 本计划创建分支只登记“计划已创建、待用户批准”，不得勾选 T06A 实现项。
  - T06A 实现合入 `master` 并推送后，再补完成证据。

### 默认不修改

- `packages/shared/src/types.ts`
  - T06A 第一版服务 DTO 只在后端内部使用；不新增 shared 类型，除非后续明确需要 HTTP/API/前端消费。
- `packages/backend/src/api/*`
  - T06A 第一版不新增 HTTP API。
  - 如果实现审查认为必须提供 API 入口，应停止并补充计划，因为这会扩大公开接口范围。
- `packages/backend/src/db/sql/*`
  - 不新增 migration。
- `packages/frontend/*`
  - 不新增页面或组件。

---

## 2. DTO 与服务契约

### Task 1: 新增服务类型和规则报告骨架

**Files:**

- Create: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 先写失败测试：能生成空数据日报骨架且不编造趋势**

在 `packages/backend/test/parent-report-service.test.mjs` 新增测试文件，使用现有测试风格：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

process.env.AI_PROVIDERS = '';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t06a-report-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const { SemesterInitializer } = await import('../dist/db/semester-initializer.js');
const { StudyRhythmService } = await import('../dist/services/study-rhythm-service.js');
const { ParentReportService } = await import('../dist/services/parent-report-service.js');

async function createReadySemester() {
  const initializer = new SemesterInitializer();
  return initializer.initializeSemester({
    studentId: crypto.randomUUID(),
    semesterCode: `t06a-${crypto.randomUUID()}`,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-07-10',
  });
}

test('T06A daily report returns rule-first empty-state blocks without inventing trends', async () => {
  const semester = await createReadySemester();
  const report = new ParentReportService({ now: () => '2026-06-01T20:00:00.000Z' }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
  });

  assert.equal(report.reportType, 'daily');
  assert.equal(report.period.startDate, '2026-06-01');
  assert.equal(report.period.endDate, '2026-06-01');
  assert.equal(report.ruleReport.status, 'insufficient_data');
  assert.equal(report.aiSummary.status, 'not_requested');
  assert.match(report.ruleReport.summary, /暂无足够数据/);
  assert.ok(report.ruleReport.sections.some((section) => section.kind === 'data_quality'));
  assert.doesNotMatch(JSON.stringify(report), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
```

- [ ] **Step 2: 构建后端，确认测试因服务不存在而失败**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: build 或测试失败，错误指向 `parent-report-service` 模块不存在。

- [ ] **Step 3: 实现最小服务骨架**

在 `packages/backend/src/services/parent-report-service.ts` 创建：

```ts
import fs from 'node:fs';
import type { Database as DatabaseType } from 'better-sqlite3';
import { openExistingDbAtPath } from '../db/connection';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { migrateSemesterDb } from '../db/migrations';

export type ParentReportType = 'daily' | 'weekly' | 'monthly' | 'exam_reminder';
export type ParentReportStatus = 'ok' | 'insufficient_data';
export type ParentReportSectionKind =
  | 'study_rhythm'
  | 'materials'
  | 'practice'
  | 'mistakes'
  | 'exam_reminder'
  | 'data_quality';

export interface ParentReportPeriod {
  startDate: string;
  endDate: string;
}

export interface ParentReportSection {
  kind: ParentReportSectionKind;
  title: string;
  summary: string;
  metrics: Record<string, number | string | boolean>;
  privacyLevel: 'aggregate_only';
}

export interface RuleParentReport {
  status: ParentReportStatus;
  summary: string;
  sections: ParentReportSection[];
}

export interface ParentReportAiSummary {
  status: 'not_requested' | 'ok' | 'failed';
  content?: string;
  errorSummary?: string;
}

export interface ParentReportResult {
  reportKey: string;
  reportType: ParentReportType;
  period: ParentReportPeriod;
  generatedAt: string;
  ruleReport: RuleParentReport;
  aiSummary: ParentReportAiSummary;
}

export interface GenerateParentReportInput {
  semesterId: string;
  reportType: ParentReportType;
  periodStart: string;
  periodEnd: string;
  includeAiSummary?: boolean;
  assessmentAttemptId?: string;
}

export interface ParentReportServiceOptions {
  now?: () => string;
}

export class ParentReportError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function assertDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ParentReportError('REPORT_PERIOD_INVALID', 400, `${field} 必须是 YYYY-MM-DD`);
  return value;
}

export class ParentReportService {
  private readonly now: () => string;

  constructor(options?: ParentReportServiceOptions) {
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  generateReport(input: GenerateParentReportInput): ParentReportResult {
    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const period = {
        startDate: assertDate(input.periodStart, 'periodStart'),
        endDate: assertDate(input.periodEnd, 'periodEnd'),
      };
      const sections = this.buildRuleSections(db);
      return {
        reportKey: `${input.reportType}:${period.startDate}:${period.endDate}`,
        reportType: input.reportType,
        period,
        generatedAt: this.now(),
        ruleReport: {
          status: 'insufficient_data',
          summary: '暂无足够数据，本报告不编造趋势。',
          sections,
        },
        aiSummary: { status: 'not_requested' },
      };
    } finally {
      db.close();
    }
  }

  private openReadySemesterDb(semesterId: string): DatabaseType {
    if (!isUuid(semesterId)) throw new ParentReportError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as { ready: number } | undefined;
      if (!row || row.ready !== 1) throw new ParentReportError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    } finally {
      globalDb?.close();
    }
    if (!fs.existsSync(getSemesterDbPath(semesterId))) throw new ParentReportError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
    migrateSemesterDb(db);
    return db;
  }

  private buildRuleSections(_db: DatabaseType): ParentReportSection[] {
    return [
      {
        kind: 'data_quality',
        title: '数据质量',
        summary: '暂无足够数据。',
        metrics: { hasEnoughData: false },
        privacyLevel: 'aggregate_only',
      },
    ];
  }
}
```

- [ ] **Step 4: 构建并确认最小测试通过**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: `parent-report-service.test.mjs` 通过。

---

## 3. 规则报告聚合

### Task 2: 聚合 S1 课程、考试、任务和 StudyEvent

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：日报统计任务完成、逾期和 parent-visible 事件**

在测试文件追加：

```js
test('T06A daily report aggregates S1 tasks and parent-visible events without exposing ids', async () => {
  const semester = await createReadySemester();
  const rhythm = new StudyRhythmService();
  const course = rhythm.createCourse({ semesterId: semester.semesterId, name: '数学' });
  const task = rhythm.createStudyTask({
    semesterId: semester.semesterId,
    courseInstanceId: course.id,
    type: 'custom',
    title: '完成函数复习',
    deadlineAt: '2026-06-01T18:00:00.000Z',
    estimatedMinutes: 30,
  });
  rhythm.updateStudyTaskStatus({ semesterId: semester.semesterId, taskId: task.id, status: 'done' });

  const report = new ParentReportService({ now: () => '2026-06-01T20:00:00.000Z' }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
  });

  const rhythmSection = report.ruleReport.sections.find((section) => section.kind === 'study_rhythm');
  assert.equal(rhythmSection.metrics.completedTasks, 1);
  assert.equal(rhythmSection.metrics.overdueTasks, 0);
  assert.match(rhythmSection.summary, /完成 1 项/);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(task.id, 'i'));
  assert.doesNotMatch(JSON.stringify(report), new RegExp(course.id, 'i'));
});
```

- [ ] **Step 2: 实现 S1 聚合 SQL**

在 `ParentReportService` 中新增私有方法：

```ts
private buildStudyRhythmSection(db: DatabaseType, period: ParentReportPeriod, nowIso: string): ParentReportSection {
  const taskStats = db
    .prepare(
      `SELECT
         COUNT(*) AS totalTasks,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completedTasks,
         SUM(CASE WHEN status != 'done' AND deadline_at IS NOT NULL AND deadline_at < ? THEN 1 ELSE 0 END) AS overdueTasks,
         COALESCE(SUM(estimated_minutes), 0) AS estimatedMinutes
       FROM study_tasks
       WHERE date(created_at) <= date(?)
         AND (deadline_at IS NULL OR date(deadline_at) >= date(?))`
    )
    .get(nowIso, period.endDate, period.startDate) as {
    totalTasks: number;
    completedTasks: number | null;
    overdueTasks: number | null;
    estimatedMinutes: number | null;
  };

  const eventStats = db
    .prepare(
      `SELECT COUNT(*) AS visibleEvents, COALESCE(SUM(workload_minutes), 0) AS workloadMinutes
       FROM study_events
       WHERE parent_visible = 1
         AND date(occurred_at) BETWEEN date(?) AND date(?)`
    )
    .get(period.startDate, period.endDate) as { visibleEvents: number; workloadMinutes: number | null };

  const completedTasks = taskStats.completedTasks ?? 0;
  const overdueTasks = taskStats.overdueTasks ?? 0;
  const visibleEvents = eventStats.visibleEvents ?? 0;
  return {
    kind: 'study_rhythm',
    title: '学习节奏',
    summary: `本周期完成 ${completedTasks} 项任务，逾期 ${overdueTasks} 项，可见学习事件 ${visibleEvents} 条。`,
    metrics: {
      totalTasks: taskStats.totalTasks ?? 0,
      completedTasks,
      overdueTasks,
      estimatedMinutes: taskStats.estimatedMinutes ?? 0,
      visibleEvents,
      workloadMinutes: eventStats.workloadMinutes ?? 0,
    },
    privacyLevel: 'aggregate_only',
  };
}
```

并让 `buildRuleSections()` 接收 `period` 与 `nowIso`，把该 section 放入返回数组。

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

### Task 3: 聚合 S2 资料处理状态和知识模块

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：资料状态和知识模块只输出计数与标题摘要**

测试中直接用学期库插入 `materials` 和 `knowledge_modules`，不要插入 `normalized_texts.text` 或 `structured_notes.markdown` 到报告断言中。

Expected assertions:

```js
assert.equal(materialsSection.metrics.completedMaterials, 1);
assert.equal(materialsSection.metrics.errorMaterials, 1);
assert.equal(materialsSection.metrics.knowledgeModules, 2);
assert.doesNotMatch(JSON.stringify(report), /讲义原文|笔记正文/);
```

- [ ] **Step 2: 实现 S2 聚合 SQL**

新增 `buildMaterialsSection(db)`：

```ts
private buildMaterialsSection(db: DatabaseType): ParentReportSection {
  const materialStats = db
    .prepare(
      `SELECT
         COUNT(*) AS totalMaterials,
         SUM(CASE WHEN status = 'completed' OR status = 'done' THEN 1 ELSE 0 END) AS completedMaterials,
         SUM(CASE WHEN status = 'failed' OR status = 'error' THEN 1 ELSE 0 END) AS errorMaterials
       FROM materials`
    )
    .get() as { totalMaterials: number; completedMaterials: number | null; errorMaterials: number | null };
  const moduleStats = db
    .prepare(
      `SELECT
         COUNT(*) AS knowledgeModules,
         SUM(CASE WHEN learn_status IN ('learning', 'in_progress') THEN 1 ELSE 0 END) AS learningModules,
         SUM(CASE WHEN learn_status = 'mastered' THEN 1 ELSE 0 END) AS masteredModules
       FROM knowledge_modules`
    )
    .get() as { knowledgeModules: number; learningModules: number | null; masteredModules: number | null };
  return {
    kind: 'materials',
    title: '资料与知识模块',
    summary: `资料完成 ${materialStats.completedMaterials ?? 0} 份，待处理/异常 ${materialStats.errorMaterials ?? 0} 份，知识模块 ${moduleStats.knowledgeModules ?? 0} 个。`,
    metrics: {
      totalMaterials: materialStats.totalMaterials ?? 0,
      completedMaterials: materialStats.completedMaterials ?? 0,
      errorMaterials: materialStats.errorMaterials ?? 0,
      knowledgeModules: moduleStats.knowledgeModules ?? 0,
      learningModules: moduleStats.learningModules ?? 0,
      masteredModules: moduleStats.masteredModules ?? 0,
    },
    privacyLevel: 'aggregate_only',
  };
}
```

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

### Task 4: 聚合 S3 练习结果，不泄露题干/答案/作答

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：练习正确率和练习次数统计，报告不含题干/答案/学生作答**

测试通过现有 S3 API/Service 或直接 seed `practice_sessions`、`questions`、`practice_answers`。断言：

```js
assert.equal(practiceSection.metrics.practiceSessions, 1);
assert.equal(practiceSection.metrics.answeredQuestions, 3);
assert.equal(practiceSection.metrics.correctAnswers, 2);
assert.equal(practiceSection.metrics.accuracyPercent, 67);
assert.doesNotMatch(JSON.stringify(report), /完整题干|正确答案|学生作答/);
```

- [ ] **Step 2: 实现 S3 聚合 SQL**

新增 `buildPracticeSection(db, period)`，只读取 `practice_sessions` 和 `practice_answers` 的统计字段，不读取 `questions.stem`、`questions.answer` 或学生作答正文：

```ts
private buildPracticeSection(db: DatabaseType, period: ParentReportPeriod): ParentReportSection {
  const stats = db
    .prepare(
      `SELECT
         COUNT(DISTINCT ps.id) AS practiceSessions,
         COUNT(pa.id) AS answeredQuestions,
         SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END) AS correctAnswers
       FROM practice_sessions ps
       LEFT JOIN practice_answers pa ON pa.practice_session_id = ps.id
       WHERE date(ps.created_at) BETWEEN date(?) AND date(?)`
    )
    .get(period.startDate, period.endDate) as { practiceSessions: number; answeredQuestions: number; correctAnswers: number | null };
  const answered = stats.answeredQuestions ?? 0;
  const correct = stats.correctAnswers ?? 0;
  const accuracyPercent = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  return {
    kind: 'practice',
    title: '练习表现',
    summary: answered > 0 ? `完成 ${stats.practiceSessions} 次练习，正确率约 ${accuracyPercent}%。` : '本周期暂无练习记录。',
    metrics: {
      practiceSessions: stats.practiceSessions ?? 0,
      answeredQuestions: answered,
      correctAnswers: correct,
      accuracyPercent,
    },
    privacyLevel: 'aggregate_only',
  };
}
```

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

### Task 5: 聚合 S4 错题/薄弱点和 T05 error_review 任务

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：错题回流只输出计数/状态，不输出错因正文**

断言：

```js
assert.equal(mistakesSection.metrics.openMistakes, 1);
assert.equal(mistakesSection.metrics.activeWeakPoints, 1);
assert.equal(mistakesSection.metrics.openErrorReviewTasks, 1);
assert.doesNotMatch(JSON.stringify(report), /粗心|错因正文|完整解析/);
```

- [ ] **Step 2: 实现 S4/T05 聚合 SQL**

新增 `buildMistakesSection(db)`：

```ts
private buildMistakesSection(db: DatabaseType): ParentReportSection {
  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM mistakes WHERE status != 'mastered') AS openMistakes,
         (SELECT COUNT(*) FROM weak_points WHERE status = 'active') AS activeWeakPoints,
         (SELECT COUNT(*) FROM study_tasks WHERE type = 'error_review' AND status != 'done') AS openErrorReviewTasks`
    )
    .get() as { openMistakes: number; activeWeakPoints: number; openErrorReviewTasks: number };
  return {
    kind: 'mistakes',
    title: '错题与薄弱点回流',
    summary: `待处理错题 ${stats.openMistakes} 条，活跃薄弱点 ${stats.activeWeakPoints} 个，查漏补缺任务 ${stats.openErrorReviewTasks} 项。`,
    metrics: stats,
    privacyLevel: 'aggregate_only',
  };
}
```

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

---

## 4. 考前提醒规则

### Task 6: 已确认考试的 7/3/1 天提醒

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：考试已确认且倒计时 7/3/1 天才生成正式提醒**

测试创建两场考试：一场 `confirmation_status='confirmed'`，一场 `pending`。断言：

```js
assert.equal(report.reportType, 'exam_reminder');
assert.equal(examSection.metrics.confirmedExamReminders, 1);
assert.equal(examSection.metrics.unconfirmedExamReminders, 0);
assert.match(examSection.summary, /7 天/);
assert.doesNotMatch(JSON.stringify(report), /pending-exam-private-name/);
```

- [ ] **Step 2: 实现考试提醒查询**

新增 `buildExamReminderSection(db, input)`：

```ts
private buildExamReminderSection(db: DatabaseType, input: GenerateParentReportInput): ParentReportSection {
  const rows = db
    .prepare(
      `SELECT name, exam_at
       FROM assessment_attempts
       WHERE confirmation_status = 'confirmed'
         AND date(exam_at) IN (date(?, '+1 day'), date(?, '+3 day'), date(?, '+7 day'))
       ORDER BY exam_at ASC`
    )
    .all(input.periodStart, input.periodStart, input.periodStart) as Array<{ name: string; exam_at: string }>;

  return {
    kind: 'exam_reminder',
    title: '考前提醒',
    summary: rows.length > 0 ? `有 ${rows.length} 场已确认考试进入 7/3/1 天提醒窗口。` : '暂无已确认考试进入正式提醒窗口。',
    metrics: {
      confirmedExamReminders: rows.length,
      unconfirmedExamReminders: 0,
    },
    privacyLevel: 'aggregate_only',
  };
}
```

实现时不得输出完整 UUID；考试名称如输出，应使用课程/考试脱敏短标题，且测试要覆盖不泄露完整 ID。

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

---

## 5. AI 摘要/润色和失败兜底

### Task 7: AI 只消费脱敏规则报告，失败时保留规则报告

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：AI 成功时附加摘要**

使用注入 fake AI 函数，不调用真实 Provider：

```js
test('T06A AI summary uses sanitized rule report and appends optional summary', async () => {
  const semester = await createReadySemester();
  const seen = [];
  const report = new ParentReportService({
    now: () => '2026-06-01T20:00:00.000Z',
    summarizeWithAi: async (payload) => {
      seen.push(payload);
      return { content: '今天节奏稳定，建议继续完成查漏补缺任务。', provider: 'fake', model: 'fake-parent-report', tokenUsed: 12, latencyMs: 1 };
    },
  }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
    includeAiSummary: true,
  });

  assert.equal(report.aiSummary.status, 'ok');
  assert.match(report.aiSummary.content, /节奏稳定/);
  assert.equal(seen.length, 1);
  assert.doesNotMatch(JSON.stringify(seen[0]), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
```

- [ ] **Step 2: 写失败测试：AI 抛错时规则报告仍可用**

```js
test('T06A keeps rule report when AI summary fails', async () => {
  const semester = await createReadySemester();
  const report = await new ParentReportService({
    now: () => '2026-06-01T20:00:00.000Z',
    summarizeWithAi: async () => {
      throw new Error('provider timeout with secret details');
    },
  }).generateReport({
    semesterId: semester.semesterId,
    reportType: 'daily',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-01',
    includeAiSummary: true,
  });

  assert.ok(report.ruleReport.sections.length > 0);
  assert.equal(report.aiSummary.status, 'failed');
  assert.match(report.aiSummary.errorSummary, /AI 摘要失败/);
  assert.doesNotMatch(report.aiSummary.errorSummary, /secret details/);
});
```

如果 `generateReport()` 改为 async，应同步调整所有测试 `await service.generateReport(...)`。

- [ ] **Step 3: 实现 AI 注入点**

扩展 options：

```ts
export interface ParentReportAiResult {
  content: string;
  provider: string;
  model: string;
  tokenUsed: number;
  latencyMs: number;
}

export interface ParentReportServiceOptions {
  now?: () => string;
  summarizeWithAi?: (payload: { reportType: ParentReportType; period: ParentReportPeriod; sections: ParentReportSection[] }) => Promise<ParentReportAiResult>;
}
```

将 `generateReport()` 改为 `async generateReport(...)`。如果 `includeAiSummary !== true`，返回 `{ status: 'not_requested' }`。如果 fake/Router 成功，返回 `{ status: 'ok', content }`。如果失败，返回 `{ status: 'failed', errorSummary: 'AI 摘要失败，已保留规则报告。' }`。

- [ ] **Step 4: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

---

## 6. 隐私与脱敏防线

### Task 8: 全报告隐私守卫

**Files:**

- Modify: `packages/backend/src/services/parent-report-service.ts`
- Test: `packages/backend/test/parent-report-service.test.mjs`

- [ ] **Step 1: 写失败测试：报告 JSON 不含敏感正文和完整 UUID**

在测试中 seed 资料原文、笔记 markdown、题干、正确答案、学生作答、错因正文和完整 UUID。统一断言：

```js
const serialized = JSON.stringify(report);
for (const forbidden of ['资料原文', '笔记正文', '完整题干', '正确答案', '学生作答', '错因正文']) {
  assert.doesNotMatch(serialized, new RegExp(forbidden));
}
assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
```

- [ ] **Step 2: 实现最后一道 sanitize 检查**

在服务返回前调用 `assertNoSensitiveLeak(result)`，至少检查完整 UUID；如发现泄漏，抛出 `ParentReportError('PARENT_REPORT_PRIVACY_VIOLATION', 500, '家长报告脱敏检查失败')`。

```ts
function assertNoSensitiveLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) {
    throw new ParentReportError('PARENT_REPORT_PRIVACY_VIOLATION', 500, '家长报告脱敏检查失败');
  }
}
```

不要用正则判断所有中文敏感词作为生产逻辑；中文敏感正文由“不读取正文列 + 测试覆盖”保证，UUID 用生产 guard 防线。

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
pnpm -r --filter backend run build
pnpm --filter @ai-studybuddy/backend exec node --test --test-concurrency=1 test/parent-report-service.test.mjs
```

Expected: T06A 专项测试通过。

---

## 7. 文档同步与验证

### Task 9: 更新 docs/04 完成证据

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`

- [ ] **Step 1: 实现完成后勾选 T06A 子项**

只有在 T06A 代码实现、测试、构建、文档治理和 diff 检查均通过，并且准备合入 `master` 前，才把 T06A 四个子项从 `[ ]` 改为 `[x]`。

- [ ] **Step 2: 补 T06A 完成证据**

在 T06A 小节下追加：

```md
> **T06A 完成证据（2026-07-17）**：已按获批计划在任务分支 `codex/phase1-t06a-parent-report-generation` 实现 `ParentReportService`，基于既有 S1/S2/S3/S4/T05 事实生成脱敏日报、周报、月报和考前 7/3/1 天提醒；规则报告可独立生成，AI 仅对脱敏规则报告做摘要/润色，AI 失败时保留规则报告。未新增数据库 Schema、HTTP API、shared 类型、Worker、前端页面、SMTP、飞书 Webhook 或真实 Provider smoke。验证通过：`pnpm type-check`、`pnpm -r --filter backend run build`、`pnpm test`、`powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1`、`git diff --check`。
```

### Task 10: 必跑验证

**Files:** none

- [ ] **Step 1: 运行代码验证**

Run:

```powershell
pnpm type-check
pnpm -r --filter backend run build
pnpm test
```

Expected:

- TypeScript type-check 通过。
- backend build 通过。
- 全量测试通过；报告后端/前端测试数量以实际输出为准。

- [ ] **Step 2: 运行文档与 diff 验证**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

如果已有暂存，还要运行：

```powershell
git diff --cached --check
```

Expected:

- `Documentation governance check passed.`
- diff 检查无输出。

### Task 11: 提交、合并和推送

**Files:** none

- [ ] **Step 1: 提交任务分支**

Run:

```powershell
git status --short
git add packages/backend/src/services/parent-report-service.ts packages/backend/test/parent-report-service.test.mjs docs/04-开发任务清单-Todo-List.md
git diff --cached --check
git commit -m "feat(phase1): 实现 S6 家长报告生成"
```

- [ ] **Step 2: 按仓库规则快进合并到 master**

Run:

```powershell
git checkout master
git pull --ff-only origin master
git checkout codex/phase1-t06a-parent-report-generation
git rebase master
git checkout master
git merge --ff-only codex/phase1-t06a-parent-report-generation
```

- [ ] **Step 3: 在 master 重新验证并推送**

Run:

```powershell
pnpm type-check
pnpm -r --filter backend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
git push origin master
```

---

## 8. 本计划提交边界

当前计划分支 `codex/phase1-t06a-parent-report-generation-plan` 只允许提交：

- `I:\ai-studybuddy\.plans\phase1-t06a-parent-report-generation-plan.md`
- `I:\ai-studybuddy\docs\04-开发任务清单-Todo-List.md` 的计划证据

本计划分支不得修改：

- `packages/backend/*`
- `packages/frontend/*`
- `packages/shared/*`
- `packages/backend/src/db/sql/*`
- `package.json` / `pnpm-lock.yaml`

本计划获批后，另起实现分支：

```text
codex/phase1-t06a-parent-report-generation
```

建议提交信息：

```text
feat(phase1): 实现 S6 家长报告生成
```

---

## 9. 自审清单

- [x] 覆盖日报、周报、月报和考前 7/3/1 天提醒。
- [x] 覆盖 S1 课程/考试/任务/StudyEvent、S2 资料/知识模块、S3 练习、S4 错题/薄弱点、T05 `error_review` 任务。
- [x] 明确规则报告独立生成，AI 只做脱敏摘要/润色，AI 失败保留规则报告。
- [x] 明确隐私边界：不输出资料原文、笔记正文、完整题干、完整答案、学生作答、错因正文、聊天内容、真实渠道地址或完整 UUID。
- [x] 明确 T06A 不做 QQ SMTP、飞书 Webhook、渠道发送、渠道去重发送测试、家长面板、前端页面、S5、S7 或 Phase 3。
- [x] 明确实现需要代码验证：`pnpm type-check`、backend build、`pnpm test`、文档治理、diff 检查。
- [x] 本计划分支只创建计划和登记 `docs/04` 计划证据，不写业务代码。
