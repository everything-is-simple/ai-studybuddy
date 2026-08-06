import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ApiError,
  ApiSuccess,
  CramFlashcardResponseDto,
  CramPlanResponseDto,
  MockExamPaperDetailDto,
  SubmitMockExamAttemptResponse,
} from '@ai-studybuddy/shared';
import { ExamCrammerError, ExamCrammerService } from '../services/exam-crammer-service';
import { CramPlanService } from '../services/cram-plan-service';

const router: Router = Router();
const service = new ExamCrammerService();
const cramPlanService = new CramPlanService();

function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}
function fail(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}
function handle(error: unknown, res: Response): Response {
  if (error instanceof ExamCrammerError) return res.status(error.status).json(fail(error.code, error.message));
  return res.status(500).json(fail('S5_REQUEST_FAILED', '请求处理失败，请稍后重试'));
}

router.get('/assessment-attempts/:id/cram-cards', (req: Request, res: Response) => {
  try {
    const result: CramFlashcardResponseDto = service.getCramCards(req.query.semesterId, req.params.id);
    return res.json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});
router.get('/assessment-attempts/:id/cram-plan', (req: Request, res: Response) => {
  try {
    const result: CramPlanResponseDto = cramPlanService.getCramPlan(req.query.semesterId, req.params.id);
    return res.json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});

router.post('/mock-exam-papers', async (req: Request, res: Response) => {
  try {
    const result: MockExamPaperDetailDto = await service.createMockExamPaper(req.body);
    return res.status(201).json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/mock-exam-papers/:id', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.getPaper(req.query.semesterId, req.params.id)));
  } catch (error) {
    return handle(error, res);
  }
});

router.post('/mock-exam-papers/:id/attempts', (req: Request, res: Response) => {
  try {
    return res.status(201).json(ok(service.startAttempt({ semesterId: req.body?.semesterId, paperId: req.params.id })));
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/mock-exam-attempts/:id', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.getAttempt(req.query.semesterId, req.params.id)));
  } catch (error) {
    return handle(error, res);
  }
});

router.post('/mock-exam-attempts/:id/submit', (req: Request, res: Response) => {
  try {
    const result: SubmitMockExamAttemptResponse = service.submitAttempt(req.params.id, req.body);
    return res.json(ok(result));
  } catch (error) {
    return handle(error, res);
  }
});

export default router;
