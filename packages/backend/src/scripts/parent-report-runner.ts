// ============================================================
// T06B 一次性家长报告 runner
// 由 Windows Task Scheduler 在本地 22:30 与登录补发时启动；
// 每次最多等待 5 秒、30 秒重试失败渠道，不提供 HTTP API 或常驻循环。
// ============================================================

import { openGlobalDb } from '../db/connection';
import { initializeRuntimeConfiguration } from '../config/runtime-configuration';
import {
  ParentReportDeliveryService,
  type ParentReportDeliveryResult,
} from '../services/parent-report-delivery-service';

export interface ParentReportDeliveryPort {
  retryDue(input: { semesterId: string }): Promise<ParentReportDeliveryResult[]>;
  deliver(input: { semesterId: string; reportDate: string }): Promise<ParentReportDeliveryResult>;
}

export interface ParentReportDeliveryRunnerOptions {
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  deliveryService?: ParentReportDeliveryPort;
}

export interface ParentReportRunnerResult {
  status: 'delivered' | 'no_active_semester' | 'ambiguous_active_semester';
  reportDate?: string;
}

interface ShanghaiClock {
  reportDate: string;
  hour: number;
  minute: number;
}

function getShanghaiClock(now: Date): ShanghaiClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day) || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('PARENT_REPORT_CLOCK_INVALID');
  }
  return { reportDate: `${year}-${month}-${day}`, hour, minute };
}

function isAtOrAfterSchedule(clock: ShanghaiClock): boolean {
  return clock.hour > 22 || (clock.hour === 22 && clock.minute >= 30);
}

function getPreviousShanghaiReportDate(now: Date): string {
  // 上海不使用夏令时；向前 24 小时后再按目标时区取日期，可稳定得到最近错过周期。
  return getShanghaiClock(new Date(now.getTime() - 24 * 60 * 60 * 1000)).reportDate;
}

function getEarliestRetryAt(results: readonly ParentReportDeliveryResult[]): string | undefined {
  const candidates = results
    .flatMap((result) => Object.values(result.channels))
    .filter((channel) => channel.status === 'failed' && typeof channel.nextRetryAt === 'string')
    .map((channel) => channel.nextRetryAt as string)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort();
  return candidates[0];
}

export class ParentReportDeliveryRunner {
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly deliveryService: ParentReportDeliveryPort;

  constructor(options?: ParentReportDeliveryRunnerOptions) {
    this.now = options?.now ?? (() => new Date());
    this.sleep = options?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.deliveryService = options?.deliveryService ?? new ParentReportDeliveryService();
  }

  async run(input?: { semesterId?: string }): Promise<ParentReportRunnerResult> {
    let semesterId = input?.semesterId;
    if (semesterId) {
      await this.retryFailedWithinRun(semesterId, await this.deliveryService.retryDue({ semesterId }));
    } else {
      for (const readySemesterId of this.findReadySemesters()) {
        await this.retryFailedWithinRun(readySemesterId, await this.deliveryService.retryDue({ semesterId: readySemesterId }));
      }
      const activeSemesters = this.findActiveSemesters();
      if (activeSemesters.length === 0) return { status: 'no_active_semester' };
      if (activeSemesters.length > 1) return { status: 'ambiguous_active_semester' };
      semesterId = activeSemesters[0];
    }

    const now = this.now();
    const clock = getShanghaiClock(now);
    // 每日 22:30 后生成当日批次；错过时段的登录/StartWhenAvailable 只补最近一个日期，
    // 不批量补发陈旧日期。已冻结或已发送批次会由服务层幂等复用/去重。
    const reportDate = isAtOrAfterSchedule(clock) ? clock.reportDate : getPreviousShanghaiReportDate(now);
    const result = await this.deliveryService.deliver({ semesterId, reportDate });
    await this.retryFailedWithinRun(semesterId, [result]);
    return { status: 'delivered', reportDate };
  }

  private async retryFailedWithinRun(semesterId: string, initialResults: ParentReportDeliveryResult[]): Promise<void> {
    let results = initialResults;
    // 首次失败后仅保留两个短生命周期等待窗口（5 秒、30 秒），总尝试不超过三次；
    // 重启后的失败仍由下次 runner 的 retryDue 继续消费同一冻结快照。
    for (let retryIndex = 0; retryIndex < 2; retryIndex += 1) {
      const retryAt = getEarliestRetryAt(results);
      if (!retryAt) return;
      const waitMs = Math.max(0, Date.parse(retryAt) - this.now().getTime());
      await this.sleep(waitMs);
      results = await this.deliveryService.retryDue({ semesterId });
    }
  }

  private findReadySemesters(): string[] {
    const db = openGlobalDb();
    try {
      return db
        .prepare("SELECT id FROM semesters WHERE ready = 1 ORDER BY created_at ASC")
        .all()
        .map((row) => (row as { id: string }).id);
    } finally {
      db.close();
    }
  }

  private findActiveSemesters(): string[] {
    const db = openGlobalDb();
    try {
      return db
        .prepare("SELECT id FROM semesters WHERE status = 'active' AND ready = 1 ORDER BY created_at ASC LIMIT 2")
        .all()
        .map((row) => (row as { id: string }).id);
    } finally {
      db.close();
    }
  }
}

async function main(): Promise<void> {
  await initializeRuntimeConfiguration();
  const result = await new ParentReportDeliveryRunner().run();
  // 只输出状态和日期，避免日志出现学期 ID、渠道地址或外部响应。
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('PARENT_REPORT_RUNNER_FAILED\n');
    process.exitCode = 1;
  });
}
