import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const createdEnvDataRoot = process.env.APP_DATA_ROOT
  ? null
  : fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-ocr-env-'));
if (createdEnvDataRoot) {
  process.env.APP_DATA_ROOT = createdEnvDataRoot;
  test.after(() => fs.rmSync(createdEnvDataRoot, { recursive: true, force: true }));
}

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { OcrConverter } = await import(pathToFileURL(path.join(backendRoot, 'dist/adapters/converter.js')).href);

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-ocr-runtime-'));
}

test('OcrConverter uses governed temp/cache roots and removes buffer temp file', async () => {
  const root = makeSandbox();
  const tempRoot = path.join(root, 'tmp');
  const cacheRoot = path.join(root, 'models', 'rapidocr');
  const workerPath = path.join(root, 'worker.js');
  fs.writeFileSync(
    workerPath,
    `
    const fs = require('node:fs');
    const imagePath = process.argv[2];
    const result = {
      ok: true,
      text: '运行时隔离',
      charCount: 5,
      cacheRoot: process.env.OCR_CACHE_ROOT,
      imageParent: require('node:path').dirname(imagePath),
      imageExists: fs.existsSync(imagePath)
    };
    process.stdout.write(JSON.stringify(result));
  `
  );

  try {
    const converter = new OcrConverter({
      pythonPath: process.execPath,
      workerPath,
      tempRoot,
      cacheRoot,
      timeoutMs: 5000,
    });
    const result = await converter.convert(Buffer.from('synthetic-image'));
    assert.equal(result.ok, true);
    assert.equal(result.text, '运行时隔离');
    assert.equal(fs.existsSync(tempRoot), true);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
    assert.equal(fs.existsSync(cacheRoot), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OcrConverter terminates a timed-out worker and cleans the temp input', async () => {
  const root = makeSandbox();
  const tempRoot = path.join(root, 'tmp');
  const workerPath = path.join(root, 'slow-worker.js');
  fs.writeFileSync(
    workerPath,
    `setTimeout(() => process.stdout.write(JSON.stringify({ ok: true, text: 'late' })), 5000);`
  );

  try {
    const converter = new OcrConverter({
      pythonPath: process.execPath,
      workerPath,
      tempRoot,
      timeoutMs: 50,
    });
    const result = await converter.convert(Buffer.from('synthetic-image'));
    assert.equal(result.ok, false);
    assert.match(result.error, /超时|timeout|退出码/i);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
