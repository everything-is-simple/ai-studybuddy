#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

function emit(ok, check, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok, check, ...details })}\n`);
}

function currentBackendRequire() {
  return createRequire(path.join(process.cwd(), 'package.json'));
}

function runDependencyImport() {
  const requireFromBackend = currentBackendRequire();
  for (const packageName of ['express', 'better-sqlite3', '@primno/dpapi', '@ai-studybuddy/shared']) {
    requireFromBackend(packageName);
  }
  emit(true, 'dependency-import');
}

function runSqlitePrecheck(databasePath, scope) {
  if (!databasePath || !scope) {
    emit(false, 'sqlite-precheck', { error: 'Database path and migration scope are required.' });
    process.exitCode = 64;
    return;
  }
  const Database = currentBackendRequire()('better-sqlite3');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const quick = db.pragma('quick_check', { simple: true });
    const migrationTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get();
    let version = 0;
    if (migrationTable) {
      const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations WHERE scope = ?').get(scope);
      version = Number(row?.v ?? 0);
    }
    emit(true, 'sqlite-precheck', { quick, version });
  } finally {
    db.close();
  }
}

function main() {
  const [check, ...argumentsForCheck] = process.argv.slice(2);
  try {
    if (check === 'dependency-import') {
      runDependencyImport();
      return;
    }
    if (check === 'sqlite-precheck') {
      runSqlitePrecheck(argumentsForCheck[0], argumentsForCheck[1]);
      return;
    }
    emit(false, check ?? 'invalid', { error: 'Unsupported runtime check.' });
    process.exitCode = 64;
  } catch (error) {
    emit(false, check ?? 'invalid', { error: `${error.name}: ${error.message}` });
    process.exitCode = 1;
  }
}

main();
