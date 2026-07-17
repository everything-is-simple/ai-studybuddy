import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

import { createConfigRouter } from '../dist/routes/config-routes.js';

const unconfigured = { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null };

async function createApi(t, overrides = {}) {
  const calls = [];
  const service = {
    getAllStatus: () => ({
      ai: unconfigured, smtp: unconfigured, feishu: unconfigured,
      runtime: { dataDir: true, aiAvailable: false, smtpAvailable: false, feishuAvailable: false, uptime: 1, nodeVersion: 'v22.test' },
    }),
    getActiveSnapshot: () => null,
    testAndActivate: async (channel, candidate, options) => {
      calls.push({ channel, candidate, options });
      return { activated: true, test: { pass: true } };
    },
    retest: async () => null,
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/config', createConfigRouter(service));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}/api/config`, calls };
}

test('config status is returned without secret fields or paths', async (t) => {
  const { base } = await createApi(t);
  const response = await fetch(`${base}/status`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.runtime.dataDir, true);
  assert.doesNotMatch(JSON.stringify(body), /apiKey|authCode|webhookUrl|APP_DATA_ROOT/);
});

test('AI activation sanitizes controls, validates limits, and stable-sorts priorities', async (t) => {
  const { base, calls } = await createApi(t);
  const response = await fetch(`${base}/ai/test-and-activate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      providers: [
        { name: 'second\u0000', baseUrl: 'https://second.invalid/v1', apiKey: 'k2', model: 'm2\u0007', priority: 2 },
        { name: 'first-a', baseUrl: 'http://localhost:11434/v1', apiKey: 'k1', model: 'm1', priority: 1 },
        { name: 'first-b', baseUrl: 'https://first.invalid/v1', apiKey: 'k3', model: 'm3', priority: 1 },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].candidate.providers.map((item) => item.name), ['first-a', 'first-b', 'second']);
  assert.equal(calls[0].candidate.providers[2].model, 'm2');

  const tooMany = await fetch(`${base}/ai/test-and-activate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providers: Array.from({ length: 11 }, (_, index) => ({ name: `p${index}`, baseUrl: 'https://x.invalid', apiKey: 'k', model: 'm', priority: 1 })) }),
  });
  assert.equal(tooMany.status, 400);
  assert.equal((await tooMany.json()).error.code, 'CONFIG_PROVIDER_COUNT_INVALID');
});

test('config API rejects invalid channels, fields, protocols, and non-JSON writes', async (t) => {
  const { base } = await createApi(t);
  const cases = [
    [`${base}/unknown/test-and-activate`, { value: true }, 'CONFIG_CHANNEL_INVALID'],
    [`${base}/smtp/test-and-activate`, { host: 'h', port: 70000, secure: true, user: 'u', authCode: 'a', to: 'a@b' }, 'CONFIG_SMTP_PORT_INVALID'],
    [`${base}/feishu/test-and-activate`, { webhookUrl: 'http://example.invalid/hook' }, 'CONFIG_URL_INVALID'],
    [`${base}/ai/test-and-activate`, { providers: [{ name: 'x'.repeat(51), baseUrl: 'https://x.invalid', apiKey: 'k', model: 'm', priority: 1 }] }, 'CONFIG_FIELD_TOO_LONG'],
    [`${base}/ai/test-and-activate`, { providers: [{ name: 'p', baseUrl: 'http://remote.invalid', apiKey: 'k', model: 'm', priority: 1 }] }, 'CONFIG_URL_INVALID'],
  ];
  for (const [url, body, code] of cases) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, code);
  }

  const form = await fetch(`${base}/smtp/test-and-activate`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'authCode=DO-NOT-LEAK',
  });
  assert.equal(form.status, 415);
  const formBody = await form.json();
  assert.equal(formBody.error.code, 'CONFIG_UNSUPPORTED_CONTENT_TYPE');
  assert.doesNotMatch(JSON.stringify(formBody), /DO-NOT-LEAK|urlencoded/);
});

test('failed activation is returned sanitized and retest without active is 404', async (t) => {
  const { base } = await createApi(t, {
    testAndActivate: async () => ({
      activated: false,
      test: { pass: false, errorCode: 'AI_AUTH_FAILED', sanitizedMessage: 'AI Provider 身份验证失败' },
    }),
  });
  const failed = await fetch(`${base}/ai/test-and-activate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providers: [{ name: 'p', baseUrl: 'https://x.invalid', apiKey: 'secret', model: 'm', priority: 1 }] }),
  });
  assert.equal(failed.status, 422);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /secret|x\.invalid/);

  const retest = await fetch(`${base}/ai/retest`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(retest.status, 404);
  assert.equal((await retest.json()).error.code, 'CONFIG_NOT_FOUND');
});
