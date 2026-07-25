import crypto from 'crypto';
import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { migrateSemesterDb } from '../db/migrations';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import { assertSemesterWritable, SemesterAccessError } from './semester-access-service';
import { StorageAdapter } from '../adapters/storage';
import type {
  KnowledgeDifficulty,
  KnowledgeImportance,
  KnowledgeLearnStatus,
  MaterialDto,
  MaterialFileType,
  MaterialStatus,
} from '@ai-studybuddy/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_TYPES: Record<string, { fileType: MaterialFileType; mimeTypes: readonly string[] }> = {
  '.pdf': { fileType: 'pdf', mimeTypes: ['application/pdf'] },
  '.jpg': { fileType: 'image', mimeTypes: ['image/jpeg'] },
  '.jpeg': { fileType: 'image', mimeTypes: ['image/jpeg'] },
  '.png': { fileType: 'image', mimeTypes: ['image/png'] },
  '.webp': { fileType: 'image', mimeTypes: ['image/webp'] },
  '.txt': { fileType: 'text', mimeTypes: ['text/plain'] },
  '.docx': { fileType: 'docx', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  '.pptx': {
    fileType: 'pptx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
};
const STATUSES: readonly MaterialStatus[] = [
  'pending',
  'converting',
  'converted',
  'note_generating',
  'completed',
  'conversion_failed',
  'pending_quality_check',
];
const IMPORTANCE_ORDER =
  "CASE importance WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END";
const DIFFICULTY_ORDER = "CASE difficulty WHEN 'hard' THEN 0 WHEN 'medium' THEN 1 WHEN 'easy' THEN 2 ELSE 3 END";

export class NoteBuilderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'NoteBuilderError';
  }
}

function now(): string {
  return new Date().toISOString();
}
function id(): string {
  return crypto.randomUUID();
}
function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function requiredUuid(value: unknown, code: string, message: string): string {
  const result = string(value);
  if (!UUID.test(result)) throw new NoteBuilderError(code, 400, message);
  return result;
}
function fileType(name: string, mimetype: string): MaterialFileType {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  const result = FILE_TYPES[extension];
  if (!result) throw new NoteBuilderError('INVALID_FILE_TYPE', 400, `不支持的文件类型：${extension || '无扩展名'}`);
  const normalizedMime = mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalizedMime && normalizedMime !== 'application/octet-stream' && !result.mimeTypes.includes(normalizedMime)) {
    throw new NoteBuilderError('INVALID_FILE_TYPE', 400, `文件 MIME 类型与扩展名不匹配：${normalizedMime}`);
  }
  return result.fileType;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
export interface NoteBuilderServiceOptions {
  storage?: StorageAdapter;
}

export class NoteBuilderService {
  private readonly storage: StorageAdapter;
  constructor(options?: NoteBuilderServiceOptions) {
    this.storage = options?.storage ?? new StorageAdapter();
  }

  openReadySemesterDb(semesterId: string): DatabaseType {
    requiredUuid(semesterId, 'SEMESTER_NOT_FOUND', '学期不存在');
    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const semester = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as
        { ready: number } | undefined;
      if (!semester) throw new NoteBuilderError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      if (semester.ready !== 1) throw new NoteBuilderError('SEMESTER_NOT_ACTIVE', 409, '学期尚未就绪或已归档');
    } finally {
      globalDb?.close();
    }
    if (!fs.existsSync(getSemesterDbPath(semesterId)))
      throw new NoteBuilderError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    const semesterDb = openExistingDbAtPath(getSemesterDbPath(semesterId));
    try {
      migrateSemesterDb(semesterDb);
      return semesterDb;
    } catch (error) {
      semesterDb.close();
      throw error;
    }
  }


  private assertWritableSemester(semesterId: unknown): void {
    try {
      assertSemesterWritable(semesterId);
    } catch (error) {
      if (error instanceof SemesterAccessError) {
        throw new NoteBuilderError(error.code, error.status, error.message);
      }
      throw error;
    }
  }

  private requireCourse(db: DatabaseType, semesterId: string, courseInstanceId: string): void {
    requiredUuid(courseInstanceId, 'COURSE_INSTANCE_NOT_FOUND', '课程不存在');
    const row = db
      .prepare('SELECT id FROM course_instances WHERE id = ? AND semester_id = ?')
      .get(courseInstanceId, semesterId);
    if (!row) throw new NoteBuilderError('COURSE_INSTANCE_NOT_FOUND', 404, '课程不存在');
  }

  private toMaterial(row: Record<string, unknown>): MaterialDto {
    return {
      id: String(row.id),
      courseInstanceId: String(row.course_instance_id),
      fileType: row.file_type as MaterialFileType,
      status: row.status as MaterialStatus,
      title: row.title ? String(row.title) : undefined,
      originalFilename: row.original_filename ? String(row.original_filename) : undefined,
      fileSizeBytes:
        row.file_size_bytes === null || row.file_size_bytes === undefined ? undefined : Number(row.file_size_bytes),
      storageKey: row.storage_key ? String(row.storage_key) : undefined,
      hasNote: row.has_note === null || row.has_note === undefined ? undefined : Number(row.has_note) === 1,
      noteId: row.note_id === null || row.note_id === undefined ? undefined : String(row.note_id),
      knowledgeModuleCount:
        row.knowledge_module_count === null || row.knowledge_module_count === undefined
          ? undefined
          : Number(row.knowledge_module_count),
      conversionRetryCount: Number(row.conversion_retry_count ?? 0),
      aiRetryCount: Number(row.ai_retry_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    };
  }

  private materialSummarySelect(prefix: string): string {
    return `
      ${prefix}.*,
      CASE WHEN EXISTS (SELECT 1 FROM structured_notes n WHERE n.material_id = ${prefix}.id) THEN 1 ELSE 0 END AS has_note,
      (SELECT id FROM structured_notes WHERE material_id = ${prefix}.id) AS note_id,
      (SELECT COUNT(*) FROM knowledge_modules km WHERE km.material_id = ${prefix}.id) AS knowledge_module_count,
      (SELECT COALESCE(sum(attempts), 0) FROM jobs WHERE material_id = ${prefix}.id AND job_type = 'material_convert') AS conversion_retry_count,
      (SELECT COALESCE(sum(attempts), 0) FROM jobs WHERE material_id = ${prefix}.id AND job_type = 'note_generate') AS ai_retry_count
    `;
  }

  private toKnowledgeModule(row: Record<string, unknown>) {
    return {
      id: String(row.id),
      courseInstanceId: String(row.course_instance_id),
      materialId: row.material_id === null || row.material_id === undefined ? undefined : String(row.material_id),
      title: String(row.title),
      contentSummary:
        row.content_summary === null || row.content_summary === undefined ? undefined : String(row.content_summary),
      importance: row.importance as KnowledgeImportance,
      difficulty: row.difficulty as KnowledgeDifficulty,
      examRelevance:
        row.exam_relevance === null || row.exam_relevance === undefined ? undefined : String(row.exam_relevance),
      sourceEvidence:
        row.source_evidence === null || row.source_evidence === undefined ? undefined : String(row.source_evidence),
      learnStatus: row.learn_status as KnowledgeLearnStatus,
      lastReviewedAt:
        row.last_reviewed_at === null || row.last_reviewed_at === undefined ? undefined : String(row.last_reviewed_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async uploadMaterial(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    title?: unknown;
    file?: UploadedFile;
  }): Promise<MaterialDto> {
    const semesterId = requiredUuid(input.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const courseInstanceId = requiredUuid(
      input.courseInstanceId,
      'MISSING_REQUIRED_FIELD',
      'courseInstanceId 不能为空'
    );
    if (!input.file) throw new NoteBuilderError('MISSING_REQUIRED_FIELD', 400, 'file 不能为空');
    if (input.file.size <= 0) throw new NoteBuilderError('INVALID_FILE', 400, '文件为空或大小无效');
    if (input.file.size > 10 * 1024 * 1024) throw new NoteBuilderError('FILE_TOO_LARGE', 413, '文件大小超过 10MB 限制');
    const materialFileType = fileType(input.file.originalname, input.file.mimetype);
    const title = string(input.title);
    if (title.length > 200) throw new NoteBuilderError('INVALID_TITLE', 400, 'title 不能超过 200 字符');
    this.assertWritableSemester(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    let storageKey: string | undefined;
    try {
      this.requireCourse(db, semesterId, courseInstanceId);
      const saved = await this.storage.put({
        semesterId,
        courseId: courseInstanceId,
        originalName: input.file.originalname,
        data: input.file.buffer,
      });
      storageKey = saved.storageKey;
      const materialId = id();
      const createdAt = now();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO materials (id, course_instance_id, file_type, storage_key, status, original_filename, title, file_size_bytes, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
        ).run(
          materialId,
          courseInstanceId,
          materialFileType,
          saved.storageKey,
          input.file!.originalname,
          title || null,
          saved.size,
          createdAt,
          createdAt
        );
        db.prepare(
          `INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at, created_at, material_id)
          VALUES (?, 'material_convert', 'pending', ?, 0, 3, ?, ?, ?)`
        ).run(id(), JSON.stringify({ semesterId }), createdAt, createdAt, materialId);
      })();
      return this.toMaterial({
        id: materialId,
        course_instance_id: courseInstanceId,
        file_type: materialFileType,
        status: 'pending',
        original_filename: input.file.originalname,
        title: title || null,
        file_size_bytes: saved.size,
        storage_key: saved.storageKey,
        created_at: createdAt,
        updated_at: createdAt,
      });
    } catch (error) {
      if (storageKey) await this.storage.delete(storageKey).catch(() => undefined);
      if (error instanceof NoteBuilderError) throw error;
      throw new NoteBuilderError('STORAGE_ERROR', 500, '保存资料失败');
    } finally {
      db.close();
    }
  }

  listMaterials(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    status?: unknown;
    page?: unknown;
    pageSize?: unknown;
  }) {
    const semesterId = requiredUuid(input.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const courseInstanceId = requiredUuid(
      input.courseInstanceId,
      'MISSING_REQUIRED_FIELD',
      'courseInstanceId 不能为空'
    );
    const status = string(input.status);
    if (status && !STATUSES.includes(status as MaterialStatus))
      throw new NoteBuilderError('INVALID_ENUM_VALUE', 400, 'status 非法');
    const page = Math.max(1, Number(input.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20) || 20));
    const db = this.openReadySemesterDb(semesterId);
    try {
      this.requireCourse(db, semesterId, courseInstanceId);
      const where = status ? 'course_instance_id = ? AND status = ?' : 'course_instance_id = ?';
      const params = status ? [courseInstanceId, status] : [courseInstanceId];
      const total = Number(
        (db.prepare(`SELECT count(*) AS total FROM materials WHERE ${where}`).get(...params) as { total: number }).total
      );
      const rows = db
        .prepare(
          `SELECT ${this.materialSummarySelect('m')} FROM materials m WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
      return {
        items: rows.map((row) => this.toMaterial(row)),
        pagination: { page, pageSize, total, hasMore: page * pageSize < total },
      };
    } finally {
      db.close();
    }
  }

  getMaterial(semesterIdValue: unknown, materialIdValue: unknown) {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const materialId = requiredUuid(materialIdValue, 'MATERIAL_NOT_FOUND', '资料不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const row = db
        .prepare(`SELECT ${this.materialSummarySelect('m')} FROM materials m WHERE m.id = ?`)
        .get(materialId) as Record<string, unknown> | undefined;
      if (!row) throw new NoteBuilderError('MATERIAL_NOT_FOUND', 404, '资料不存在');
      const text = db
        .prepare('SELECT id, char_count, text, metadata_json FROM normalized_texts WHERE material_id = ?')
        .get(materialId) as { id: string; char_count: number; text: string; metadata_json: string | null } | undefined;
      return {
        ...this.toMaterial(row),
        normalizedText: text
          ? {
              id: text.id,
              charCount: text.char_count,
              preview: text.text.slice(0, 500),
              metadata: text.metadata_json ? JSON.parse(text.metadata_json) : {},
            }
          : undefined,
      };
    } finally {
      db.close();
    }
  }

  retry(semesterIdValue: unknown, materialIdValue: unknown, type: 'material_convert' | 'note_generate') {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const materialId = requiredUuid(materialIdValue, 'MATERIAL_NOT_FOUND', '资料不存在');
    const expected = type === 'material_convert' ? 'conversion_failed' : 'pending_quality_check';
    this.assertWritableSemester(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    try {
      const material = db.prepare('SELECT status FROM materials WHERE id = ?').get(materialId) as
        { status: MaterialStatus } | undefined;
      if (!material) throw new NoteBuilderError('MATERIAL_NOT_FOUND', 404, '资料不存在');
      if (material.status !== expected) throw new NoteBuilderError('INVALID_STATUS', 400, `资料状态必须为 ${expected}`);
      const attempts = Number(
        (
          db
            .prepare('SELECT COALESCE(sum(attempts), 0) AS total FROM jobs WHERE material_id = ? AND job_type = ?')
            .get(materialId, type) as { total: number }
        ).total
      );
      if (attempts >= 3) throw new NoteBuilderError('MAX_RETRIES_EXCEEDED', 409, '已达到最大重试次数');
      try {
        db.prepare(
          `INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at, created_at, material_id) VALUES (?, ?, 'pending', ?, 0, 3, ?, ?, ?)`
        ).run(id(), type, JSON.stringify({ semesterId }), now(), now(), materialId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE constraint'))
          throw new NoteBuilderError('JOB_ALREADY_PENDING', 409, '已有待执行或运行中的任务');
        throw err;
      }
      return { id: materialId, status: material.status, attempts, jobStatus: 'pending' };
    } finally {
      db.close();
    }
  }

  replaceText(semesterIdValue: unknown, materialIdValue: unknown, textValue: unknown) {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const materialId = requiredUuid(materialIdValue, 'MATERIAL_NOT_FOUND', '资料不存在');
    const text = string(textValue);
    if (!text || text.length > 1048576)
      throw new NoteBuilderError('INVALID_TEXT', 400, 'text 长度必须为 1-1048576 字符');
    this.assertWritableSemester(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    try {
      const material = db.prepare('SELECT status FROM materials WHERE id = ?').get(materialId) as
        { status: MaterialStatus } | undefined;
      if (!material) throw new NoteBuilderError('MATERIAL_NOT_FOUND', 404, '资料不存在');
      if (material.status !== 'conversion_failed' && material.status !== 'pending_quality_check')
        throw new NoteBuilderError('INVALID_STATUS', 400, '当前状态不允许手动粘贴文本');
      const recoveryFrom = material.status;
      const updatedAt = now();
      const normalizedTextId = id();
      try {
        db.transaction(() => {
          const activeJob = db
            .prepare("SELECT job_type FROM jobs WHERE material_id = ? AND status IN ('pending', 'running') LIMIT 1")
            .get(materialId) as { job_type: string } | undefined;
          if (activeJob) throw new NoteBuilderError('JOB_ALREADY_PENDING', 409, '已有待执行或运行中的任务');
          db.prepare('DELETE FROM normalized_texts WHERE material_id = ?').run(materialId);
          db.prepare(
            "INSERT INTO normalized_texts (id, material_id, source_type, text, char_count, metadata_json, created_at) VALUES (?, ?, 'text', ?, ?, ?, ?)"
          ).run(
            normalizedTextId,
            materialId,
            text,
            text.length,
            JSON.stringify({ converter: 'manual', recoveryFrom, recoveredAt: updatedAt }),
            updatedAt
          );
          db.prepare(
            "UPDATE materials SET status = 'converted', conversion_error_message = NULL, ai_generation_error_message = NULL, truncated = 0, updated_at = ? WHERE id = ?"
          ).run(updatedAt, materialId);
          db.prepare(
            "INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at, created_at, material_id) VALUES (?, 'note_generate', 'pending', ?, 0, 3, ?, ?, ?)"
          ).run(id(), JSON.stringify({ semesterId, normalizedTextId }), updatedAt, updatedAt, materialId);
        })();
      } catch (err) {
        if (err instanceof NoteBuilderError) throw err;
        const message = err instanceof Error ? err.message : '';
        if (message.includes('UNIQUE constraint'))
          throw new NoteBuilderError('JOB_ALREADY_PENDING', 409, '已有待执行或运行中的任务');
        throw err;
      }
      return { id: materialId, status: 'converted', normalizedTextId, jobStatus: 'pending' };
    } finally {
      db.close();
    }
  }

  async createNormalizedTextMaterial(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    title: unknown;
    text: unknown;
    sourceType: 'class_audio_transcription';
  }): Promise<MaterialDto> {
    const semesterId = requiredUuid(input.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const courseInstanceId = requiredUuid(
      input.courseInstanceId,
      'MISSING_REQUIRED_FIELD',
      'courseInstanceId 不能为空'
    );
    const title = string(input.title);
    const text = string(input.text);
    if (!title || title.length > 200) throw new NoteBuilderError('INVALID_TITLE', 400, 'title 长度必须为 1-200 字符');
    if (!text || text.length > 1048576)
      throw new NoteBuilderError('INVALID_TEXT', 400, 'text 长度必须为 1-1048576 字符');
    this.assertWritableSemester(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    let storageKey: string | undefined;
    try {
      this.requireCourse(db, semesterId, courseInstanceId);
      const saved = await this.storage.put({
        semesterId,
        courseId: courseInstanceId,
        originalName: `${title}.txt`,
        data: Buffer.from(text, 'utf8'),
      });
      storageKey = saved.storageKey;
      const materialId = id();
      const normalizedTextId = id();
      const createdAt = now();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO materials (id, course_instance_id, file_type, storage_key, status, original_filename, title, file_size_bytes, created_at, updated_at)
           VALUES (?, ?, 'text', ?, 'converted', ?, ?, ?, ?, ?)`
        ).run(materialId, courseInstanceId, saved.storageKey, `${title}.txt`, title, saved.size, createdAt, createdAt);
        db.prepare(
          `INSERT INTO normalized_texts (id, material_id, source_type, text, char_count, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          normalizedTextId,
          materialId,
          input.sourceType,
          text,
          text.length,
          JSON.stringify({ converter: 'class_capture', userConfirmed: true }),
          createdAt
        );
      })();
      return this.toMaterial({
        id: materialId,
        course_instance_id: courseInstanceId,
        file_type: 'text',
        storage_key: saved.storageKey,
        status: 'converted',
        original_filename: `${title}.txt`,
        title,
        file_size_bytes: saved.size,
        created_at: createdAt,
        updated_at: createdAt,
      });
    } catch (error) {
      if (storageKey) await this.storage.delete(storageKey).catch(() => undefined);
      if (error instanceof NoteBuilderError) throw error;
      throw new NoteBuilderError('STORAGE_ERROR', 500, '保存转写文本失败');
    } finally {
      db.close();
    }
  }

  requestNoteGeneration(semesterIdValue: unknown, materialIdValue: unknown) {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const materialId = requiredUuid(materialIdValue, 'MATERIAL_NOT_FOUND', '资料不存在');
    this.assertWritableSemester(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    try {
      const material = db.prepare('SELECT status FROM materials WHERE id = ?').get(materialId) as
        { status: MaterialStatus } | undefined;
      if (!material) throw new NoteBuilderError('MATERIAL_NOT_FOUND', 404, '资料不存在');
      if (material.status !== 'converted') throw new NoteBuilderError('INVALID_STATUS', 400, '当前资料尚不能生成笔记');
      const normalized = db.prepare('SELECT id FROM normalized_texts WHERE material_id = ?').get(materialId) as
        { id: string } | undefined;
      if (!normalized) throw new NoteBuilderError('NORMALIZED_TEXT_NOT_FOUND', 409, '缺少可生成笔记的正文');
      const activeJob = db
        .prepare("SELECT id FROM jobs WHERE material_id = ? AND status IN ('pending', 'running') LIMIT 1")
        .get(materialId) as { id: string } | undefined;
      if (activeJob) throw new NoteBuilderError('JOB_ALREADY_PENDING', 409, '已有待执行或运行中的任务');
      const createdAt = now();
      db.prepare(
        `INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at, created_at, material_id)
         VALUES (?, 'note_generate', 'pending', ?, 0, 3, ?, ?, ?)`
      ).run(id(), JSON.stringify({ semesterId, normalizedTextId: normalized.id }), createdAt, createdAt, materialId);
      return { id: materialId, status: 'converted', jobStatus: 'pending' };
    } finally {
      db.close();
    }
  }

  getNote(semesterIdValue: unknown, noteIdValue: unknown) {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const noteId = requiredUuid(noteIdValue, 'NOTE_NOT_FOUND', '笔记不存在');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const note = db
        .prepare(
          'SELECT n.*, m.course_instance_id FROM structured_notes n JOIN materials m ON m.id = n.material_id WHERE n.id = ?'
        )
        .get(noteId) as Record<string, unknown> | undefined;
      if (!note) throw new NoteBuilderError('NOTE_NOT_FOUND', 404, '笔记不存在');
      const mindMap = db.prepare('SELECT id, format, data FROM mind_maps WHERE note_id = ?').get(noteId) as
        { id: string; format: string; data: string } | undefined;
      const modules = db
        .prepare('SELECT * FROM knowledge_modules WHERE material_id = ? ORDER BY created_at')
        .all(note.material_id) as Record<string, unknown>[];
      return {
        id: note.id,
        materialId: note.material_id,
        markdown: note.markdown,
        highlights: JSON.parse(String(note.highlights_json ?? '[]')),
        mindMap: mindMap ? { id: mindMap.id, format: mindMap.format, data: mindMap.data } : undefined,
        knowledgeModules: modules.map((row) => this.toKnowledgeModule(row)),
        model: note.model,
        promptVersion: note.prompt_version,
        tokenCount: note.token_count,
        generationDurationMs: note.generation_duration_ms,
        createdAt: note.created_at,
      };
    } finally {
      db.close();
    }
  }
  listKnowledgeModules(
    semesterIdValue: unknown,
    courseInstanceIdValue: unknown,
    filters: { learnStatus?: unknown; importance?: unknown; page?: unknown; pageSize?: unknown }
  ) {
    const semesterId = requiredUuid(semesterIdValue, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const courseInstanceId = requiredUuid(courseInstanceIdValue, 'MISSING_REQUIRED_FIELD', 'courseInstanceId 不能为空');
    const learnStatus = filters.learnStatus === undefined ? '' : string(filters.learnStatus);
    const importance = filters.importance === undefined ? '' : string(filters.importance);
    if (learnStatus && !['not_started', 'learning', 'mastered'].includes(learnStatus))
      throw new NoteBuilderError('INVALID_ENUM_VALUE', 400, 'learnStatus 非法');
    if (importance && !['low', 'medium', 'high', 'critical'].includes(importance))
      throw new NoteBuilderError('INVALID_ENUM_VALUE', 400, 'importance 非法');
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 20) || 20));
    const db = this.openReadySemesterDb(semesterId);
    try {
      this.requireCourse(db, semesterId, courseInstanceId);
      const clauses = ['course_instance_id = ?'];
      const params: string[] = [courseInstanceId];
      if (learnStatus) {
        clauses.push('learn_status = ?');
        params.push(learnStatus);
      }
      if (importance) {
        clauses.push('importance = ?');
        params.push(importance);
      }
      const where = clauses.join(' AND ');
      const total = Number(
        (
          db.prepare(`SELECT count(*) AS total FROM knowledge_modules WHERE ${where}`).get(...params) as {
            total: number;
          }
        ).total
      );
      const rows = db
        .prepare(
          `SELECT * FROM knowledge_modules WHERE ${where} ORDER BY ${IMPORTANCE_ORDER}, ${DIFFICULTY_ORDER}, created_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
      return {
        items: rows.map((row) => this.toKnowledgeModule(row)),
        pagination: { page, pageSize, total, hasMore: page * pageSize < total },
      };
    } finally {
      db.close();
    }
  }

  updateKnowledgeModule(input: {
    semesterId: unknown;
    id: unknown;
    learnStatus?: unknown;
    importance?: unknown;
    difficulty?: unknown;
    examRelevance?: unknown;
  }) {
    const semesterId = requiredUuid(input.semesterId, 'MISSING_REQUIRED_FIELD', 'semesterId 不能为空');
    const moduleId = requiredUuid(input.id, 'KNOWLEDGE_MODULE_NOT_FOUND', '知识模块不存在');
    this.assertWritableSemester(semesterId);
    const db = this.openReadySemesterDb(semesterId);
    try {
      const module = db.prepare('SELECT * FROM knowledge_modules WHERE id = ?').get(moduleId) as
        Record<string, unknown> | undefined;
      if (!module) throw new NoteBuilderError('KNOWLEDGE_MODULE_NOT_FOUND', 404, '知识模块不存在');
      const learnStatus = input.learnStatus === undefined ? String(module.learn_status) : string(input.learnStatus);
      const importance = input.importance === undefined ? String(module.importance) : string(input.importance);
      const difficulty = input.difficulty === undefined ? String(module.difficulty) : string(input.difficulty);
      if (
        !['not_started', 'learning', 'mastered'].includes(learnStatus) ||
        !['low', 'medium', 'high', 'critical'].includes(importance) ||
        !['easy', 'medium', 'hard'].includes(difficulty)
      )
        throw new NoteBuilderError('INVALID_ENUM_VALUE', 400, '知识模块枚举值非法');
      const updatedAt = now();
      db.transaction(() => {
        db.prepare(
          'UPDATE knowledge_modules SET learn_status = ?, importance = ?, difficulty = ?, exam_relevance = ?, last_reviewed_at = ?, updated_at = ? WHERE id = ?'
        ).run(
          learnStatus,
          importance,
          difficulty,
          input.examRelevance === undefined ? module.exam_relevance : string(input.examRelevance),
          learnStatus !== module.learn_status ? updatedAt : module.last_reviewed_at,
          updatedAt,
          moduleId
        );
        if (learnStatus !== module.learn_status)
          db.prepare(
            "INSERT INTO study_events (id, course_instance_id, task_id, source_system, event_type, title, workload_minutes, evidence_ref, source_confidence, quality_gate, parent_visible, occurred_at, created_at) VALUES (?, ?, NULL, 'S2', 'knowledge_module_status_changed', ?, NULL, ?, 1, 'passed', 1, ?, ?)"
          ).run(
            id(),
            module.course_instance_id,
            `知识模块状态更新：${module.title}`,
            `km:${moduleId}`,
            updatedAt,
            updatedAt
          );
      })();
      const updated = db.prepare('SELECT * FROM knowledge_modules WHERE id = ?').get(moduleId) as
        Record<string, unknown> | undefined;
      return updated ? this.toKnowledgeModule(updated) : undefined;
    } finally {
      db.close();
    }
  }
}
