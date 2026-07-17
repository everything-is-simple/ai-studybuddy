import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';
import { getAiRouter } from '../../config/config-registry';
import type { AiProvider } from './provider';
import { AiProviderError } from './router';

export class AiRouterProxy implements AiProvider {
  readonly name = 'config-aware-router';

  async generate(request: AiRequest): Promise<AiResponse> {
    const router = getAiRouter();
    if (!router) {
      throw new AiProviderError('AI_NOT_CONFIGURED', 'AI Provider 未配置，请先在设置中完成连接测试');
    }
    return router.generate(request);
  }
}
