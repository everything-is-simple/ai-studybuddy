import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../src/api/api-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  unconfigured: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
  verified: { status: 'verified_pass', lastVerified: '2026-07-17T12:00:00.000Z', summary: '已配置', errorCode: null },
  statusFixture: {
    ai: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
    smtp: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
    feishu: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
    runtime: {
      dataDir: true,
      aiAvailable: false,
      smtpAvailable: false,
      feishuAvailable: false,
      uptime: 5,
      nodeVersion: 'v22.test',
    },
  },
  getConfigurationStatus: vi.fn(),
  testAndActivate: vi.fn(),
  retestConfiguration: vi.fn(),
}));

vi.mock('../src/api/configuration-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/configuration-api')>()),
  getConfigurationStatus: mocks.getConfigurationStatus,
  testAndActivate: mocks.testAndActivate,
  retestConfiguration: mocks.retestConfiguration,
}));

let container: HTMLDivElement;
let root: Root;
let localStorageShim: Storage;

beforeEach(() => {
  localStorageShim = createLocalStorageShim();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: localStorageShim, configurable: true });
  localStorage.clear();
  mocks.statusFixture = {
    ai: { ...mocks.unconfigured },
    smtp: { ...mocks.unconfigured },
    feishu: { ...mocks.unconfigured },
    runtime: {
      dataDir: true,
      aiAvailable: false,
      smtpAvailable: false,
      feishuAvailable: false,
      uptime: 5,
      nodeVersion: 'v22.test',
    },
  };
  mocks.getConfigurationStatus.mockImplementation(async () => mocks.statusFixture);
  mocks.testAndActivate.mockResolvedValue({ activated: true, test: { pass: true } });
  mocks.retestConfiguration.mockResolvedValue({ activated: false, test: { pass: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  vi.clearAllMocks();
  localStorage.clear();
});

function createLocalStorageShim(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

async function flush() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

async function renderSettingsPage() {
  const { default: SettingsPage } = await import('../src/pages/settings-page');
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
  });
  await flush();
}

async function renderApp() {
  const { App } = await import('../src/app');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );
  });
  await flush();
}

function input(testId: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  expect(element, `应找到输入框：${testId}`).not.toBeNull();
  return element!;
}

function buttonContaining(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes(label));
  expect(button, `应找到按钮：${label}`).not.toBeNull();
  return button!;
}

async function setInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('settings page', () => {
  it('shows runtime status and config sections', async () => {
    mocks.statusFixture = {
      ...mocks.statusFixture,
      ai: { ...mocks.unconfigured, errorCode: 'CONFIG_DPAPI_UNAVAILABLE' },
    };
    await renderSettingsPage();

    expect(container.textContent).toContain('运行状态');
    expect(container.textContent).toContain('Node v22.test');
    expect(container.textContent).toContain('AI Provider');
    expect(container.textContent).toContain('QQ SMTP');
    expect(container.textContent).toContain('飞书 Webhook');
    expect(container.textContent).toContain('CONFIG_DPAPI_UNAVAILABLE');
  });

  it('tests and activates AI config then clears secret fields', async () => {
    await renderSettingsPage();
    const apiKeyInput = input('ai-provider-0-api-key');

    await setInput(input('ai-provider-0-name'), 'main');
    await setInput(input('ai-provider-0-base-url'), 'http://127.0.0.1:3001/v1');
    await setInput(apiKeyInput, 'sk-test-secret');
    await setInput(input('ai-provider-0-model'), 'test-model');

    await act(async () => buttonContaining('测试并激活 AI').click());
    await flush();

    expect(mocks.testAndActivate).toHaveBeenCalledWith('ai', {
      providers: [
        {
          name: 'main',
          baseUrl: 'http://127.0.0.1:3001/v1',
          apiKey: 'sk-test-secret',
          model: 'test-model',
          priority: 1,
        },
      ],
    });
    expect(apiKeyInput.value).toBe('');
    expect(container.textContent).toContain('连接通过，配置已激活');
    expect(localStorage.getItem('sk-test-secret')).toBeNull();
  });

  it('shows fixed error code when connection test fails without rendering the secret', async () => {
    mocks.testAndActivate.mockRejectedValue(new ApiClientError('AI_TEST_FAILED', '测试失败'));
    await renderSettingsPage();

    await setInput(input('ai-provider-0-api-key'), 'sk-failed-secret');
    await act(async () => buttonContaining('测试并激活 AI').click());
    await flush();

    expect(container.textContent).toContain('测试失败：AI_TEST_FAILED');
    expect(container.textContent).not.toContain('sk-failed-secret');
    expect(localStorage.getItem('sk-failed-secret')).toBeNull();
  });

  it('shows first-run guide in app shell when all channels are unconfigured', async () => {
    await renderApp();

    expect(container.textContent).toContain('首次使用建议先完成本机配置。');
    expect(container.textContent).toContain('进入配置中心');
  });
});
