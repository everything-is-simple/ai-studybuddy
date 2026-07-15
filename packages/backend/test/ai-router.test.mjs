import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiProviderRouter,
  AiProviderError,
  AllProvidersFailedError,
  AllProvidersCoolingDownError,
} from '../dist/adapters/ai/router.js';
import { OpenAiProvider } from '../dist/adapters/ai/openai-provider.js';
import { aiLogger } from '../dist/utils/ai-logger.js';

function makeRequest(inputText = '测试输入') {
  return { taskType: 'note_generation', inputText };
}

function makeSensitiveUuid() {
  return ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-');
}

class MockProvider {
  constructor(name, behavior) {
    this.name = name;
    this.behavior = behavior;
    this.calls = 0;
  }

  async generate(request) {
    this.calls += 1;
    return this.behavior(request, this.calls);
  }
}


function createClock(start = Date.parse('2026-07-16T00:00:00.000Z')) {
  let current = start;
  return {
    now: () => current,
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

function createRecordingLogger() {
  const successes = [];
  const failures = [];
  const opened = [];
  const closed = [];

  return {
    logger: {
      recordSuccess(payload) {
        successes.push(payload);
      },
      recordFailure(payload) {
        failures.push(payload);
      },
      recordCircuitOpened(payload) {
        opened.push(payload);
      },
      recordCircuitClosed(payload) {
        closed.push(payload);
      },
    },
    successes,
    failures,
    opened,
    closed,
  };
}
function successResponse(overrides = {}) {
  return {
    content: '成功响应',
    provider: overrides.provider ?? 'mock',
    model: 'gpt-test',
    tokenUsed: 10,
    latencyMs: 100,
    fallbackUsed: false,
    ...overrides,
  };
}

function makeOpenAiFetch(response, delayMs = 0) {
  return async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

test('single provider succeeds and returns standard response', async () => {
  const provider = new MockProvider('primary', () => successResponse({ provider: 'primary' }));
  const router = new AiProviderRouter({ providers: [provider] });

  const result = await router.generate(makeRequest());

  assert.equal(result.content, '成功响应');
  assert.equal(result.provider, 'primary');
  assert.equal(result.model, 'gpt-test');
  assert.equal(result.tokenUsed, 10);
  assert.equal(result.fallbackUsed, false);
  assert.ok(result.latencyMs >= 0);
});

test('first provider fails and router falls back to second provider', async () => {
  const primary = new MockProvider('primary', () => {
    throw new Error('primary down');
  });
  const secondary = new MockProvider('secondary', () => successResponse({ provider: 'secondary' }));
  const router = new AiProviderRouter({ providers: [primary, secondary] });

  const result = await router.generate(makeRequest());

  assert.equal(result.provider, 'secondary');
  assert.equal(result.fallbackUsed, true);
});

test('all providers fail and router throws AI_ALL_PROVIDERS_FAILED', async () => {
  const first = new MockProvider('first', () => {
    throw new Error('first error');
  });
  const second = new MockProvider('second', () => {
    throw new Error('second error');
  });
  const router = new AiProviderRouter({ providers: [first, second] });

  let caught;
  try {
    await router.generate(makeRequest());
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof AllProvidersFailedError);
  assert.equal(caught.code, 'AI_ALL_PROVIDERS_FAILED');
  assert.equal(caught.failures.length, 2);
  assert.equal(caught.failures[0].provider, 'first');
  assert.match(caught.failures[0].error, /first error/);
});

test('provider timeout is treated as failure and router falls back', async () => {
  const slowProvider = new OpenAiProvider({
    name: 'slow',
    baseURL: 'https://example.com/v1',
    apiKey: 'test-key',
    defaultModel: 'gpt-test',
    timeoutMs: 10,
    fetch: (_url, init) =>
      new Promise((_, reject) => {
        const abort = () => reject(new Error('Request timed out.'));
        if (init.signal?.aborted) {
          abort();
        } else {
          init.signal?.addEventListener('abort', abort);
        }
      }),
  });
  const fastProvider = new MockProvider('fast', () => successResponse({ provider: 'fast' }));
  const router = new AiProviderRouter({ providers: [slowProvider, fastProvider] });

  const start = Date.now();
  const result = await router.generate(makeRequest());
  const elapsed = Date.now() - start;

  assert.equal(result.provider, 'fast');
  assert.equal(result.fallbackUsed, true);
  assert.ok(
    elapsed >= 10 && elapsed < 200,
    `fallback should wait for timeout then succeed quickly, elapsed=${elapsed}ms`
  );
});

test('unconfigured router throws AI_NOT_CONFIGURED', async () => {
  const router = new AiProviderRouter({ providers: [] });

  let caught;
  try {
    await router.generate(makeRequest());
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof AiProviderError);
  assert.equal(caught.code, 'AI_NOT_CONFIGURED');
});

test('OpenAiProvider parses chat completion response correctly', async () => {
  const responseBody = {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-5.5',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'OpenAI 响应' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
  };
  const provider = new OpenAiProvider({
    name: 'openai-mock',
    baseURL: 'https://mock.example/v1',
    apiKey: 'mock-key',
    defaultModel: 'gpt-5.5',
    fetch: makeOpenAiFetch(responseBody),
  });

  const result = await provider.generate(makeRequest());

  assert.equal(result.content, 'OpenAI 响应');
  assert.equal(result.provider, 'openai-mock');
  assert.equal(result.model, 'gpt-5.5');
  assert.equal(result.tokenUsed, 12);
  assert.equal(result.fallbackUsed, false);
  assert.ok(result.latencyMs >= 0);
});

test('provider remains callable through four consecutive failures', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  const primary = new MockProvider('primary', () => {
    throw new Error('primary unavailable');
  });
  const secondary = new MockProvider('secondary', () => successResponse({ provider: 'secondary' }));
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await router.generate(makeRequest());
    assert.equal(result.provider, 'secondary');
    assert.equal(result.fallbackUsed, true);
  }

  assert.equal(primary.calls, 4);
  assert.equal(secondary.calls, 4);
  assert.equal(recording.opened.length, 0);
});

test('fifth consecutive failure opens circuit and cooldown skips primary', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  const primary = new MockProvider('primary', () => {
    throw new Error('primary unavailable');
  });
  const secondary = new MockProvider('secondary', () => successResponse({ provider: 'secondary' }));
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await router.generate(makeRequest());
  }

  assert.equal(primary.calls, 5);
  assert.equal(recording.opened.length, 1);
  assert.deepEqual(recording.opened[0], {
    provider: 'primary',
    cooldownStartedAt: '2026-07-16T00:00:00.000Z',
    cooldownEndsAt: '2026-07-16T00:10:00.000Z',
  });

  const result = await router.generate(makeRequest());

  assert.equal(primary.calls, 5, 'primary must not be called during cooldown');
  assert.equal(secondary.calls, 6);
  assert.equal(result.provider, 'secondary');
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(recording.successes.at(-1)?.attemptedProviders, [
    { provider: 'primary', error: 'AI_PROVIDER_COOLDOWN' },
  ]);
});

test('cooldown expiry probes provider successfully and resets consecutive failures', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  let primaryShouldFail = true;
  const primary = new MockProvider('primary', () => {
    if (primaryShouldFail) throw new Error('primary unavailable');
    return successResponse({ provider: 'primary' });
  });
  const secondary = new MockProvider('secondary', () => successResponse({ provider: 'secondary' }));
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await router.generate(makeRequest());
  }

  clock.advance(10 * 60 * 1000);
  primaryShouldFail = false;
  const recovered = await router.generate(makeRequest());

  assert.equal(recovered.provider, 'primary');
  assert.equal(recovered.fallbackUsed, false);
  assert.equal(recording.closed.length, 1);
  assert.deepEqual(recording.closed[0], {
    provider: 'primary',
    cooldownEndedAt: '2026-07-16T00:10:00.000Z',
  });

  primaryShouldFail = true;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await router.generate(makeRequest());
  }
  assert.equal(recording.opened.length, 1, 'successful recovery must reset failure count');
});

test('failed recovery probe immediately opens a new cooldown window', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  const primary = new MockProvider('primary', () => {
    throw new Error('primary unavailable');
  });
  const secondary = new MockProvider('secondary', () => successResponse({ provider: 'secondary' }));
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await router.generate(makeRequest());
  }

  clock.advance(10 * 60 * 1000);
  await router.generate(makeRequest());

  assert.equal(primary.calls, 6);
  assert.equal(recording.closed.length, 1);
  assert.equal(recording.opened.length, 2);
  assert.equal(recording.opened[1].cooldownStartedAt, '2026-07-16T00:10:00.000Z');
  assert.equal(recording.opened[1].cooldownEndsAt, '2026-07-16T00:20:00.000Z');

  await router.generate(makeRequest());
  assert.equal(primary.calls, 6, 'failed recovery probe must be skipped in the new cooldown');
});

test('health state is isolated by provider instance even when names match', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  const unhealthy = new MockProvider('duplicate-name', () => {
    throw new Error('unhealthy instance');
  });
  const healthy = new MockProvider('duplicate-name', () =>
    successResponse({ provider: 'duplicate-name' })
  );
  const router = new AiProviderRouter({
    providers: [unhealthy, healthy],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await router.generate(makeRequest());
    assert.equal(result.provider, 'duplicate-name');
  }

  assert.equal(unhealthy.calls, 5);
  assert.equal(healthy.calls, 6, 'healthy instance must not inherit same-name cooldown');
});

test('health state is isolated between router instances', async () => {
  const clock = createClock();
  const firstRecording = createRecordingLogger();
  const secondRecording = createRecordingLogger();
  const sharedPrimary = new MockProvider('shared-primary', () => {
    throw new Error('shared primary unavailable');
  });
  const firstFallback = new MockProvider('first-fallback', () =>
    successResponse({ provider: 'first-fallback' })
  );
  const secondFallback = new MockProvider('second-fallback', () =>
    successResponse({ provider: 'second-fallback' })
  );
  const firstRouter = new AiProviderRouter({
    providers: [sharedPrimary, firstFallback],
    now: clock.now,
    logger: firstRecording.logger,
  });
  const secondRouter = new AiProviderRouter({
    providers: [sharedPrimary, secondFallback],
    now: clock.now,
    logger: secondRecording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await firstRouter.generate(makeRequest());
  }
  const result = await secondRouter.generate(makeRequest());

  assert.equal(result.provider, 'second-fallback');
  assert.equal(sharedPrimary.calls, 6, 'second router must still probe the shared provider instance');
  assert.equal(secondRecording.opened.length, 0);
});

test('all cooling providers throw AI_ALL_PROVIDERS_COOLING_DOWN without real calls', async () => {
  const sensitiveUuid = makeSensitiveUuid();
  const clock = createClock();
  const recording = createRecordingLogger();
  const first = new MockProvider('first', () => {
    throw new Error('sk-sensitive-first https://first-secret.invalid student-body');
  });
  const second = new MockProvider('second', () => {
    throw new Error(`${sensitiveUuid} raw-second-error`);
  });
  const router = new AiProviderRouter({
    providers: [first, second],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() => router.generate(makeRequest()), {
      code: 'AI_ALL_PROVIDERS_FAILED',
    });
  }

  let caught;
  try {
    await router.generate(makeRequest());
  } catch (error) {
    caught = error;
  }

  assert.equal(first.calls, 5);
  assert.equal(second.calls, 5);
  assert.equal(caught?.constructor.name, 'AllProvidersCoolingDownError');
  assert.equal(caught?.code, 'AI_ALL_PROVIDERS_COOLING_DOWN');
  assert.deepEqual(caught?.providers, ['first', 'second']);
  assert.equal(caught?.retryAt, '2026-07-16T00:10:00.000Z');
  const serializedError = JSON.stringify({
    code: caught?.code,
    providers: caught?.providers,
    retryAt: caught?.retryAt,
    message: caught?.message,
  });
  assert.equal(serializedError.includes('sk-sensitive-first'), false);
  assert.equal(serializedError.includes('first-secret.invalid'), false);
  assert.equal(serializedError.includes('student-body'), false);
  assert.equal(serializedError.includes(sensitiveUuid), false);
  assert.equal(serializedError.includes('raw-second-error'), false);
});

test('cooldown skips plus an actual failure retain AI_ALL_PROVIDERS_FAILED semantics', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  let secondaryShouldFail = false;
  const primary = new MockProvider('primary', () => {
    throw new Error('primary unavailable');
  });
  const secondary = new MockProvider('secondary', () => {
    if (secondaryShouldFail) throw new Error('secondary unavailable');
    return successResponse({ provider: 'secondary' });
  });
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await router.generate(makeRequest());
  }
  secondaryShouldFail = true;

  let caught;
  try {
    await router.generate(makeRequest());
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof AllProvidersFailedError);
  assert.equal(caught.code, 'AI_ALL_PROVIDERS_FAILED');
  assert.deepEqual(caught.failures, [
    { provider: 'primary', error: 'AI_PROVIDER_COOLDOWN' },
    { provider: 'secondary', error: 'secondary unavailable' },
  ]);
});
test('OpenAiProvider adapters use controlled .invalid fetch and skip cooled primary', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  let primaryFetchCalls = 0;
  let secondaryFetchCalls = 0;
  const completion = {
    id: 'chatcmpl-controlled',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-controlled',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: '受控响应' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  };
  const primary = new OpenAiProvider({
    name: 'primary-openai',
    baseURL: 'https://primary.invalid/v1',
    apiKey: 'test-primary-key',
    defaultModel: 'gpt-controlled',
    fetch: async (url) => {
      primaryFetchCalls += 1;
      assert.match(String(url), /^https:\/\/primary\.invalid\/v1\/chat\/completions/);
      throw new Error('controlled primary failure');
    },
  });
  const secondary = new OpenAiProvider({
    name: 'secondary-openai',
    baseURL: 'https://secondary.invalid/v1',
    apiKey: 'test-secondary-key',
    defaultModel: 'gpt-controlled',
    fetch: async (url) => {
      secondaryFetchCalls += 1;
      assert.match(String(url), /^https:\/\/secondary\.invalid\/v1\/chat\/completions/);
      return new Response(JSON.stringify(completion), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await router.generate(makeRequest());
    assert.equal(result.provider, 'secondary-openai');
    assert.equal(result.fallbackUsed, true);
  }

  assert.equal(primaryFetchCalls, 5);
  assert.equal(secondaryFetchCalls, 6);
  assert.equal(recording.opened.length, 1);
  assert.deepEqual(recording.successes.at(-1)?.attemptedProviders, [
    { provider: 'primary-openai', error: 'AI_PROVIDER_COOLDOWN' },
  ]);
});

test('circuit logger output uses a strict field allowlist and drops sensitive extras', () => {
  const sensitiveUuid = makeSensitiveUuid();
  const sensitiveValues = [
    'sk-sensitive-test-value',
    'https://provider-secret.invalid/v1',
    '学生正文不应进入熔断日志',
    sensitiveUuid,
    'raw provider failure detail',
  ];
  const originalConsoleLog = console.log;
  const output = [];
  console.log = (line) => output.push(String(line));

  try {
    aiLogger.recordCircuitOpened({
      provider: 'safe-provider',
      cooldownStartedAt: '2026-07-16T00:00:00.000Z',
      cooldownEndsAt: '2026-07-16T00:10:00.000Z',
      apiKey: sensitiveValues[0],
      baseURL: sensitiveValues[1],
      inputText: sensitiveValues[2],
      requestId: sensitiveValues[3],
      error: new Error(sensitiveValues[4]),
    });
    aiLogger.recordCircuitClosed({
      provider: 'safe-provider',
      cooldownEndedAt: '2026-07-16T00:10:00.000Z',
      apiKey: sensitiveValues[0],
      outputText: sensitiveValues[2],
      requestId: sensitiveValues[3],
    });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(output.length, 2);
  const opened = JSON.parse(output[0]);
  const closed = JSON.parse(output[1]);
  assert.deepEqual(Object.keys(opened).sort(), [
    'cooldownEndsAt',
    'cooldownStartedAt',
    'event',
    'level',
    'provider',
    'timestamp',
  ]);
  assert.deepEqual(Object.keys(closed).sort(), [
    'cooldownEndedAt',
    'event',
    'level',
    'provider',
    'timestamp',
  ]);
  assert.equal(opened.event, 'AI_PROVIDER_CIRCUIT_OPENED');
  assert.equal(closed.event, 'AI_PROVIDER_CIRCUIT_CLOSED');

  const serialized = JSON.stringify({ opened, closed });
  for (const sensitive of sensitiveValues) {
    assert.equal(serialized.includes(sensitive), false, `circuit logs leaked: ${sensitive}`);
  }
});
test('all cooling error reports the earliest provider recovery time', async () => {
  const clock = createClock();
  const recording = createRecordingLogger();
  let secondaryShouldFail = false;
  const primary = new MockProvider('primary', () => {
    throw new Error('primary unavailable');
  });
  const secondary = new MockProvider('secondary', () => {
    if (secondaryShouldFail) throw new Error('secondary unavailable');
    return successResponse({ provider: 'secondary' });
  });
  const router = new AiProviderRouter({
    providers: [primary, secondary],
    now: clock.now,
    logger: recording.logger,
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await router.generate(makeRequest());
  }
  secondaryShouldFail = true;

  for (let minute = 1; minute <= 5; minute += 1) {
    clock.advance(60 * 1000);
    await assert.rejects(() => router.generate(makeRequest()), {
      code: 'AI_ALL_PROVIDERS_FAILED',
    });
  }

  await assert.rejects(() => router.generate(makeRequest()), (error) => {
    assert.ok(error instanceof AllProvidersCoolingDownError);
    assert.equal(error.retryAt, '2026-07-16T00:10:00.000Z');
    assert.deepEqual(error.providers, ['primary', 'secondary']);
    return true;
  });
});
