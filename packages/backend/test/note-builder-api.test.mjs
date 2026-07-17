import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');
let nextPort = 49000;

async function startBackend(t, providedDataRoot) {
  const dataRoot = providedDataRoot ?? (await mkdtemp(path.join(tmpdir(), 'studybuddy-t07-api-')));
  const port = nextPort++;
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      AI_PROVIDERS: '',
      AI_API_KEY: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    if (providedDataRoot === undefined) {
      await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return port;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend did not become healthy: ${stderr}`);
}

async function json(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json() };
}

async function readySemester(port) {
  const response = await json(port, 'POST', '/api/dev/init-semester', {
    studentName: 'T07',
    semesterCode: `t07-${crypto.randomUUID()}`,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
  });
  assert.equal(response.status, 200);
  return response.json.data.semesterId;
}

test('S2 uploads text, converts it, and preserves normalized text when AI is unavailable', async (t) => {
  const port = await startBackend(t);
  const semesterId = await readySemester(port);
  const course = await json(port, 'POST', '/api/courses', { semesterId, name: '线性代数' });
  assert.equal(course.status, 201);
  const courseInstanceId = course.json.data.id;

  const form = new FormData();
  form.append('semesterId', semesterId);
  form.append('courseInstanceId', courseInstanceId);
  form.append('file', new Blob(['向量空间的定义与线性组合。'], { type: 'text/plain' }), 'chapter.txt');
  const upload = await fetch(`http://127.0.0.1:${port}/api/materials/upload`, { method: 'POST', body: form });
  const uploaded = await upload.json();
  assert.equal(upload.status, 200);
  assert.equal(uploaded.success, true);
  assert.equal(uploaded.data.status, 'pending');

  let detail;
  for (let attempt = 0; attempt < 220; attempt += 1) {
    const response = await json(port, 'GET', `/api/materials/${uploaded.data.id}?semesterId=${semesterId}`);
    assert.equal(response.json?.success, true, JSON.stringify(response));
    if (response.json.data.status === 'pending_quality_check') {
      detail = response.json.data;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(detail.status, 'pending_quality_check');
  assert.match(detail.normalizedText.preview, /向量空间/);
  assert.equal(detail.aiRetryCount, 3);
  assert.equal(detail.hasNote, false);
  assert.equal(detail.noteId, undefined);
  assert.equal(detail.knowledgeModuleCount, 0);

  const invalidRetry = await json(port, 'POST', `/api/materials/${uploaded.data.id}/retry-conversion`, { semesterId });
  assert.equal(invalidRetry.status, 400);
  assert.equal(invalidRetry.json.error.code, 'INVALID_STATUS');
});

test('S2 worker runOnce generates notes, modules, list metadata, and study evidence with mock AI', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t07-worker-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  process.env.APP_DATA_ROOT = dataRoot;
  process.env.AI_PROVIDERS = '';
  process.env.AI_API_KEY = '';

  const { initializeSemester } = await import('../dist/db/semester-initializer.js');
  const { StudyRhythmService } = await import('../dist/services/study-rhythm-service.js');
  const { NoteBuilderService } = await import('../dist/services/note-builder-service.js');
  const { MaterialJobWorker, runOnce } = await import('../dist/services/material-job-worker.js');
  const { StorageAdapter } = await import('../dist/adapters/storage.js');

  assert.equal(typeof runOnce, 'function');

  const semester = initializeSemester(
    {
      studentName: 'T07 Worker',
      semesterCode: `t07-worker-${crypto.randomUUID()}`,
      teachingStartDate: '2026-02-20',
      teachingEndDate: '2026-06-30',
    },
    { appDataRoot: dataRoot }
  );
  const course = new StudyRhythmService().createCourse({ semesterId: semester.semesterId, name: '线性代数' });
  const service = new NoteBuilderService();

  await assert.rejects(
    () =>
      service.uploadMaterial({
        semesterId: semester.semesterId,
        courseInstanceId: course.id,
        file: { originalname: 'wrong.txt', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('oops') },
      }),
    { code: 'INVALID_FILE_TYPE' }
  );

  const uploaded = await service.uploadMaterial({
    semesterId: semester.semesterId,
    courseInstanceId: course.id,
    title: '向量空间讲义',
    file: {
      originalname: 'chapter.txt',
      mimetype: 'text/plain',
      size: Buffer.byteLength('向量空间的定义与线性组合。'),
      buffer: Buffer.from('向量空间的定义与线性组合。'),
    },
  });

  const mockAi = {
    name: 'mock-ai',
    async generate(request) {
      assert.equal(request.taskType, 'note_generation');
      assert.match(request.inputText, /向量空间/);
      return {
        content: JSON.stringify({
          markdown: '# 线性代数\n\n## 向量空间\n向量空间的定义与线性组合。',
          highlights: [{ content: '向量空间的定义', importance: 'high', position: '第1段' }],
          mindMap: '# 线性代数\n## 向量空间\n### 线性组合',
          knowledgeModules: [
            {
              title: '向量空间定义',
              contentSummary: '理解向量空间的定义与线性组合。',
              importance: 'high',
              difficulty: 'medium',
              sourceEvidence: '向量空间的定义',
              examRelevance: '常作为概念题考察',
            },
          ],
        }),
        provider: 'mock',
        model: 'mock-note',
        tokenUsed: 120,
        latencyMs: 3,
        fallbackUsed: false,
      };
    },
  };
  const worker = new MaterialJobWorker(service, new StorageAdapter(), mockAi);

  assert.equal(await worker.runOnce(), true);
  assert.equal(await worker.runOnce(), true);

  const detail = service.getMaterial(semester.semesterId, uploaded.id);
  assert.equal(detail.status, 'completed');
  assert.equal(detail.normalizedText.charCount, '向量空间的定义与线性组合。'.length);
  assert.equal(detail.hasNote, true);
  assert.equal(detail.knowledgeModuleCount, 1);
  assert.ok(detail.noteId, 'completed 资料应返回 noteId');

  const materials = service.listMaterials({ semesterId: semester.semesterId, courseInstanceId: course.id });
  assert.equal(materials.items[0].hasNote, true);
  assert.equal(materials.items[0].knowledgeModuleCount, 1);
  assert.equal(materials.items[0].noteId, detail.noteId, '列表与详情返回的 noteId 应一致');

  const modules = service.listKnowledgeModules(semester.semesterId, course.id, { pageSize: 10 });
  assert.equal(modules.pagination.total, 1);
  assert.equal(modules.items[0].sourceEvidence, '向量空间的定义');

  const db = service.openReadySemesterDb(semester.semesterId);
  let noteId;
  let completedEvent;
  try {
    noteId = db.prepare('SELECT id FROM structured_notes WHERE material_id = ?').get(uploaded.id).id;
    completedEvent = db
      .prepare(
        "SELECT event_type, evidence_ref, quality_gate, source_confidence FROM study_events WHERE event_type = 'material_note_completed'"
      )
      .get();
  } finally {
    db.close();
  }

  const note = service.getNote(semester.semesterId, noteId);
  assert.match(note.markdown, /^# 线性代数/);
  assert.match(note.mindMap.data, /^# 线性代数/);
  assert.equal(note.knowledgeModules.length, 1);
  assert.deepEqual(completedEvent, {
    event_type: 'material_note_completed',
    evidence_ref: `material:${uploaded.id}`,
    quality_gate: 'passed',
    source_confidence: 1,
  });

  const port = await startBackend(t, dataRoot);
  const interference = await json(port, 'POST', '/api/study-events', {
    semesterId: semester.semesterId,
    sourceSystem: 'S1',
    eventType: 'study_task_completed',
    title: '干扰事件',
    courseInstanceId: course.id,
  });
  assert.equal(interference.status, 201);
  const timeline = await json(
    port,
    'GET',
    `/api/timeline?semesterId=${semester.semesterId}&eventType=material_note_completed`
  );
  assert.equal(timeline.status, 200);
  assert.equal(timeline.json.data.length, 1);
  const timelineEvent = timeline.json.data[0];
  assert.equal(timelineEvent.sourceSystem, 'S2');
  assert.equal(timelineEvent.courseInstanceId, course.id);
  assert.equal(timelineEvent.evidenceRef, `material:${uploaded.id}`);
  assert.equal(timelineEvent.workloadMinutes, undefined);
  assert.equal(timelineEvent.title, '资料笔记已生成');
  assert.doesNotMatch(timelineEvent.title, /向量空间|线性组合/);

  const updated = service.updateKnowledgeModule({
    semesterId: semester.semesterId,
    id: modules.items[0].id,
    learnStatus: 'learning',
  });
  assert.equal(updated.learnStatus, 'learning');

  const dbAfterUpdate = service.openReadySemesterDb(semester.semesterId);
  try {
    const statusEvent = dbAfterUpdate
      .prepare(
        "SELECT evidence_ref, quality_gate FROM study_events WHERE event_type = 'knowledge_module_status_changed'"
      )
      .get();
    assert.deepEqual(statusEvent, { evidence_ref: `km:${modules.items[0].id}`, quality_gate: 'passed' });
  } finally {
    dbAfterUpdate.close();
  }

  const legacyDb = service.openReadySemesterDb(semester.semesterId);
  try {
    legacyDb.exec('DROP TABLE jobs');
  } finally {
    legacyDb.close();
  }

  const repairedMaterials = service.listMaterials({ semesterId: semester.semesterId, courseInstanceId: course.id });
  assert.equal(repairedMaterials.items.length, 1);
  assert.equal(repairedMaterials.items[0].id, uploaded.id);

  const repairedDb = service.openReadySemesterDb(semester.semesterId);
  try {
    const jobColumns = repairedDb.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
    assert.ok(jobColumns.includes('material_id'));
  } finally {
    repairedDb.close();
  }
});
