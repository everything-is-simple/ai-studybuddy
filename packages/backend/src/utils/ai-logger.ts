import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';
import { toSafeLogErrorCode } from './runtime-log-boundary';

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

function writeAllowedConsoleEntry(
  entry: Record<string, string | number | boolean | null | Array<{ provider: string; errorCode: string }>>
): void {
  console.log(JSON.stringify(entry));
}

export const aiLogger: AiLogger = {
  recordSuccess({ taskType, result, attemptedProviders }) {
    writeAllowedConsoleEntry({
      level: 'INFO',
      event: 'AI_REQUEST_SUCCESS',
      taskType,
      provider: result.provider,
      model: result.model,
      tokenUsed: result.tokenUsed,
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed,
      attemptedProviders: attemptedProviders.map(({ provider, error }) => ({
        provider,
        errorCode: toSafeLogErrorCode({ code: error }),
      })),
      timestamp: new Date().toISOString(),
    });
  },
  recordFailure({ taskType, provider, error }) {
    writeAllowedConsoleEntry({
      level: 'WARN',
      event: 'AI_REQUEST_FAILURE',
      taskType,
      provider,
      errorCode: toSafeLogErrorCode(error),
      timestamp: new Date().toISOString(),
    });
  },
  recordCircuitOpened({ provider, cooldownStartedAt, cooldownEndsAt }) {
    writeAllowedConsoleEntry({
      level: 'WARN',
      event: 'AI_PROVIDER_CIRCUIT_OPENED',
      provider,
      cooldownStartedAt,
      cooldownEndsAt,
      timestamp: new Date().toISOString(),
    });
  },
  recordCircuitClosed({ provider, cooldownEndedAt }) {
    writeAllowedConsoleEntry({
      level: 'INFO',
      event: 'AI_PROVIDER_CIRCUIT_CLOSED',
      provider,
      cooldownEndedAt,
      timestamp: new Date().toISOString(),
    });
  },
};
