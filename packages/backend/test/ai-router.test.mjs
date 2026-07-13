import assert from 'node:assert/strict';
import test from 'node:test';
import { AiProviderRouter, AiProviderError, AllProvidersFailedError } from '../dist/adapters/ai/router.js';
import { OpenAiProvider } from '../dist/adapters/ai/openai-provider.js';

function makeRequest(inputText = '测试输入') {
  return { taskType: 'note_generation', inputText };
}

class MockProvider {
  constructor(name, behavior) {
    this.name = name;
    this.behavior = behavior;
  }

  async generate(request) {
    return this.behavior(request);
  }
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
