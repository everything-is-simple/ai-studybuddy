import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ApiError,
  ApiSuccess,
  CreatePracticeSessionResponse,
  PracticeHistoryListResponseDto,
  PracticeHistoryResultDto,
  SubmitPracticeSessionResponse,
} from '@ai-studybuddy/shared';
import { PracticeRunnerError, PracticeRunnerService } from '../services/practice-runner-service';

const router: Router = Router();
const service = new PracticeRunnerService();

function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function fail(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

function handle(error: unknown, res: Response): Response {
  if (error instanceof PracticeRunnerError) return res.status(error.status).json(fail(error.code, error.message));
  return res.status(500).json(fail('S3_REQUEST_FAILED', '请求处理失败，请稍后重试'));
}

router.post('/practice-sessions', async (req: Request, res: Response) => {
  try {
    const result: CreatePracticeSessionResponse = await service.createPracticeSession(req.body);
    return res.status(201).json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});


router.get('/practice-sessions/history', (req: Request, res: Response) => {
  try {
    const result: PracticeHistoryListResponseDto = service.listPracticeHistory({
      semesterId: req.query.semesterId,
      courseInstanceId: req.query.courseInstanceId,
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return res.json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/practice-sessions/:id/history-result', (req: Request, res: Response) => {
  try {
    const result: PracticeHistoryResultDto = service.getPracticeHistoryResult(req.query.semesterId, req.params.id);
    return res.json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/practice-sessions/:id', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.getPracticeSession(req.query.semesterId, req.params.id)));
  } catch (error) {
    return handle(error, res);
  }
});

router.post('/practice-sessions/:id/submit', (req: Request, res: Response) => {
  try {
    const result: SubmitPracticeSessionResponse = service.submitPracticeSession(req.params.id, req.body);
    return res.json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});

export default router;
