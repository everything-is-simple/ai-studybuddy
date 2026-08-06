import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) throw new Error('failed to allocate a free port');
  return port;
}

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-s7-api-'));
  const port = await getFreePort();
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      NODE_ENV: 'test',
      AI_PROVIDERS: '',
      AI_API_KEY: '',
      LOCAL_ASR_WHISPER_CLI_PATH: '',
      LOCAL_ASR_WHISPER_MODEL_PATH: '',
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
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return { port, dataRoot };
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

async function seedCourse(port) {
  const initialized = await json(port, 'POST', '/api/dev/init-semester', {
    studentName: 'S7 Test',
    semesterCode: `s7-${crypto.randomUUID()}`,
    teachingStartDate: '2026-02-20',
    teachingEndDate: '2026-06-30',
  });
  assert.equal(initialized.status, 200);
  const semesterId = initialized.json.data.semesterId;
  const course = await json(port, 'POST', '/api/courses', { semesterId, name: '语文' });
  assert.equal(course.status, 201);
  return { semesterId, courseInstanceId: course.json.data.id };
}

function canonicalWav() {
  const data = Buffer.alloc(320, 1);
  const buffer = Buffer.alloc(44 + data.length);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(data.length, 40);
  data.copy(buffer, 44);
  return buffer;
}

async function transcribe(port, fields, file = canonicalWav()) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append('file', new Blob([file], { type: 'audio/wav' }), 'lesson.wav');
  const response = await fetch(`http://127.0.0.1:${port}/api/class-captures/transcribe`, {
    method: 'POST',
    body: form,
  });
  return { status: response.status, json: await response.json() };
}

test('S7-MVP requires recording permission before it attempts transcription', async (t) => {
  const { port } = await startBackend(t);
  const { semesterId, courseInstanceId } = await seedCourse(port);
  const response = await transcribe(port, {
    semesterId,
    courseInstanceId,
    title: '课堂录音',
    permissionConfirmed: 'false',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(response.json, {
    success: false,
    error: { code: 'CLASS_CAPTURE_PERMISSION_REQUIRED', message: '请先确认课堂录音已获得相关人员允许' },
  });
});

test('S7-MVP validates WAV contract, and returns runtime unavailable only for a canonical WAV', async (t) => {
  const { port } = await startBackend(t);
  const { semesterId, courseInstanceId } = await seedCourse(port);
  const invalid = await transcribe(
    port,
    { semesterId, courseInstanceId, title: '课堂录音', permissionConfirmed: 'true' },
    Buffer.from('not wav')
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, 'ASR_INVALID_AUDIO_FORMAT');

  const unavailable = await transcribe(port, {
    semesterId,
    courseInstanceId,
    title: '课堂录音',
    permissionConfirmed: 'true',
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.json.error.code, 'ASR_RUNTIME_UNAVAILABLE');
});

test('S7-MVP saves only confirmed text as an S2 material and queues no work until explicit generation', async (t) => {
  const { port } = await startBackend(t);
  const { semesterId, courseInstanceId } = await seedCourse(port);
  const save = await json(port, 'POST', '/api/class-captures/save-to-notes', {
    semesterId,
    courseInstanceId,
    title: '第三章课堂整理',
    permissionConfirmed: true,
    text: '这是学生修改确认后的课堂转写文本。',
  });
  assert.equal(save.status, 201);
  assert.equal(save.json.success, true);
  assert.equal(save.json.data.material.fileType, 'text');
  assert.equal(save.json.data.material.status, 'converted');
  assert.match(save.json.data.material.originalFilename, /第三章课堂整理\.txt/);

  const detail = await json(port, 'GET', `/api/materials/${save.json.data.material.id}?semesterId=${semesterId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.data.normalizedText.charCount, '这是学生修改确认后的课堂转写文本。'.length);
  assert.equal(detail.json.data.normalizedText.metadata.converter, 'class_capture');
  assert.equal(detail.json.data.aiRetryCount, 0);
  assert.equal(detail.json.data.conversionRetryCount, 0);

  const generate = await json(port, 'POST', `/api/materials/${save.json.data.material.id}/generate-note`, {
    semesterId,
  });
  assert.equal(generate.status, 200);
  assert.equal(generate.json.success, true);
});
