export type ProviderPresetGroup = 'international' | 'mainland' | 'alternative';
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
  {
    id: 'openai', displayName: 'OpenAI', group: 'international', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5.5',
    modelSuggestions: ['gpt-5.5', 'gpt-5.4', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    description: '使用 OpenAI 官方 API。',
  },
  {
    id: 'claude', displayName: 'Claude / Anthropic', group: 'international', protocol: 'anthropic-native', availability: 'coming-soon',
    baseUrl: 'https://api.anthropic.com/v1', defaultModel: '', modelSuggestions: [],
    description: '后续适配：当前后端尚未提供 Anthropic Native Adapter。',
  },
  {
    id: 'gemini', displayName: 'Gemini', group: 'international', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-3.5-flash', modelSuggestions: ['gemini-3.5-flash'],
    description: '使用 Gemini 官方 OpenAI 兼容接口。',
  },
  {
    id: 'grok', displayName: 'Grok / xAI', group: 'international', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4.3', modelSuggestions: ['grok-4.3'],
    description: '使用 xAI 官方 API。',
  },
  {
    id: 'glm', displayName: '智谱 GLM', group: 'mainland', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5', modelSuggestions: ['glm-5'],
    description: '使用智谱官方 OpenAI 兼容接口。',
  },
  {
    id: 'kimi', displayName: 'Kimi / Moonshot', group: 'mainland', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.7-code', modelSuggestions: ['kimi-k2.7-code', 'kimi-k2.7', 'kimi-k2.6'],
    description: '使用 Moonshot 官方 API。',
  },
  {
    id: 'deepseek', displayName: 'DeepSeek', group: 'mainland', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash', modelSuggestions: ['deepseek-v4-flash'],
    description: '使用 DeepSeek 官方 API。',
  },
  {
    id: 'minimax', displayName: 'MiniMax', group: 'alternative', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://api.minimaxi.com/v1', defaultModel: 'MiniMax-M2.5', modelSuggestions: ['MiniMax-M2.5'],
    description: '使用 MiniMax 官方 OpenAI 兼容接口。',
  },
  {
    id: 'qwen', displayName: 'Qwen / DashScope', group: 'alternative', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3.5-plus', modelSuggestions: ['qwen3.5-plus'],
    description: '使用阿里云百炼官方兼容接口。',
  },
  {
    id: 'stepfun', displayName: 'StepFun', group: 'alternative', protocol: 'openai-compatible', availability: 'available',
    baseUrl: 'https://api.stepfun.com/v1', defaultModel: 'step-3.5-flash', modelSuggestions: ['step-3.5-flash'],
    description: '使用阶跃星辰官方 OpenAI 兼容接口。',
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
