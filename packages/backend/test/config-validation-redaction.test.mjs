import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

import { createConfigRouter } from '../dist/routes/config-routes.js';

const syntheticSecrets = [
  'phase3-t02c-api-key-sentinel',
  'https://phase3-t02c-provider.invalid/v1',
  'phase3-t02c-smtp-user-sentinel@example.invalid',
  'phase3-t02c-smtp-auth-sentinel',
  'phase3-t02c-smtp-to-sentinel@example.invalid',
  'https://phase3-t02c-webhook.invalid/open-robot/send?token=secret',
];

function assertNoSyntheticSecret(text) {
  for (const secret of syntheticSecrets) {
    assert.doesNotMatch(text, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
}

async function createApi(t, overrides = {}) {
  const service = {
    getAllStatus: () => ({ ai: {}, smtp: {}, feishu: {}, runtime: {} }),
    getActiveSnapshot: () => null,
    testAndActivate: async () => ({ activated: false, test: { pass: false } }),
    retest: async () => null,
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/config', createConfigRouter(service));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/config`;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, text: await response.text() };
}

test('config validation errors expose fixed codes without provider, smtp, or webhook values', async (t) => {
  const base = await createApi(t);
  const cases = [
    [`${base}/ai/test-and-activate`, {
      providers: [{ kind: 'custom', name: 'p', baseUrl: 'ftp://phase3-t02c-provider.invalid/v1', apiKey: 'phase3-t02c-api-key-sentinel', model: 'm', priority: 1 }],
    }, 'CONFIG_URL_INVALID'],
    [`${base}/smtp/test-and-activate`, {
      host: 'smtp.phase3-t02c.invalid', port: 70000, secure: true, user: 'phase3-t02c-smtp-user-sentinel@example.invalid', authCode: 'phase3-t02c-smtp-auth-sentinel', to: 'phase3-t02c-smtp-to-sentinel@example.invalid',
    }, 'CONFIG_SMTP_PORT_INVALID'],
    [`${base}/feishu/test-and-activate`, {
      webhookUrl: 'http://phase3-t02c-webhook.invalid/open-robot/send?token=secret',
    }, 'CONFIG_URL_INVALID'],
  ];

  for (const [url, body, code] of cases) {
    const { response, text } = await postJson(url, body);
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(text).error.code, code);
    assert.equal(JSON.parse(text).error.message, '配置字段无效');
    assertNoSyntheticSecret(text);
    assert.doesNotMatch(text, /stack|SyntaxError|ValidationError|raw|process\.env/i);
  }
});
test('connection test failures keep fixed sanitized summaries only', async (t) => {
  const base = await createApi(t, {
    testAndActivate: async (channel) => ({
      activated: false,
      test: {
        pass: false,
        errorCode: channel === 'ai' ? 'AI_AUTH_FAILED' : channel === 'smtp' ? 'SMTP_AUTH_FAILED' : 'FEISHU_WEBHOOK_REJECTED',
        sanitizedMessage: channel === 'ai' ? 'AI Provider 身份验证失败' : channel === 'smtp' ? 'SMTP 身份验证失败' : '飞书 Webhook 拒绝了测试请求',
      },
    }),
  });
  const requests = [
    [`${base}/ai/test-and-activate`, { providers: [{ kind: 'custom', name: 'p', baseUrl: 'https://phase3-t02c-provider.invalid/v1', apiKey: 'phase3-t02c-api-key-sentinel', model: 'm', priority: 1 }] }],
    [`${base}/smtp/test-and-activate`, { host: 'smtp.phase3-t02c.invalid', port: 465, secure: true, user: 'phase3-t02c-smtp-user-sentinel@example.invalid', authCode: 'phase3-t02c-smtp-auth-sentinel', to: 'phase3-t02c-smtp-to-sentinel@example.invalid' }],
    [`${base}/feishu/test-and-activate`, { webhookUrl: 'https://phase3-t02c-webhook.invalid/open-robot/send?token=secret' }],
  ];

  for (const [url, body] of requests) {
    const { response, text } = await postJson(url, body);
    assert.equal(response.status, 422);
    const parsed = JSON.parse(text);
    assert.equal(parsed.success, false);
    assert.match(parsed.error.code, /^(AI_AUTH_FAILED|SMTP_AUTH_FAILED|FEISHU_WEBHOOK_REJECTED)$/);
    assertNoSyntheticSecret(text);
    assert.doesNotMatch(text, /stack|process\.env|err\.message/i);
  }
});
