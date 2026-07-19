import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

import { createConfigRouter } from '../dist/routes/config-routes.js';

const unconfigured = { status: 'unconfigured', lastVerified: null, summary: null, details: [], errorCode: null };

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
  assert.deepEqual(body.data.ai.details, []);
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

test('configuration presets expose only approved non-secret official metadata', async (t) => {
  const { base } = await createApi(t);
  const response = await fetch(`${base}/presets`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.error, undefined);
  assert.equal(body.data.ai.length, 10);
  assert.deepEqual(body.data.ai.map((preset) => preset.id), [
    'openai', 'claude', 'gemini', 'grok', 'glm', 'kimi', 'deepseek', 'minimax', 'qwen', 'stepfun',
  ]);

  const openai = body.data.ai.find((preset) => preset.id === 'openai');
  assert.deepEqual(openai.modelSuggestions, ['gpt-5.5', 'gpt-5.4', 'gpt-5.6-terra', 'gpt-5.6-luna']);
  assert.equal(openai.defaultModel, 'gpt-5.5');

  const kimi = body.data.ai.find((preset) => preset.id === 'kimi');
  assert.equal(kimi.baseUrl, 'https://api.moonshot.cn/v1');
  assert.deepEqual(kimi.modelSuggestions, ['kimi-k2.7-code', 'kimi-k2.7', 'kimi-k2.6']);
  assert.equal(kimi.defaultModel, 'kimi-k2.7-code');
  assert.doesNotMatch(JSON.stringify(body), new RegExp(`kimi-k${'3'}`, 'i'));

  const grok = body.data.ai.find((preset) => preset.id === 'grok');
  assert.equal(grok.baseUrl, 'https://api.x.ai/v1');
  assert.equal(grok.defaultModel, 'grok-4.3');
  assert.deepEqual(grok.modelSuggestions, ['grok-4.3']);
  const deepseek = body.data.ai.find((preset) => preset.id === 'deepseek');
  assert.equal(deepseek.baseUrl, 'https://api.deepseek.com');
  assert.equal(deepseek.defaultModel, 'deepseek-v4-flash');
  assert.deepEqual(deepseek.modelSuggestions, ['deepseek-v4-flash']);

  const stepfun = body.data.ai.find((preset) => preset.id === 'stepfun');
  assert.equal(stepfun.baseUrl, 'https://api.stepfun.com/v1');
  assert.equal(stepfun.defaultModel, 'step-3.5-flash');
  assert.deepEqual(stepfun.modelSuggestions, ['step-3.5-flash']);
  const claude = body.data.ai.find((preset) => preset.id === 'claude');
  assert.equal(claude.protocol, 'anthropic-native');
  assert.equal(claude.availability, 'coming-soon');

  assert.deepEqual(body.data.smtp, {
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    userHint: '填写 QQ 邮箱账号',
    authCodeHint: '填写 SMTP 授权码，不是 QQ 登录密码',
    recipientHint: '填写收件邮箱',
  });
  assert.match(body.data.feishu.webhookHint, /Webhook/);
  assert.match(body.data.feishu.securityHint, /加密保存在本机/);
  assert.doesNotMatch(JSON.stringify(body), /apiKey|authCode"|webhookUrl|FAKE_T12/i);
});

test('official AI candidates resolve fixed presets and reject unavailable or altered fields', async (t) => {
  const { base, calls } = await createApi(t);
  const activate = async (providers) => fetch(`${base}/ai/test-and-activate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providers }),
  });

  const accepted = await activate([{
    kind: 'official',
    presetId: 'kimi',
    apiKey: 'FAKE_T12_KIMI_KEY',
    model: 'kimi-k2.7-code',
    priority: 1,
  }]);
  assert.equal(accepted.status, 200);
  assert.deepEqual(calls[0].candidate, {
    providers: [{
      name: 'Kimi / Moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: 'FAKE_T12_KIMI_KEY',
      model: 'kimi-k2.7-code',
      priority: 1,
    }],
  });

  for (const [provider, code] of [
    [{ kind: 'official', presetId: 'unknown', apiKey: 'FAKE', model: 'x', priority: 1 }, 'CONFIG_PRESET_INVALID'],
    [{ kind: 'official', presetId: 'claude', apiKey: 'FAKE', model: 'x', priority: 1 }, 'CONFIG_PRESET_UNAVAILABLE'],
    [{ kind: 'official', presetId: 'kimi', apiKey: 'FAKE', model: 'other', priority: 1 }, 'CONFIG_MODEL_INVALID'],
    [{ kind: 'official', presetId: 'kimi', baseUrl: 'https://attacker.invalid', apiKey: 'FAKE', model: 'kimi-k2.7-code', priority: 1 }, 'CONFIG_FIELD_INVALID'],
    [{ kind: 'unsupported-kind', name: 'x', baseUrl: 'https://x.invalid', apiKey: 'FAKE', model: 'm', priority: 1 }, 'CONFIG_FIELD_INVALID'],
  ]) {
    const rejected = await activate([provider]);
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, code);
  }
});
