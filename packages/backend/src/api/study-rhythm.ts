// ============================================================
// S1 StudyRhythm 正式业务 API — Phase 0.8 T06
// 只负责 HTTP 路由、JSON 校验与标准信封映射；业务逻辑在 service 中。
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiError, ApiSuccess } from '@ai-studybuddy/shared';
import { StudyRhythmError, StudyRhythmService } from '../services/study-rhythm-service';

const router: Router = Router();
const service = new StudyRhythmService();

function okResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

function errorResponse(code: string, message: string): ApiError {
  return { success: false, error: { code, message } };
}

function handleError(error: unknown, res: Response): void {
  if (error instanceof StudyRhythmError) {
    res.status(error.status).json(errorResponse(error.code, error.message));
    return;
  }
  res.status(500).json(errorResponse('S1_REQUEST_FAILED', '请求处理失败，请稍后重试'));
}

// ── POST /api/courses ───────────────────────────────────────
router.post('/courses', (req: Request, res: Response) => {
  try {
    const course = service.createCourse(req.body);
    return res.status(201).json(okResponse(course));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── GET /api/courses ────────────────────────────────────────
router.get('/courses', (req: Request, res: Response) => {
  try {
    const courses = service.listCourses(req.query.semesterId);
    return res.json(okResponse(courses));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── POST /api/exams ─────────────────────────────────────────
router.post('/exams', (req: Request, res: Response) => {
  try {
    const exam = service.createExam(req.body);
    return res.status(201).json(okResponse(exam));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── GET /api/exams ──────────────────────────────────────────
router.get('/exams', (req: Request, res: Response) => {
  try {
    const exams = service.listExams(req.query.semesterId, req.query.courseInstanceId);
    return res.json(okResponse(exams));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── GET /api/study-tasks ────────────────────────────────────
router.get('/study-tasks', (req: Request, res: Response) => {
  try {
    const tasks = service.listTasks(req.query.semesterId, req.query.courseInstanceId);
    return res.json(okResponse(tasks));
  } catch (error) {
    return handleError(error, res);
  }
});
// ── POST /api/study-tasks ───────────────────────────────────
router.post('/study-tasks', (req: Request, res: Response) => {
  try {
    const task = service.createTask(req.body);
    return res.status(201).json(okResponse(task));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── PATCH /api/study-tasks/:id/status ───────────────────────
router.patch('/study-tasks/:id/status', (req: Request, res: Response) => {
  try {
    const task = service.updateTaskStatus({
      semesterId: req.body.semesterId,
      taskId: req.params.id,
      status: req.body.status,
      occurredAt: req.body.occurredAt,
    });
    return res.json(okResponse(task));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── POST /api/study-events ──────────────────────────────────
router.post('/study-events', (req: Request, res: Response) => {
  try {
    const event = service.createEvent(req.body);
    return res.status(201).json(okResponse(event));
  } catch (error) {
    return handleError(error, res);
  }
});

// ── GET /api/timeline ───────────────────────────────────────
router.get('/timeline', (req: Request, res: Response) => {
  try {
    const events = service.getTimeline(req.query.semesterId, req.query.courseInstanceId, req.query.limit);
    return res.json(okResponse(events));
  } catch (error) {
    return handleError(error, res);
  }
});

export default router;
