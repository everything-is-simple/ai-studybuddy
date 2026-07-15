import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const VALID_PAYLOAD = {
  markdown: '# 人工补文笔记\n\n## 向量空间\n人工补文后的完整正文已生成笔记。',
  highlights: [{ content: '人工补文后的完整正文', importance: 'high', position: '第1段' }],
  mindMap: '# 人工补文笔记\n## 向量空间\n### 线性组合',
  knowledgeModules: [
    {
      title: '人工补文知识点',
      contentSummary: '基于人工补文生成的知识点。',
      importance: 'high',
      difficulty: 'medium',
      sourceEvidence: '人工补文后的完整正文',
      examRelevance: '概念题与简答题',
    },
  ],
};

function mockAi(contentBuilder) {
  const calls = [];
  return {
    calls,
    provider: {
      name: 'mock-ai',
      async generate(request) {
        calls.push(request);
        return {
          content: contentBuilder(calls.length, request),
          provider: 'mock',
          model: 'mock-note',
          tokenUsed: 100,
          latencyMs: 3,
          fallbackUsed: false,
        };
      },
    },
  };
}

let shared;
async function ensureShared() {
  if (shared) return shared;
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t10-worker-'));
  process.env.APP_DATA_ROOT = dataRoot;
  process.env.AI_PROVIDERS = '';
  process.env.AI_API_KEY = '';
  const { initializeSemester } = await import('../dist/db/semester-initializer.js');
  const { StudyRhythmService } = await import('../dist/services/study-rhythm-service.js');
  const { NoteBuilderService } = await import('../dist/services/note-builder-service.js');
  const { MaterialJobWorker } = await import('../dist/services/material-job-worker.js');
  const { StorageAdapter } = await import('../dist/adapters/storage.js');
  shared = { dataRoot, initializeSemester, StudyRhythmService, NoteBuilderService, MaterialJobWorker, StorageAdapter };
  return shared;
}

async function setupUploaded() {
  const { dataRoot, initializeSemester, StudyRhythmService, NoteBuilderService, MaterialJobWorker, StorageAdapter } =
    await ensureShared();
  const semester = initializeSemester(
    {
      studentName: 'T10 Worker',
      semesterCode: `t10-worker-${crypto.randomUUID()}`,
      teachingStartDate: '2026-02-20',
      teachingEndDate: '2026-06-30',
    },
    { appDataRoot: dataRoot }
  );
  const course = new StudyRhythmService().createCourse({ semesterId: semester.semesterId, name: '线性代数' });
  const service = new NoteBuilderService();
  const uploaded = await service.uploadMaterial({
    semesterId: semester.semesterId,
    courseInstanceId: course.id,
    title: '向量空间讲义',
    file: {
      originalname: 'chapter.txt',
      mimetype: 'text/plain',
      size: Buffer.byteLength('旧正文：向量空间的定义与线性组合。'),
      buffer: Buffer.from('旧正文：向量空间的定义与线性组合。'),
    },
  });
  return { service, MaterialJobWorker, StorageAdapter, semesterId: semester.semesterId, courseId: course.id, materialId: uploaded.id };
}

function forceMaterialStatus(service, semesterId, materialId, status, options = {}) {
  const timestamp = new Date().toISOString();
  const db = service.openReadySemesterDb(semesterId);
  try {
    if (options.clearJobs !== false) {
      db.prepare("UPDATE jobs SET status = 'failed', attempts = max_attempts, completed_at = ? WHERE material_id = ?").run(
        timestamp,
        materialId
      );
    }
    if (options.oldAiAttempts) {
      db.prepare(
        "INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at, completed_at, created_at, material_id) VALUES (?, 'note_generate', 'failed', ?, 3, 3, ?, ?, ?, ?)"
      ).run(crypto.randomUUID(), JSON.stringify({ semesterId }), timestamp, timestamp, timestamp, materialId);
    }
    db.prepare(
      'UPDATE materials SET status = ?, conversion_error_message = ?, ai_generation_error_message = ?, updated_at = ? WHERE id = ?'
    ).run(
      status,
      options.conversionError ?? (status === 'conversion_failed' ? '转换失败旧错误' : null),
      options.aiError ?? (status === 'pending_quality_check' ? 'AI 失败旧错误' : null),
      timestamp,
      materialId
    );
  } finally {
    db.close();
  }
}

function readDbState(service, semesterId, materialId) {
  const db = service.openReadySemesterDb(semesterId);
  try {
    const material = db
      .prepare('SELECT storage_key, status, conversion_error_message, ai_generation_error_message, truncated FROM materials WHERE id = ?')
      .get(materialId);
    const normalized = db
      .prepare('SELECT id, text, char_count, metadata_json FROM normalized_texts WHERE material_id = ?')
      .get(materialId);
    const jobs = db
      .prepare('SELECT job_type, status, attempts, max_attempts, payload_json FROM jobs WHERE material_id = ? ORDER BY created_at')
      .all(materialId);
    return { material, normalized, jobs };
  } finally {
    db.close();
  }
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function drainWorker(worker, service, semesterId, materialId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const progressed = await worker.runOnce();
    const detail = service.getMaterial(semesterId, materialId);
    if (detail.status === 'completed' || detail.status === 'pending_quality_check') return detail;
    if (!progressed) {
      const db = service.openReadySemesterDb(semesterId);
      try {
        db.prepare("UPDATE jobs SET available_at = ? WHERE status = 'pending' AND material_id = ?").run(
          new Date().toISOString(),
          materialId
        );
      } finally {
        db.close();
      }
    }
  }
  return service.getMaterial(semesterId, materialId);
}

test('S2 manual text replacement accepts only terminal recovery states and records new text version metadata', async () => {
  const conversionFailed = await setupUploaded();
  forceMaterialStatus(conversionFailed.service, conversionFailed.semesterId, conversionFailed.materialId, 'conversion_failed');
  const before = readDbState(conversionFailed.service, conversionFailed.semesterId, conversionFailed.materialId);

  const result = conversionFailed.service.replaceText(
    conversionFailed.semesterId,
    conversionFailed.materialId,
    '  人工补文完整正文：转换失败后粘贴。  '
  );
  assert.equal(result.status, 'converted');
  assert.equal(result.jobStatus, 'pending');

  const after = readDbState(conversionFailed.service, conversionFailed.semesterId, conversionFailed.materialId);
  assert.equal(after.material.storage_key, before.material.storage_key, '人工补文不得删除或替换原始上传文件');
  assert.equal(after.material.status, 'converted');
  assert.equal(after.material.conversion_error_message, null);
  assert.equal(after.material.ai_generation_error_message, null);
  assert.equal(after.material.truncated, 0);
  assert.equal(after.normalized.text, '人工补文完整正文：转换失败后粘贴。');
  assert.equal(after.normalized.char_count, '人工补文完整正文：转换失败后粘贴。'.length);
  assert.deepEqual(JSON.parse(after.normalized.metadata_json), {
    converter: 'manual',
    recoveryFrom: 'conversion_failed',
    recoveredAt: JSON.parse(after.normalized.metadata_json).recoveredAt,
  });
  assert.ok(JSON.parse(after.normalized.metadata_json).recoveredAt);
  assert.equal(after.jobs.at(-1).job_type, 'note_generate');
  assert.equal(after.jobs.at(-1).status, 'pending');
  assert.equal(after.jobs.at(-1).attempts, 0);
  assert.equal(after.jobs.at(-1).max_attempts, 3);
  assert.equal(JSON.parse(after.jobs.at(-1).payload_json).normalizedTextId, result.normalizedTextId);

  const pendingQuality = await setupUploaded();
  forceMaterialStatus(pendingQuality.service, pendingQuality.semesterId, pendingQuality.materialId, 'pending_quality_check', {
    oldAiAttempts: true,
  });
  const recovered = pendingQuality.service.replaceText(
    pendingQuality.semesterId,
    pendingQuality.materialId,
    '人工补文完整正文：AI 失败后重新生成。'
  );
  assert.equal(recovered.status, 'converted');
  const pendingQualityState = readDbState(pendingQuality.service, pendingQuality.semesterId, pendingQuality.materialId);
  assert.equal(JSON.parse(pendingQualityState.normalized.metadata_json).recoveryFrom, 'pending_quality_check');
  assert.equal(
    pendingQualityState.jobs.filter((job) => job.job_type === 'note_generate' && job.status === 'pending').length,
    1,
    '旧文本版本已耗尽 3 次后，人工新正文仍应获得新的受限生成 Job'
  );

  for (const status of ['pending', 'converting', 'note_generating', 'completed']) {
    const item = await setupUploaded();
    forceMaterialStatus(item.service, item.semesterId, item.materialId, status);
    assertThrowsCode(
      () => item.service.replaceText(item.semesterId, item.materialId, `不允许覆盖 ${status}`),
      'INVALID_STATUS'
    );
  }
});

test('S2 manual text replacement rejects active worker jobs instead of racing with them', async () => {
  const item = await setupUploaded();
  forceMaterialStatus(item.service, item.semesterId, item.materialId, 'conversion_failed', { clearJobs: false });
  assertThrowsCode(
    () => item.service.replaceText(item.semesterId, item.materialId, '有运行中任务时不应覆盖'),
    'JOB_ALREADY_PENDING'
  );
});

test('S2 manual text replacement after AI failure can generate note, module, and study event', async () => {
  const { service, MaterialJobWorker, StorageAdapter, semesterId, materialId } = await setupUploaded();
  const badAi = mockAi(() => '这不是 JSON，应该触发三次 AI 失败。');
  const badWorker = new MaterialJobWorker(service, new StorageAdapter(), badAi.provider);
  const failed = await drainWorker(badWorker, service, semesterId, materialId);
  assert.equal(failed.status, 'pending_quality_check');
  assert.equal(failed.aiRetryCount, 3);
  const originalStorageKey = failed.storageKey;

  const replacementText = '人工补文后的完整正文：向量空间、线性组合、基底与维数。';
  service.replaceText(semesterId, materialId, replacementText);

  const goodAi = mockAi(() => JSON.stringify(VALID_PAYLOAD));
  const goodWorker = new MaterialJobWorker(service, new StorageAdapter(), goodAi.provider);
  const completed = await drainWorker(goodWorker, service, semesterId, materialId);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.hasNote, true);
  assert.equal(completed.knowledgeModuleCount, 1);
  assert.equal(completed.storageKey, originalStorageKey);
  assert.equal(goodAi.calls.length, 1);
  assert.match(goodAi.calls[0].inputText, /人工补文后的完整正文/);

  const db = service.openReadySemesterDb(semesterId);
  try {
    const note = db.prepare('SELECT markdown FROM structured_notes WHERE material_id = ?').get(materialId);
    const module = db.prepare('SELECT title, source_evidence FROM knowledge_modules WHERE material_id = ?').get(materialId);
    const event = db
      .prepare("SELECT event_type, evidence_ref, quality_gate FROM study_events WHERE event_type = 'material_note_completed'")
      .get();
    assert.match(note.markdown, /人工补文笔记/);
    assert.equal(module.title, '人工补文知识点');
    assert.equal(module.source_evidence, '人工补文后的完整正文');
    assert.deepEqual(event, {
      event_type: 'material_note_completed',
      evidence_ref: `material:${materialId}`,
      quality_gate: 'passed',
    });
  } finally {
    db.close();
  }
});
