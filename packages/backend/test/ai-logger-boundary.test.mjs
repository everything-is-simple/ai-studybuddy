// T05-1 专项：AI 日志经 runtime-log-boundary 脱敏落盘
// 验证：字段符合 allowlist、写入 ai JSONL、非法字段被拒绝、敏感内容不落盘。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSiblingRuntimeLogBoundary } = require('../dist/utils/runtime-log-boundary.js');
const { createAiLogger } = require('../dist/utils/ai-logger.js');

function makeIsolatedAppRoot() {
  // 独立父目录，使 logRoot（appDataRoot 的兄弟 logs/）每测试隔离
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'asb-t05-parent-'));
  const appRoot = path.join(parent, 'data');
  fs.mkdirSync(appRoot, { recursive: true });
  return appRoot;
}

test('AI 日志经 boundary 写入 ai JSONL 且字段符合 allowlist', () => {
  const appDataRoot = makeIsolatedAppRoot();
  const boundary = createSiblingRuntimeLogBoundary(appDataRoot);
  const logger = createAiLogger(boundary);

  logger.recordSuccess({
    taskType: 'note_generate',
    result: {
      provider: 'mock-provider',
      model: 'mock-model',
      tokenUsed: 100,
      latencyMs: 500,
      fallbackUsed: true,
      content: '这是不应落盘的敏感正文',
    },
    attemptedProviders: [
      { provider: 'mock-a', error: 'HTTP 401' },
      { provider: 'mock-b', error: 'timeout' },
    ],
  });

  const logRoot = path.resolve(appDataRoot, '..', 'logs');
  const aiLog = path.join(logRoot, 'runtime', 'ai-events.jsonl');
  assert.equal(fs.existsSync(aiLog), true, 'ai-events.jsonl 应存在');

  const lines = fs.readFileSync(aiLog, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.level, 'INFO');
  assert.equal(entry.event, 'AI_REQUEST_SUCCESS');
  assert.equal(entry.provider, 'mock-provider');
  assert.equal(entry.tokenUsed, 100);
  assert.equal(entry.attemptedProviderCount, 2);
  assert.equal(entry.attemptedProviders, 'mock-a:UNKNOWN_ERROR,mock-b:UNKNOWN_ERROR');
  // 敏感正文不得落盘
  assert.ok(!JSON.stringify(entry).includes('敏感正文'), 'AI 生成正文不得写入日志');
  // 仅允许字段
  const allowed = new Set([
    'event', 'level', 'taskType', 'provider', 'model', 'tokenUsed', 'latencyMs',
    'fallbackUsed', 'attemptedProviderCount', 'attemptedProviders', 'errorCode', 'timestamp',
  ]);
  for (const key of Object.keys(entry)) {
    assert.ok(allowed.has(key), `不允许的日志字段: ${key}`);
  }
});

test('AI 失败/熔断事件落盘且 errorCode 安全化', () => {
  const appDataRoot = makeIsolatedAppRoot();
  const boundary = createSiblingRuntimeLogBoundary(appDataRoot);
  const logger = createAiLogger(boundary);

  const secret = 'sk-super-secret-123456789';
  logger.recordFailure({
    taskType: 'practice_generate',
    provider: 'mock-provider',
    error: Object.assign(new Error(`HTTP 401 ${secret}`), { code: 'AI_PROVIDER_FAILED' }),
  });
  logger.recordCircuitOpened({
    provider: 'mock-provider',
    cooldownStartedAt: '2026-08-06T00:00:00.000Z',
    cooldownEndsAt: '2026-08-06T00:10:00.000Z',
  });

  const logRoot = path.resolve(appDataRoot, '..', 'logs');
  const lines = fs.readFileSync(path.join(logRoot, 'runtime', 'ai-events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);

  const failure = JSON.parse(lines[0]);
  assert.equal(failure.event, 'AI_REQUEST_FAILURE');
  assert.equal(failure.errorCode, 'AI_PROVIDER_FAILED');
  assert.ok(!JSON.stringify(failure).includes(secret), '错误消息中的秘密不得泄露');

  const opened = JSON.parse(lines[1]);
  assert.equal(opened.event, 'AI_PROVIDER_CIRCUIT_OPENED');
  assert.equal(opened.cooldownEndsAt, '2026-08-06T00:10:00.000Z');
});

test('非法字段（超长/未知键）被 boundary 拒绝', () => {
  const appDataRoot = makeIsolatedAppRoot();
  const boundary = createSiblingRuntimeLogBoundary(appDataRoot);

  // 直接向 boundary 写未知字段与超长字符串：logger 只写白名单字段，
  // 非法值必须由 boundary 的 allowlist 拦截。
  assert.throws(
    () =>
      boundary.append('ai', {
        event: 'TEST',
        level: 'INFO',
        timestamp: new Date().toISOString(),
        unknownField: 'x',
      }),
    (err) => err.code === 'LOG_ENTRY_FIELDS_INVALID' || err.message === 'LOG_ENTRY_FIELDS_INVALID'
  );
  assert.throws(
    () =>
      boundary.append('ai', {
        event: 'TEST',
        level: 'INFO',
        timestamp: new Date().toISOString(),
        provider: 'x'.repeat(200),
      }),
    (err) => err.code === 'LOG_ENTRY_FIELDS_INVALID' || err.message === 'LOG_ENTRY_FIELDS_INVALID'
  );
});

test('无 boundary 时降级 console 且字段相同（不抛错）', () => {
  const logger = createAiLogger(undefined);
  const original = console.log;
  const captured = [];
  console.log = (line) => captured.push(String(line));
  try {
    logger.recordCircuitClosed({ provider: 'mock-provider', cooldownEndedAt: '2026-08-06T00:00:00.000Z' });
  } finally {
    console.log = original;
  }
  assert.equal(captured.length, 1);
  const entry = JSON.parse(captured[0]);
  assert.equal(entry.event, 'AI_PROVIDER_CIRCUIT_CLOSED');
  assert.equal(entry.level, 'INFO');
});
