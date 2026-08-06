import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const VALID_PAYLOAD = {
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
          content: contentBuilder(calls.length),
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

// 共享一次性初始化：由于 dist/config/env.ts 在模块层缓存了 APP_DATA_ROOT，
// 同一进程中所有测试必须共用同一个 dataRoot（每个测试用独立的 semesterId 隔离）。
let shared;
async function ensureShared(t) {
  if (shared) return shared;
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t09-parsing-'));
  process.env.APP_DATA_ROOT = dataRoot;
  process.env.AI_PROVIDERS = '';
  process.env.AI_API_KEY = '';
  const { initializeSemester } = await import('../dist/db/semester-initializer.js');
  const { StudyRhythmService } = await import('../dist/services/study-rhythm-service.js');
  const { NoteBuilderService } = await import('../dist/services/note-builder-service.js');
  const { MaterialJobWorker } = await import('../dist/services/material-job-worker.js');
  const { StorageAdapter } = await import('../dist/adapters/storage.js');
  shared = {
    dataRoot,
    initializeSemester,
    StudyRhythmService,
    NoteBuilderService,
    MaterialJobWorker,
    StorageAdapter,
  };
  return shared;
}

async function setup(t) {
  const { dataRoot, initializeSemester, StudyRhythmService, NoteBuilderService, MaterialJobWorker, StorageAdapter } =
    await ensureShared(t);
  const semester = initializeSemester(
    {
      studentName: 'T09 Parsing',
      semesterCode: `t09-parse-${crypto.randomUUID()}`,
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
      size: Buffer.byteLength('向量空间的定义与线性组合。'),
      buffer: Buffer.from('向量空间的定义与线性组合。'),
    },
  });
  return { service, MaterialJobWorker, StorageAdapter, semesterId: semester.semesterId, materialId: uploaded.id };
}

async function drainConvertAndGenerate(worker, service, semesterId, terminate) {
  // 首次 runOnce 处理 material_convert；note_generate 重试时把 available_at 置为 now+5s。
  // 为了测试不真等 15s，我们在每次 runOnce 返回 false 时把 note_generate 的 available_at 强制拉回当前。
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const progressed = await worker.runOnce();
    if (terminate && terminate()) return;
    if (!progressed) {
      const db = service.openReadySemesterDb(semesterId);
      try {
        db.prepare("UPDATE jobs SET available_at = ? WHERE status = 'pending' AND job_type = 'note_generate'").run(
          new Date().toISOString()
        );
      } finally {
        db.close();
      }
    }
  }
}

async function reachCompleted(worker, service, semesterId, materialId) {
  return drainConvertAndGenerate(worker, service, semesterId, () => {
    const detail = service.getMaterial(semesterId, materialId);
    return detail.status === 'completed' || detail.status === 'pending_quality_check';
  });
}

test('S2 parseAi 接受裸 JSON（回归）', async (t) => {
  const { service, MaterialJobWorker, StorageAdapter, semesterId, materialId } = await setup(t);
  const ai = mockAi(() => JSON.stringify(VALID_PAYLOAD));
  const worker = new MaterialJobWorker(service, new StorageAdapter(), ai.provider);
  await reachCompleted(worker, service, semesterId, materialId);
  const detail = service.getMaterial(semesterId, materialId);
  assert.equal(detail.status, 'completed');
  assert.equal(detail.hasNote, true);
  assert.equal(detail.knowledgeModuleCount, 1);
  assert.equal(ai.calls.length, 1, '成功路径不应重试');
});

test('S2 parseAi 接受带 ```json 围栏的输出', async (t) => {
  const { service, MaterialJobWorker, StorageAdapter, semesterId, materialId } = await setup(t);
  const ai = mockAi(() => '```json\n' + JSON.stringify(VALID_PAYLOAD) + '\n```');
  const worker = new MaterialJobWorker(service, new StorageAdapter(), ai.provider);
  await reachCompleted(worker, service, semesterId, materialId);
  const detail = service.getMaterial(semesterId, materialId);
  assert.equal(detail.status, 'completed', '围栏 JSON 应可解析并完成');
  assert.equal(detail.knowledgeModuleCount, 1);
  assert.equal(ai.calls.length, 1);
});

test('S2 parseAi 接受「前置解说 + JSON」组合', async (t) => {
  const { service, MaterialJobWorker, StorageAdapter, semesterId, materialId } = await setup(t);
  const ai = mockAi(() => '好的，以下是根据资料生成的笔记：\n\n' + JSON.stringify(VALID_PAYLOAD) + '\n\n希望有帮助。');
  const worker = new MaterialJobWorker(service, new StorageAdapter(), ai.provider);
  await reachCompleted(worker, service, semesterId, materialId);
  const detail = service.getMaterial(semesterId, materialId);
  assert.equal(detail.status, 'completed', '前置解说 + JSON 应可解析并完成');
  assert.equal(detail.hasNote, true);
});

test('S2 彻底非 JSON 输出：3 次重试后进入 pending_quality_check，error_summary 不含原始正文', async (t) => {
  const { service, MaterialJobWorker, StorageAdapter, semesterId, materialId } = await setup(t);
  const RAW = '我认为学习就是要多做题，不要死记硬背，加油！';
  const ai = mockAi(() => RAW);
  const worker = new MaterialJobWorker(service, new StorageAdapter(), ai.provider);
  await reachCompleted(worker, service, semesterId, materialId);
  const detail = service.getMaterial(semesterId, materialId);
  assert.equal(detail.status, 'pending_quality_check');
  assert.equal(detail.hasNote, false);
  assert.equal(detail.knowledgeModuleCount, 0);
  assert.equal(detail.aiRetryCount, 3, '非 JSON 应耗尽 3 次生成重试');
  assert.match(detail.normalizedText.preview, /向量空间/);
  // 从数据库直接读 ai_generation_error_message 断言不含原始正文
  const db = service.openReadySemesterDb(semesterId);
  try {
    const row = db.prepare('SELECT ai_generation_error_message FROM materials WHERE id = ?').get(materialId);
    const errorSummary = String(row?.ai_generation_error_message ?? '');
    assert.ok(errorSummary.length > 0, 'error_summary 应有内容');
    assert.ok(!errorSummary.includes('死记硬背'), `error_summary 泄漏了原始正文：${errorSummary}`);
    assert.ok(!errorSummary.includes('加油'), `error_summary 泄漏了原始正文：${errorSummary}`);
  } finally {
    db.close();
  }
});

// 关键场景：AI 返回「以 { 开头、能通过 sanitize gate、但 JSON.parse 失败」的畸形 JSON，
// 且该畸形 JSON 中嵌入了「疑似 API Key / 敏感哨兵」。修复前 parseAi 里
// `AI 输出无法解析为 JSON：${cause}` 会把 V8 SyntaxError 的 message 拼进 error_summary，
// 而 V8 message 常回显畸形位置附近的原文（例如 `Unexpected token 's', "…sk-DEAD… " is not valid JSON`）。
// 修复后错误消息必须是固定字符串，不含任何来自运行时 cause 的字符。
test('S2 畸形 JSON 含敏感哨兵时，error_summary 不得回显运行时 cause', async (t) => {
  const { service, MaterialJobWorker, StorageAdapter, semesterId, materialId } = await setup(t);
  const SENTINEL = 'sk-DEADBEEF-DO-NOT-LEAK-42';
  // 以 { 开头、} 结尾——sanitize 会当成疑似 JSON 交给 JSON.parse；未加引号的 sk-... 会触发 SyntaxError。
  const MALFORMED = `{ "apiKey": ${SENTINEL}, "note": 缺失结束引号 }`;
  const ai = mockAi(() => MALFORMED);
  const worker = new MaterialJobWorker(service, new StorageAdapter(), ai.provider);
  await reachCompleted(worker, service, semesterId, materialId);
  const detail = service.getMaterial(semesterId, materialId);
  assert.equal(detail.status, 'pending_quality_check');
  assert.equal(detail.aiRetryCount, 3);

  const db = service.openReadySemesterDb(semesterId);
  try {
    const row = db.prepare('SELECT ai_generation_error_message FROM materials WHERE id = ?').get(materialId);
    const errorSummary = String(row?.ai_generation_error_message ?? '');
    assert.ok(errorSummary.length > 0);
    // 哨兵及其明显子串都不得出现。
    assert.ok(!errorSummary.includes(SENTINEL), `error_summary 泄漏了完整哨兵：${errorSummary}`);
    assert.ok(!errorSummary.includes('sk-DEAD'), `error_summary 泄漏了哨兵前缀：${errorSummary}`);
    assert.ok(!errorSummary.includes('DEADBEEF'), `error_summary 泄漏了哨兵指纹：${errorSummary}`);
    // 中文关键片段（未闭合引号旁的原文）也不得回显。
    assert.ok(!errorSummary.includes('缺失结束引号'), `error_summary 回显了畸形位置附近的原文：${errorSummary}`);
    // V8 SyntaxError 的常见片段（"Unexpected token" / "is not valid JSON" / 数字位置）都不得回显。
    assert.ok(!/Unexpected token/i.test(errorSummary), `error_summary 泄漏了 V8 诊断字符串：${errorSummary}`);
    assert.ok(!/is not valid JSON/i.test(errorSummary), `error_summary 泄漏了 V8 诊断字符串：${errorSummary}`);
    assert.ok(!/position\s*\d+/i.test(errorSummary), `error_summary 回显了运行时字符位置：${errorSummary}`);
  } finally {
    db.close();
  }
});
