export type ProviderPresetGroup = 'international' | 'mainland' | 'relay';
export type ProviderPresetProtocol = 'openai-compatible' | 'anthropic-native';
export type ProviderPresetAvailability = 'available' | 'coming-soon';

export interface AiProviderPreset {
  id: string;
  displayName: string;
  group: ProviderPresetGroup;
  protocol: ProviderPresetProtocol;
  availability: ProviderPresetAvailability;
  baseUrl: string;
  defaultModel: string;
  modelSuggestions: readonly string[];
  description: string;
  /**
   * 官方 Provider 的地址由预设固定；中转站没有官方地址，必须由用户自己填写，
   * 并且允许填多个备用地址（一个不通就试下一个）。
   */
  requiresBaseUrl: boolean;
  maxBaseUrls: number;
}

export interface ConfigurationPresets {
  ai: AiProviderPreset[];
  smtp: {
    host: 'smtp.qq.com';
    port: 465;
    secure: true;
    userHint: string;
    authCodeHint: string;
    recipientHint: string;
  };
  feishu: {
    webhookHint: string;
    securityHint: string;
  };
  customProviderHint: string;
}

const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  // === 国内主流 ===
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    group: 'mainland',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelSuggestions: ['deepseek-chat', 'deepseek-reasoner'],
    description: 'DeepSeek 推理模型，支持 deepseek-chat（快速）和 deepseek-reasoner（深度推理）。',
    requiresBaseUrl: false,
    maxBaseUrls: 1,
  },
  {
    id: 'kimi',
    displayName: 'Kimi（月之暗面）',
    group: 'mainland',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    modelSuggestions: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    description: 'Kimi 长上下文模型，支持 8k、32k、128k 不同上下文窗口。',
    requiresBaseUrl: false,
    maxBaseUrls: 1,
  },
  {
    id: 'glm',
    displayName: '智谱 GLM',
    group: 'mainland',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    modelSuggestions: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'],
    description: '智谱 GLM-4 系列模型，flash（快速）、plus（增强）、air（轻量）。',
    requiresBaseUrl: false,
    maxBaseUrls: 1,
  },
  // === 国外主流 ===
  {
    id: 'openai',
    displayName: 'OpenAI ChatGPT',
    group: 'international',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    modelSuggestions: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini', 'o1'],
    description: 'OpenAI GPT 系列，包括 GPT-4o 和 o1 推理模型。',
    requiresBaseUrl: false,
    maxBaseUrls: 1,
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    group: 'international',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    modelSuggestions: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    description: 'Anthropic Claude 3.5 系列，Sonnet（平衡）、Haiku（快速）、Opus（强大）。',
    requiresBaseUrl: false,
    maxBaseUrls: 1,
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    group: 'international',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash-exp',
    modelSuggestions: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    description: 'Google Gemini 系列，2.0-flash（最新）、1.5-flash（快速）、1.5-pro（强大）。',
    requiresBaseUrl: false,
    maxBaseUrls: 1,
  },
  // === 中转站（3个自定义槽位）===
  // 中转站没有官方地址：地址和 Key 都由用户填写。中转本身不稳定，所以每个槽位
  // 允许填多个请求地址，测试时逐个尝试，只要有一个通就用它。
  {
    id: 'relay-1',
    displayName: '中转站 1',
    group: 'relay',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: '',
    defaultModel: '',
    modelSuggestions: [],
    description:
      '自定义中转站，OpenAI 兼容接口。填写 API Key 和至少一个请求地址；可以多填几个备用地址，测试时逐个尝试，用第一个通的。',
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
    description:
      '自定义中转站，OpenAI 兼容接口。填写 API Key 和至少一个请求地址；可以多填几个备用地址，测试时逐个尝试，用第一个通的。',
    requiresBaseUrl: true,
    maxBaseUrls: 4,
  },
  {
    id: 'relay-3',
    displayName: '中转站 3',
    group: 'relay',
    protocol: 'openai-compatible',
    availability: 'available',
    baseUrl: '',
    defaultModel: '',
    modelSuggestions: [],
    description:
      '自定义中转站，OpenAI 兼容接口。填写 API Key 和至少一个请求地址；可以多填几个备用地址，测试时逐个尝试，用第一个通的。',
    requiresBaseUrl: true,
    maxBaseUrls: 4,
  },
];

export function getConfigurationPresets(): ConfigurationPresets {
  return {
    ai: AI_PROVIDER_PRESETS.map((preset) => ({ ...preset, modelSuggestions: [...preset.modelSuggestions] })),
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
}

export function findProviderPreset(id: string): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id);
}
