import type { AiRequest, AiResponse } from '@ai-studybuddy/shared';
import { toSafeLogErrorCode, type RuntimeLogBoundary } from './runtime-log-boundary';

// 全局可注入的日志边界（T05-1）：应用启动时由 runtime-configuration 设置，
// 使默认 aiLogger 单例的日志落盘到 runtime-log-boundary 的 ai JSONL 文件。
let activeBoundary: RuntimeLogBoundary | null = null;

export function setAiLogBoundary(boundary: RuntimeLogBoundary | null): void {
  activeBoundary = boundary;
}

export function getAiLogBoundary(): RuntimeLogBoundary | null {
  return activeBoundary;
}

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

/**
 * 创建 AI 日志器。
 *
 * - 传入 boundary 时：日志写入 runtime-log-boundary 的 `ai` JSONL 文件，
 *   字段受 LOG_ENTRY_FIELDS.ai allowlist 约束（T05-1 脱敏落盘）。
 * - 未显式传入时：惰性读取全局 activeBoundary（应用启动后自动接线）；
 *   两者皆无时降级为 console.log，字段与落盘路径完全一致。
 */
export function createAiLogger(boundary?: RuntimeLogBoundary): AiLogger {
  const write = (entry: Record<string, string | number | boolean | null>): void => {
    const target = boundary ?? getAiLogBoundary();
    if (target) {
      target.append('ai', entry);
    } else {
      console.log(JSON.stringify(entry));
    }
  };

  return {
    recordSuccess({ taskType, result, attemptedProviders }) {
      write({
        level: 'INFO',
        event: 'AI_REQUEST_SUCCESS',
        taskType,
        provider: result.provider,
        model: result.model,
        tokenUsed: result.tokenUsed,
        latencyMs: result.latencyMs,
        fallbackUsed: result.fallbackUsed,
        // attemptedProviders 扁平化为标量，避免数组字段破坏日志边界类型
        attemptedProviderCount: attemptedProviders.length,
        attemptedProviders: attemptedProviders
          .map(({ provider, error }) => `${provider}:${toSafeLogErrorCode({ code: error })}`)
          .join(','),
        timestamp: new Date().toISOString(),
      });
    },
    recordFailure({ taskType, provider, error }) {
      write({
        level: 'WARN',
        event: 'AI_REQUEST_FAILURE',
        taskType,
        provider,
        errorCode: toSafeLogErrorCode(error),
        timestamp: new Date().toISOString(),
      });
    },
    recordCircuitOpened({ provider, cooldownStartedAt, cooldownEndsAt }) {
      write({
        level: 'WARN',
        event: 'AI_PROVIDER_CIRCUIT_OPENED',
        provider,
        cooldownStartedAt,
        cooldownEndsAt,
        timestamp: new Date().toISOString(),
      });
    },
    recordCircuitClosed({ provider, cooldownEndedAt }) {
      write({
        level: 'INFO',
        event: 'AI_PROVIDER_CIRCUIT_CLOSED',
        provider,
        cooldownEndedAt,
        timestamp: new Date().toISOString(),
      });
    },
  };
}

/** 向后兼容：未接线时的默认 AI 日志器（console 输出）。 */
export const aiLogger: AiLogger = createAiLogger();
