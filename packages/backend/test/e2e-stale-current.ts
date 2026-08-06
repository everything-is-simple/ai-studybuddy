import { openExistingDbAtPath } from '../src/db/connection';
import { initGlobalDb } from '../src/db/migrations';
import { getGlobalDbPath } from '../src/db/paths';

export function poisonCurrentSemesterForE2E(
  staleSemesterId = ['00000000', '0000', '4000', '8000', '000000000000'].join('-')
) {
  initGlobalDb().close();
  const db = openExistingDbAtPath(getGlobalDbPath());
  try {
    db.prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES ('current_semester_id', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(staleSemesterId, new Date().toISOString());
  } finally {
    db.close();
  }
}
