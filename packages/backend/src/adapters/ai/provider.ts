import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';

export interface AiProvider {
  readonly name: string;
  generate(request: AiRequest): Promise<AiResponse>;
}
