import express from 'express';
import cors from 'cors';
import type { ApiSuccess } from '@ai-studybuddy/shared';
import { config } from './config/env';
import devRouter from './api/dev';
import storageDevRouter from './api/dev-storage';
import converterDevRouter from './api/dev-converter';
import aiDevRouter from './api/dev-ai';
import studyRhythmRouter from './api/study-rhythm';
import noteBuilderRouter from './api/note-builder';
import practiceRunnerRouter from './api/practice-runner';
import { MaterialJobWorker } from './services/material-job-worker';

const app = express();
const materialJobWorker = new MaterialJobWorker();
let workerTimer: NodeJS.Timeout | undefined;
const PORT = config.backendPort;
const HOST = config.backendHost;

// ── 中间件 ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── 健康检查 ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const response: ApiSuccess<{ version: string; timestamp: string }> = {
    success: true,
    data: {
      version: '0.8.0',
      timestamp: new Date().toISOString(),
    },
  };
  res.json(response);
});

// ── 开发验证路由 ────────────────────────────────────────────
app.use('/api/dev', devRouter);
app.use('/api/dev/storage', storageDevRouter);
app.use('/api/dev/converter', converterDevRouter);
app.use('/api/dev/ai', aiDevRouter);

// ── S1 学习节奏业务路由 ───────────────────────────────────
app.use('/api', studyRhythmRouter);
app.use('/api', noteBuilderRouter);
app.use('/api', practiceRunnerRouter);

// ── 启动 ──────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
  workerTimer = materialJobWorker.startPolling(2000);
  console.log(`✅ Backend running on http://${HOST}:${PORT}`);
  console.log(`   - Health: http://${HOST}:${PORT}/api/health`);
  console.log(`   - Dev:    http://${HOST}:${PORT}/api/dev/db-health`);
});

function shutdown(): void {
  if (workerTimer) materialJobWorker.stopPolling(workerTimer);
  server.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
