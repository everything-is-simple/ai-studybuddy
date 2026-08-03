const { mkdtempSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const path = require('node:path');

const dataRoot = mkdtempSync(path.join(tmpdir(), 'ai-studybuddy-backend-test-'));
try {
  const result = spawnSync(
    process.execPath,
    ['--require', './src/polyfills.cjs', '--test', '--test-concurrency=1', 'test/*.test.mjs'],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, APP_DATA_ROOT: dataRoot, NODE_ENV: 'test' },
      stdio: 'inherit',
    }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
