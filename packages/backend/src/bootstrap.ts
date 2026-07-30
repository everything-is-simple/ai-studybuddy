import type { Express } from 'express';
import type { Server } from 'http';
import type { ConfigurationService } from './config/configuration-service';
import type { MaterialJobWorker } from './services/material-job-worker';
import { SemesterSelectorService } from './services/semester-selector-service';
import { getGlobalDbPath } from './db/paths';
import {
  openReadOnlyExistingDbAtPath,
  runIntegrityCheck,
  getAllActiveSemesterDbPaths,
} from './db/connection';

export interface BackendController {
  server: Server;
  shutdown(): Promise<void>;
}

/**
 * T04-2: 启动时数据库完整性检查
 * 检查全局库和所有活跃学期库的完整性。
 * 任何失败都会拒绝启动。
 */
function performStartupIntegrityCheck(log?: (message: string) => void): void {
  const failures: string[] = [];

  // 检查全局库
  try {
    const globalDbPath = getGlobalDbPath();
    const globalDb = openReadOnlyExistingDbAtPath(globalDbPath);
    try {
      const result = runIntegrityCheck(globalDb);
      if (result !== 'ok') {
        const msg = `[DATABASE] STARTUP_INTEGRITY_FAILED scope=global detail=${result}`;
        log?.(msg);
        failures.push(msg);
      }
    } finally {
      globalDb.close();
    }
  } catch (error) {
    const msg = `[DATABASE] STARTUP_INTEGRITY_FAILED scope=global detail=${String(error)}`;
    log?.(msg);
    failures.push(msg);
  }

  // 检查所有活跃学期库
  try {
    const semesterDbPaths = getAllActiveSemesterDbPaths();
    for (const semesterDbPath of semesterDbPaths) {
      try {
        const semesterDb = openReadOnlyExistingDbAtPath(semesterDbPath);
        try {
          const result = runIntegrityCheck(semesterDb);
          if (result !== 'ok') {
            const msg = `[DATABASE] STARTUP_INTEGRITY_FAILED scope=semester path=${semesterDbPath} detail=${result}`;
            log?.(msg);
            failures.push(msg);
          }
        } finally {
          semesterDb.close();
        }
      } catch (error) {
        const msg = `[DATABASE] STARTUP_INTEGRITY_FAILED scope=semester path=${semesterDbPath} detail=${String(error)}`;
        log?.(msg);
        failures.push(msg);
      }
    }
  } catch (error) {
    const msg = `[DATABASE] STARTUP_INTEGRITY_QUERY_FAILED detail=${String(error)}`;
    log?.(msg);
    failures.push(msg);
  }

  if (failures.length > 0) {
    const summaryMsg = `[DATABASE] STARTUP_INTEGRITY_ALL_FAILED count=${failures.length}`;
    log?.(summaryMsg);
    console.error(summaryMsg);
    failures.forEach(f => console.error(f));
    process.exitCode = 1;
    throw new Error('Database integrity check failed at startup');
  }
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
  new SemesterSelectorService().migrateReadySemesters();
  const app = options.createApplication(configurationService);

  // T04-2: Startup database integrity check
  performStartupIntegrityCheck(options.log);

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
