import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-app-'));
process.env.APP_DATA_ROOT = dataRoot;
test.after(() => rm(dataRoot, { recursive: true, force: true }));
const { createApp } = await import('../dist/app.js');
const { bootstrapBackend } = await import('../dist/bootstrap.js');

const unconfigured = { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null };
const service = {
  getAllStatus: () => ({
    ai: unconfigured,
    smtp: unconfigured,
    feishu: unconfigured,
    runtime: {
      dataDir: true,
      aiAvailable: false,
      smtpAvailable: false,
      feishuAvailable: false,
      uptime: 1,
      nodeVersion: 'v22.test',
    },
  }),
  getActiveSnapshot: () => null,
  testAndActivate: async () => ({ activated: false, test: { pass: false } }),
  retest: async () => null,
};

test('createApp protects every API route and exposes config status to allowed origins', async (t) => {
  const app = createApp({ configurationService: service, allowedOriginsRaw: undefined, enableDevRoutes: false });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const rejected = await fetch(`${base}/api/health`, { headers: { Origin: 'http://evil.example' } });
  assert.equal(rejected.status, 403);
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).data.version, '0.8.1');
  const accepted = await fetch(`${base}/api/config/status`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).data.ai.status, 'unconfigured');
});

test('bootstrap waits for configuration before listen and starts worker only after listening', async () => {
  const order = [];
  const fakeServer = {
    close(callback) {
      callback?.();
    },
  };
  const fakeApp = {
    listen(_port, _host, callback) {
      order.push('listen');
      callback();
      return fakeServer;
    },
  };
  const worker = {
    startPolling() {
      order.push('worker');
      return { fake: true };
    },
    stopPolling() {},
  };

  const startupLogs = [];
  await bootstrapBackend({
    initializeConfiguration: async () => {
      order.push('config-start');
      await Promise.resolve();
      order.push('config-end');
      return service;
    },
    createApplication: () => {
      order.push('app');
      return fakeApp;
    },
    createWorker: () => worker,
    port: 3000,
    host: '127.0.0.1',
    log: (message) => startupLogs.push(message),
  });

  assert.deepEqual(order, ['config-start', 'config-end', 'app', 'listen', 'worker']);
  assert.equal(existsSync(path.join(dataRoot, 'studybuddy.db')), true, 'empty data root must initialize the global database');
  assert.ok(startupLogs.includes('[DATABASE] STARTUP_GLOBAL_INITIALIZED'), 'first start must log explicit global database initialization');
  assert.equal(startupLogs.some((message) => message.includes('STARTUP_INTEGRITY_ALL_FAILED')), false);
});

