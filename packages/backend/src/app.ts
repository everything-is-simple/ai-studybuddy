import type { ApiSuccess } from '@ai-studybuddy/shared';
import express, { type Express } from 'express';
import aiDevRouter from './api/dev-ai';
import converterDevRouter from './api/dev-converter';
import storageDevRouter from './api/dev-storage';
import devRouter from './api/dev';
import errorFixerRouter from './api/error-fixer';
import noteBuilderRouter from './api/note-builder';
import practiceRunnerRouter from './api/practice-runner';
import { createSemesterSelectorRouter } from './api/semester-selector';
import studyRhythmRouter from './api/study-rhythm';
import type { ConfigurationService } from './config/configuration-service';
import type { TimetableRecognizer } from './services/semester-selector-service';
import { createApiOriginPolicy, parseAllowedOrigins } from './middleware/api-origin-policy';
import { createConfigRouter } from './routes/config-routes';

export function createApp(options: {
  configurationService: ConfigurationService;
  allowedOriginsRaw?: string;
  timetableRecognizer?: TimetableRecognizer;
}): Express {
  const app = express();
  app.use('/api', createApiOriginPolicy(parseAllowedOrigins(options.allowedOriginsRaw)));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const response: ApiSuccess<{ version: string; timestamp: string }> = {
      success: true,
      data: { version: '0.8.0', timestamp: new Date().toISOString() },
    };
    res.json(response);
  });

  app.use('/api/config', createConfigRouter(options.configurationService));
  app.use('/api/dev', devRouter);
  app.use('/api/dev/storage', storageDevRouter);
  app.use('/api/dev/converter', converterDevRouter);
  app.use('/api/dev/ai', aiDevRouter);
  app.use('/api', createSemesterSelectorRouter({ recognizer: options.timetableRecognizer }));
  app.use('/api', studyRhythmRouter);
  app.use('/api', noteBuilderRouter);
  app.use('/api', practiceRunnerRouter);
  app.use('/api', errorFixerRouter);
  return app;
}
