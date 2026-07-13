// ============================================================
// 文件存储开发验证 API — Phase 0.8 T03
// 仅用于 smoke test；正式业务通过 StorageAdapter 直接调用。
// ============================================================

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import { StorageAdapter, StorageKeyNotFoundError, StoragePathEscapeError } from '../adapters';

const router: Router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const adapter = new StorageAdapter();

// 简单扩展名到 MIME 的映射（T03 阶段够用）
function mimeByExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.md':
      return 'text/markdown; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

// ── POST /api/dev/storage/upload ───────────────────────────
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const semesterId = String(req.body.semesterId ?? '').trim();
    const courseIdRaw = req.body.courseId;
    const courseId = courseIdRaw && String(courseIdRaw).trim() ? String(courseIdRaw).trim() : undefined;
    const file = req.file;

    if (!semesterId) {
      const response: ApiError = {
        success: false,
        error: { code: 'SEMESTER_ID_REQUIRED', message: 'semesterId 不能为空' },
      };
      return res.status(400).json(response);
    }

    if (!file) {
      const response: ApiError = {
        success: false,
        error: { code: 'FILE_REQUIRED', message: 'file 字段不能为空' },
      };
      return res.status(400).json(response);
    }

    const result = await adapter.put({
      semesterId,
      courseId,
      originalName: file.originalname,
      data: file.buffer,
    });

    const response: ApiSuccess = {
      success: true,
      data: result,
    };
    return res.json(response);
  } catch (error) {
    const isPathEscape = error instanceof StoragePathEscapeError;
    const status = isPathEscape ? 400 : 500;
    const response: ApiError = {
      success: false,
      error: {
        code: isPathEscape ? 'STORAGE_PATH_ESCAPE' : 'STORAGE_UPLOAD_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return res.status(status).json(response);
  }
});

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    const response: ApiError = {
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: '单个文件不能超过 50MB' },
    };
    return res.status(413).json(response);
  }
  return next(error);
});
// ── GET /api/dev/storage/download?key=<storageKey> ───────────
router.get('/download', async (req: Request, res: Response) => {
  try {
    const key = String(req.query.key ?? '');
    if (!key) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_KEY_REQUIRED', message: 'key 参数不能为空' },
      };
      return res.status(400).json(response);
    }

    const result = await adapter.get(key);
    res.setHeader('Content-Length', String(result.size));
    res.setHeader('Content-Type', mimeByExt(key));
    res.setHeader('X-Storage-Key', key);
    return result.stream.pipe(res);
  } catch (error) {
    if (error instanceof StorageKeyNotFoundError) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_KEY_NOT_FOUND', message: error.message },
      };
      return res.status(404).json(response);
    }
    if (error instanceof StoragePathEscapeError) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_PATH_ESCAPE', message: error.message },
      };
      return res.status(400).json(response);
    }
    const response: ApiError = {
      success: false,
      error: {
        code: 'STORAGE_DOWNLOAD_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return res.status(500).json(response);
  }
});

// ── DELETE /api/dev/storage/delete?key=<storageKey> ──────────
router.delete('/delete', async (req: Request, res: Response) => {
  try {
    const key = String(req.query.key ?? '');
    if (!key) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_KEY_REQUIRED', message: 'key 参数不能为空' },
      };
      return res.status(400).json(response);
    }

    await adapter.delete(key);
    const response: ApiSuccess = { success: true, data: { deleted: true } };
    return res.json(response);
  } catch (error) {
    if (error instanceof StorageKeyNotFoundError) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_KEY_NOT_FOUND', message: error.message },
      };
      return res.status(404).json(response);
    }
    if (error instanceof StoragePathEscapeError) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_PATH_ESCAPE', message: error.message },
      };
      return res.status(400).json(response);
    }
    const response: ApiError = {
      success: false,
      error: {
        code: 'STORAGE_DELETE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return res.status(500).json(response);
  }
});

// ── GET /api/dev/storage/exists?key=<storageKey> ─────────────
router.get('/exists', (req: Request, res: Response) => {
  try {
    const key = String(req.query.key ?? '');
    if (!key) {
      const response: ApiError = {
        success: false,
        error: { code: 'STORAGE_KEY_REQUIRED', message: 'key 参数不能为空' },
      };
      return res.status(400).json(response);
    }

    const exists = adapter.exists(key);
    const response: ApiSuccess = { success: true, data: { exists } };
    return res.json(response);
  } catch (error) {
    const response: ApiError = {
      success: false,
      error: {
        code: 'STORAGE_EXISTS_CHECK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return res.status(500).json(response);
  }
});

export default router;
