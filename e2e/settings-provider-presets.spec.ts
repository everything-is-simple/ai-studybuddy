import { expect, test } from '@playwright/test';

const status = {
  ai: { status: 'unconfigured', lastVerified: null, summary: null, details: [], errorCode: null },
  smtp: { status: 'unconfigured', lastVerified: null, summary: null, details: [], errorCode: null },
  feishu: { status: 'unconfigured', lastVerified: null, summary: null, details: [], errorCode: null },
  runtime: { dataDir: true, aiAvailable: false, smtpAvailable: false, feishuAvailable: false, uptime: 1, nodeVersion: 'v-e2e' },
};

const presets = {
  ai: [
    { id: 'openai', displayName: 'OpenAI', group: 'international', protocol: 'openai-compatible', availability: 'available', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5.5', modelSuggestions: ['gpt-5.5', 'gpt-5.4', 'gpt-5.6-terra', 'gpt-5.6-luna'], description: 'OpenAI 官方', requiresBaseUrl: false, maxBaseUrls: 1 },
    { id: 'claude', displayName: 'Claude / Anthropic', group: 'international', protocol: 'anthropic-native', availability: 'coming-soon', baseUrl: 'https://api.anthropic.com/v1', defaultModel: '', modelSuggestions: [], description: '后续适配', requiresBaseUrl: false, maxBaseUrls: 1 },
    { id: 'kimi', displayName: 'Kimi / Moonshot', group: 'mainland', protocol: 'openai-compatible', availability: 'available', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.7-code', modelSuggestions: ['kimi-k2.7-code', 'kimi-k2.7', 'kimi-k2.6'], description: 'Kimi 官方', requiresBaseUrl: false, maxBaseUrls: 1 },
    { id: 'relay-1', displayName: '中转站 1', group: 'relay', protocol: 'openai-compatible', availability: 'available', baseUrl: '', defaultModel: '', modelSuggestions: [], description: '自定义中转站', requiresBaseUrl: true, maxBaseUrls: 4 },
  ],
  smtp: { host: 'smtp.qq.com', port: 465, secure: true, userHint: '填写 QQ 邮箱账号', authCodeHint: '填写 SMTP 授权码，不是 QQ 登录密码', recipientHint: '填写收件邮箱' },
  feishu: { webhookHint: '填写飞书群机器人 Webhook URL', securityHint: 'Webhook 会加密保存在本机、页面不回显、不要复制到截图或提交到 Git。' },
  customProviderHint: '仅用于你自己的 OpenAI-compatible 服务；避免使用日抛、CPA 或来源不稳定的账号。',
};

function success(data: unknown) {
  return { success: true, data };
}

test('T12 设置中心通过 API mock 提供预设、脱敏失败与窄屏交互', async ({ page }) => {
  let aiActivationCount = 0;
  let receivedAiPayload: unknown;
  let currentStatus = status;

  await page.route('**/api/config/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/config/status') {
      await route.fulfill({ json: success(currentStatus) });
      return;
    }
    if (request.method() === 'GET' && pathname === '/api/config/presets') {
      await route.fulfill({ json: success(presets) });
      return;
    }
    if (request.method() === 'POST' && pathname === '/api/config/ai/test-provider') {
      // 中转站会送多个候选地址，取第一个当作测通的那个。
      const { baseUrls } = request.postDataJSON() as { baseUrls: string[] };
      await route.fulfill({
        json: success({ latencyMs: 12, supportedModels: [], resolvedBaseUrl: baseUrls[0], attempts: [{ baseUrl: baseUrls[0], pass: true }] }),
      });
      return;
    }
    if (request.method() === 'POST' && pathname === '/api/config/ai/test-and-activate') {
      receivedAiPayload = request.postDataJSON();
      aiActivationCount += 1;
      if (aiActivationCount > 1) {
        await route.fulfill({ status: 422, json: { success: false, error: { code: 'CONFIG_CONNECTION_TEST_FAILED', message: '连接测试失败' } } });
        return;
      }
      await route.fulfill({ json: success({ activated: true, test: { pass: true } }) });
      return;
    }
    if (request.method() === 'POST' && pathname.endsWith('/test-and-activate')) {
      await route.fulfill({ json: success({ activated: true, test: { pass: true } }) });
      return;
    }
    await route.fulfill({ status: 500, json: { success: false, error: { code: 'UNEXPECTED_REQUEST', message: '未预期请求' } } });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '本机配置中心', level: 1 })).toBeVisible();
  await expect(page.getByText('Kimi / Moonshot', { exact: true })).toBeVisible();
  await expect(page.getByText('按优先级失败切换 + 冷却，不是成功请求轮询。')).toBeVisible();
  await expect(page.getByRole('button', { name: /Claude \/ Anthropic.*后续适配/ })).toBeDisabled();

  const initialKimiKey = page.getByTestId('official-kimi-api-key');
  await initialKimiKey.fill('SENTINEL_E2E_VISIBILITY');
  await expect(initialKimiKey).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: '显示 Kimi / Moonshot API Key' }).click();
  await expect(initialKimiKey).toHaveAttribute('type', 'text');
  await expect(initialKimiKey).toHaveValue('SENTINEL_E2E_VISIBILITY');
  await page.getByRole('button', { name: '隐藏 Kimi / Moonshot API Key' }).click();
  await expect(initialKimiKey).toHaveAttribute('type', 'password');
  await page.reload();
  await expect(page.getByTestId('official-kimi-api-key')).toHaveAttribute('type', 'password');
  await expect(page.getByTestId('official-kimi-api-key')).toHaveValue('');
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });

  await expect(page.getByTestId('custom-provider-advanced')).toHaveAttribute('open', '');

  // 中转站没有官方地址，必须给出可填地址的输入框；官方 Provider 不给。
  const relayCard = page.locator('.provider-preset-card', { has: page.getByRole('heading', { name: '中转站 1', level: 4 }) });
  await expect(relayCard.getByTestId('official-relay-1-base-url-0')).toBeVisible();
  await expect(relayCard).not.toContainText('官方 API 地址');
  await expect(page.getByTestId('official-openai-base-url-0')).toHaveCount(0);

  const kimiCard = page.locator('.provider-preset-card', { has: page.getByRole('heading', { name: 'Kimi / Moonshot', level: 4 }) });
  await kimiCard.getByTestId('official-kimi-api-key').fill('FAKE_E2E_KIMI_KEY');
  // 现在必须先测通才能加入 fallback。
  await expect(kimiCard.getByRole('button', { name: '加入 fallback' })).toBeDisabled();
  await kimiCard.getByRole('button', { name: '测试此 Provider' }).click();
  await kimiCard.getByRole('button', { name: '加入 fallback' }).click();
  await expect(page.getByLabel('Provider fallback 优先级')).toContainText('优先级 1');
  await page.getByRole('button', { name: '测试并激活 AI' }).click();
  await expect(page.getByText('连接通过，配置已激活', { exact: true })).toBeVisible();
  expect(receivedAiPayload).toEqual({ providers: [{ kind: 'official', presetId: 'kimi', apiKey: 'FAKE_E2E_KIMI_KEY', model: 'kimi-k2.7-code', priority: 1 }] });
  await expect(kimiCard.getByTestId('official-kimi-api-key')).toHaveValue('');

  await kimiCard.getByTestId('official-kimi-api-key').fill('FAKE_E2E_FAIL_KEY');
  await kimiCard.getByRole('button', { name: '测试此 Provider' }).click();
  await kimiCard.getByRole('button', { name: '加入 fallback' }).click();
  await page.getByRole('button', { name: '测试并激活 AI' }).click();
  await expect(page.getByText('测试失败：CONFIG_CONNECTION_TEST_FAILED', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('FAKE_E2E_KIMI_KEY');
  await expect(page.locator('body')).not.toContainText('FAKE_E2E_FAIL_KEY');

  currentStatus = {
    ...status,
    ai: {
      status: 'environment_fallback',
      lastVerified: null,
      summary: '2 个 Provider：model-primary、model-backup',
      details: [
        { label: '本机中转站', value: 'model-primary · 优先级 1' },
        { label: 'Kimi / Moonshot', value: 'model-backup · 优先级 2' },
      ],
      errorCode: null,
    },
    smtp: {
      status: 'environment_fallback', lastVerified: null, summary: 'QQ SMTP 已激活',
      details: [{ label: '账号', value: 'se••••••@example.test' }, { label: 'SMTP 授权码', value: '•••••••• 已保存，不可回显' }], errorCode: null,
    },
    feishu: {
      status: 'environment_fallback', lastVerified: null, summary: '飞书 Webhook 已激活',
      details: [{ label: '飞书 Webhook', value: '•••••••• 已保存，不可回显' }], errorCode: null,
    },
  };
  await page.reload();
  await expect(page.getByText('环境配置（待验证）', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('AI Provider 已有配置摘要')).toContainText('本机中转站');
  await expect(page.getByRole('button', { name: '测试现有配置' }).first()).toBeVisible();
  await expect(page.locator('body')).toContainText('•••••••• 已保存，不可回显');
  await expect(page.locator('body')).not.toContainText('FAKE_E2E_KIMI_KEY');
  await expect(kimiCard.getByTestId('official-kimi-api-key')).toHaveValue('');
  const browserStorage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(JSON.stringify(browserStorage)).not.toMatch(/FAKE_E2E_KIMI_KEY/);

  const screenshotPath = test.info().outputPath('settings-config-audit.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await test.info().attach('settings-config-audit', { path: screenshotPath, contentType: 'image/png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '本机配置中心', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
