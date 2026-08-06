import fs from 'node:fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { migrateSemesterDb } from '../db/migrations';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';

export type ParentReportType = 'daily' | 'weekly' | 'monthly' | 'exam_reminder';
export type ParentReportStatus = 'ok' | 'insufficient_data';
export type ParentReportSectionKind =
  'study_rhythm' | 'materials' | 'practice' | 'mistakes' | 'exam_reminder' | 'data_quality';

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

export interface ParentReportAiResult {
  content: string;
  provider: string;
  model: string;
  tokenUsed: number;
  latencyMs: number;
}

export interface ParentReportServiceOptions {
  now?: () => string;
  summarizeWithAi?: (payload: {
    reportType: ParentReportType;
    period: ParentReportPeriod;
    sections: ParentReportSection[];
  }) => Promise<ParentReportAiResult>;
}

export class ParentReportError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ParentReportError';
  }
}

type CountRow = Record<string, number | null>;

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const REPORT_TYPES: readonly ParentReportType[] = ['daily', 'weekly', 'monthly', 'exam_reminder'];

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isParentReportType(value: string): value is ParentReportType {
  return REPORT_TYPES.includes(value as ParentReportType);
}

function assertDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ParentReportError('REPORT_PERIOD_INVALID', 400, `${field} 必须是 YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ParentReportError('REPORT_PERIOD_INVALID', 400, `${field} 必须是有效日期`);
  }
  return value;
}

function numberOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function assertNoSensitiveLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (UUID_PATTERN.test(serialized)) {
    throw new ParentReportError('PARENT_REPORT_PRIVACY_VIOLATION', 500, '家长报告脱敏检查失败');
  }
}

export class ParentReportService {
  private readonly now: () => string;
  private readonly summarizeWithAi?: ParentReportServiceOptions['summarizeWithAi'];

  constructor(options?: ParentReportServiceOptions) {
    this.now = options?.now ?? (() => new Date().toISOString());
    this.summarizeWithAi = options?.summarizeWithAi;
  }

  async generateReport(input: GenerateParentReportInput): Promise<ParentReportResult> {
    if (!isParentReportType(input.reportType)) {
      throw new ParentReportError('REPORT_TYPE_INVALID', 400, 'reportType 不支持');
    }

    const period: ParentReportPeriod = {
      startDate: assertDate(input.periodStart, 'periodStart'),
      endDate: assertDate(input.periodEnd, 'periodEnd'),
    };
    if (period.startDate > period.endDate) {
      throw new ParentReportError('REPORT_PERIOD_INVALID', 400, 'periodStart 不得晚于 periodEnd');
    }

    const db = this.openReadySemesterDb(input.semesterId);
    try {
      const sections = this.buildRuleSections(db, input, period, this.now());
      const dataQuality = this.buildDataQualitySection(sections);
      const allSections = [...sections, dataQuality];
      const status: ParentReportStatus = dataQuality.metrics.hasEnoughData === true ? 'ok' : 'insufficient_data';
      const result: ParentReportResult = {
        reportKey: `${input.reportType}:${period.startDate}:${period.endDate}`,
        reportType: input.reportType,
        period,
        generatedAt: this.now(),
        ruleReport: {
          status,
          summary: status === 'ok' ? '已汇总本周期学习事实。' : '暂无足够数据，本报告不编造趋势。',
          sections: allSections,
        },
        aiSummary: await this.buildAiSummary(input, period, allSections),
      };
      assertNoSensitiveLeak(result);
      return result;
    } finally {
      db.close();
    }
  }

  private openReadySemesterDb(semesterId: string): DatabaseType {
    if (!isUuid(semesterId)) {
      throw new ParentReportError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }

    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as
        { ready: number } | undefined;
      if (!row) {
        throw new ParentReportError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      }
      if (row.ready !== 1) {
        throw new ParentReportError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
      }
    } finally {
      globalDb?.close();
    }

    const semesterDbPath = getSemesterDbPath(semesterId);
    if (!fs.existsSync(semesterDbPath)) {
      throw new ParentReportError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    }
    const db = openExistingDbAtPath(semesterDbPath);
    migrateSemesterDb(db);
    return db;
  }

  private buildRuleSections(
    db: DatabaseType,
    input: GenerateParentReportInput,
    period: ParentReportPeriod,
    nowIso: string
  ): ParentReportSection[] {
    return [
      this.buildStudyRhythmSection(db, period, nowIso),
      this.buildMaterialsSection(db),
      this.buildPracticeSection(db, period),
      this.buildMistakesSection(db),
      this.buildExamReminderSection(db, input, period),
    ];
  }

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
      .get(nowIso, period.endDate, period.startDate) as CountRow;
    const eventStats = db
      .prepare(
        `SELECT COUNT(*) AS visibleEvents, COALESCE(SUM(workload_minutes), 0) AS workloadMinutes
         FROM study_events
         WHERE parent_visible = 1
           AND date(occurred_at) BETWEEN date(?) AND date(?)`
      )
      .get(period.startDate, period.endDate) as CountRow;
    const courseStats = db.prepare('SELECT COUNT(*) AS courseInstances FROM course_instances').get() as CountRow;

    const completedTasks = numberOrZero(taskStats.completedTasks);
    const overdueTasks = numberOrZero(taskStats.overdueTasks);
    const visibleEvents = numberOrZero(eventStats.visibleEvents);
    return {
      kind: 'study_rhythm',
      title: '学习节奏',
      summary: `课程 ${numberOrZero(courseStats.courseInstances)} 门，本周期完成 ${completedTasks} 项任务，逾期 ${overdueTasks} 项，可见学习事件 ${visibleEvents} 条。`,
      metrics: {
        courseInstances: numberOrZero(courseStats.courseInstances),
        totalTasks: numberOrZero(taskStats.totalTasks),
        completedTasks,
        overdueTasks,
        estimatedMinutes: numberOrZero(taskStats.estimatedMinutes),
        visibleEvents,
        workloadMinutes: numberOrZero(eventStats.workloadMinutes),
      },
      privacyLevel: 'aggregate_only',
    };
  }

  private buildMaterialsSection(db: DatabaseType): ParentReportSection {
    const materialStats = db
      .prepare(
        `SELECT
           COUNT(*) AS totalMaterials,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedMaterials,
           SUM(CASE WHEN status IN ('conversion_failed') THEN 1 ELSE 0 END) AS errorMaterials,
           SUM(CASE WHEN status IN ('pending', 'converting', 'converted', 'note_generating', 'pending_quality_check') THEN 1 ELSE 0 END) AS processingMaterials
         FROM materials`
      )
      .get() as CountRow;
    const moduleStats = db.prepare('SELECT COUNT(*) AS knowledgeModules FROM knowledge_modules').get() as CountRow;
    const totalMaterials = numberOrZero(materialStats.totalMaterials);
    const knowledgeModules = numberOrZero(moduleStats.knowledgeModules);

    return {
      kind: 'materials',
      title: '资料处理与知识模块',
      summary: `已登记资料 ${totalMaterials} 份，知识模块 ${knowledgeModules} 个。`,
      metrics: {
        totalMaterials,
        completedMaterials: numberOrZero(materialStats.completedMaterials),
        errorMaterials: numberOrZero(materialStats.errorMaterials),
        processingMaterials: numberOrZero(materialStats.processingMaterials),
        knowledgeModules,
      },
      privacyLevel: 'aggregate_only',
    };
  }

  private buildPracticeSection(db: DatabaseType, period: ParentReportPeriod): ParentReportSection {
    const stats = db
      .prepare(
        `SELECT
           COUNT(*) AS gradedSessions,
           COALESCE(AVG(correct_rate), 0) AS averageCorrectRate,
           COALESCE(SUM(question_count), 0) AS gradedQuestions,
           SUM(CASE WHEN overtime = 1 THEN 1 ELSE 0 END) AS overtimeSessions
         FROM practice_sessions
         WHERE status = 'graded'
           AND graded_at IS NOT NULL
           AND date(graded_at) BETWEEN date(?) AND date(?)`
      )
      .get(period.startDate, period.endDate) as CountRow;
    const gradedSessions = numberOrZero(stats.gradedSessions);
    const averageCorrectRate = numberOrZero(stats.averageCorrectRate);

    return {
      kind: 'practice',
      title: '练习表现',
      summary:
        gradedSessions > 0
          ? `本周期完成 ${gradedSessions} 次已批改练习，平均正确率 ${(averageCorrectRate * 100).toFixed(0)}%。`
          : '本周期暂无已批改练习记录。',
      metrics: {
        gradedSessions,
        averageCorrectRate,
        gradedQuestions: numberOrZero(stats.gradedQuestions),
        overtimeSessions: numberOrZero(stats.overtimeSessions),
      },
      privacyLevel: 'aggregate_only',
    };
  }

  private buildMistakesSection(db: DatabaseType): ParentReportSection {
    const stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM mistakes WHERE status != 'mastered') AS openMistakes,
           (SELECT COUNT(*) FROM weak_points WHERE status = 'active') AS activeWeakPoints,
           (SELECT COUNT(*) FROM study_tasks WHERE type = 'error_review' AND status != 'done') AS openErrorReviewTasks,
           (SELECT COUNT(*) FROM study_tasks WHERE type = 'error_review' AND status = 'done') AS completedErrorReviewTasks`
      )
      .get() as CountRow;
    const openMistakes = numberOrZero(stats.openMistakes);
    const activeWeakPoints = numberOrZero(stats.activeWeakPoints);
    const openErrorReviewTasks = numberOrZero(stats.openErrorReviewTasks);

    return {
      kind: 'mistakes',
      title: '错题与薄弱点回流',
      summary: `待处理错题 ${openMistakes} 条，活跃薄弱点 ${activeWeakPoints} 个，查漏补缺任务 ${openErrorReviewTasks} 项。`,
      metrics: {
        openMistakes,
        activeWeakPoints,
        openErrorReviewTasks,
        completedErrorReviewTasks: numberOrZero(stats.completedErrorReviewTasks),
      },
      privacyLevel: 'aggregate_only',
    };
  }

  private buildExamReminderSection(
    db: DatabaseType,
    _input: GenerateParentReportInput,
    period: ParentReportPeriod
  ): ParentReportSection {
    const rows = db
      .prepare(
        `SELECT CAST(julianday(date(exam_at)) - julianday(date(?)) AS INTEGER) AS daysUntil
         FROM assessment_attempts
         WHERE confirmation_status = 'confirmed'
           AND date(exam_at) IN (date(?, '+1 day'), date(?, '+3 day'), date(?, '+7 day'))`
      )
      .all(period.startDate, period.startDate, period.startDate, period.startDate) as Array<{ daysUntil: number }>;
    const oneDayReminders = rows.filter((row) => row.daysUntil === 1).length;
    const threeDayReminders = rows.filter((row) => row.daysUntil === 3).length;
    const sevenDayReminders = rows.filter((row) => row.daysUntil === 7).length;
    const confirmedExamReminders = rows.length;

    return {
      kind: 'exam_reminder',
      title: '考前提醒',
      summary:
        confirmedExamReminders > 0
          ? `已确认考试进入提醒窗口：1 天 ${oneDayReminders} 场，3 天 ${threeDayReminders} 场，7 天 ${sevenDayReminders} 场。`
          : '暂无已确认考试进入正式提醒窗口。',
      metrics: {
        confirmedExamReminders,
        oneDayReminders,
        threeDayReminders,
        sevenDayReminders,
        unconfirmedExamReminders: 0,
      },
      privacyLevel: 'aggregate_only',
    };
  }

  private buildDataQualitySection(sections: readonly ParentReportSection[]): ParentReportSection {
    const evidenceSignals = sections.reduce((total, section) => {
      switch (section.kind) {
        case 'study_rhythm':
          return (
            total +
            numberOrZero(section.metrics.totalTasks as number) +
            numberOrZero(section.metrics.visibleEvents as number)
          );
        case 'materials':
          return (
            total +
            numberOrZero(section.metrics.totalMaterials as number) +
            numberOrZero(section.metrics.knowledgeModules as number)
          );
        case 'practice':
          return total + numberOrZero(section.metrics.gradedSessions as number);
        case 'mistakes':
          return (
            total +
            numberOrZero(section.metrics.openMistakes as number) +
            numberOrZero(section.metrics.activeWeakPoints as number)
          );
        case 'exam_reminder':
          return total + numberOrZero(section.metrics.confirmedExamReminders as number);
        default:
          return total;
      }
    }, 0);
    const hasEnoughData = evidenceSignals > 0;
    return {
      kind: 'data_quality',
      title: '数据质量',
      summary: hasEnoughData ? `已汇总 ${evidenceSignals} 项脱敏事实信号。` : '暂无足够数据。',
      metrics: { hasEnoughData, evidenceSignals },
      privacyLevel: 'aggregate_only',
    };
  }

  private async buildAiSummary(
    input: GenerateParentReportInput,
    period: ParentReportPeriod,
    sections: ParentReportSection[]
  ): Promise<ParentReportAiSummary> {
    if (input.includeAiSummary !== true) {
      return { status: 'not_requested' };
    }
    if (!this.summarizeWithAi) {
      return { status: 'failed', errorSummary: 'AI 摘要失败，已保留规则报告。' };
    }

    try {
      const result = await this.summarizeWithAi({ reportType: input.reportType, period, sections });
      const content = typeof result?.content === 'string' ? result.content.trim() : '';
      if (!content || UUID_PATTERN.test(content)) {
        return { status: 'failed', errorSummary: 'AI 摘要失败，已保留规则报告。' };
      }
      return { status: 'ok', content };
    } catch {
      return { status: 'failed', errorSummary: 'AI 摘要失败，已保留规则报告。' };
    }
  }
}
