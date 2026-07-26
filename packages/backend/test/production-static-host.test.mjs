import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-static-host-'));
const staticRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-static-public-'));
await mkdir(path.join(staticRoot, 'assets'));
await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><html><body>AI StudyBuddy</body></html>');
await writeFile(path.join(staticRoot, 'assets', 'app.txt'), 'asset-ok');
process.env.APP_DATA_ROOT = dataRoot;
const { createApp } = await import('../dist/app.js');
const service = {
  getAllStatus: () => ({ ai: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null }, smtp: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null }, feishu: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null }, runtime: { dataDir: true, aiAvailable: false, smtpAvailable: false, feishuAvailable: false, uptime: 1, nodeVersion: 'test' } }),
  getActiveSnapshot: () => null,
  testAndActivate: async () => ({ activated: false, test: { pass: false } }),
  retest: async () => null,
};
const app = createApp({ configurationService: service, staticRoot, enableDevRoutes: false });
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataRoot, { recursive: true, force: true });
  await rm(staticRoot, { recursive: true, force: true });
});

test('production host serves assets and SPA fallback while preserving API JSON', async () => {
  const asset = await fetch(`${base}/assets/app.txt`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'asset-ok');
  const deepLink = await fetch(`${base}/courses/current/workbench`);
  assert.equal(deepLink.status, 200);
  assert.match(await deepLink.text(), /AI StudyBuddy/);
  const missingApi = await fetch(`${base}/api/not-a-route`);
  assert.equal(missingApi.status, 404);
  assert.deepEqual((await missingApi.json()).error.code, 'NOT_FOUND');
});

test('createApp without staticRoot keeps API-only behavior', async () => {
  const apiOnly = http.createServer(createApp({ configurationService: service, enableDevRoutes: false }));
  await new Promise((resolve) => apiOnly.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${apiOnly.address().port}/some-page`);
  assert.equal(response.status, 404);
  await new Promise((resolve) => apiOnly.close(resolve));
});
