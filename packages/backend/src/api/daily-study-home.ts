import { Router, type Request, type Response } from 'express';
import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import { DailyStudyHomeError, DailyStudyHomeService } from '../services/daily-study-home-service';

const router: Router = Router();
const service = new DailyStudyHomeService();

function ok<T>(data: T): ApiSuccess<T> { return { success: true, data }; }
function fail(code: string, message: string): ApiError { return { success: false, error: { code, message } }; }

router.get('/daily-study-home', (req: Request, res: Response) => {
  try {
    return res.json(ok(service.getHome(req.query.semesterId, req.query.date)));
  } catch (error) {
    if (error instanceof DailyStudyHomeError) return res.status(error.status).json(fail(error.code, error.message));
    return res.status(500).json(fail('DAILY_STUDY_HOME_FAILED', '每日学习首页加载失败，请稍后重试'));
  }
});

export default router;
