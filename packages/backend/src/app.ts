import type { ApiSuccess } from '@ai-studybuddy/shared';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import aiDevRouter from './api/dev-ai';
import converterDevRouter from './api/dev-converter';
import storageDevRouter from './api/dev-storage';
import devRouter from './api/dev';
import dailyStudyHomeRouter from './api/daily-study-home';
import errorFixerRouter from './api/error-fixer';
import noteBuilderRouter from './api/note-builder';
import classCaptureRouter from './api/class-capture';
import practiceRunnerRouter from './api/practice-runner';
import examCrammerRouter from './api/exam-crammer';
import { createSemesterSelectorRouter } from './api/semester-selector';
import studyRhythmRouter from './api/study-rhythm';
import type { ConfigurationService } from './config/configuration-service';
import type { TimetableRecognizer } from './services/semester-selector-service';
import { createApiOriginPolicy, parseAllowedOrigins } from './middleware/api-origin-policy';
import { apiErrorHandler, sendSafeApiError } from './middleware/api-error-handler';
import { createConfigRouter } from './routes/config-routes';

export function createApp(options: {
  configurationService: ConfigurationService;
  allowedOriginsRaw?: string;
  timetableRecognizer?: TimetableRecognizer;
  staticRoot?: string;
  enableDevRoutes?: boolean;
}): Express {
  const app = express();
  app.use('/api', createApiOriginPolicy(parseAllowedOrigins(options.allowedOriginsRaw)));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const response: ApiSuccess<{ version: string; timestamp: string }> = {
      success: true,
      data: { version: '0.8.1', timestamp: new Date().toISOString() },
    };
    res.json(response);
  });

  app.use('/api/config', createConfigRouter(options.configurationService));
  if (options.enableDevRoutes === true) {
    app.use('/api/dev', devRouter);
    app.use('/api/dev/storage', storageDevRouter);
    app.use('/api/dev/converter', converterDevRouter);
    app.use('/api/dev/ai', aiDevRouter);
  }
  app.use('/api', createSemesterSelectorRouter({ recognizer: options.timetableRecognizer }));
  app.use('/api', studyRhythmRouter);
  app.use('/api', dailyStudyHomeRouter);
  app.use('/api', noteBuilderRouter);
  app.use('/api', classCaptureRouter);
  app.use('/api', practiceRunnerRouter);
  app.use('/api', examCrammerRouter);
  app.use('/api', errorFixerRouter);

  app.use('/api', (_req, res) => {
    sendSafeApiError(res, 'NOT_FOUND');
  });

  const staticRoot = options.staticRoot;
  if (staticRoot && fs.existsSync(staticRoot)) {
    app.use(express.static(staticRoot, { index: 'index.html' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) { next(); return; }
      const indexPath = path.join(staticRoot, 'index.html');
      if (!fs.existsSync(indexPath)) { next(); return; }
      res.sendFile(indexPath);
    });
  }

  app.use(apiErrorHandler);

  return app;
}
