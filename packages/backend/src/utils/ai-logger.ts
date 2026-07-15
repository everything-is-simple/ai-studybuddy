import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';

export interface AiLogSuccessPayload {
  taskType: AiRequest['taskType'];
  result: AiResponse;
  attemptedProviders: Array<{ provider: string; error: string }>;
}

export interface AiLogFailurePayload {
  taskType: AiRequest['taskType'];
  provider: string;
  error: Error;
}

export interface AiCircuitOpenedPayload {
  provider: string;
  cooldownStartedAt: string;
  cooldownEndsAt: string;
}

export interface AiCircuitClosedPayload {
  provider: string;
  cooldownEndedAt: string;
}

export interface AiLogger {
  recordSuccess(payload: AiLogSuccessPayload): void;
  recordFailure(payload: AiLogFailurePayload): void;
  recordCircuitOpened(payload: AiCircuitOpenedPayload): void;
  recordCircuitClosed(payload: AiCircuitClosedPayload): void;
}

function extractErrorCode(error: Error): string {
  const coded = error as { code?: string; status?: number };
  return coded.code ?? String(coded.status ?? 'UNKNOWN_ERROR');
}

export const aiLogger: AiLogger = {
  recordSuccess({ taskType, result, attemptedProviders }) {
    const entry = {
      level: 'INFO',
      event: 'AI_REQUEST_SUCCESS',
      taskType,
      provider: result.provider,
      model: result.model,
      tokenUsed: result.tokenUsed,
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed,
      attemptedProviders,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(entry));
  },
  recordFailure({ taskType, provider, error }) {
    const entry = {
      level: 'WARN',
      event: 'AI_REQUEST_FAILURE',
      taskType,
      provider,
      errorCode: extractErrorCode(error),
      errorMessage: error.message,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(entry));
  },
  recordCircuitOpened({ provider, cooldownStartedAt, cooldownEndsAt }) {
    const entry = {
      level: 'WARN',
      event: 'AI_PROVIDER_CIRCUIT_OPENED',
      provider,
      cooldownStartedAt,
      cooldownEndsAt,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(entry));
  },
  recordCircuitClosed({ provider, cooldownEndedAt }) {
    const entry = {
      level: 'INFO',
      event: 'AI_PROVIDER_CIRCUIT_CLOSED',
      provider,
      cooldownEndedAt,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(entry));
  },
};
