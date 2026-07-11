// ============================================================
// 格式转换层开发验证 API — Phase 0.8 T04
// 仅用于 smoke test；不做持久化。
// ============================================================

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { ApiError, ApiSuccess } from "@ai-studybuddy/shared";
import { PdfConverter, OcrConverter, TextConverter } from "../adapters";
import { config } from "../config/env";

const router: Router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const pdfConverter = new PdfConverter();
const ocrConverter = new OcrConverter({
  pythonPath: config.pythonPath,
  timeoutMs: config.ocrTimeoutMs,
});
const textConverter = new TextConverter();

function okResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function errorResponse(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

// ── POST /api/dev/converter/pdf ─────────────────────────────
router.post(
  "/pdf",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json(errorResponse("FILE_REQUIRED", "file 字段不能为空"));
      }

      const result = await pdfConverter.convert(file.buffer);
      return res.json(okResponse(result));
    } catch (error) {
      return res
        .status(500)
        .json(errorResponse("PDF_CONVERT_FAILED", error instanceof Error ? error.message : String(error)));
    }
  }
);

// ── POST /api/dev/converter/image ───────────────────────────
router.post(
  "/image",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json(errorResponse("FILE_REQUIRED", "file 字段不能为空"));
      }

      const result = await ocrConverter.convert(file.buffer);
      return res.json(okResponse(result));
    } catch (error) {
      return res
        .status(500)
        .json(errorResponse("OCR_CONVERT_FAILED", error instanceof Error ? error.message : String(error)));
    }
  }
);

// ── POST /api/dev/converter/text ────────────────────────────
router.post(
  "/text",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json(errorResponse("FILE_REQUIRED", "file 字段不能为空"));
      }

      const result = await textConverter.convert(file.buffer);
      return res.json(okResponse(result));
    } catch (error) {
      return res
        .status(500)
        .json(errorResponse("TEXT_CONVERT_FAILED", error instanceof Error ? error.message : String(error)));
    }
  }
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json(errorResponse("FILE_TOO_LARGE", "单个文件不能超过 50MB"));
  }
  return next(error);
});

export default router;
