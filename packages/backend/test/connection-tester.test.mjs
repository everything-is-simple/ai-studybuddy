import assert from 'node:assert/strict';
import test from 'node:test';

import { ConnectionTester } from '../dist/config/connection-tester.js';

const aiCandidate = {
  providers: [
    { name: 'primary', baseUrl: 'https://primary.invalid/v1', apiKey: 'secret-primary', model: 'm1', priority: 1 },
    { name: 'backup', baseUrl: 'https://backup.invalid/v1', apiKey: 'secret-backup', model: 'm2', priority: 2 },
  ],
};

test('AI connection test checks every provider and passes only when all pass', async () => {
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

  assert.equal(result.pass, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(result.providers.map(({ name, pass }) => ({ name, pass })), [
    { name: 'primary', pass: true },
    { name: 'backup', pass: false },
  ]);
  assert.equal(result.providers[1].errorCode, 'AI_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(result), /secret-backup|backup\.invalid/);
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
