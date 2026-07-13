// ============================================================
// 学期库 migration v3：S2 资料笔记核心字段与约束
// ============================================================

export const SEMESTER_V3_SQL = `
ALTER TABLE materials ADD COLUMN original_filename TEXT;
ALTER TABLE materials ADD COLUMN title TEXT;
ALTER TABLE materials ADD COLUMN file_size_bytes INTEGER;
ALTER TABLE materials ADD COLUMN conversion_error_message TEXT;
ALTER TABLE materials ADD COLUMN ai_generation_error_message TEXT;
ALTER TABLE materials ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0;

ALTER TABLE jobs ADD COLUMN material_id TEXT;
CREATE INDEX idx_jobs_material_type_created ON jobs(material_id, job_type, created_at);
CREATE UNIQUE INDEX idx_jobs_material_type_active
  ON jobs(material_id, job_type)
  WHERE material_id IS NOT NULL AND status IN ('pending', 'running');

ALTER TABLE normalized_texts ADD COLUMN char_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE structured_notes ADD COLUMN prompt_version TEXT DEFAULT 's2-note-v1.0';
ALTER TABLE structured_notes ADD COLUMN token_count INTEGER;
ALTER TABLE structured_notes ADD COLUMN generation_duration_ms INTEGER;

ALTER TABLE knowledge_modules ADD COLUMN content_summary TEXT;
ALTER TABLE knowledge_modules ADD COLUMN exam_relevance TEXT;
ALTER TABLE knowledge_modules ADD COLUMN last_reviewed_at TEXT;

ALTER TABLE study_events ADD COLUMN evidence_ref TEXT;
ALTER TABLE study_events ADD COLUMN source_confidence REAL;
ALTER TABLE study_events ADD COLUMN quality_gate TEXT;

CREATE TRIGGER validate_materials_insert
BEFORE INSERT ON materials
FOR EACH ROW
WHEN NEW.status NOT IN ('pending', 'converting', 'converted', 'note_generating', 'completed', 'conversion_failed', 'pending_quality_check')
  OR NEW.storage_key LIKE '%..%'
  OR NEW.storage_key LIKE '%:%\\%'
  OR NEW.storage_key LIKE '%:/%'
  OR (NEW.file_size_bytes IS NOT NULL AND NEW.file_size_bytes <= 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid material');
END;

CREATE TRIGGER validate_materials_update
BEFORE UPDATE OF status, storage_key, file_size_bytes ON materials
FOR EACH ROW
WHEN NEW.status NOT IN ('pending', 'converting', 'converted', 'note_generating', 'completed', 'conversion_failed', 'pending_quality_check')
  OR NEW.storage_key LIKE '%..%'
  OR NEW.storage_key LIKE '%:%\\%'
  OR NEW.storage_key LIKE '%:/%'
  OR (NEW.file_size_bytes IS NOT NULL AND NEW.file_size_bytes <= 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid material');
END;

CREATE TRIGGER validate_normalized_text_insert
BEFORE INSERT ON normalized_texts
FOR EACH ROW
WHEN length(NEW.text) = 0 OR length(NEW.text) > 1048576
BEGIN
  SELECT RAISE(ABORT, 'invalid normalized text');
END;

CREATE TRIGGER validate_normalized_text_update
BEFORE UPDATE OF text ON normalized_texts
FOR EACH ROW
WHEN length(NEW.text) = 0 OR length(NEW.text) > 1048576
BEGIN
  SELECT RAISE(ABORT, 'invalid normalized text');
END;

CREATE INDEX idx_materials_course_status_created
  ON materials(course_instance_id, status, created_at);
CREATE UNIQUE INDEX idx_structured_notes_material
  ON structured_notes(material_id);
CREATE UNIQUE INDEX idx_mind_maps_note
  ON mind_maps(note_id);
CREATE INDEX idx_knowledge_modules_course_status
  ON knowledge_modules(course_instance_id, learn_status, importance, difficulty);
`;
