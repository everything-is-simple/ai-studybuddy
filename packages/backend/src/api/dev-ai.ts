// ============================================================
// AI Provider Router 开发验证 API — Phase 0.8 T05
// 仅用于 smoke test；不做持久化。
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AiRequest, AiResponse, ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import { AiRouterProxy, AllProvidersFailedError, AiProviderError } from '../adapters';

const router: Router = Router();
const aiRouter = new AiRouterProxy();

function okResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function errorResponse(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

function validateAiRequest(
  body: unknown
): { ok: false; error: { status: number; response: ApiError } } | { ok: true; request: AiRequest } {
  if (typeof body !== 'object' || body === null) {
    return {
      ok: false,
      error: { status: 400, response: errorResponse('AI_REQUEST_INVALID', '请求体必须是 JSON 对象') },
    };
  }

  const { taskType, inputText, language, options } = body as Record<string, unknown>;

  if (typeof taskType !== 'string' || taskType.trim().length === 0) {
    return {
      ok: false,
      error: { status: 400, response: errorResponse('AI_TASK_TYPE_REQUIRED', 'taskType 必须为非空字符串') },
    };
  }

  const validTaskTypes = ['note_generation', 'practice_grading', 'error_analysis', 'question_generation'];
  if (!validTaskTypes.includes(taskType)) {
    return {
      ok: false,
      error: {
        status: 400,
        response: errorResponse('AI_TASK_TYPE_INVALID', `taskType 必须是 ${validTaskTypes.join('/')} 之一`),
      },
    };
  }

  if (typeof inputText !== 'string' || inputText.trim().length === 0) {
    return {
      ok: false,
      error: { status: 400, response: errorResponse('AI_INPUT_TEXT_REQUIRED', 'inputText 必须为非空字符串') },
    };
  }

  if (language !== undefined && language !== 'zh' && language !== 'en') {
    return {
      ok: false,
      error: { status: 400, response: errorResponse('AI_LANGUAGE_INVALID', 'language 必须是 zh 或 en') },
    };
  }

  return {
    ok: true,
    request: {
      taskType: taskType as AiRequest['taskType'],
      inputText,
      language,
      options: typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : undefined,
    },
  };
}

// ── POST /api/dev/ai/generate ───────────────────────────────
router.post('/generate', async (req: Request, res: Response) => {
  const validated = validateAiRequest(req.body);
  if (!validated.ok) {
    return res.status(validated.error.status).json(validated.error.response);
  }

  try {
    const result: AiResponse = await aiRouter.generate(validated.request);
    return res.json(okResponse(result));
  } catch (error) {
    if (error instanceof AiProviderError && error.code === 'AI_NOT_CONFIGURED') {
      return res.status(503).json(errorResponse(error.code, error.message));
    }
    if (error instanceof AllProvidersFailedError) {
      return res.status(502).json(errorResponse(error.code, error.message));
    }
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json(errorResponse('AI_GENERATE_FAILED', message));
  }
});

export default router;
