import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createdDataRoot = process.env.APP_DATA_ROOT ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-t02b-env-'));
if (createdDataRoot) process.env.APP_DATA_ROOT = createdDataRoot;
test.after(() => {
  if (createdDataRoot) fs.rmSync(createdDataRoot, { recursive: true, force: true });
});

const { OcrConverter } = await import(pathToFileURL(path.join(backendRoot, 'dist/adapters/converter.js')).href);
const { WhisperCppAuralConverter } = await import(
  pathToFileURL(path.join(backendRoot, 'dist/adapters/aural/whispercpp-aural-converter.js')).href
);

const FORBIDDEN_KEYS = [
  'APP_DATA_ROOT',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_PROVIDERS',
  'SMTP_HOST',
  'SMTP_AUTH_CODE',
  'FEISHU_WEBHOOK_URL',
  'PYTHONPATH',
  'PYTHONHOME',
  'PHASE3_T02B_HOST_ONLY',
];

function getEnvironmentValue(key) {
  const found = Object.keys(process.env).find((candidate) => candidate.toUpperCase() === key.toUpperCase());
  return found === undefined ? undefined : process.env[found];
}

function allowedKeys({ includePath, includeOcrCache }) {
  const keys = ['TEMP', 'TMP'];
  if (getEnvironmentValue('SystemRoot')) keys.push('SYSTEMROOT');
  if (getEnvironmentValue('WINDIR')) keys.push('WINDIR');
  if (includeOcrCache) keys.push('OCR_CACHE_ROOT', 'XDG_CACHE_HOME');
  if (includePath) keys.push('PATH', 'PATHEXT');
  return keys.sort();
}

async function withHostSentinels(callback) {
  const additions = {
    AI_API_KEY: 't02b-not-a-real-api-key',
    AI_BASE_URL: 'https://provider.invalid/t02b',
    AI_PROVIDERS: '[{"apiKey":"t02b-not-a-real-api-key","baseUrl":"https://provider.invalid/t02b"}]',
    SMTP_HOST: 'smtp.invalid',
    SMTP_AUTH_CODE: 't02b-not-a-real-smtp-code',
    FEISHU_WEBHOOK_URL: 'https://webhook.invalid/t02b',
    PYTHONPATH: 't02b-host-pythonpath',
    PYTHONHOME: 't02b-host-pythonhome',
    PHASE3_T02B_HOST_ONLY: 't02b-host-only',
  };
  const previous = new Map(Object.keys(additions).map((key) => [key, process.env[key]]));
  Object.assign(process.env, additions);
  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function canonicalWav() {
  const data = Buffer.alloc(320, 1);
  const buffer = Buffer.alloc(44 + data.length);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(data.length, 40);
  data.copy(buffer, 44);
  return buffer;
}

test('OCR child receives only its explicit allowlist and no host secrets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-t02b-ocr-'));
  const tempRoot = path.join(root, 'tmp');
  const cacheRoot = path.join(root, 'cache');
  const workerPath = path.join(root, 'inspect-worker.js');
  const expectedKeys = allowedKeys({ includePath: false, includeOcrCache: true });
  fs.writeFileSync(workerPath, `
    const allowed = new Set(${JSON.stringify(expectedKeys)});
    const keys = Object.keys(process.env).map((key) => key.toUpperCase());
    const forbidden = ${JSON.stringify(FORBIDDEN_KEYS)};
    process.stdout.write(JSON.stringify({
      ok: true,
      text: JSON.stringify({
        forbiddenAbsent: forbidden.every((key) => !keys.includes(key))
      })
    }));
  `);

  try {
    await withHostSentinels(async () => {
      const converter = new OcrConverter({ pythonPath: process.execPath, workerPath, tempRoot, cacheRoot, timeoutMs: 5000 });
      const result = await converter.convert(Buffer.from('synthetic-image'));
      assert.equal(result.ok, true);
      assert.deepEqual(JSON.parse(result.text), { forbiddenAbsent: true });
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OCR path lookup allowlist never includes Python or host configuration variables', async () => {
  const { getOcrWorkerEnvironment } = await import(pathToFileURL(path.join(backendRoot, 'dist/config/env.js')).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-t02b-ocr-env-'));
  try {
    await withHostSentinels(async () => {
      const environment = getOcrWorkerEnvironment({ tempRoot: path.join(root, 'tmp'), cacheRoot: path.join(root, 'cache'), requiresPathLookup: true });
      const keys = Object.keys(environment).map((key) => key.toUpperCase()).sort();
      assert.deepEqual(keys, allowedKeys({ includePath: true, includeOcrCache: true }));
      assert.equal(FORBIDDEN_KEYS.some((key) => Object.hasOwn(environment, key)), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('OCR failure does not expose child stderr or stdout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studybuddy-t02b-ocr-error-'));
  const workerPath = path.join(root, 'failing-worker.js');
  fs.writeFileSync(workerPath, "process.stderr.write('T02B_OCR_CHILD_SECRET'); process.exit(1);");
  try {
    const result = await new OcrConverter({ pythonPath: process.execPath, workerPath, tempRoot: path.join(root, 'tmp'), timeoutMs: 5000 }).convert(Buffer.from('synthetic-image'));
    assert.equal(result.ok, false);
    assert.equal(result.error.includes('T02B_OCR_CHILD_SECRET'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('whisper.cpp receives a request-scoped allowlist without host secrets', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'studybuddy-t02b-whisper-'));
  const cliPath = path.join(root, 'fake-whisper.exe');
  const modelPath = path.join(root, 'model.bin');
  await Promise.all([fsp.writeFile(cliPath, ''), fsp.writeFile(modelPath, '')]);
  let capturedEnvironment;
  const fakeSpawn = (_command, args, options) => {
    capturedEnvironment = options.env;
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => undefined;
    queueMicrotask(async () => {
      const outputBase = args[args.indexOf('-of') + 1];
      await fsp.writeFile(`${outputBase}.json`, JSON.stringify({ transcription: [{ text: '受控转写' }] }));
      child.emit('close', 0);
    });
    return child;
  };
  try {
    await withHostSentinels(async () => {
      const converter = new WhisperCppAuralConverter(
        { cliPath, modelPath, timeoutMs: 5000, maxFileBytes: 1024 * 1024 },
        fakeSpawn
      );
      const result = await converter.transcribe({ originalname: 'lesson.wav', mimetype: 'audio/wav', size: canonicalWav().length, buffer: canonicalWav() });
      assert.equal(result.text, '受控转写');
      const keys = Object.keys(capturedEnvironment).map((key) => key.toUpperCase()).sort();
      assert.deepEqual(keys, allowedKeys({ includePath: false, includeOcrCache: false }));
      assert.equal(FORBIDDEN_KEYS.some((key) => Object.hasOwn(capturedEnvironment, key)), false);
      assert.equal(capturedEnvironment.TEMP.startsWith(path.join(process.env.APP_DATA_ROOT, 'tmp', 'class-capture')), true);
    });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('whisper.cpp failure keeps child stderr out of the public error', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'studybuddy-t02b-whisper-error-'));
  const cliPath = path.join(root, 'fake-whisper.exe');
  const modelPath = path.join(root, 'model.bin');
  await Promise.all([fsp.writeFile(cliPath, ''), fsp.writeFile(modelPath, '')]);
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => undefined;
    queueMicrotask(() => {
      child.stderr.emit('data', Buffer.from('T02B_WHISPER_CHILD_SECRET'));
      child.emit('close', 1);
    });
    return child;
  };
  try {
    const converter = new WhisperCppAuralConverter(
      { cliPath, modelPath, timeoutMs: 5000, maxFileBytes: 1024 * 1024 },
      fakeSpawn
    );
    await assert.rejects(
      () => converter.transcribe({ originalname: 'lesson.wav', mimetype: 'audio/wav', size: canonicalWav().length, buffer: canonicalWav() }),
      (error) => error.code === 'ASR_TRANSCRIPTION_FAILED' && !error.message.includes('T02B_WHISPER_CHILD_SECRET')
    );
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
