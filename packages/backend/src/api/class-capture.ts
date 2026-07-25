import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import { config } from '../config/env';
import { NoteBuilderError } from '../services/note-builder-service';
import { ClassCaptureError, ClassCaptureService, WhisperCppAuralConverterError } from '../services/class-capture-service';

const router: Router = Router();
const service = new ClassCaptureService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.localAsrWhisperMaxFileBytes } });

function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}
function fail(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}
function handle(error: unknown, res: Response): Response {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json(fail('ASR_FILE_TOO_LARGE', '音频文件超过当前课堂转写大小限制'));
  }
  if (error instanceof ClassCaptureError || error instanceof WhisperCppAuralConverterError || error instanceof NoteBuilderError) {
    return res.status(error.status).json(fail(error.code, error.message));
  }
  return res.status(500).json(fail('CLASS_CAPTURE_REQUEST_FAILED', '课堂录音请求处理失败，请稍后重试'));
}

router.post('/class-captures/transcribe', (req, res) =>
  upload.single('file')(req, res, (error) => {
    if (error) return handle(error, res);
    service
      .transcribe({
        semesterId: req.body.semesterId,
        courseInstanceId: req.body.courseInstanceId,
        title: req.body.title,
        permissionConfirmed: req.body.permissionConfirmed,
        file: req.file
          ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, buffer: req.file.buffer }
          : undefined,
      })
      .then((result) => res.status(200).json(ok(result)))
      .catch((reason) => handle(reason, res));
  })
);

router.post('/class-captures/save-to-notes', (req: Request, res: Response) => {
  service
    .saveToNotes({
      semesterId: req.body.semesterId,
      courseInstanceId: req.body.courseInstanceId,
      title: req.body.title,
      permissionConfirmed: req.body.permissionConfirmed,
      text: req.body.text,
    })
    .then((result) => res.status(201).json(ok(result)))
    .catch((reason) => handle(reason, res));
});

export default router;
