import type { Express } from 'express';
import type { Server } from 'http';
import type { ConfigurationService } from './config/configuration-service';
import type { MaterialJobWorker } from './services/material-job-worker';

export interface BackendController {
  server: Server;
  shutdown(): Promise<void>;
}

export async function bootstrapBackend(options: {
  initializeConfiguration: () => Promise<ConfigurationService>;
  createApplication: (service: ConfigurationService) => Express;
  createWorker: () => MaterialJobWorker;
  port: number;
  host: string;
  log?: (message: string) => void;
}): Promise<BackendController> {
  const configurationService = await options.initializeConfiguration();
  const app = options.createApplication(configurationService);
  const worker = options.createWorker();
  let workerTimer: NodeJS.Timeout | undefined;
  let server!: Server;
  await new Promise<void>((resolve, reject) => {
    server = app.listen(options.port, options.host, () => {
      workerTimer = worker.startPolling(2000);
      options.log?.(`Backend running on http://${options.host}:${options.port}`);
      resolve();
    });
    server.once('error', reject);
  });
  return {
    server,
    shutdown: () =>
      new Promise<void>((resolve, reject) => {
        if (workerTimer) worker.stopPolling(workerTimer);
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
