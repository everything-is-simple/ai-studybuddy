import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-runtime-'));
process.env.APP_DATA_ROOT = dataRoot;
process.env.AI_PROVIDERS = JSON.stringify([
  { name: 'env-provider', baseUrl: 'https://provider.invalid/v1', apiKey: 'env-ai-secret', model: 'env-model', priority: 1 },
]);
process.env.SMTP_HOST = 'smtp.qq.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_SECURE = 'true';
process.env.SMTP_USER = 'sender@example.test';
process.env.SMTP_AUTH_CODE = 'env-smtp-secret';
process.env.SMTP_TO = 'to@example.test';
process.env.FEISHU_WEBHOOK_URL = 'https://example.invalid/env-hook';
test.after(() => rm(dataRoot, { recursive: true, force: true }));

const { initializeRuntimeConfiguration } = await import('../dist/config/runtime-configuration.js');
const { getAiRouter, getCurrentSmtpConfig, getCurrentFeishuConfig, clearConfigRegistry } =
  await import('../dist/config/config-registry.js');

test.afterEach(() => clearConfigRegistry());

test('runtime initialization uses env fallbacks without pretending they are encrypted active configs', async () => {
  const service = await initializeRuntimeConfiguration();

  assert.notEqual(getAiRouter(), null);
  assert.equal(getCurrentSmtpConfig().authCode, 'env-smtp-secret');
  assert.equal(getCurrentFeishuConfig().webhookUrl, 'https://example.invalid/env-hook');
  assert.equal(service.getChannelStatus('ai').status, 'environment_fallback');
  assert.equal(service.getChannelStatus('smtp').status, 'environment_fallback');
  assert.equal(service.getChannelStatus('feishu').status, 'environment_fallback');
  assert.deepEqual(service.getChannelStatus('ai').details, [
    { label: 'env-provider', value: 'env-model · 优先级 1' },
  ]);
  assert.equal(service.getChannelStatus('smtp').details[0].value, 'se••••@example.test');
  assert.doesNotMatch(JSON.stringify(service.getAllStatus()), /env-ai-secret|env-smtp-secret|env-hook/);
  assert.deepEqual(
    {
      ai: service.getAllStatus().runtime.aiAvailable,
      smtp: service.getAllStatus().runtime.smtpAvailable,
      feishu: service.getAllStatus().runtime.feishuAvailable,
    },
    { ai: true, smtp: true, feishu: true }
  );
});
