// ============================================================
// Phase 1-T09A 学期 selector API
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import {
  SemesterSelectorError,
  SemesterSelectorService,
  type TimetableRecognizer,
} from '../services/semester-selector-service';

function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function fail(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

function handleError(error: unknown, res: Response): void {
  if (error instanceof SemesterSelectorError) {
    res.status(error.status).json(fail(error.code, error.message));
    return;
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json(fail('TIMETABLE_IMAGE_TOO_LARGE', '课程表图片不能超过 10 MiB'));
      return;
    }
    res.status(400).json(fail('TIMETABLE_UPLOAD_INVALID', '课程表图片上传失败，请重新选择文件'));
    return;
  }
  res.status(500).json(fail('SEMESTER_REQUEST_FAILED', '学期请求处理失败，请稍后重试'));
}

export function createSemesterSelectorRouter(options: { recognizer?: TimetableRecognizer } = {}): Router {
  const router = Router();
  const service = new SemesterSelectorService(options.recognizer);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 10 * 1024 * 1024, parts: 8, fields: 6 },
    fileFilter: (_req, file, callback) => {
      if (file.fieldname !== 'timetableImage') {
        callback(new SemesterSelectorError('TIMETABLE_UPLOAD_INVALID', 400, '请使用 timetableImage 字段上传课程表'));
        return;
      }
      callback(null, true);
    },
  });

  router.get('/semesters', (_req, res) => {
    try {
      res.json(ok(service.listSemesters()));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/semesters/archived', (_req, res) => {
    try {
      res.json(ok(service.listArchivedSemesters()));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/semesters/:id/archive', (req: Request, res: Response) => {
    try {
      res.json(ok(service.archiveSemester(req.params.id)));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/semesters/current', (_req, res) => {
    try {
      res.json(ok(service.getCurrentSemester()));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/semesters/current', (req: Request, res: Response) => {
    try {
      res.json(ok(service.selectCurrentSemester(req.body?.semesterId)));
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/semesters/preview', (req: Request, res: Response) => {
    upload.single('timetableImage')(req, res, (error) => {
      if (error) {
        handleError(error, res);
        return;
      }
      void service
        .createPreview({
          semesterCode: req.body?.semesterCode,
          teachingStartDate: req.body?.teachingStartDate,
          teachingEndDate: req.body?.teachingEndDate,
          finalArchiveDate: req.body?.finalArchiveDate,
          studentName: req.body?.studentName,
          file: req.file,
        })
        .then((preview) => res.json(ok(preview)))
        .catch((previewError) => handleError(previewError, res));
    });
  });

  router.post('/semesters', (req: Request, res: Response) => {
    try {
      res.status(201).json(ok(service.confirmSemester(req.body)));
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
