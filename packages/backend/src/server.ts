// Node 24 polyfill: DOMMatrix removed from global scope, required by pdf-parse
require('./polyfills.cjs');

import path from 'node:path';
import { createApp } from './app';
import { bootstrapBackend, type BackendController } from './bootstrap';
import { config } from './config/env';
import { initializeRuntimeConfiguration } from './config/runtime-configuration';
import { MaterialJobWorker } from './services/material-job-worker';

let controller: BackendController | undefined;

async function main(): Promise<void> {
  controller = await bootstrapBackend({
    initializeConfiguration: initializeRuntimeConfiguration,
    createApplication: (configurationService) =>
      createApp({
        configurationService,
        allowedOriginsRaw: config.configAllowedOrigins,
        staticRoot: config.frontendStaticRoot || path.resolve(__dirname, 'public'),
        enableDevRoutes: config.nodeEnv === 'development' || config.nodeEnv === 'test',
      }),
    createWorker: () => new MaterialJobWorker(),
    port: config.backendPort,
    host: config.backendHost,
    log: (message) => console.log(message),
  });
}

async function shutdown(): Promise<void> {
  await controller?.shutdown();
  process.exit(0);
}

if (require.main === module) {
  void main().catch(() => {
    console.error('BACKEND_BOOTSTRAP_FAILED');
    process.exitCode = 1;
  });
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
