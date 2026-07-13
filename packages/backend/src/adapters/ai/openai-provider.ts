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

const SYSTEM_PROMPTS: Record<AiRequest['taskType'], string> = {
  note_generation: '你是一名学习助手，请根据输入资料生成结构化的中文学习笔记。',
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
