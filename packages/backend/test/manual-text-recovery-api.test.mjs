import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');
let nextPort = 49300;

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t10-api-'));
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
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    studentName: 'T10 API',
    semesterCode: `t10-api-${crypto.randomUUID()}`,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
  });
  assert.equal(response.status, 200);
  return response.json.data.semesterId;
}

async function uploadText(port, semesterId, courseInstanceId, filename, content) {
  const form = new FormData();
  form.append('semesterId', semesterId);
  form.append('courseInstanceId', courseInstanceId);
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  const response = await fetch(`http://127.0.0.1:${port}/api/materials/upload`, { method: 'POST', body: form });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  return body.data;
}

async function waitForMaterialStatus(port, semesterId, materialId, targetStatus) {
  for (let attempt = 0; attempt < 220; attempt += 1) {
    const response = await json(port, 'GET', `/api/materials/${materialId}?semesterId=${semesterId}`);
    assert.equal(response.json?.success, true, JSON.stringify(response));
    if (response.json.data.status === targetStatus) return response.json.data;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`material did not reach ${targetStatus}`);
}

test('S2 replace-text API restores pending_quality_check with manual full text', async (t) => {
  const port = await startBackend(t);
  const semesterId = await readySemester(port);
  const course = await json(port, 'POST', '/api/courses', { semesterId, name: '线性代数' });
  assert.equal(course.status, 201);
  const courseInstanceId = course.json.data.id;

  const uploaded = await uploadText(port, semesterId, courseInstanceId, 'chapter.txt', '旧正文：向量空间的定义。');
  const failed = await waitForMaterialStatus(port, semesterId, uploaded.id, 'pending_quality_check');
  assert.match(failed.normalizedText.preview, /旧正文/);

  const replacementText = '人工补文后的完整正文：向量空间、线性组合与基底。';
  const replaced = await json(port, 'POST', `/api/materials/${uploaded.id}/replace-text`, {
    semesterId,
    text: replacementText,
  });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.json.success, true);
  assert.equal(replaced.json.data.status, 'converted');
  assert.equal(replaced.json.data.jobStatus, 'pending');

  const detail = await json(port, 'GET', `/api/materials/${uploaded.id}?semesterId=${semesterId}`);
  assert.equal(detail.status, 200);
  assert.match(detail.json.data.normalizedText.preview, /人工补文后的完整正文/);
  assert.equal(detail.json.data.normalizedText.metadata.converter, 'manual');
  assert.equal(detail.json.data.normalizedText.metadata.recoveryFrom, 'pending_quality_check');
  assert.ok(detail.json.data.normalizedText.metadata.recoveredAt);

  const pendingUpload = await uploadText(port, semesterId, courseInstanceId, 'pending.txt', '刚上传还在等待转换。');
  const invalid = await json(port, 'POST', `/api/materials/${pendingUpload.id}/replace-text`, {
    semesterId,
    text: '不应允许覆盖 pending 正文',
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.success, false);
  assert.equal(invalid.json.error.code, 'INVALID_STATUS');
});
