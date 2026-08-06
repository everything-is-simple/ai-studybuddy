import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleDataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-service-module-'));
process.env.APP_DATA_ROOT = moduleDataRoot;
test.after(() => rm(moduleDataRoot, { recursive: true, force: true }));
const { ConfigurationService } = await import('../dist/config/configuration-service.js');
const { SecureStore } = await import('../dist/config/secure-store.js');
const { TestProtector } = await import('../dist/config/test-protector.js');
const { SecretProtectionError } = await import('../dist/config/secret-protector.js');

const ai = (apiKey) => ({
  providers: [{ name: 'primary', baseUrl: 'https://provider.invalid/v1', apiKey, model: 'm1', priority: 1 }],
});
const smtp = (authCode) => ({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: 'sender@example.test',
  authCode,
  to: 'to@example.test',
});
const feishu = (webhookUrl = 'https://example.invalid/hook') => ({ webhookUrl });

function passingTester(overrides = {}) {
  return {
    testAi: async () => ({ pass: true, providers: [{ name: 'primary', pass: true, model: 'm1' }] }),
    testSmtp: async () => ({ pass: true }),
    testFeishu: async () => ({ pass: true }),
    ...overrides,
  };
}

async function createService(t, tester = passingTester(), now = () => '2026-07-17T01:02:03.000Z') {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-service-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const store = new SecureStore({ configDir, protector: new TestProtector() });
  return { configDir, store, service: new ConfigurationService({ store, tester, configDir, now }) };
}

test('ConfigurationService initializes all channels as unconfigured without crashing', async (t) => {
  const { service } = await createService(t);

  await service.initialize();

  assert.deepEqual(service.getChannelStatus('ai'), {
    status: 'unconfigured',
    lastVerified: null,
    summary: null,
    details: [],
    errorCode: null,
  });
  assert.equal(service.getActiveSnapshot('smtp'), null);
  assert.deepEqual(service.getAllStatus(), {
    ai: service.getChannelStatus('ai'),
    smtp: service.getChannelStatus('smtp'),
    feishu: service.getChannelStatus('feishu'),
    runtime: {
      dataDir: true,
      aiAvailable: false,
      smtpAvailable: false,
      feishuAvailable: false,
      uptime: service.getAllStatus().runtime.uptime,
      nodeVersion: process.version,
    },
  });
  assert.equal(JSON.stringify(service.getAllStatus()).includes(moduleDataRoot), false);
});

test('successful test activates an immutable snapshot, persists it, and notifies listeners', async (t) => {
  const { service, store } = await createService(t);
  await service.initialize();
  const events = [];
  service.onConfigActivated((channel, snapshot) => events.push({ channel, snapshot }));
  const candidate = ai('secret-key');

  const result = await service.testAndActivate('ai', candidate);

  assert.equal(result.activated, true);
  assert.equal(service.getChannelStatus('ai').status, 'verified_pass');
  assert.match(service.getChannelStatus('ai').summary, /m1/);
  assert.equal(service.getChannelStatus('ai').lastVerified, '2026-07-17T01:02:03.000Z');
  assert.deepEqual((await store.read('ai')).data, candidate);
  assert.equal(events.length, 1);
  assert.equal(events[0].channel, 'ai');
  assert.throws(() => {
    events[0].snapshot.providers[0].model = 'mutated';
  }, TypeError);
});

test('failed candidate is discarded without changing disk, snapshot, or listeners', async (t) => {
  const tester = passingTester({
    testAi: async (candidate) =>
      candidate.providers[0].apiKey === 'good'
        ? { pass: true, providers: [{ name: 'primary', pass: true }] }
        : { pass: false, providers: [{ name: 'primary', pass: false, errorCode: 'AI_AUTH_FAILED' }] },
  });
  const { service, store } = await createService(t, tester);
  await service.initialize();
  await service.testAndActivate('ai', ai('good'));
  let eventCount = 0;
  service.onConfigActivated(() => {
    eventCount += 1;
  });

  const result = await service.testAndActivate('ai', ai('bad'));

  assert.equal(result.activated, false);
  assert.deepEqual(service.getActiveSnapshot('ai'), ai('good'));
  assert.deepEqual((await store.read('ai')).data, ai('good'));
  assert.equal(eventCount, 0);
});

test('same-channel activation is serial while different channels can test concurrently', async (t) => {
  let active = 0;
  let sameChannelMax = 0;
  let crossChannelMax = 0;
  const delay = () => new Promise((resolve) => setTimeout(resolve, 10));
  const tracked = async (kind) => {
    active += 1;
    if (kind === 'same') sameChannelMax = Math.max(sameChannelMax, active);
    else crossChannelMax = Math.max(crossChannelMax, active);
    await delay();
    active -= 1;
    return kind === 'ai' ? { pass: true, providers: [{ name: 'primary', pass: true }] } : { pass: true };
  };
  const tester = passingTester({
    testAi: async () => tracked('same'),
    testSmtp: async () => tracked('same'),
  });
  const { service } = await createService(t, tester);
  await service.initialize();

  await Promise.all([service.testAndActivate('ai', ai('first')), service.testAndActivate('ai', ai('second'))]);
  assert.equal(sameChannelMax, 1);
  assert.deepEqual(service.getActiveSnapshot('ai'), ai('second'));

  active = 0;
  tester.testAi = async () => tracked('ai');
  tester.testSmtp = async () => tracked('smtp');
  await Promise.all([service.testAndActivate('ai', ai('third')), service.testAndActivate('smtp', smtp('smtp-secret'))]);
  assert.equal(crossChannelMax, 2);
});

test('a failed queued activation always releases the channel for its successor', async (t) => {
  const tester = passingTester({
    testFeishu: async (candidate) =>
      candidate.webhookUrl.includes('bad') ? { pass: false, errorCode: 'FEISHU_WEBHOOK_REJECTED' } : { pass: true },
  });
  const { service } = await createService(t, tester);
  await service.initialize();

  const [failed, succeeded] = await Promise.all([
    service.testAndActivate('feishu', feishu('https://example.invalid/bad')),
    service.testAndActivate('feishu', feishu('https://example.invalid/good')),
  ]);

  assert.equal(failed.activated, false);
  assert.equal(succeeded.activated, true);
  assert.deepEqual(service.getActiveSnapshot('feishu'), feishu('https://example.invalid/good'));
});

test('initialize recovers prev, preserves safe metadata, and degrades on double corruption', async (t) => {
  const { configDir, store, service } = await createService(t);
  await service.initialize();
  await service.testAndActivate('ai', ai('secret-v1'));
  await service.testAndActivate('ai', ai('secret-v2'));
  const metadata = await readFile(path.join(configDir, 'state.json'), 'utf8');
  assert.doesNotMatch(metadata, /secret-v1|secret-v2|provider\.invalid/);
  await writeFile(path.join(configDir, 'ai.active.enc'), 'corrupt');

  const recovered = new ConfigurationService({
    store,
    tester: passingTester(),
    configDir,
  });
  await recovered.initialize();
  assert.equal(recovered.getChannelStatus('ai').status, 'verified_pass');
  assert.equal(recovered.getChannelStatus('ai').errorCode, 'CONFIG_RECOVERED_FROM_PREV');
  assert.deepEqual(recovered.getActiveSnapshot('ai'), ai('secret-v1'));

  await writeFile(path.join(configDir, 'ai.active.enc'), 'corrupt-active');
  await writeFile(path.join(configDir, 'ai.prev.enc'), 'corrupt-prev');
  const degraded = new ConfigurationService({
    store,
    tester: passingTester(),
    configDir,
  });
  await degraded.initialize();
  assert.deepEqual(degraded.getChannelStatus('ai'), {
    status: 'unconfigured',
    lastVerified: null,
    summary: null,
    details: [],
    errorCode: 'CONFIG_CORRUPT_DEGRADED',
  });
});

test('initialize reports DPAPI unavailable separately from corrupt configuration', async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-dpapi-unavailable-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  await writeFile(path.join(configDir, 'ai.active.enc'), 'encrypted-data');
  const unavailableProtector = {
    available: false,
    encrypt() {
      throw new SecretProtectionError('CONFIG_DPAPI_UNAVAILABLE', 'unavailable');
    },
    decrypt() {
      throw new SecretProtectionError('CONFIG_DPAPI_UNAVAILABLE', 'unavailable');
    },
  };
  const store = new SecureStore({ configDir, protector: unavailableProtector });
  const service = new ConfigurationService({ store, tester: passingTester(), configDir });

  await service.initialize();

  assert.equal(service.getChannelStatus('ai').errorCode, 'CONFIG_DPAPI_UNAVAILABLE');
});

test('retest uses only the active snapshot and never rewrites or deactivates it', async (t) => {
  let shouldPass = true;
  const seen = [];
  const tester = passingTester({
    testAi: async (candidate) => {
      seen.push(candidate);
      return shouldPass
        ? { pass: true, providers: [{ name: 'primary', pass: true }] }
        : { pass: false, errorCode: 'AI_AUTH_FAILED', sanitizedMessage: 'AI Provider 身份验证失败', providers: [] };
    },
  });
  const { service } = await createService(t, tester);
  await service.initialize();
  assert.equal(await service.retest('ai'), null);
  await service.testAndActivate('ai', ai('active-secret'));
  let events = 0;
  service.onConfigActivated(() => {
    events += 1;
  });
  shouldPass = false;

  const result = await service.retest('ai');

  assert.equal(result.activated, false);
  assert.equal(result.test.pass, false);
  assert.deepEqual(seen.at(-1), ai('active-secret'));
  assert.deepEqual(service.getActiveSnapshot('ai'), ai('active-secret'));
  assert.equal(service.getChannelStatus('ai').status, 'verified_pass');
  assert.equal(events, 0);
});

test('environment fallback is observable without persistence or secret disclosure', async (t) => {
  const { service, store } = await createService(t);
  await service.initialize();
  const candidate = ai('environment-secret');

  assert.equal(service.registerEnvironmentFallback('ai', candidate), true);
  assert.equal(service.registerEnvironmentFallback('ai', ai('ignored')), false);
  assert.deepEqual(service.getChannelStatus('ai'), {
    status: 'environment_fallback',
    lastVerified: null,
    summary: '1 个 Provider：m1',
    details: [{ label: 'primary', value: 'm1 · 优先级 1' }],
    errorCode: null,
  });
  assert.deepEqual(service.getActiveSnapshot('ai'), candidate);
  const exposedStatus = service.getChannelStatus('ai');
  exposedStatus.details[0].value = 'tampered';
  exposedStatus.details.push({ label: 'unexpected', value: 'unexpected' });
  assert.deepEqual(service.getChannelStatus('ai').details, [{ label: 'primary', value: 'm1 · 优先级 1' }]);
  await assert.rejects(store.read('ai'));
  assert.doesNotMatch(JSON.stringify(service.getAllStatus()), /environment-secret|provider\.invalid/);

  const retest = await service.retest('ai');
  assert.equal(retest.test.pass, true);
  assert.equal(service.getChannelStatus('ai').status, 'environment_fallback');
  assert.equal(service.getChannelStatus('ai').lastVerified, '2026-07-17T01:02:03.000Z');
});
