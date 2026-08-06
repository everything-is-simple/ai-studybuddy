import assert from 'node:assert/strict';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleDataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-store-module-'));
process.env.APP_DATA_ROOT = moduleDataRoot;
test.after(() => rm(moduleDataRoot, { recursive: true, force: true }));
const { SecureStore } = await import('../dist/config/secure-store.js');
const { TestProtector } = await import('../dist/config/test-protector.js');

test('TestProtector encrypts and decrypts without leaving plaintext unchanged', () => {
  const protector = new TestProtector();
  const plaintext = Buffer.from('local-secret', 'utf8');

  const ciphertext = protector.encrypt(plaintext);

  assert.notDeepEqual(ciphertext, plaintext);
  assert.deepEqual(protector.decrypt(ciphertext), plaintext);
});

test('SecureStore writes encrypted active config and reads it back', async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-store-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const store = new SecureStore({ configDir, protector: new TestProtector() });
  const value = { apiKey: 'must-not-appear-on-disk', model: 'test-model' };

  await store.write('ai', value);

  const diskBytes = await readFile(path.join(configDir, 'ai.active.enc'));
  assert.equal(diskBytes.includes(Buffer.from(value.apiKey)), false);
  assert.equal(store.exists('ai'), true);
  assert.deepEqual(await store.read('ai'), {
    data: value,
    recoveredFromPrev: false,
  });
});

test('SecureStore recovers the previous config after interruption following active rotation', async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-interrupt-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const protector = new TestProtector();
  const initialStore = new SecureStore({ configDir, protector });
  await initialStore.write('ai', { apiKey: 'active-v1' });

  const interruptedStore = new SecureStore({
    configDir,
    protector,
    onAtomicWriteStep(step) {
      if (step === 'active-moved-to-prev') throw new Error('simulated process interruption');
    },
  });

  await assert.rejects(interruptedStore.write('ai', { apiKey: 'candidate-v2' }), {
    code: 'CONFIG_WRITE_FAILED',
  });
  assert.deepEqual(await initialStore.read('ai'), {
    data: { apiKey: 'active-v1' },
    recoveredFromPrev: true,
  });
});

test('SecureStore falls back to prev when active is corrupt and degrades when both are corrupt', async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-corrupt-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const store = new SecureStore({ configDir, protector: new TestProtector() });
  await store.write('ai', { version: 1 });
  await store.write('ai', { version: 2 });
  await writeFile(path.join(configDir, 'ai.active.enc'), 'corrupt-active');

  assert.deepEqual(await store.read('ai'), {
    data: { version: 1 },
    recoveredFromPrev: true,
  });

  await writeFile(path.join(configDir, 'ai.active.enc'), 'corrupt-active-again');
  await writeFile(path.join(configDir, 'ai.prev.enc'), 'corrupt-prev');
  await assert.rejects(store.read('ai'), { code: 'CONFIG_CORRUPT_DEGRADED' });
});

test('SecureStore keeps channels isolated and removes only recognized temporary files', async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-channels-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const store = new SecureStore({ configDir, protector: new TestProtector() });
  await store.write('ai', { value: 'ai' });
  await store.write('smtp', { value: 'smtp' });
  await writeFile(path.join(configDir, 'ai.abcd.tmp'), 'stale');
  await writeFile(path.join(configDir, 'unrelated.tmp'), 'keep');

  await store.cleanupTemporaryFiles();

  assert.deepEqual((await store.read('ai')).data, { value: 'ai' });
  assert.deepEqual((await store.read('smtp')).data, { value: 'smtp' });
  assert.deepEqual((await readdir(configDir)).sort(), ['ai.active.enc', 'smtp.active.enc', 'unrelated.tmp']);
});

test('SecureStore removes a half-written temp file when encryption or activation fails', async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'studybuddy-t08-write-fail-'));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const failingProtector = {
    available: true,
    encrypt() {
      throw new Error('encrypt failed');
    },
    decrypt(value) {
      return value;
    },
  };
  const store = new SecureStore({ configDir, protector: failingProtector });

  await assert.rejects(store.write('feishu', { webhookUrl: 'secret' }), {
    code: 'CONFIG_WRITE_FAILED',
  });
  assert.deepEqual(await readdir(configDir), []);
});
