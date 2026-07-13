import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import type { ApiError, ApiSuccess } from "@ai-studybuddy/shared";
import { NoteBuilderError, NoteBuilderService } from "../services/note-builder-service";

const router: ExpressRouter = Router();
const service = new NoteBuilderService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

function ok<T>(data: T): ApiSuccess<T> { return { success: true, data }; }
function fail(code: string, message: string): ApiError { return { success: false, error: { code, message } }; }
function handle(error: unknown, res: Response): Response {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json(fail("FILE_TOO_LARGE", "文件大小超过 10MB 限制"));
  if (error instanceof NoteBuilderError) return res.status(error.status).json(fail(error.code, error.message));
  return res.status(500).json(fail("S2_REQUEST_FAILED", "请求处理失败，请稍后重试"));
}

router.post("/materials/upload", (req, res) => upload.single("file")(req, res, (error) => {
  if (error) return handle(error, res);
  service.uploadMaterial({ semesterId: req.body.semesterId, courseInstanceId: req.body.courseInstanceId, title: req.body.title, file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, buffer: req.file.buffer } : undefined }).then((result) => res.status(200).json(ok(result))).catch((reason) => handle(reason, res));
}));
router.get("/materials", (req: Request, res: Response) => { try { res.json(ok(service.listMaterials({ semesterId: req.query.semesterId, courseInstanceId: req.query.courseInstanceId, status: req.query.status, page: req.query.page, pageSize: req.query.pageSize }))); } catch (error) { handle(error, res); } });
router.get("/materials/:id", (req: Request, res: Response) => { try { res.json(ok(service.getMaterial(req.query.semesterId, req.params.id))); } catch (error) { handle(error, res); } });
router.post("/materials/:id/retry-conversion", (req: Request, res: Response) => { try { res.json(ok(service.retry(req.body.semesterId, req.params.id, "material_convert"))); } catch (error) { handle(error, res); } });
router.post("/materials/:id/retry-ai-generation", (req: Request, res: Response) => { try { res.json(ok(service.retry(req.body.semesterId, req.params.id, "note_generate"))); } catch (error) { handle(error, res); } });
router.post("/materials/:id/replace-text", (req: Request, res: Response) => { try { res.json(ok(service.replaceText(req.body.semesterId, req.params.id, req.body.text))); } catch (error) { handle(error, res); } });
router.get("/notes/:id", (req: Request, res: Response) => { try { res.json(ok(service.getNote(req.query.semesterId, req.params.id))); } catch (error) { handle(error, res); } });
router.get("/knowledge-modules", (req: Request, res: Response) => { try { res.json(ok(service.listKnowledgeModules(req.query.semesterId, req.query.courseInstanceId, { learnStatus: req.query.learnStatus, importance: req.query.importance, page: req.query.page, pageSize: req.query.pageSize }))); } catch (error) { handle(error, res); } });
router.patch("/knowledge-modules/:id", (req: Request, res: Response) => { try { res.json(ok(service.updateKnowledgeModule({ semesterId: req.body.semesterId, id: req.params.id, learnStatus: req.body.learnStatus, importance: req.body.importance, difficulty: req.body.difficulty, examRelevance: req.body.examRelevance }))); } catch (error) { handle(error, res); } });

export default router;

