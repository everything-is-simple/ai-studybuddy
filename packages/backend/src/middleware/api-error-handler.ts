import type { ApiError } from '@ai-studybuddy/shared';
import multer from 'multer';
import type { ErrorRequestHandler, NextFunction, Response } from 'express';

export type SafeErrorCode = 'NOT_FOUND' | 'INVALID_JSON' | 'FILE_TOO_LARGE' | 'BAD_REQUEST' | 'INTERNAL_ERROR';

const safeErrors: Record<SafeErrorCode, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: '未找到请求的接口' },
  INVALID_JSON: { status: 400, message: '请求体不是有效的 JSON' },
  FILE_TOO_LARGE: { status: 413, message: '上传文件超过大小限制' },
  BAD_REQUEST: { status: 400, message: '请求参数无效' },
  INTERNAL_ERROR: { status: 500, message: '服务暂时无法完成请求，请稍后重试' },
};

export class SafeApiError extends Error {
  constructor(readonly code: SafeErrorCode) {
    super(code);
  }
}

function isSafeErrorCode(value: unknown): value is SafeErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(safeErrors, value);
}

export function sendSafeApiError(res: Response, code: SafeErrorCode): void {
  const safeError = safeErrors[code];
  const response: ApiError = {
    success: false,
    error: { code, message: safeError.message },
  };
  res.status(safeError.status).json(response);
}

function isMalformedJsonError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { type?: unknown }).type === 'entity.parse.failed';
}

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isMalformedJsonError(error)) {
    sendSafeApiError(res, 'INVALID_JSON');
    return;
  }

  if (error instanceof SafeApiError && isSafeErrorCode(error.code)) {
    sendSafeApiError(res, error.code);
    return;
  }

  if (error instanceof multer.MulterError) {
    sendSafeApiError(res, error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'BAD_REQUEST');
    return;
  }

  sendSafeApiError(res, 'INTERNAL_ERROR');
};
