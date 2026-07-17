// ============================================================
// S6 家长报告投递服务（T06B）
// - 只消费 T06A 的脱敏报告；冻结快照后再投递；
// - SMTP 与飞书完全独立，任一失败不阻断另一渠道；
// - 不暴露渠道地址、凭据、外部响应或完整 UUID。
// ============================================================

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { fetch as undiciFetch } from 'undici';
import { getCurrentFeishuConfig, getCurrentSmtpConfig } from '../config/config-registry';
import { openExistingDbAtPath, type DatabaseType } from '../db/connection';
import { migrateSemesterDb } from '../db/migrations';
import { getSemesterDbPath, getSemesterParentReportArchiveDir } from '../db/paths';
import {
  ParentReportService,
  type GenerateParentReportInput,
  type ParentReportResult,
  type ParentReportSection,
  type ParentReportType,
} from './parent-report-service';

export const PARENT_REPORT_TIMEZONE = 'Asia/Shanghai';
export const PARENT_REPORT_CHANNELS = ['smtp', 'feishu'] as const;

export type ParentReportChannel = (typeof PARENT_REPORT_CHANNELS)[number];
export type ParentReportDeliveryStatus =
  | 'sent'
  | 'failed'
  | 'deduplicated'
  | 'skipped_unconfigured'
  | 'deferred'
  | 'in_progress';

export interface FrozenParentReportBlock {
  reportType: ParentReportType;
  period: { startDate: string; endDate: string };
  generatedAt: string;
  ruleReport: {
    status: 'ok' | 'insufficient_data';
    summary: string;
    sections: ParentReportSection[];
  };
  aiSummary?: string;
}

export interface ParentReportSnapshot {
  reportKey: string;
  reportDate: string;
  timezone: typeof PARENT_REPORT_TIMEZONE;
  generatedAt: string;
  reports: FrozenParentReportBlock[];
}

export interface ParentReportChannelPayload {
  channel: ParentReportChannel;
  snapshot: ParentReportSnapshot;
  html?: string;
  card?: Record<string, unknown>;
}

export interface ParentReportChannelAdapter {
  readonly channel: ParentReportChannel;
  isConfigured(): boolean;
  send(payload: ParentReportChannelPayload): Promise<void>;
}

export interface ParentReportGenerator {
  generateReport(input: GenerateParentReportInput): Promise<ParentReportResult>;
}

export interface ParentReportDeliveryServiceOptions {
  now?: () => string;
  reportGenerator?: ParentReportGenerator;
  channels?: readonly ParentReportChannelAdapter[];
}

export interface ParentReportDeliveryResult {
  reportKey: string;
  snapshotCreated: boolean;
  channels: Record<ParentReportChannel, { status: ParentReportDeliveryStatus; errorSummary?: string; nextRetryAt?: string }>;
}

interface DeliveryRow {
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempt_count: number;
  error_summary: string | null;
  next_retry_at: string | null;
  lease_expires_at: string | null;
}

interface ClaimedDelivery {
  shouldSend: boolean;
  status?: ParentReportDeliveryStatus;
  errorSummary?: string;
  nextRetryAt?: string;
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const LEASE_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [5_000, 30_000] as const;
const MAX_AUTOMATIC_ATTEMPTS = 3;

function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('REPORT_DATE_INVALID');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('REPORT_DATE_INVALID');
  return value;
}

function addUtcDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
}

function isMonthEnd(date: string): boolean {
  return addUtcDays(date, 1).slice(0, 7) !== date.slice(0, 7);
}

function reportTypeLabel(type: ParentReportType): string {
  return ({ daily: '日报', weekly: '周报', monthly: '月报', exam_reminder: '考前提醒' } as const)[type];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function safeErrorCode(channel: ParentReportChannel): string {
  return channel === 'smtp' ? 'SMTP_SEND_FAILED' : 'FEISHU_SEND_FAILED';
}

function hasExamReminder(report: ParentReportResult): boolean {
  return report.ruleReport.sections.some((section) => {
    if (section.kind !== 'exam_reminder') return false;
    return Object.entries(section.metrics).some(([key, value]) => key.endsWith('Reminders') && typeof value === 'number' && value > 0);
  });
}

function toFrozenBlock(report: ParentReportResult): FrozenParentReportBlock {
  const block: FrozenParentReportBlock = {
    reportType: report.reportType,
    period: { ...report.period },
    generatedAt: report.generatedAt,
    ruleReport: {
      status: report.ruleReport.status,
      summary: report.ruleReport.summary,
      sections: report.ruleReport.sections.map((section) => ({
        kind: section.kind,
        title: section.title,
        summary: section.summary,
        metrics: { ...section.metrics },
        privacyLevel: 'aggregate_only',
      })),
    },
  };
  if (report.aiSummary.status === 'ok' && report.aiSummary.content) block.aiSummary = report.aiSummary.content;
  return block;
}

function assertSnapshotIsSafe(snapshot: ParentReportSnapshot): void {
  const serialized = JSON.stringify(snapshot);
  if (UUID_PATTERN.test(serialized)) throw new Error('PARENT_REPORT_PRIVACY_VIOLATION');
}

function parseSnapshot(contentJson: string): ParentReportSnapshot {
  const parsed = JSON.parse(contentJson) as ParentReportSnapshot;
  assertSnapshotIsSafe(parsed);
  return parsed;
}

function makeDefaultChannels(): ParentReportChannelAdapter[] {
  return [new SmtpParentReportAdapter(), new FeishuParentReportAdapter()];
}

function getFailureArchivePaths(semesterId: string, snapshot: ParentReportSnapshot): { htmlPath: string; summaryPath: string } {
  const directory = getSemesterParentReportArchiveDir(semesterId);
  const fileStem = `report-${snapshot.reportDate}`;
  return {
    htmlPath: path.join(directory, `${fileStem}.html`),
    summaryPath: path.join(directory, `${fileStem}.delivery.json`),
  };
}

async function writeFileAtomically(targetPath: string, content: string): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, content, 'utf8');
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export class ParentReportDeliveryService {
  private readonly now: () => string;
  private readonly reportGenerator: ParentReportGenerator;
  private readonly channels: Map<ParentReportChannel, ParentReportChannelAdapter>;

  constructor(options?: ParentReportDeliveryServiceOptions) {
    this.now = options?.now ?? (() => new Date().toISOString());
    this.reportGenerator = options?.reportGenerator ?? new ParentReportService();
    const configuredChannels = options?.channels ?? makeDefaultChannels();
    this.channels = new Map(configuredChannels.map((channel) => [channel.channel, channel]));
  }

  async deliver(input: { semesterId: string; reportDate: string }): Promise<ParentReportDeliveryResult> {
    const reportDate = assertDate(input.reportDate);
    const snapshotResult = await this.getOrCreateSnapshot(input.semesterId, reportDate);
    const channels = {} as ParentReportDeliveryResult['channels'];
    for (const channel of PARENT_REPORT_CHANNELS) {
      channels[channel] = await this.deliverChannel(input.semesterId, snapshotResult.snapshot, channel);
    }
    await this.syncFailureArchive(input.semesterId, snapshotResult.snapshot, channels);
    return { reportKey: snapshotResult.snapshot.reportKey, snapshotCreated: snapshotResult.created, channels };
  }

  async retryDue(input: { semesterId: string; reportKey?: string }): Promise<ParentReportDeliveryResult[]> {
    const db = this.openSemesterDb(input.semesterId);
    let snapshots: ParentReportSnapshot[] = [];
    try {
      const now = this.now();
      db.prepare(
        `UPDATE report_deliveries
         SET status = 'failed', error_summary = 'DELIVERY_LEASE_EXPIRED', next_retry_at = ?,
             updated_at = ?, lease_expires_at = NULL
         WHERE status = 'sending' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`
      ).run(now, now, now);
      const rows = db
        .prepare(
          `SELECT DISTINCT p.content_json
           FROM parent_reports p
           JOIN report_deliveries d ON d.report_key = p.report_key
           WHERE d.status = 'failed'
              AND d.attempt_count < ?
              AND (d.next_retry_at IS NULL OR d.next_retry_at <= ?)
              ${input.reportKey ? 'AND p.report_key = ?' : ''}`
        )
        .all(...(input.reportKey ? [MAX_AUTOMATIC_ATTEMPTS, now, input.reportKey] : [MAX_AUTOMATIC_ATTEMPTS, now])) as Array<{ content_json: string }>;
      snapshots = rows.map((row) => parseSnapshot(row.content_json));
    } finally {
      db.close();
    }

    const results: ParentReportDeliveryResult[] = [];
    for (const snapshot of snapshots) {
      const channels = {} as ParentReportDeliveryResult['channels'];
      for (const channel of PARENT_REPORT_CHANNELS) {
        channels[channel] = await this.deliverChannel(input.semesterId, snapshot, channel);
      }
      await this.syncFailureArchive(input.semesterId, snapshot, channels);
      results.push({ reportKey: snapshot.reportKey, snapshotCreated: false, channels });
    }
    return results;
  }

  /**
   * 架构要求的人工出口：仅当 SMTP 与飞书本次都明确失败时，将同一脱敏冻结快照
   * 渲染为本机 HTML，并保存固定失败代码。任一渠道后来成功/已成功去重后立即清理，
   * 避免维护者对已恢复投递的旧留档重复手工发送。
   */
  private async syncFailureArchive(
    semesterId: string,
    snapshot: ParentReportSnapshot,
    channels: ParentReportDeliveryResult['channels']
  ): Promise<void> {
    const { htmlPath, summaryPath } = getFailureArchivePaths(semesterId, snapshot);
    const smtp = channels.smtp;
    const feishu = channels.feishu;
    if (smtp.status === 'failed' && feishu.status === 'failed') {
      assertSnapshotIsSafe(snapshot);
      await fs.mkdir(path.dirname(htmlPath), { recursive: true });
      const contentHash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 16);
      const summary = JSON.stringify(
        {
          reportKey: snapshot.reportKey,
          reportDate: snapshot.reportDate,
          generatedAt: snapshot.generatedAt,
          contentHash,
          channels: {
            smtp: smtp.errorSummary ?? 'SMTP_SEND_FAILED',
            feishu: feishu.errorSummary ?? 'FEISHU_SEND_FAILED',
          },
          manualResend: '渠道凭据恢复后，由本机维护者重新运行一次性家长报告任务。',
        },
        null,
        2
      );
      await writeFileAtomically(htmlPath, renderParentReportHtml(snapshot));
      await writeFileAtomically(summaryPath, summary);
      return;
    }

    if (smtp.status === 'sent' || smtp.status === 'deduplicated' || feishu.status === 'sent' || feishu.status === 'deduplicated') {
      await Promise.all([fs.rm(htmlPath, { force: true }), fs.rm(summaryPath, { force: true })]);
    }
  }
  private async getOrCreateSnapshot(semesterId: string, reportDate: string): Promise<{ snapshot: ParentReportSnapshot; created: boolean }> {
    const reportKey = `report:${reportDate}`;
    const existing = this.readSnapshot(semesterId, reportKey);
    if (existing) return { snapshot: existing, created: false };

    const reports = await this.generateBlocks(semesterId, reportDate);
    const snapshot: ParentReportSnapshot = {
      reportKey,
      reportDate,
      timezone: PARENT_REPORT_TIMEZONE,
      generatedAt: this.now(),
      reports,
    };
    assertSnapshotIsSafe(snapshot);
    const contentJson = JSON.stringify(snapshot);
    const contentHash = crypto.createHash('sha256').update(contentJson).digest('hex').slice(0, 16);
    const db = this.openSemesterDb(semesterId);
    try {
      const created = db.transaction(() => {
        const insert = db
          .prepare(
            `INSERT OR IGNORE INTO parent_reports
             (report_key, report_date, timezone, generated_at, content_json, content_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(reportKey, reportDate, PARENT_REPORT_TIMEZONE, snapshot.generatedAt, contentJson, contentHash, this.now());
        return insert.changes === 1;
      })();
      if (created) return { snapshot, created: true };
      const row = db.prepare('SELECT content_json FROM parent_reports WHERE report_key = ?').get(reportKey) as { content_json: string } | undefined;
      if (!row) throw new Error('PARENT_REPORT_SNAPSHOT_UNAVAILABLE');
      return { snapshot: parseSnapshot(row.content_json), created: false };
    } finally {
      db.close();
    }
  }

  private readSnapshot(semesterId: string, reportKey: string): ParentReportSnapshot | undefined {
    const db = this.openSemesterDb(semesterId);
    try {
      const row = db.prepare('SELECT content_json FROM parent_reports WHERE report_key = ?').get(reportKey) as { content_json: string } | undefined;
      return row ? parseSnapshot(row.content_json) : undefined;
    } finally {
      db.close();
    }
  }

  private async generateBlocks(semesterId: string, reportDate: string): Promise<FrozenParentReportBlock[]> {
    const reportInputs: GenerateParentReportInput[] = [
      { semesterId, reportType: 'daily', periodStart: reportDate, periodEnd: reportDate },
    ];
    if (isSunday(reportDate)) reportInputs.push({ semesterId, reportType: 'weekly', periodStart: addUtcDays(reportDate, -6), periodEnd: reportDate });
    if (isMonthEnd(reportDate)) reportInputs.push({ semesterId, reportType: 'monthly', periodStart: `${reportDate.slice(0, 7)}-01`, periodEnd: reportDate });

    const reports: ParentReportResult[] = [];
    for (const input of reportInputs) reports.push(await this.reportGenerator.generateReport(input));
    const reminder = await this.reportGenerator.generateReport({ semesterId, reportType: 'exam_reminder', periodStart: reportDate, periodEnd: reportDate });
    if (hasExamReminder(reminder)) reports.push(reminder);
    return reports.map(toFrozenBlock);
  }

  private async deliverChannel(semesterId: string, snapshot: ParentReportSnapshot, channel: ParentReportChannel): Promise<{ status: ParentReportDeliveryStatus; errorSummary?: string; nextRetryAt?: string }> {
    const adapter = this.channels.get(channel);
    if (!adapter || !adapter.isConfigured()) return { status: 'skipped_unconfigured' };

    const claim = this.claimDelivery(semesterId, snapshot.reportKey, channel);
    if (!claim.shouldSend) {
      return {
        status: claim.status ?? 'deferred',
        ...(claim.errorSummary ? { errorSummary: claim.errorSummary } : {}),
        ...(claim.nextRetryAt ? { nextRetryAt: claim.nextRetryAt } : {}),
      };
    }
    try {
      const payload: ParentReportChannelPayload = {
        channel,
        snapshot,
        ...(channel === 'smtp' ? { html: renderParentReportHtml(snapshot) } : { card: renderFeishuParentReportCard(snapshot) }),
      };
      await adapter.send(payload);
      this.markSent(semesterId, snapshot.reportKey, channel);
      return { status: 'sent' };
    } catch {
      const errorSummary = safeErrorCode(channel);
      const nextRetryAt = this.markFailed(semesterId, snapshot.reportKey, channel, errorSummary);
      return { status: 'failed', errorSummary, nextRetryAt };
    }
  }

  private claimDelivery(semesterId: string, reportKey: string, channel: ParentReportChannel): ClaimedDelivery {
    const now = this.now();
    const leaseExpiresAt = new Date(Date.parse(now) + LEASE_MS).toISOString();
    const db = this.openSemesterDb(semesterId);
    try {
      return db.transaction((): ClaimedDelivery => {
        const row = db
          .prepare('SELECT status, attempt_count, error_summary, next_retry_at, lease_expires_at FROM report_deliveries WHERE report_key = ? AND channel = ?')
          .get(reportKey, channel) as DeliveryRow | undefined;
        if (row?.status === 'sent') return { shouldSend: false, status: 'deduplicated' };
        if (row?.status === 'sending' && row.lease_expires_at && row.lease_expires_at > now) return { shouldSend: false, status: 'in_progress' };
        if (row?.status === 'failed' && row.attempt_count >= MAX_AUTOMATIC_ATTEMPTS) {
          return { shouldSend: false, status: 'failed', errorSummary: row.error_summary ?? undefined };
        }
        if (row?.status === 'failed' && row.next_retry_at && row.next_retry_at > now) return { shouldSend: false, status: 'deferred', nextRetryAt: row.next_retry_at };

        if (!row) {
          db.prepare(
            `INSERT INTO report_deliveries
             (report_key, channel, status, attempt_count, last_attempt_at, updated_at, lease_expires_at, created_at)
             VALUES (?, ?, 'sending', 1, ?, ?, ?, ?)`
          ).run(reportKey, channel, now, now, leaseExpiresAt, now);
        } else {
          db.prepare(
            `UPDATE report_deliveries
             SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = ?,
                 updated_at = ?, lease_expires_at = ?, next_retry_at = NULL, error_summary = NULL
             WHERE report_key = ? AND channel = ?`
          ).run(now, now, leaseExpiresAt, reportKey, channel);
        }
        return { shouldSend: true };
      })();
    } finally {
      db.close();
    }
  }

  private markSent(semesterId: string, reportKey: string, channel: ParentReportChannel): void {
    const now = this.now();
    const db = this.openSemesterDb(semesterId);
    try {
      db.prepare(
        `UPDATE report_deliveries
         SET status = 'sent', sent_at = ?, updated_at = ?, lease_expires_at = NULL,
             next_retry_at = NULL, error_summary = NULL
         WHERE report_key = ? AND channel = ?`
      ).run(now, now, reportKey, channel);
    } finally {
      db.close();
    }
  }

  private markFailed(semesterId: string, reportKey: string, channel: ParentReportChannel, errorSummary: string): string | undefined {
    const now = this.now();
    const db = this.openSemesterDb(semesterId);
    try {
      const row = db.prepare('SELECT attempt_count FROM report_deliveries WHERE report_key = ? AND channel = ?').get(reportKey, channel) as { attempt_count: number } | undefined;
      const attemptCount = row?.attempt_count ?? 1;
      const delay = RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
      const nextRetryAt = attemptCount < MAX_AUTOMATIC_ATTEMPTS ? new Date(Date.parse(now) + delay).toISOString() : null;
      db.prepare(
        `UPDATE report_deliveries
         SET status = 'failed', error_summary = ?, next_retry_at = ?, updated_at = ?, lease_expires_at = NULL
         WHERE report_key = ? AND channel = ?`
       ).run(errorSummary, nextRetryAt, now, reportKey, channel);
       return nextRetryAt ?? undefined;
    } finally {
      db.close();
    }
  }

  private openSemesterDb(semesterId: string): DatabaseType {
    const db = openExistingDbAtPath(getSemesterDbPath(semesterId));
    migrateSemesterDb(db);
    return db;
  }
}

export class SmtpParentReportAdapter implements ParentReportChannelAdapter {
  readonly channel = 'smtp' as const;

  isConfigured(): boolean {
    return getCurrentSmtpConfig() !== null;
  }

  async send(payload: ParentReportChannelPayload): Promise<void> {
    if (!this.isConfigured() || !payload.html) throw new Error('SMTP_UNCONFIGURED');
    const smtp = getCurrentSmtpConfig();
    if (!smtp) throw new Error('SMTP_UNCONFIGURED');
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.authCode },
    });
    await transport.sendMail({
      from: smtp.user,
      to: smtp.to,
      subject: `学习日报 ${payload.snapshot.reportDate}`,
      html: payload.html,
    });
  }
}

export class FeishuParentReportAdapter implements ParentReportChannelAdapter {
  readonly channel = 'feishu' as const;

  constructor(private readonly request: typeof fetch = undiciFetch as unknown as typeof fetch) {}

  isConfigured(): boolean {
    return getCurrentFeishuConfig() !== null;
  }

  async send(payload: ParentReportChannelPayload): Promise<void> {
    if (!this.isConfigured() || !payload.card) throw new Error('FEISHU_UNCONFIGURED');
    const feishu = getCurrentFeishuConfig();
    if (!feishu) throw new Error('FEISHU_UNCONFIGURED');
    const response = await this.request(feishu.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload.card),
    });
    if (!response.ok) throw new Error('FEISHU_HTTP_FAILED');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('FEISHU_RESPONSE_INVALID');
    }
    if (!body || typeof body !== 'object') throw new Error('FEISHU_RESPONSE_INVALID');
    const code = (body as { code?: unknown; StatusCode?: unknown }).code ?? (body as { StatusCode?: unknown }).StatusCode;
    if (code !== 0) throw new Error('FEISHU_BUSINESS_FAILED');
  }
}

export function renderParentReportHtml(snapshot: ParentReportSnapshot): string {
  const blocks = snapshot.reports
    .map((report) => {
      const sections = report.ruleReport.sections
        .map((section) => {
          const metrics = Object.entries(section.metrics)
            .map(([key, value]) => `<li>${escapeHtml(key)}：${escapeHtml(String(value))}</li>`)
            .join('');
          return `<section><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.summary)}</p><ul>${metrics}</ul></section>`;
        })
        .join('');
      const ai = report.aiSummary ? `<p><strong>补充摘要：</strong>${escapeHtml(report.aiSummary)}</p>` : '';
      return `<section><h2>${reportTypeLabel(report.reportType)}</h2><p>${escapeHtml(report.ruleReport.summary)}</p>${sections}${ai}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>学习日报</title></head><body><h1>学习日报</h1><p>报告日期：${escapeHtml(snapshot.reportDate)}</p>${blocks}</body></html>`;
}

export function renderFeishuParentReportCard(snapshot: ParentReportSnapshot): Record<string, unknown> {
  const elements = snapshot.reports.flatMap((report) => [
    { tag: 'markdown', content: `**${reportTypeLabel(report.reportType)}**\n${report.ruleReport.summary}` },
    ...report.ruleReport.sections.map((section) => ({ tag: 'markdown', content: `**${section.title}**\n${section.summary}` })),
  ]);
  return {
    msg_type: 'interactive',
    card: {
      header: { title: { tag: 'plain_text', content: '学习日报' } },
      elements,
    },
  };
}
