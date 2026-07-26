import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const backendDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(backendDir, '../..');
const modulePath = path.join(repoRoot, 'scripts', 'lib', 'AIStudyBuddy.Deployment.psm1');
const builtEnvModule = path.join(backendDir, 'dist', 'config', 'env.js');

const sentinels = [
  'phase3-t02c-provider-key-sentinel',
  'https://phase3-t02c-provider.invalid/v1',
  'phase3-t02c-smtp-auth-sentinel',
  'https://phase3-t02c-webhook.invalid/hook',
  'phase3-t02c-illegal-env-line-secret',
  'phase3-t02c-host-sentinel',
  'phase3-t02c-data-root-sentinel',
];

function assertNoSentinel(text) {
  for (const sentinel of sentinels) {
    assert.doesNotMatch(text, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
}

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test('backend config rejects invalid AI_PROVIDERS without echoing raw provider secrets', async () => {
  await withTempDir('studybuddy-phase3-t02c-env-', async (dataRoot) => {
    const rawProviders = '{"baseUrl":"https://phase3-t02c-provider.invalid/v1","apiKey":"phase3-t02c-provider-key-sentinel"';
    const result = spawnSync(process.execPath, ['-e', "require('./dist/config/env.js')"], {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        APP_DATA_ROOT: dataRoot,
        BACKEND_HOST: '127.0.0.1',
        NODE_ENV: 'test',
        AI_PROVIDERS: rawProviders,
        AI_API_KEY: 'phase3-t02c-provider-key-sentinel',
        AI_BASE_URL: 'https://phase3-t02c-provider.invalid/v1',
        SMTP_AUTH_CODE: 'phase3-t02c-smtp-auth-sentinel',
        FEISHU_WEBHOOK_URL: 'https://phase3-t02c-webhook.invalid/hook',
      },
    });

    assert.notEqual(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /INVALID_AI_PROVIDERS/);
    assertNoSentinel(output);
    assert.doesNotMatch(output, /AI_PROVIDERS=.*phase3/i);
  });
});

test('backend .env.local parser reports invalid lines, empty keys, and duplicate keys without raw content', async () => {
  const cases = [
    ['APP_DATA_ROOT=ok\nnot an env line phase3-t02c-illegal-env-line-secret\n', 'INVALID_ENV_LINE', /line 2/i],
    ['=phase3-t02c-illegal-env-line-secret\n', 'INVALID_ENV_LINE', /line 1/i],
    ['APP_DATA_ROOT=first\napp_data_root=phase3-t02c-data-root-sentinel\n', 'DUPLICATE_ENV_KEY', /APP_DATA_ROOT|app_data_root/],
  ];
  for (const [content, code, allowedContext] of cases) {
    await withTempDir('studybuddy-phase3-t02c-dotenv-', async (dir) => {
      await writeFile(path.join(dir, '.env.local'), content, 'utf8');
      const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(builtEnvModule)})`], {
        cwd: dir,
        encoding: 'utf8',
        env: {},
      });
      assert.notEqual(result.status, 0);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.match(output, new RegExp(code));
      assert.match(output, allowedContext);
      assertNoSentinel(output);
      assert.doesNotMatch(output, /not an env line|APP_DATA_ROOT=|app_data_root=|SyntaxError|stack|\.env\.local/i);
    });
  }
});

test('backend config hides APP_DATA_ROOT value when the data root is not writable', async () => {
  await withTempDir('studybuddy-phase3-t02c-root-parent-', async (dir) => {
    const fileRoot = path.join(dir, 'phase3-t02c-data-root-sentinel');
    await writeFile(fileRoot, 'not-a-directory', 'utf8');
    const result = spawnSync(process.execPath, ['-e', "require('./dist/config/env.js')"], {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        APP_DATA_ROOT: fileRoot,
        BACKEND_HOST: '127.0.0.1',
        NODE_ENV: 'test',
        AI_PROVIDERS: '',
      },
    });

    assert.notEqual(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /DATA_ROOT_NOT_WRITABLE/);
    assertNoSentinel(output);
    assert.doesNotMatch(output, /APP_DATA_ROOT=.*phase3/i);
    assert.doesNotMatch(output, /ENOTDIR|EEXIST|EACCES|Error:/i);
  });
});

test('PowerShell env import rejects invalid lines without echoing raw env content', async () => {
  await withTempDir('studybuddy-phase3-t02c-ps-env-', async (dir) => {
    const envFile = path.join(dir, 'production.env');
    await writeFile(envFile, 'VALID_KEY=ok\nnot an env line phase3-t02c-illegal-env-line-secret\n', 'utf8');
    const command = `Import-Module '${modulePath.replaceAll("'", "''")}' -Force -DisableNameChecking; try { Import-AIStudyBuddyEnvFile '${envFile.replaceAll("'", "''")}' } catch { Write-Output $_.Exception.Message; exit 9 }`;
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {},
    });

    assert.equal(result.status, 9);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /INVALID_ENV_LINE/);
    assert.match(output, /line 2/i);
    assertNoSentinel(output);
    assert.doesNotMatch(output, /not an env line/i);
  });
});

test('PowerShell loopback host rejection exposes only the key name and fixed code', () => {
  const command = `$env:BACKEND_HOST='phase3-t02c-host-sentinel'; Import-Module '${modulePath.replaceAll("'", "''")}' -Force -DisableNameChecking; try { Assert-AIStudyBuddyLoopbackHost } catch { Write-Output $_.Exception.Message; exit 9 }`;
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 9);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /INVALID_BACKEND_HOST/);
  assert.match(output, /BACKEND_HOST/);
  assertNoSentinel(output);
});
