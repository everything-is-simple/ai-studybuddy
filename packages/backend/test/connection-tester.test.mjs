import assert from 'node:assert/strict';
import test from 'node:test';

import { ConnectionTester } from '../dist/config/connection-tester.js';

const aiCandidate = {
  providers: [
    { name: 'primary', baseUrl: 'https://primary.invalid/v1', apiKey: 'secret-primary', model: 'm1', priority: 1 },
    { name: 'backup', baseUrl: 'https://backup.invalid/v1', apiKey: 'secret-backup', model: 'm2', priority: 2 },
  ],
};

test('AI connection test checks every provider and passes when at least one passes', async () => {
  const calls = [];
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate(request) {
          calls.push({ name: config.name, request });
          if (config.name === 'backup') throw new Error(`failed ${config.apiKey} ${config.baseUrl}`);
          return { content: 'OK', provider: config.name, model: config.model, latencyMs: 3, fallbackUsed: false };
        },
      };
    },
  });

  const result = await tester.testAi(aiCandidate);

  // 只要有一家通就激活，失败的那家在结果里标出来但不阻塞。
  assert.equal(result.pass, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(result.providers.map(({ name, pass }) => ({ name, pass })), [
    { name: 'primary', pass: true },
    { name: 'backup', pass: false },
  ]);
  assert.equal(result.providers[1].errorCode, 'AI_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(result), /secret-backup|backup\.invalid/);
});

test('AI connection test fails only when every provider fails', async () => {
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          throw new Error(`failed ${config.apiKey} ${config.baseUrl}`);
        },
      };
    },
  });

  const result = await tester.testAi(aiCandidate);

  assert.equal(result.pass, false);
  assert.deepEqual(result.providers.map(({ pass }) => pass), [false, false]);
  assert.doesNotMatch(JSON.stringify(result), /secret-primary|secret-backup|primary\.invalid|backup\.invalid/);
});

test('relay slots try every address in order and adopt the first one that answers', async () => {
  const attempted = [];
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          attempted.push(config.baseUrl);
          if (config.baseUrl !== 'https://relay-c.invalid/v1') {
            throw new Error(`failed ${config.apiKey} ${config.baseUrl}`);
          }
          return { content: 'OK', provider: config.name, model: config.model, latencyMs: 4, fallbackUsed: false };
        },
      };
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'relay-model-a' }, { id: 'relay-model-b' }] }),
    }),
  });

  const result = await tester.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay-a.invalid/v1', 'https://relay-b.invalid/v1', 'https://relay-c.invalid/v1'],
    apiKey: 'secret-relay',
    model: '',
  });

  assert.equal(result.pass, true);
  assert.equal(result.resolvedBaseUrl, 'https://relay-c.invalid/v1');
  assert.deepEqual(attempted, [
    'https://relay-a.invalid/v1',
    'https://relay-b.invalid/v1',
    'https://relay-c.invalid/v1',
  ]);
  assert.deepEqual(result.supportedModels, ['relay-model-a', 'relay-model-b']);
  assert.doesNotMatch(JSON.stringify(result), /secret-relay/);
});

test('relay slots separate an unreachable address from a reachable one with a bad key', async () => {
  const tester = new ConnectionTester({
    createAiProvider: (config) => ({ name: config.name, generate: async () => ({ content: 'OK' }) }),
    // 地址连不上：fetch 直接抛，而不是返回 HTTP 错误。
    fetch: async () => { throw new Error('getaddrinfo ENOTFOUND'); },
  });

  const unreachable = await tester.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay-nope.invalid/v1'],
    apiKey: 'secret-relay',
    model: '',
  });

  assert.equal(unreachable.pass, false);
  assert.equal(unreachable.errorCode, 'AI_BASE_URL_UNREACHABLE');
  assert.doesNotMatch(JSON.stringify(unreachable), /secret-relay/);

  const rejectedKey = new ConnectionTester({
    createAiProvider: (config) => ({ name: config.name, generate: async () => ({ content: 'OK' }) }),
    // 地址通了但 Key 不对。
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });

  const badKey = await rejectedKey.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay-ok.invalid/v1'],
    apiKey: 'secret-relay',
    model: '',
  });

  assert.equal(badKey.pass, false);
  assert.equal(badKey.errorCode, 'AI_AUTH_FAILED');
});

test('relay slots report an empty model list separately from an unreachable address', async () => {
  const tester = new ConnectionTester({
    createAiProvider: (config) => ({ name: config.name, generate: async () => ({ content: 'OK' }) }),
    // 地址通、Key 也没被拒，但对方就是没给模型。
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }),
  });

  const result = await tester.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay-empty.invalid/v1'],
    apiKey: 'secret-relay',
    model: '',
  });

  assert.equal(result.pass, false);
  assert.equal(result.errorCode, 'AI_NO_MODEL_AVAILABLE');
});

test('relay slots report failure with per-address attempts when no address answers', async () => {
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          const error = new Error('unauthorized');
          error.status = 401;
          throw error;
        },
      };
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'relay-model-a' }] }) }),
  });

  const result = await tester.testSingleProvider({
    name: '中转站 2',
    baseUrls: ['https://relay-a.invalid/v1', 'https://relay-b.invalid/v1'],
    apiKey: 'secret-relay',
    model: '',
  });

  // 两个地址都是 401，说明问题在 Key 而不是地址，要报认证失败。
  assert.equal(result.pass, false);
  assert.equal(result.errorCode, 'AI_AUTH_FAILED');
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(result.attempts.map(({ pass }) => pass), [false, false]);
  assert.doesNotMatch(JSON.stringify(result), /secret-relay/);
});

test('relay slots reject an empty address list', async () => {
  const tester = new ConnectionTester({
    createAiProvider: (config) => ({ name: config.name, generate: async () => ({ content: 'OK' }) }),
  });

  const result = await tester.testSingleProvider({ name: '中转站 3', baseUrls: [], apiKey: 'secret', model: '' });

  assert.equal(result.pass, false);
  assert.equal(result.errorCode, 'AI_BASE_URL_REQUIRED');
});

test('AI connection test marks a provider timeout without leaking candidate values', async () => {
  const tester = new ConnectionTester({
    aiProviderTimeoutMs: 5,
    createAiProvider(config) {
      return { name: config.name, generate: () => new Promise(() => {}) };
    },
  });

  const result = await tester.testAi({ providers: [aiCandidate.providers[0]] });

  assert.equal(result.pass, false);
  assert.equal(result.providers[0].errorCode, 'AI_CONNECTION_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(result), /secret-primary|primary\.invalid/);
});

test('AI connection test rejects an empty provider list', async () => {
  const tester = new ConnectionTester();

  assert.deepEqual(await tester.testAi({ providers: [] }), {
    pass: false,
    errorCode: 'AI_NO_PROVIDERS',
    sanitizedMessage: '至少需要一个 AI Provider',
    providers: [],
  });
});

test('SMTP connection test verifies and optionally sends a fixed data-free message', async () => {
  const calls = [];
  const tester = new ConnectionTester({
    createSmtpTransport(config) {
      calls.push({ type: 'create', config });
      return {
        async verify() {
          calls.push({ type: 'verify' });
          return true;
        },
        async sendMail(message) {
          calls.push({ type: 'send', message });
        },
      };
    },
  });
  const candidate = {
    host: 'smtp.qq.com', port: 465, secure: true, user: 'sender@example.test',
    authCode: 'smtp-secret', to: 'receiver@example.test',
  };

  const result = await tester.testSmtp(candidate, true);

  assert.equal(result.pass, true);
  assert.equal(calls[1].type, 'verify');
  assert.deepEqual(calls[2], {
    type: 'send',
    message: {
      from: candidate.user,
      to: candidate.to,
      subject: 'AI StudyBuddy 配置测试',
      text: 'AI StudyBuddy 配置测试成功。',
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /smtp-secret|receiver@example/);
});

test('SMTP and Feishu failures return fixed sanitized codes', async () => {
  const secret = 'DO-NOT-LEAK';
  const tester = new ConnectionTester({
    createSmtpTransport() {
      return { verify: async () => { throw Object.assign(new Error(secret), { code: 'EAUTH' }); }, sendMail: async () => {} };
    },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.card.header.title.content, '配置测试');
      assert.doesNotMatch(JSON.stringify(body), /学生|课程|考试/);
      return new Response(JSON.stringify({ code: 19001, msg: secret }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const smtp = await tester.testSmtp({
    host: 'smtp.invalid', port: 465, secure: true, user: 'u', authCode: secret, to: 'to@example.test',
  }, false);
  const feishu = await tester.testFeishu({ webhookUrl: `https://example.invalid/${secret}` });

  assert.deepEqual(smtp, {
    pass: false,
    errorCode: 'SMTP_AUTH_FAILED',
    sanitizedMessage: 'SMTP 身份验证失败',
  });
  assert.deepEqual(feishu, {
    pass: false,
    errorCode: 'FEISHU_WEBHOOK_REJECTED',
    sanitizedMessage: '飞书 Webhook 拒绝了测试请求',
  });
  assert.doesNotMatch(JSON.stringify({ smtp, feishu }), new RegExp(secret));
});

test('Feishu connection test accepts a successful fixed-card response', async () => {
  const tester = new ConnectionTester({
    fetch: async () => new Response(JSON.stringify({ code: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  assert.deepEqual(
    await tester.testFeishu({ webhookUrl: 'https://example.invalid/safe-hook' }),
    { pass: true }
  );
});


test('AI 429 and common SMTP transport failures use fixed actionable sanitized codes', async () => {
  const secret = 'DO-NOT-LEAK-M03';
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          throw Object.assign(new Error(secret), { status: 429 });
        },
      };
    },
    createSmtpTransport() {
      return {
        async verify() {
          throw Object.assign(new Error(secret), { code: 'ETIMEDOUT' });
        },
        async sendMail() {},
      };
    },
  });

  const aiResult = await tester.testAi({ providers: [aiCandidate.providers[0]] });
  const smtpResult = await tester.testSmtp({
    host: 'smtp.invalid', port: 465, secure: true, user: 'sender@example.test', authCode: secret, to: 'receiver@example.test',
  }, false);

  assert.equal(aiResult.providers[0].errorCode, 'AI_QUOTA_OR_RATE_LIMITED');
  assert.deepEqual(smtpResult, {
    pass: false,
    errorCode: 'SMTP_CONNECTION_TIMEOUT',
    sanitizedMessage: 'SMTP 连接超时',
  });
  assert.doesNotMatch(JSON.stringify({ aiResult, smtpResult }), new RegExp(secret));
});

test('relay slots skip /models when the caller provides a model name', async () => {
  let fetchCalled = false;
  let generateCalledWith = '';
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          generateCalledWith = config.model;
          return { content: 'OK', provider: config.name, model: config.model, latencyMs: 1, fallbackUsed: false };
        },
      };
    },
    fetch: async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'server-model' }] }) };
    },
  });

  const result = await tester.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay.example.test/v1'],
    apiKey: 'secret-relay',
    model: 'user-typed-model',
  });

  assert.equal(result.pass, true);
  assert.equal(fetchCalled, false, '/models 不应被调用');
  assert.equal(generateCalledWith, 'user-typed-model');
  assert.deepEqual(result.supportedModels, ['user-typed-model']);
  assert.doesNotMatch(JSON.stringify(result), /secret-relay/);
});

test('relay slots auto-append /v1 when a bare address only serves the API under /v1', async () => {
  // 中转站（new-api / one-api）常只在 /v1 下暴露接口，根路径返回站点首页。
  // 用户填裸地址时应自动补 /v1 变体并轮到它。
  const attempted = [];
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          attempted.push(config.baseUrl);
          if (config.baseUrl !== 'https://relay.invalid/v1') {
            throw new Error(`failed ${config.apiKey} ${config.baseUrl}`);
          }
          return { content: 'OK', provider: config.name, model: config.model, latencyMs: 2, fallbackUsed: false };
        },
      };
    },
  });

  const result = await tester.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay.invalid'],
    apiKey: 'secret-relay',
    model: 'gpt-5.5',
  });

  assert.equal(result.pass, true);
  assert.equal(result.resolvedBaseUrl, 'https://relay.invalid/v1');
  // 裸地址先试再退到 /v1 变体。
  assert.deepEqual(attempted, ['https://relay.invalid', 'https://relay.invalid/v1']);
  assert.doesNotMatch(JSON.stringify(result), /secret-relay/);
});

test('relay slots do not duplicate a /v1 suffix the caller already provided', async () => {
  const attempted = [];
  const tester = new ConnectionTester({
    createAiProvider(config) {
      return {
        name: config.name,
        async generate() {
          attempted.push(config.baseUrl);
          return { content: 'OK', provider: config.name, model: config.model, latencyMs: 1, fallbackUsed: false };
        },
      };
    },
  });

  const result = await tester.testSingleProvider({
    name: '中转站 1',
    baseUrls: ['https://relay.invalid/v1'],
    apiKey: 'secret-relay',
    model: 'gpt-5.5',
  });

  assert.equal(result.pass, true);
  assert.equal(result.resolvedBaseUrl, 'https://relay.invalid/v1');
  // 已带 /v1 的地址只试一次，不生成 /v1/v1。
  assert.deepEqual(attempted, ['https://relay.invalid/v1']);
});
