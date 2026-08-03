import type { DatabaseType } from '../connection';

function addColumnIfMissing(db: DatabaseType, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

export function migrateSemesterV11(db: DatabaseType): void {
  addColumnIfMissing(db, 'materials', 'ocr_confidence', 'REAL');
  addColumnIfMissing(db, 'materials', 'vision_review_status', "TEXT NOT NULL DEFAULT 'not_needed'");
  addColumnIfMissing(db, 'materials', 'vision_review_model', 'TEXT');
  addColumnIfMissing(db, 'materials', 'vision_review_error', 'TEXT');
  addColumnIfMissing(db, 'normalized_texts', 'raw_ocr_text', 'TEXT');
  addColumnIfMissing(db, 'structured_notes', 'chunk_count', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'structured_notes', 'processing_mode', "TEXT NOT NULL DEFAULT 'single'");
  addColumnIfMissing(db, 'structured_notes', 'processing_metadata_json', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_chunks (
      id TEXT PRIMARY KEY, material_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
      start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, source_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', markdown TEXT, highlights_json TEXT,
      knowledge_modules_json TEXT, model TEXT, token_count INTEGER, generation_duration_ms INTEGER,
      error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(material_id) REFERENCES materials(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_material_chunks_material_order ON material_chunks(material_id, chunk_index);
    CREATE INDEX IF NOT EXISTS idx_material_chunks_material_status ON material_chunks(material_id, status, chunk_index);
  `);
}
