import OpenAI from 'openai';
import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';
import type { AiProvider } from './provider';

export interface OpenAiProviderOptions {
  name: string;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

// note_generation 严格 JSON 契约：schema 与 material-job-worker.parseAi / toMindMapData 的校验逐字段对齐。
// 输出必须是可以直接 JSON.parse 的单个 JSON 对象，不含 Markdown 围栏、不含任何解说文字。
// 服务端仍会做兜底清洗（sanitizeAiJson），但提示词优先让模型少走弯路。
const NOTE_GENERATION_SYSTEM_PROMPT = [
  '你是一名学习助手，请根据输入资料生成结构化的中文学习笔记。',
  '',
  '严格输出规则：',
  '1. 只返回一个 JSON 对象，不要包裹在 Markdown 代码块（如 ```json ... ```）里，不要在 JSON 之外增加解说、前后缀、寒暄或引导语。',
  '2. JSON 字段必须严格匹配下列 schema，字段名与取值均不得改动：',
  '',
  '{',
  '  "markdown": string,               // 非空。结构化中文笔记，允许 KaTeX 行内 $...$ 与块级 $$...$$。',
  '  "highlights": Array<{',
  '    "content": string,              // 非空。要点原文或摘要。',
  '    "importance": "low" | "medium" | "high",',
  '    "position": string              // 非空。要点在资料中的位置线索（如「第 1 段」「第 2 页」）。',
  '  }>,',
  '  "mindMap": string,                // Markmap Markdown 层级：必须至少含一个「# 一级」标题与一个「## 二级」标题。',
  '  "knowledgeModules": Array<{       // 非空数组，至少 1 项。',
  '    "title": string,                // 非空。',
  '    "contentSummary": string,       // 可选。若无可省略该字段（不要写 null）。',
  '    "importance": "low" | "medium" | "high" | "critical",',
  '    "difficulty": "easy" | "medium" | "hard",',
  '    "sourceEvidence": string,       // 非空。可在输入资料中定位到的原文片段或关键词。',
  '    "examRelevance": string         // 可选。若无可省略该字段（不要写 null）。',
  '  }>',
  '}',
  '',
  '3. 语言：全部中文。禁止只返回英文、只返回思维导图、只返回大纲。',
  '4. 若你判断资料过短或含义不明，仍须返回符合 schema 的 JSON（至少 1 个 knowledgeModule），不得返回错误说明。',
].join('\n');

const SYSTEM_PROMPTS: Record<AiRequest['taskType'], string> = {
  note_generation: NOTE_GENERATION_SYSTEM_PROMPT,
  practice_grading: '你是一名学习助手，请根据标准答案批改学生的练习。',
  error_analysis: '你是一名学习助手，请分析学生的错题并给出改进建议。',
  question_generation: '你是一名学习助手，请根据资料生成练习题。',
};

export class OpenAiProvider implements AiProvider {
  readonly name: string;
  private client: OpenAI;
  private defaultModel: string;

  constructor({ name, baseURL, apiKey, defaultModel, timeoutMs = 60000, fetch }: OpenAiProviderOptions) {
    this.name = name;
    this.defaultModel = defaultModel;
    this.client = new OpenAI({
      baseURL,
      apiKey,
      timeout: timeoutMs,
      maxRetries: 0,
      fetch,
    });
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    const start = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[request.taskType] },
        { role: 'user', content: request.inputText },
      ],
    });
    const latencyMs = Date.now() - start;
    const choice = completion.choices[0];
    const content = choice?.message?.content ?? '';

    return {
      content,
      provider: this.name,
      model: completion.model ?? this.defaultModel,
      tokenUsed: completion.usage?.total_tokens ?? 0,
      latencyMs,
      fallbackUsed: false,
    };
  }
}
