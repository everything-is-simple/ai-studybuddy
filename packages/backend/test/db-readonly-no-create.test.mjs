import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("openExistingDbAtPath and checkDatabaseIntegrityAtPath do not create missing db", async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "studybuddy-t03-readonly-"));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { openExistingDbAtPath } = await import("../dist/db/connection.js");
  const { checkDatabaseIntegrityAtPath } = await import("../dist/db/backups.js");

  const missingDbPath = path.join(dataRoot, "sub", "missing.db");
  assert.equal(existsSync(missingDbPath), false);
  assert.equal(existsSync(path.dirname(missingDbPath)), false);

  assert.throws(() => openExistingDbAtPath(missingDbPath), /DB_NOT_FOUND/);

  assert.equal(existsSync(path.dirname(missingDbPath)), false);
  assert.equal(existsSync(missingDbPath), false);

  const integrity = checkDatabaseIntegrityAtPath(missingDbPath);
  assert.ok(integrity.includes("DB_NOT_FOUND") || integrity.includes("error:"));

  assert.equal(existsSync(path.dirname(missingDbPath)), false);
  assert.equal(existsSync(missingDbPath), false);
});
