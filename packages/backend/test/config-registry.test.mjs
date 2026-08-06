import assert from 'node:assert/strict';
import test from 'node:test';

import { AiRouterProxy } from '../dist/adapters/ai/ai-router-proxy.js';
import {
  clearConfigRegistry,
  getCurrentFeishuConfig,
  getCurrentSmtpConfig,
  setAiRouter,
  setFeishuConfig,
  setSmtpConfig,
} from '../dist/config/config-registry.js';

const request = { taskType: 'error_analysis', inputText: 'test' };

test.beforeEach(() => clearConfigRegistry());

test('AiRouterProxy returns AI_NOT_CONFIGURED when no router is active', async () => {
  const proxy = new AiRouterProxy();

  await assert.rejects(proxy.generate(request), { code: 'AI_NOT_CONFIGURED' });
});

test('AiRouterProxy reuses the active router and switches new requests atomically', async () => {
  const calls = [];
  const first = {
    generate: async () => {
      calls.push('first');
      return { content: 'first', provider: 'first', model: 'm1', latencyMs: 1, fallbackUsed: false };
    },
  };
  const second = {
    generate: async () => {
      calls.push('second');
      return { content: 'second', provider: 'second', model: 'm2', latencyMs: 1, fallbackUsed: false };
    },
  };
  const proxy = new AiRouterProxy();
  setAiRouter(first);

  await proxy.generate(request);
  await proxy.generate(request);
  setAiRouter(second);
  const result = await proxy.generate(request);

  assert.deepEqual(calls, ['first', 'first', 'second']);
  assert.equal(result.content, 'second');
});

test('an in-flight proxy request keeps its original router after activation changes', async () => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const first = {
    async generate() {
      await blocked;
      return { content: 'old', provider: 'old', model: 'old', latencyMs: 1, fallbackUsed: false };
    },
  };
  const second = {
    async generate() {
      return { content: 'new', provider: 'new', model: 'new', latencyMs: 1, fallbackUsed: false };
    },
  };
  const proxy = new AiRouterProxy();
  setAiRouter(first);
  const inFlight = proxy.generate(request);
  setAiRouter(second);
  const newRequest = await proxy.generate(request);
  release();

  assert.equal((await inFlight).content, 'old');
  assert.equal(newRequest.content, 'new');
});

test('SMTP and Feishu registry snapshots cannot be mutated by callers', () => {
  const smtp = { host: 'smtp.qq.com', port: 465, secure: true, user: 'u', authCode: 'secret', to: 'to@example.test' };
  const feishu = { webhookUrl: 'https://example.invalid/hook' };
  setSmtpConfig(smtp);
  setFeishuConfig(feishu);
  smtp.authCode = 'mutated';
  feishu.webhookUrl = 'https://example.invalid/mutated';

  assert.equal(getCurrentSmtpConfig().authCode, 'secret');
  assert.equal(getCurrentFeishuConfig().webhookUrl, 'https://example.invalid/hook');
  assert.throws(() => {
    getCurrentSmtpConfig().host = 'mutated';
  }, TypeError);
});
