// ============================================================
// S4 ErrorFixer 正式 API — Phase 1-T04B
// 错题列表/详情/错因确认/状态流转/原题重做/薄弱点。
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import { ErrorFixerApiError, ErrorFixerQueryService } from '../services/error-fixer-query-service';

const router: Router = Router();
const service = new ErrorFixerQueryService();

function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function fail(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

function handle(error: unknown, res: Response): Response {
  if (error instanceof ErrorFixerApiError) return res.status(error.status).json(fail(error.code, error.message));
  return res.status(500).json(fail('S4_REQUEST_FAILED', '请求处理失败，请稍后重试'));
}

router.get('/mistakes', (req: Request, res: Response) => {
  try {
    return res.json(
      ok(
        service.listMistakes(req.query.semesterId, req.query.courseInstanceId, {
          knowledgeModuleId: req.query.knowledgeModuleId,
          status: req.query.status,
          page: req.query.page,
          pageSize: req.query.pageSize,
        })
      )
    );
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/mistakes/:id', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.getMistake(req.query.semesterId, req.params.id)));
  } catch (error) {
    return handle(error, res);
  }
});

router.patch('/mistakes/:id/error-cause', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.confirmErrorCause(req.params.id, req.body)));
  } catch (error) {
    return handle(error, res);
  }
});

router.patch('/mistakes/:id/status', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.updateStatus(req.params.id, req.body)));
  } catch (error) {
    return handle(error, res);
  }
});

router.post('/mistakes/:id/redo', (req: Request, res: Response) => {
  try {
    return res.status(201).json(ok(service.createRedoSession(req.params.id, req.body)));
  } catch (error) {
    return handle(error, res);
  }
});

router.get('/weak-points', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.listWeakPoints(req.query.semesterId, req.query.courseInstanceId)));
  } catch (error) {
    return handle(error, res);
  }
});

export default router;
