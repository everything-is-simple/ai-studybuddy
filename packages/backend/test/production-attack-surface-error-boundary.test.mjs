import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import multer from 'multer';

const backendDir = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(backendDir, '../..');
let nextPort = 59400;

async function startBackend(t, nodeEnv) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-phase3-t02a-'));
  const port = nextPort++;
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      NODE_ENV: nodeEnv,
      AI_PROVIDERS: '',
      AI_API_KEY: '',
      AI_BASE_URL: '',
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    child.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return `http://127.0.0.1:${port}`;
    } catch {
      // Wait for the isolated backend process to listen.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('built backend did not become healthy');
}

function assertSafeNotFound(response, text) {
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  const body = JSON.parse(text);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(body.error.message, '未找到请求的接口');
  assert.equal(body.data, undefined);
  assert.doesNotMatch(text, /stack|node_modules|H:\\|\/home\/|\/tmp\/|phase3-t02a-sentinel/i);
}

test('production process does not expose development routers', async (t) => {
  const base = await startBackend(t, 'production');
  const requests = [
    ['/api/dev/db-health', {}],
    ['/api/dev/storage/exists?key=phase3-t02a-sentinel', {}],
    ['/api/dev/converter/text', { method: 'POST' }],
    ['/api/dev/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
  ];

  for (const [route, options] of requests) {
    const response = await fetch(`${base}${route}`, options);
    assertSafeNotFound(response, await response.text());
  }
});

test('test process retains development diagnostics', async (t) => {
  const base = await startBackend(t, 'test');
  const response = await fetch(`${base}/api/dev/db-health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('development process retains development diagnostics', async (t) => {
  const base = await startBackend(t, 'development');
  const response = await fetch(`${base}/api/dev/db-health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('malformed JSON is returned as a safe JSON API error', async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-phase3-t02a-app-'));
  process.env.APP_DATA_ROOT = dataRoot;
  const { createApp } = await import('../dist/app.js');
  const service = {
    getAllStatus: () => ({ ai: {}, smtp: {}, feishu: {}, runtime: {} }),
    getActiveSnapshot: () => null,
    testAndActivate: async () => ({ activated: false, test: { pass: false } }),
    retest: async () => null,
  };
  const server = http.createServer(createApp({ configurationService: service, enableDevRoutes: false }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/config/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad-json',
    });
    const text = await response.text();
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(JSON.parse(text).error.code, 'INVALID_JSON');
    assert.doesNotMatch(text, /SyntaxError|stack|bad-json/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test('unknown errors use a fixed response without internal details', async () => {
  const { apiErrorHandler } = await import('../dist/middleware/api-error-handler.js');
  const app = express();
  app.get('/api/fail', () => {
    throw new Error('SECRET_INTERNAL_PATH H:\\private\\student.txt');
  });
  app.use(apiErrorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/fail`);
    const text = await response.text();
    assert.equal(response.status, 500);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(JSON.parse(text).error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(text, /SECRET_INTERNAL_PATH|H:\\private|student\.txt|stack/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('known safe application errors preserve only their allowed contract', async () => {
  const { SafeApiError, apiErrorHandler } = await import('../dist/middleware/api-error-handler.js');
  const app = express();
  app.get('/api/invalid', () => {
    throw new SafeApiError('BAD_REQUEST');
  });
  app.use(apiErrorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/invalid`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'BAD_REQUEST', message: '请求参数无效' },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unhandled Multer limits use the safe API error boundary', async () => {
  const { apiErrorHandler } = await import('../dist/middleware/api-error-handler.js');
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 } });
  app.post('/api/upload', upload.single('file'), (_req, res) => res.status(204).end());
  app.use(apiErrorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const form = new FormData();
    form.set('file', new Blob(['too-large']), 'sample.txt');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/upload`, {
      method: 'POST',
      body: form,
    });
    const text = await response.text();
    assert.equal(response.status, 413);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(JSON.parse(text).error.code, 'FILE_TOO_LARGE');
    assert.doesNotMatch(text, /MulterError|LIMIT_FILE_SIZE|sample\.txt|stack/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('production startup script fixes the Node process mode before it starts the backend', async () => {
  const script = await readFile(path.join(repositoryRoot, 'scripts', 'start-production.ps1'), 'utf8');
  assert.match(script, /Assert-AIStudyBuddyLoopbackHost\s*\r?\n\$env:NODE_ENV = 'production'/);
  assert.match(script, /Start-Process[\s\S]*-FilePath 'node'/);
});
