// ============================================================
// 格式转换层开发验证 API — Phase 0.8 T04
// 仅用于 smoke test；不做持久化。
// ============================================================

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { ApiError, ApiSuccess, ConverterResult } from '@ai-studybuddy/shared';
import { PdfConverter, OcrConverter, TextConverter, DocxConverter, PptxConverter, UrlFetcher } from '../adapters';
import { config } from '../config/env';

const router: Router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const pdfConverter = new PdfConverter();
const ocrConverter = new OcrConverter({
  pythonPath: config.pythonPath,
  timeoutMs: config.ocrTimeoutMs,
  cacheRoot: config.ocrCacheRoot,
  tempRoot: config.ocrTempRoot,
});
const textConverter = new TextConverter();
const docxConverter = new DocxConverter();
const pptxConverter = new PptxConverter();
const urlFetcher = new UrlFetcher();

function okResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function errorResponse(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

// ── POST /api/dev/converter/pdf ─────────────────────────────
router.post('/pdf', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json(errorResponse('FILE_REQUIRED', 'file 字段不能为空'));
    }

    const result = await pdfConverter.convert(file.buffer);
    return res.json(okResponse(result));
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('PDF_CONVERT_FAILED', error instanceof Error ? error.message : String(error)));
  }
});

// ── POST /api/dev/converter/image ───────────────────────────
router.post('/image', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json(errorResponse('FILE_REQUIRED', 'file 字段不能为空'));
    }

    const result = await ocrConverter.convert(file.buffer);
    return res.json(okResponse(result));
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('OCR_CONVERT_FAILED', error instanceof Error ? error.message : String(error)));
  }
});

// ── POST /api/dev/converter/text ────────────────────────────
router.post('/text', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json(errorResponse('FILE_REQUIRED', 'file 字段不能为空'));
    }

    const result = await textConverter.convert(file.buffer);
    return res.json(okResponse(result));
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('TEXT_CONVERT_FAILED', error instanceof Error ? error.message : String(error)));
  }
});

// ── POST /api/dev/converter/docx ────────────────────────────
router.post('/docx', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json(errorResponse('FILE_REQUIRED', 'file 字段不能为空'));
    }

    const result = await docxConverter.convert(file.buffer);
    return res.json(okResponse(result));
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('DOCX_CONVERT_FAILED', error instanceof Error ? error.message : String(error)));
  }
});

// ── POST /api/dev/converter/pptx ────────────────────────────
router.post('/pptx', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json(errorResponse('FILE_REQUIRED', 'file 字段不能为空'));
    }

    const result = await pptxConverter.convert(file.buffer);
    return res.json(okResponse(result));
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('PPTX_CONVERT_FAILED', error instanceof Error ? error.message : String(error)));
  }
});

// ── POST /api/dev/converter/url ─────────────────────────────
function mapUrlError(result: ConverterResult): { status: number; code: string } {
  const message = result.error ?? 'URL 抓取失败';
  if (message.includes('SSRF')) return { status: 403, code: 'URL_SSRF_BLOCKED' };
  if (message.includes('超时') || message.includes('aborted') || message.includes('timeout')) {
    return { status: 504, code: 'URL_TIMEOUT' };
  }
  if (message.includes('URL 解析失败') || message.includes('不能为空')) {
    return { status: 400, code: 'URL_INVALID' };
  }
  if (message.includes('Content-Type')) return { status: 415, code: 'URL_UNSUPPORTED_CONTENT_TYPE' };
  if (message.includes('体积') || message.includes('大小')) {
    return { status: 413, code: 'URL_RESPONSE_TOO_LARGE' };
  }
  if (message.includes('上游响应')) return { status: 502, code: 'URL_UPSTREAM_ERROR' };
  return { status: 502, code: 'URL_FETCH_FAILED' };
}

router.post('/url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (typeof url !== 'string' || url.trim().length === 0) {
      return res.status(400).json(errorResponse('URL_REQUIRED', 'url 字段必须为非空字符串'));
    }

    const result = await urlFetcher.fetch(url.trim());
    if (!result.ok) {
      const { status, code } = mapUrlError(result);
      return res.status(status).json(errorResponse(code, result.error ?? 'URL 抓取失败'));
    }
    return res.json(okResponse(result));
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('URL_FETCH_FAILED', error instanceof Error ? error.message : String(error)));
  }
});

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json(errorResponse('FILE_TOO_LARGE', '单个文件不能超过 50MB'));
  }
  return next(error);
});

export default router;
