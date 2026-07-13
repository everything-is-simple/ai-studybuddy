import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-api-'));
  // 独立端口区间，避免与其他并发起后端的测试文件端口冲突（EADDRINUSE）
  const port = 45000 + Math.floor(Math.random() * 3000);
  const processHandle = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
    },
    stdio: 'ignore',
  });

  t.after(async () => {
    processHandle.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  // 100 次 × 100ms = 10s 预算，容忍多测试文件并发起后端时的 CPU 竞争
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return { dataRoot, port };
    } catch {
      // 后端尚未开始监听，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('built backend did not become healthy');
}

function buildForm(filename, content) {
  const form = new FormData();
  form.append('semesterId', 'sem-t03');
  form.append('courseId', 'course-t03');
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  return form;
}

test('dev storage upload and download roundtrip', async (t) => {
  const backend = await startBackend(t);
  const base = `http://127.0.0.1:${backend.port}/api/dev/storage`;
  const content = 'dev storage roundtrip content 中文';

  const uploadResponse = await fetch(`${base}/upload`, {
    method: 'POST',
    body: buildForm('roundtrip.txt', content),
  });
  assert.equal(uploadResponse.status, 200);
  const uploadJson = await uploadResponse.json();
  assert.equal(uploadJson.success, true);
  const { storageKey, size } = uploadJson.data;
  assert.ok(storageKey.startsWith('semesters/sem-t03/files/course-t03/'));
  assert.equal(size, Buffer.byteLength(content, 'utf8'));

  const downloadResponse = await fetch(`${base}/download?key=${encodeURIComponent(storageKey)}`);
  assert.equal(downloadResponse.status, 200);
  const downloaded = await downloadResponse.text();
  assert.equal(downloaded, content);

  const existsResponse = await fetch(`${base}/exists?key=${encodeURIComponent(storageKey)}`);
  assert.equal(existsResponse.status, 200);
  const existsJson = await existsResponse.json();
  assert.equal(existsJson.data.exists, true);

  const deleteResponse = await fetch(`${base}/delete?key=${encodeURIComponent(storageKey)}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 200);

  const afterDelete = await fetch(`${base}/exists?key=${encodeURIComponent(storageKey)}`);
  assert.equal((await afterDelete.json()).data.exists, false);
});

test('dev storage download returns 404 for missing key', async (t) => {
  const backend = await startBackend(t);
  const url = `http://127.0.0.1:${backend.port}/api/dev/storage/download?key=${encodeURIComponent(
    'semesters/missing/files/common/00000000-0000-4000-8000-000000000000.txt'
  )}`;
  const response = await fetch(url);
  assert.equal(response.status, 404);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'STORAGE_KEY_NOT_FOUND');
});

test('dev storage rejects path escape attempts', async (t) => {
  const backend = await startBackend(t);
  const base = `http://127.0.0.1:${backend.port}/api/dev/storage`;

  const downloadResponse = await fetch(`${base}/download?key=${encodeURIComponent('../etc/passwd')}`);
  assert.equal(downloadResponse.status, 400);
  const json = await downloadResponse.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'STORAGE_PATH_ESCAPE');
});

test('dev storage rejects keys outside the managed files layout', async (t) => {
  const backend = await startBackend(t);
  const base = `http://127.0.0.1:${backend.port}/api/dev/storage`;

  const response = await fetch(`${base}/download?key=${encodeURIComponent('studybuddy.db')}`);
  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'STORAGE_PATH_ESCAPE');
});

test('dev storage returns a JSON 413 when an upload exceeds the file limit', async (t) => {
  const backend = await startBackend(t);
  const form = new FormData();
  form.append('semesterId', 'sem-t03');
  form.append('file', new Blob([Buffer.alloc(50 * 1024 * 1024 + 1)]), 'too-large.bin');

  const response = await fetch(`http://127.0.0.1:${backend.port}/api/dev/storage/upload`, {
    method: 'POST',
    body: form,
  });

  assert.equal(response.status, 413);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'FILE_TOO_LARGE');
});
