import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../src/api/api-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const presetsFixture = {
  ai: [
    {
      id: 'openai',
      displayName: 'OpenAI',
      group: 'international',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.5',
      modelSuggestions: ['gpt-5.5', 'gpt-5.4', 'gpt-5.6-terra', 'gpt-5.6-luna'],
      description: 'OpenAI 官方',
    },
    {
      id: 'claude',
      displayName: 'Claude / Anthropic',
      group: 'international',
      protocol: 'anthropic-native',
      availability: 'coming-soon',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: '',
      modelSuggestions: [],
      description: '后续适配',
    },
    {
      id: 'gemini',
      displayName: 'Gemini',
      group: 'international',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: 'https://gemini.invalid/v1',
      defaultModel: 'gemini-test',
      modelSuggestions: ['gemini-test'],
      description: 'Gemini 官方',
    },
    {
      id: 'grok',
      displayName: 'Grok / xAI',
      group: 'international',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: 'https://grok.invalid/v1',
      defaultModel: 'grok-test',
      modelSuggestions: ['grok-test'],
      description: 'Grok 官方',
    },
    {
      id: 'glm',
      displayName: '智谱 GLM',
      group: 'mainland',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: 'https://glm.invalid/v1',
      defaultModel: 'glm-test',
      modelSuggestions: ['glm-test'],
      description: 'GLM 官方',
    },
    {
      id: 'kimi',
      displayName: 'Kimi / Moonshot',
      group: 'mainland',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: 'https://api.moonshot.cn/v1',
      defaultModel: 'kimi-k2.7-code',
      modelSuggestions: ['kimi-k2.7-code', 'kimi-k2.7', 'kimi-k2.6'],
      description: 'Kimi 官方',
    },
    {
      id: 'deepseek',
      displayName: 'DeepSeek',
      group: 'mainland',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: 'https://deepseek.invalid/v1',
      defaultModel: 'deepseek-test',
      modelSuggestions: ['deepseek-test'],
      description: 'DeepSeek 官方',
    },
    {
      id: 'relay-1',
      displayName: '中转站 1',
      group: 'relay',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: '',
      defaultModel: '',
      modelSuggestions: [],
      description: '自定义中转站',
      requiresBaseUrl: true,
      maxBaseUrls: 4,
    },
    {
      id: 'relay-2',
      displayName: '中转站 2',
      group: 'relay',
      protocol: 'openai-compatible',
      availability: 'available',
      baseUrl: '',
      defaultModel: '',
      modelSuggestions: [],
      description: '自定义中转站',
      requiresBaseUrl: true,
      maxBaseUrls: 4,
    },
  ],
  smtp: {
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    userHint: '填写 QQ 邮箱账号',
    authCodeHint: '填写 SMTP 授权码，不是 QQ 登录密码',
    recipientHint: '填写收件邮箱',
  },
  feishu: {
    webhookHint: '填写飞书群机器人 Webhook URL',
    securityHint: 'Webhook 会加密保存在本机、页面不回显、不要复制到截图或提交到 Git。',
  },
  customProviderHint: '仅用于你自己的 OpenAI-compatible 服务；避免使用日抛、CPA 或来源不稳定的账号。',
};

const mocks = vi.hoisted(() => ({
  unconfigured: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
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
  getConfigurationPresets: vi.fn(),
  testAndActivate: vi.fn(),
  retestConfiguration: vi.fn(),
  testSingleProvider: vi.fn(),
}));

vi.mock('../src/api/configuration-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/configuration-api')>()),
  getConfigurationStatus: mocks.getConfigurationStatus,
  getConfigurationPresets: mocks.getConfigurationPresets,
  testAndActivate: mocks.testAndActivate,
  retestConfiguration: mocks.retestConfiguration,
  testSingleProvider: mocks.testSingleProvider,
}));

let container: HTMLDivElement;
let root: Root;
let localStorageShim: Storage;
let sessionStorageShim: Storage;
let setItemSpy: ReturnType<typeof vi.spyOn>;
let sessionSetItemSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorageShim = createStorageShim();
  sessionStorageShim = createStorageShim();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: localStorageShim, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageShim, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorageShim, configurable: true });
  setItemSpy = vi.spyOn(localStorageShim, 'setItem');
  sessionSetItemSpy = vi.spyOn(sessionStorageShim, 'setItem');
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
  mocks.getConfigurationPresets.mockResolvedValue(presetsFixture);
  mocks.testAndActivate.mockResolvedValue({ activated: true, test: { pass: true } });
  mocks.retestConfiguration.mockResolvedValue({ activated: false, test: { pass: true } });
  mocks.testSingleProvider.mockImplementation(async ({ baseUrls }: { baseUrls: string[] }) => ({
    latencyMs: 12,
    supportedModels: [],
    resolvedBaseUrl: baseUrls[0],
    attempts: [{ baseUrl: baseUrls[0], pass: true }],
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  vi.clearAllMocks();
});

function createStorageShim(): Storage {
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
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  });
}

async function renderSettingsPage() {
  const { default: SettingsPage } = await import('../src/pages/settings-page');
  await act(async () => { root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SettingsPage /></MemoryRouter>); });
  await flush();
}

async function renderApp() {
  const { App } = await import('../src/app');
  await act(async () => { root.render(<MemoryRouter initialEntries={['/settings']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></MemoryRouter>); });
  await flush();
}

function input(testId: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  expect(element, `应找到输入框：${testId}`).not.toBeNull();
  return element!;
}

function select(testId: string): HTMLSelectElement {
  const element = container.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`);
  expect(element, `应找到下拉框：${testId}`).not.toBeNull();
  return element!;
}

function buttonContaining(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(label)
  );
  expect(button, `应找到按钮：${label}`).not.toBeNull();
  return button!;
}

function buttonByAriaLabel(label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button, `应找到按钮：${label}`).not.toBeNull();
  return button!;
}

function presetCard(name: string): HTMLElement {
  const card = [...container.querySelectorAll<HTMLElement>('.provider-preset-card')].find(
    (item) => item.querySelector('h4')?.textContent === name
  );
  expect(card, `应找到预设卡：${name}`).not.toBeNull();
  return card!;
}

async function setInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function cardButton(name: string, label: string): HTMLButtonElement {
  const button = [...presetCard(name).querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(label)
  );
  expect(button, `应在卡片 ${name} 找到按钮：${label}`).not.toBeNull();
  return button!;
}

/** 现在必须先测通才能加入 fallback，所以每次加入前都要走一遍测试。 */
async function testThenAdd(name: string) {
  await act(async () => cardButton(name, '测试此 Provider').click());
  await flush();
  await act(async () => cardButton(name, '加入 fallback').click());
  await flush();
}

describe('settings page', () => {
  it('renders server-provided official presets in groups without editable official base URLs', async () => {
    await renderSettingsPage();

    expect(container.textContent).toContain('国外主流');
    expect(container.textContent).toContain('国内主流');
    expect(container.textContent).toContain('中转站');
    expect(container.textContent).toContain('OpenAI');
    expect(container.textContent).toContain('Kimi / Moonshot');
    expect(container.textContent).toContain('后续适配');
    expect(buttonContaining('Claude / Anthropic').disabled).toBe(true);
    expect(container.querySelector('[data-testid="official-openai-base-url"]')).toBeNull();

    expect([...select('official-openai-model').options].map((option) => option.value)).toEqual([
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
    expect([...select('official-kimi-model').options].map((option) => option.value)).toEqual([
      'kimi-k2.7-code',
      'kimi-k2.7',
      'kimi-k2.6',
    ]);
    expect(input('official-kimi-api-key').type).toBe('password');
    expect(container.textContent).toContain('配置中心测试激活的连接信息使用当前 Windows 用户的 DPAPI 加密存储');
    expect(container.textContent).toContain('环境 fallback 来自进程环境或命中的配置文件');
  });

  it('reveals only the current sentinel secret and resets masking after remount without browser storage', async () => {
    await renderSettingsPage();

    const secrets = [
      { testId: 'official-kimi-api-key', label: 'Kimi / Moonshot API Key', sentinel: 'SENTINEL_AI_VISIBLE' },
      { testId: 'custom-provider-api-key', label: '自定义 Provider API Key', sentinel: 'SENTINEL_RELAY_VISIBLE' },
      { testId: 'smtp-auth-code', label: 'SMTP 授权码', sentinel: 'SENTINEL_SMTP_VISIBLE' },
      { testId: 'feishu-webhook-url', label: '飞书 Webhook', sentinel: 'SENTINEL_FEISHU_VISIBLE' },
    ];

    for (const secret of secrets) {
      const field = input(secret.testId);
      await setInput(field, secret.sentinel);
      expect(field.type).toBe('password');
      await act(async () => buttonByAriaLabel('显示 ' + secret.label).click());
      expect(field.type).toBe('text');
      expect(field.value).toBe(secret.sentinel);
      await act(async () => buttonByAriaLabel('隐藏 ' + secret.label).click());
      expect(field.type).toBe('password');
    }

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(sessionSetItemSpy).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderSettingsPage();
    for (const secret of secrets) {
      expect(input(secret.testId).type).toBe('password');
      expect(input(secret.testId).value).toBe('');
    }
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(sessionSetItemSpy).not.toHaveBeenCalled();
  });

  it('submits official fallback candidates by priority, then clears API keys without browser storage', async () => {
    await renderSettingsPage();
    await setInput(input('official-kimi-api-key'), 'FAKE_KIMI_SECRET');
    await act(async () => buttonByAriaLabel('显示 Kimi / Moonshot API Key').click());
    expect(input('official-kimi-api-key').type).toBe('text');
    await testThenAdd('Kimi / Moonshot');

    // 加入 fallback 会清空 Key，SecretInput 在值变空后自动回到遮蔽态。
    expect(input('official-kimi-api-key').value).toBe('');
    expect(input('official-kimi-api-key').type).toBe('password');
    await setInput(input('official-kimi-api-key'), 'SENTINEL_AFTER_CLEAR');
    expect(input('official-kimi-api-key').type).toBe('password');
    await setInput(input('official-kimi-api-key'), '');
    expect(container.textContent).toContain('优先级 1');
    await act(async () => buttonContaining('测试并激活 AI').click());
    await flush();

    expect(mocks.testAndActivate).toHaveBeenCalledWith('ai', {
      providers: [
        { kind: 'official', presetId: 'kimi', apiKey: 'FAKE_KIMI_SECRET', model: 'kimi-k2.7-code', priority: 1 },
      ],
    });
    expect(input('official-kimi-api-key').value).toBe('');
    expect(container.textContent).toContain('还没有加入 fallback 的 Provider。');
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('FAKE_KIMI_SECRET');
  });

  it('moves and removes fallback candidates while deriving the displayed priority from list order', async () => {
    await renderSettingsPage();
    await setInput(input('official-kimi-api-key'), 'FAKE_KIMI_MOVE');
    await testThenAdd('Kimi / Moonshot');
    await setInput(input('official-openai-api-key'), 'FAKE_OPENAI_MOVE');
    await testThenAdd('OpenAI');

    const items = () => [...container.querySelectorAll<HTMLElement>('.fallback-list li')];
    expect(items()).toHaveLength(2);
    expect(items()[0].textContent).toContain('Kimi / Moonshot');
    expect(items()[1].textContent).toContain('OpenAI');
    await act(async () =>
      [...items()[1].querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '上移')!
        .click()
    );
    await flush();
    expect(items()[0].textContent).toContain('OpenAI');
    expect(items()[0].textContent).toContain('优先级 1');
    await act(async () =>
      [...items()[0].querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === '移除')!
        .click()
    );
    await flush();
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toContain('Kimi / Moonshot');
  });
  it('keeps QQ SMTP and Feishu first screens minimal, secure, and secret-free after a failed request', async () => {
    mocks.testAndActivate.mockRejectedValue(new ApiClientError('CONFIG_CONNECTION_TEST_FAILED', '失败'));
    await renderSettingsPage();

    expect(container.querySelector('details[data-testid="custom-provider-advanced"]')).not.toBeNull();
    expect(
      (container.querySelector('details[data-testid="custom-provider-advanced"]') as HTMLDetailsElement).open
    ).toBe(true);
    expect(container.querySelector('details[data-testid="smtp-advanced"]')).not.toBeNull();
    expect((container.querySelector('details[data-testid="smtp-advanced"]') as HTMLDetailsElement).open).toBe(false);
    expect(container.querySelector('[data-testid="smtp-host"]')?.closest('details')).toBe(
      container.querySelector('details[data-testid="smtp-advanced"]')
    );
    expect(container.querySelector('[data-testid="smtp-port"]')?.closest('details')).toBe(
      container.querySelector('details[data-testid="smtp-advanced"]')
    );
    expect(input('smtp-user').type).toBe('text');
    expect(input('smtp-auth-code').type).toBe('password');
    expect(input('smtp-to').type).toBe('text');
    expect(input('feishu-webhook-url').type).toBe('password');
    expect(container.textContent).toContain('Webhook 会加密保存在本机、页面不回显');

    await setInput(input('smtp-auth-code'), 'FAKE_SMTP_SECRET');
    await act(async () => buttonContaining('测试并激活 SMTP').click());
    await flush();
    expect(input('smtp-auth-code').value).toBe('');
    expect(container.textContent).not.toContain('FAKE_SMTP_SECRET');

    await setInput(input('feishu-webhook-url'), 'FAKE_FEISHU_SECRET');
    await act(async () => buttonContaining('测试并激活飞书').click());
    await flush();
    expect(input('feishu-webhook-url').value).toBe('');
    expect(container.textContent).not.toContain('FAKE_FEISHU_SECRET');
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('lets relay slots take user-entered addresses while official providers keep fixed ones', async () => {
    await renderSettingsPage();

    // 官方 Provider：地址由预设固定，不给编辑框。
    expect(container.querySelector('[data-testid="official-kimi-base-url-0"]')).toBeNull();
    expect(presetCard('Kimi / Moonshot').textContent).toContain('官方 API 地址');

    // 中转站：必须有地址输入框，且不该显示"官方 API 地址"。
    const relayCard = presetCard('中转站 1');
    expect(relayCard.textContent).not.toContain('官方 API 地址');
    expect(input('official-relay-1-base-url-0')).not.toBeNull();

    // 只填 Key 不填地址时不能测试。
    await setInput(input('official-relay-1-api-key'), 'FAKE_RELAY_KEY');
    expect(cardButton('中转站 1', '测试此 Provider').disabled).toBe(true);

    await setInput(input('official-relay-1-base-url-0'), 'https://relay-a.invalid/v1');
    expect(cardButton('中转站 1', '测试此 Provider').disabled).toBe(false);
  });

  it('tries every relay address in order and adopts the one that answers', async () => {
    mocks.testSingleProvider.mockResolvedValue({
      latencyMs: 30,
      supportedModels: ['relay-gpt-4o', 'relay-claude'],
      resolvedBaseUrl: 'https://relay-b.invalid/v1',
      attempts: [
        { baseUrl: 'https://relay-a.invalid/v1', pass: false, errorCode: 'AI_UNKNOWN' },
        { baseUrl: 'https://relay-b.invalid/v1', pass: true },
      ],
    });
    await renderSettingsPage();

    await setInput(input('official-relay-1-api-key'), 'FAKE_RELAY_KEY');
    await setInput(input('official-relay-1-base-url-0'), 'https://relay-a.invalid/v1');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="official-relay-1-add-base-url"]')!.click()
    );
    await flush();
    await setInput(input('official-relay-1-base-url-1'), 'https://relay-b.invalid/v1');

    await act(async () => cardButton('中转站 1', '测试此 Provider').click());
    await flush();

    // 两个地址都要送到后端，顺序保持用户填写的顺序。
    expect(mocks.testSingleProvider).toHaveBeenCalledWith({
      name: '中转站 1',
      baseUrls: ['https://relay-a.invalid/v1', 'https://relay-b.invalid/v1'],
      apiKey: 'FAKE_RELAY_KEY',
      model: '',
    });

    // 模型来自中转站实际返回，而不是预设。
    expect([...select('official-relay-1-model').options].map((option) => option.value)).toEqual([
      'relay-gpt-4o',
      'relay-claude',
    ]);
    expect(presetCard('中转站 1').textContent).toContain('https://relay-b.invalid/v1');

    await act(async () => cardButton('中转站 1', '加入 fallback').click());
    await flush();
    await act(async () => buttonContaining('测试并激活 AI').click());
    await flush();

    // 激活时必须带上测通的那个地址，否则后端不知道该请求哪里。
    expect(mocks.testAndActivate).toHaveBeenCalledWith('ai', {
      providers: [
        {
          kind: 'official',
          presetId: 'relay-1',
          baseUrl: 'https://relay-b.invalid/v1',
          apiKey: 'FAKE_RELAY_KEY',
          model: 'relay-gpt-4o',
          priority: 1,
        },
      ],
    });
  });

  it('invalidates a passed test when the address or key changes afterwards', async () => {
    await renderSettingsPage();

    await setInput(input('official-relay-1-api-key'), 'FAKE_RELAY_KEY');
    await setInput(input('official-relay-1-base-url-0'), 'https://relay-a.invalid/v1');
    await act(async () => cardButton('中转站 1', '测试此 Provider').click());
    await flush();
    expect(cardButton('中转站 1', '加入 fallback').disabled).toBe(false);

    // 改了地址就不能再用旧的测试结果加入 fallback。
    await setInput(input('official-relay-1-base-url-0'), 'https://relay-changed.invalid/v1');
    expect(cardButton('中转站 1', '加入 fallback').disabled).toBe(true);
  });

  it('shows first-run guide in app shell when all channels are unconfigured', async () => {
    await renderApp();
    expect(container.textContent).toContain('首次使用建议先完成本机配置。');
    expect(container.textContent).toContain('进入配置中心');
  });
});
