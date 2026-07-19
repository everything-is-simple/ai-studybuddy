import { expect, test } from '@playwright/test';

const status = {
  ai: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
  smtp: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
  feishu: { status: 'unconfigured', lastVerified: null, summary: null, errorCode: null },
  runtime: { dataDir: true, aiAvailable: false, smtpAvailable: false, feishuAvailable: false, uptime: 1, nodeVersion: 'v-e2e' },
};

const presets = {
  ai: [
    { id: 'openai', displayName: 'OpenAI', group: 'international', protocol: 'openai-compatible', availability: 'available', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5.5', modelSuggestions: ['gpt-5.5', 'gpt-5.4', 'gpt-5.6-terra', 'gpt-5.6-luna'], description: 'OpenAI 官方' },
    { id: 'claude', displayName: 'Claude / Anthropic', group: 'international', protocol: 'anthropic-native', availability: 'coming-soon', baseUrl: 'https://api.anthropic.com/v1', defaultModel: '', modelSuggestions: [], description: '后续适配' },
    { id: 'kimi', displayName: 'Kimi / Moonshot', group: 'mainland', protocol: 'openai-compatible', availability: 'available', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.7-code', modelSuggestions: ['kimi-k2.7-code', 'kimi-k2.7', 'kimi-k2.6'], description: 'Kimi 官方' },
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

  await page.route('**/api/config/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/config/status') {
      await route.fulfill({ json: success(status) });
      return;
    }
    if (request.method() === 'GET' && pathname === '/api/config/presets') {
      await route.fulfill({ json: success(presets) });
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

  const kimiCard = page.locator('.provider-preset-card', { has: page.getByRole('heading', { name: 'Kimi / Moonshot', level: 4 }) });
  await kimiCard.getByLabel('API Key').fill('FAKE_E2E_KIMI_KEY');
  await kimiCard.getByRole('button', { name: '加入 fallback' }).click();
  await expect(page.getByLabel('Provider fallback 优先级')).toContainText('优先级 1');
  await page.getByRole('button', { name: '测试并激活 AI' }).click();
  await expect(page.getByText('连接通过，配置已激活', { exact: true })).toBeVisible();
  expect(receivedAiPayload).toEqual({ providers: [{ kind: 'official', presetId: 'kimi', apiKey: 'FAKE_E2E_KIMI_KEY', model: 'kimi-k2.7-code', priority: 1 }] });
  await expect(kimiCard.getByLabel('API Key')).toHaveValue('');

  await kimiCard.getByLabel('API Key').fill('FAKE_E2E_FAIL_KEY');
  await kimiCard.getByRole('button', { name: '加入 fallback' }).click();
  await page.getByRole('button', { name: '测试并激活 AI' }).click();
  await expect(page.getByText('测试失败：CONFIG_CONNECTION_TEST_FAILED', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('FAKE_E2E_KIMI_KEY');
  await expect(page.locator('body')).not.toContainText('FAKE_E2E_FAIL_KEY');

  await page.reload();
  await expect(page.locator('body')).not.toContainText('FAKE_E2E_KIMI_KEY');
  await expect(kimiCard.getByLabel('API Key')).toHaveValue('');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '本机配置中心', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
