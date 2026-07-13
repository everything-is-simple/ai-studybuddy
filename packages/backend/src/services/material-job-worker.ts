import crypto from "crypto";
import fs from "fs";
import { Readable } from "stream";
import type { DatabaseType } from "../db/connection";
import { StorageAdapter, dispatchConverter, AiProviderRouter } from "../adapters";
import type { AiProvider } from "../adapters";
import { NoteBuilderService } from "./note-builder-service";

interface JobRow { id: string; job_type: "material_convert" | "note_generate"; payload_json: string; attempts: number; material_id: string; }
interface AiNotePayload { markdown: string; highlights: Array<{ content: string; importance: "low" | "medium" | "high"; position: string }>; mindMap: { title?: string; children?: unknown[] } | string; knowledgeModules: Array<{ title: string; contentSummary?: string; importance: "low" | "medium" | "high" | "critical"; difficulty: "easy" | "medium" | "hard"; sourceEvidence: string; examRelevance?: string }>; }

function now(): string { return new Date().toISOString(); }
function id(): string { return crypto.randomUUID(); }
async function streamBuffer(stream: Readable): Promise<Buffer> { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return Buffer.concat(chunks); }

export class MaterialJobWorker {
  constructor(private readonly service = new NoteBuilderService(), private readonly storage = new StorageAdapter(), private readonly ai: AiProvider = new AiProviderRouter()) {}

  async runOnce(): Promise<boolean> {
    const semesterIds = this.listReadySemesterIds();
    for (const semesterId of semesterIds) {
      const db = this.service.openReadySemesterDb(semesterId);
      try {
        this.recoverStale(db);
        const job = this.claim(db);
        if (!job) continue;
        if (job.job_type === "material_convert") await this.convert(db, semesterId, job);
        else await this.generate(db, semesterId, job);
        return true;
      } finally { db.close(); }
    }
    return false;
  }

  startPolling(intervalMs = 2000): NodeJS.Timeout { return setInterval(() => { void this.runOnce().catch(() => undefined); }, intervalMs); }
  stopPolling(timer: NodeJS.Timeout): void { clearInterval(timer); }

  private listReadySemesterIds(): string[] {
    const { openExistingDbAtPath } = require("../db/connection") as typeof import("../db/connection");
    const { getGlobalDbPath } = require("../db/paths") as typeof import("../db/paths");
    const globalDbPath = getGlobalDbPath();
    if (!fs.existsSync(globalDbPath)) return [];
    const global = openExistingDbAtPath(globalDbPath);
    try { return (global.prepare("SELECT id FROM semesters WHERE ready = 1 ORDER BY created_at").all() as Array<{ id: string }>).map((row) => row.id); } finally { global.close(); }
  }

  private recoverStale(db: DatabaseType): void {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare("UPDATE jobs SET status = 'pending', started_at = NULL, available_at = ? WHERE status = 'running' AND started_at < ?").run(now(), staleBefore);
  }

  private claim(db: DatabaseType): JobRow | undefined {
    const candidate = db.prepare("SELECT id FROM jobs WHERE status = 'pending' AND available_at <= ? AND job_type IN ('material_convert', 'note_generate') ORDER BY created_at LIMIT 1").get(now()) as { id: string } | undefined;
    if (!candidate) return undefined;
    const updated = db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, started_at = ? WHERE id = ? AND status = 'pending'").run(now(), candidate.id);
    if (updated.changes !== 1) return undefined;
    return db.prepare("SELECT id, job_type, payload_json, attempts, material_id FROM jobs WHERE id = ?").get(candidate.id) as JobRow;
  }

  private finish(db: DatabaseType, jobId: string): void { db.prepare("UPDATE jobs SET status = 'completed', completed_at = ? WHERE id = ?").run(now(), jobId); }
  private retryOrFail(db: DatabaseType, job: JobRow, materialStatus: "pending" | "converted", terminalStatus: "conversion_failed" | "pending_quality_check", field: "conversion_error_message" | "ai_generation_error_message", error: unknown): void {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    if (job.attempts < 3) {
      db.transaction(() => { db.prepare("UPDATE jobs SET status = 'pending', available_at = ?, started_at = NULL, error_summary = ? WHERE id = ?").run(new Date(Date.now() + 5000).toISOString(), message, job.id); db.prepare(`UPDATE materials SET status = ?, ${field} = ?, updated_at = ? WHERE id = ?`).run(materialStatus, message, now(), job.material_id); })();
    } else {
      db.transaction(() => { db.prepare("UPDATE jobs SET status = 'failed', completed_at = ?, error_summary = ? WHERE id = ?").run(now(), message, job.id); db.prepare(`UPDATE materials SET status = ?, ${field} = ?, updated_at = ? WHERE id = ?`).run(terminalStatus, message, now(), job.material_id); })();
    }
  }

  private async convert(db: DatabaseType, semesterId: string, job: JobRow): Promise<void> {
    try {
      const material = db.prepare("SELECT storage_key, original_filename FROM materials WHERE id = ?").get(job.material_id) as { storage_key: string; original_filename: string } | undefined;
      if (!material) throw new Error("资料不存在");
      db.prepare("UPDATE materials SET status = 'converting', updated_at = ? WHERE id = ?").run(now(), job.material_id);
      const file = await this.storage.get(material.storage_key); const result = await dispatchConverter({ buffer: await streamBuffer(file.stream), filename: material.original_filename });
      if (!result.ok || !result.text?.trim()) throw new Error(result.error || "资料转换失败");
      const timestamp = now();
      db.transaction(() => {
        db.prepare("DELETE FROM normalized_texts WHERE material_id = ?").run(job.material_id);
        db.prepare("INSERT INTO normalized_texts (id, material_id, source_type, text, char_count, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id(), job.material_id, result.sourceType, result.text, result.text!.length, JSON.stringify(result.metadata ?? {}), timestamp);
        db.prepare("UPDATE materials SET status = 'converted', conversion_error_message = NULL, updated_at = ? WHERE id = ?").run(timestamp, job.material_id);
        db.prepare("INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at, created_at, material_id) VALUES (?, 'note_generate', 'pending', ?, 0, 3, ?, ?, ?)").run(id(), JSON.stringify({ semesterId }), timestamp, timestamp, job.material_id);
        this.finish(db, job.id);
      })();
    } catch (error) { this.retryOrFail(db, job, "pending", "conversion_failed", "conversion_error_message", error); }
  }

  private parseAi(content: string): AiNotePayload {
    const parsed = JSON.parse(content) as AiNotePayload;
    if (!parsed.markdown?.trim() || !Array.isArray(parsed.highlights) || !Array.isArray(parsed.knowledgeModules) || parsed.knowledgeModules.length === 0) throw new Error("AI 输出不符合笔记 JSON 格式");
    for (const highlight of parsed.highlights) {
      if (!highlight.content?.trim() || !highlight.position?.trim() || !["low", "medium", "high"].includes(highlight.importance)) throw new Error("AI highlights 输出不符合格式");
    }
    for (const module of parsed.knowledgeModules) {
      if (!module.title?.trim() || !module.sourceEvidence?.trim() || !["low", "medium", "high", "critical"].includes(module.importance) || !["easy", "medium", "hard"].includes(module.difficulty)) throw new Error("AI knowledgeModules 输出不符合格式");
    }
    return parsed;
  }

  private toMindMapData(mindMap: AiNotePayload["mindMap"]): string {
    if (typeof mindMap === "string") {
      const data = mindMap.trim();
      if (!/^#\s+/m.test(data) || !/^##\s+/m.test(data)) throw new Error("AI mindMap 不是 Markmap Markdown 层级");
      return data;
    }

    const lines: string[] = [];
    const walk = (node: { title?: string; children?: unknown[] }, level: number): void => {
      if (!node.title?.trim()) return;
      lines.push(`${"#".repeat(level)} ${node.title.trim()}`);
      for (const child of node.children ?? []) {
        if (child && typeof child === "object") walk(child as { title?: string; children?: unknown[] }, level + 1);
      }
    };
    walk(mindMap, 1);
    const data = lines.join("\n");
    if (!/^#\s+/m.test(data) || !/^##\s+/m.test(data)) throw new Error("AI mindMap 不是 Markmap Markdown 层级");
    return data;
  }

  private async generate(db: DatabaseType, semesterId: string, job: JobRow): Promise<void> {
    try {
      const material = db.prepare("SELECT course_instance_id FROM materials WHERE id = ?").get(job.material_id) as { course_instance_id: string } | undefined;
      const normalized = db.prepare("SELECT text FROM normalized_texts WHERE material_id = ?").get(job.material_id) as { text: string } | undefined;
      if (!material || !normalized) throw new Error("缺少可生成笔记的纯文本");
      const inputText = normalized.text.slice(0, 8000); const timestamp = now();
      db.prepare("UPDATE materials SET status = 'note_generating', truncated = ?, updated_at = ? WHERE id = ?").run(normalized.text.length > inputText.length ? 1 : 0, timestamp, job.material_id);
      const response = await this.ai.generate({ taskType: "note_generation", inputText, language: "zh" }); const parsed = this.parseAi(response.content);
      const noteId = id(); const mindMapData = this.toMindMapData(parsed.mindMap);
      db.transaction(() => {
        db.prepare("INSERT INTO structured_notes (id, material_id, knowledge_module_id, markdown, highlights_json, model, prompt_version, token_count, generation_duration_ms, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, 's2-note-v1.0', ?, ?, ?, ?)").run(noteId, job.material_id, parsed.markdown, JSON.stringify(parsed.highlights), response.model, response.tokenUsed, response.latencyMs, timestamp, timestamp);
        db.prepare("INSERT INTO mind_maps (id, note_id, format, data, created_at) VALUES (?, ?, 'markmap', ?, ?)").run(id(), noteId, mindMapData, timestamp);
        const insertModule = db.prepare("INSERT INTO knowledge_modules (id, course_instance_id, material_id, title, importance, difficulty, exam_content, source_evidence, learn_status, content_summary, exam_relevance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'not_started', ?, ?, ?, ?)");
        for (const item of parsed.knowledgeModules) insertModule.run(id(), material.course_instance_id, job.material_id, item.title, item.importance, item.difficulty, item.sourceEvidence, item.contentSummary ?? null, item.examRelevance ?? null, timestamp, timestamp);
        db.prepare("UPDATE materials SET status = 'completed', ai_generation_error_message = NULL, updated_at = ? WHERE id = ?").run(timestamp, job.material_id);
        db.prepare("INSERT INTO study_events (id, course_instance_id, task_id, source_system, event_type, title, workload_minutes, evidence_ref, source_confidence, quality_gate, parent_visible, occurred_at, created_at) VALUES (?, ?, NULL, 'S2', 'material_note_completed', '资料笔记已生成', NULL, ?, 1, 'passed', 1, ?, ?)").run(id(), material.course_instance_id, `material:${job.material_id}`, timestamp, timestamp);
        this.finish(db, job.id);
      })();
    } catch (error) { this.retryOrFail(db, job, "converted", "pending_quality_check", "ai_generation_error_message", error); }
  }
}

const defaultWorker = new MaterialJobWorker();

export async function runOnce(): Promise<boolean> {
  return defaultWorker.runOnce();
}

export function startPolling(intervalMs = 2000): NodeJS.Timeout {
  return defaultWorker.startPolling(intervalMs);
}

export function stopPolling(timer: NodeJS.Timeout): void {
  defaultWorker.stopPolling(timer);
}

