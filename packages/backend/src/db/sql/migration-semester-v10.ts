import type { DatabaseType } from '../connection';

export function migrateSemesterV10(db: DatabaseType): void {
  const columns = db.prepare('PRAGMA table_info(schedule_entries)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'teacher')) {
    db.exec('ALTER TABLE schedule_entries ADD COLUMN teacher TEXT;');
  }
}
