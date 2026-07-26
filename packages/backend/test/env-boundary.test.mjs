import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');

async function loadConfig(environment) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-phase3-t02a-env-'));
  try {
    return spawnSync(process.execPath, ['-e', "require('./dist/config/env.js')"], {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        APP_DATA_ROOT: dataRoot,
        BACKEND_HOST: '127.0.0.1',
        AI_PROVIDERS: '',
        ...environment,
      },
    });
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

for (const nodeEnv of ['development', 'test', 'production']) {
  test(`configuration accepts NODE_ENV=${nodeEnv}`, async () => {
    const result = await loadConfig({ NODE_ENV: nodeEnv });
    assert.equal(result.status, 0, result.stderr);
  });
}

test('configuration rejects an unsupported NODE_ENV without echoing it', async () => {
  const result = await loadConfig({ NODE_ENV: 'staging-private-mode' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INVALID_NODE_ENV/);
  assert.doesNotMatch(result.stderr, /staging-private-mode/);
});

for (const backendHost of ['0.0.0.0', 'localhost', '::1', '192.168.1.50']) {
  test(`configuration rejects non-loopback BACKEND_HOST=${backendHost}`, async () => {
    const result = await loadConfig({ BACKEND_HOST: backendHost });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INVALID_BACKEND_HOST/);
    assert.doesNotMatch(result.stderr, new RegExp(backendHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}
