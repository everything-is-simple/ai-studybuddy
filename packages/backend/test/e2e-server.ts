import { createApp } from '../src/app';
import { bootstrapBackend } from '../src/bootstrap';
import { initializeRuntimeConfiguration } from '../src/config/runtime-configuration';
import { MaterialJobWorker } from '../src/services/material-job-worker';
import type { TimetableRecognizer } from '../src/services/semester-selector-service';

const host = process.env.BACKEND_HOST || '127.0.0.1';
const port = Number(process.env.BACKEND_PORT || '4311');

const fakeTimetableRecognizer: TimetableRecognizer = {
  async recognize() {
    return {
      text: [
        '周一 08:00-08:45 数学 101',
        '周三 10:00-10:45 英语 202',
        '周五 14:00-14:45 物理 303',
      ].join('\n'),
    };
  },
};

async function main() {
  const controller = await bootstrapBackend({
    initializeConfiguration: initializeRuntimeConfiguration,
    createApplication: (configurationService) =>
      createApp({
        configurationService,
        allowedOriginsRaw: process.env.ALLOWED_API_ORIGINS,
        timetableRecognizer: fakeTimetableRecognizer,
      }),
    createWorker: () => new MaterialJobWorker(),
    port,
    host,
    log: (message) => console.log(message),
  });

  const shutdown = async () => {
    await controller.shutdown();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
