// ============================================================
// 学期库 migration v6：S4 T04B 前端闭环所需的最小 Schema 补洞
// （T04A 遗漏，经用户批准的"收窄版方案 A"补齐）
// 1. mistakes：错因确认最小字段（类别/备注/确认时间）
// 2. mistake_evidence：证据类型扩展 redo_correct / redo_incorrect，
//    重建表并更新触发器（redo 作答指向复制题，经 origin_question_id 回链原题）
// 3. practice_sessions：session_kind + origin_mistake_id，仅服务 S4 原题重做
// 4. questions：origin_question_id 复制题溯源
// 不引入 T05 回流规则，不服务 S5/S6/S7。
// ============================================================

export const SEMESTER_V6_SQL = `
ALTER TABLE mistakes ADD COLUMN error_cause_category TEXT
  CHECK(error_cause_category IS NULL OR error_cause_category IN
    ('concept_unclear', 'misread', 'formula_error', 'step_missing', 'time_pressure', 'other'));
ALTER TABLE mistakes ADD COLUMN error_cause_note TEXT
  CHECK(error_cause_note IS NULL OR length(trim(error_cause_note)) BETWEEN 1 AND 500);
ALTER TABLE mistakes ADD COLUMN error_cause_confirmed_at TEXT;

ALTER TABLE practice_sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'practice'
  CHECK(session_kind IN ('practice', 'mistake_redo'));
ALTER TABLE practice_sessions ADD COLUMN origin_mistake_id TEXT
  REFERENCES mistakes(id) ON DELETE SET NULL;

ALTER TABLE questions ADD COLUMN origin_question_id TEXT
  REFERENCES questions(id) ON DELETE SET NULL;

CREATE TRIGGER validate_session_kind_insert
BEFORE INSERT ON practice_sessions
FOR EACH ROW
WHEN (NEW.session_kind = 'practice' AND NEW.origin_mistake_id IS NOT NULL)
  OR (NEW.session_kind = 'mistake_redo' AND (
    NEW.origin_mistake_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM mistakes m
      WHERE m.id = NEW.origin_mistake_id
        AND m.course_instance_id = NEW.course_instance_id
    )
  ))
BEGIN
  SELECT RAISE(ABORT, 'practice session redo relation mismatch');
END;

CREATE TRIGGER validate_session_kind_update
BEFORE UPDATE OF session_kind, origin_mistake_id, course_instance_id ON practice_sessions
FOR EACH ROW
WHEN (NEW.session_kind = 'practice' AND NEW.origin_mistake_id IS NOT NULL)
  OR (NEW.session_kind = 'mistake_redo' AND (
    NEW.origin_mistake_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM mistakes m
      WHERE m.id = NEW.origin_mistake_id
        AND m.course_instance_id = NEW.course_instance_id
    )
  ))
BEGIN
  SELECT RAISE(ABORT, 'practice session redo relation mismatch');
END;

CREATE TRIGGER validate_question_origin_insert
BEFORE INSERT ON questions
FOR EACH ROW
WHEN NEW.origin_question_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM questions o
  WHERE o.id = NEW.origin_question_id
    AND o.course_instance_id = NEW.course_instance_id
    AND o.knowledge_module_id = NEW.knowledge_module_id
)
BEGIN
  SELECT RAISE(ABORT, 'question origin relation mismatch');
END;

CREATE TRIGGER validate_question_origin_update
BEFORE UPDATE OF origin_question_id, course_instance_id, knowledge_module_id ON questions
FOR EACH ROW
WHEN NEW.origin_question_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM questions o
  WHERE o.id = NEW.origin_question_id
    AND o.course_instance_id = NEW.course_instance_id
    AND o.knowledge_module_id = NEW.knowledge_module_id
)
BEGIN
  SELECT RAISE(ABORT, 'question origin relation mismatch');
END;

CREATE TABLE mistake_evidence_v6 (
  id TEXT PRIMARY KEY,
  mistake_id TEXT NOT NULL,
  source_practice_answer_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL
    CHECK(evidence_type IN ('practice_error', 'redo_correct', 'redo_incorrect')),
  course_instance_id TEXT NOT NULL,
  knowledge_module_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(mistake_id) REFERENCES mistakes(id) ON DELETE CASCADE,
  FOREIGN KEY(source_practice_answer_id) REFERENCES practice_answers(id) ON DELETE CASCADE,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);

INSERT INTO mistake_evidence_v6
  SELECT id, mistake_id, source_practice_answer_id, evidence_type,
         course_instance_id, knowledge_module_id, question_id, occurred_at, created_at
  FROM mistake_evidence;

DROP TABLE mistake_evidence;

ALTER TABLE mistake_evidence_v6 RENAME TO mistake_evidence;

CREATE UNIQUE INDEX idx_mistake_evidence_source_answer
  ON mistake_evidence(source_practice_answer_id);
CREATE INDEX idx_mistake_evidence_mistake
  ON mistake_evidence(mistake_id, occurred_at DESC);
CREATE INDEX idx_mistake_evidence_module
  ON mistake_evidence(course_instance_id, knowledge_module_id, occurred_at DESC);

CREATE TRIGGER validate_mistake_evidence_insert
BEFORE INSERT ON mistake_evidence
FOR EACH ROW
WHEN NOT (
  (NEW.evidence_type = 'practice_error' AND EXISTS (
    SELECT 1
    FROM mistakes m
    JOIN practice_answers a ON a.id = NEW.source_practice_answer_id
    JOIN questions q ON q.id = a.question_id
    WHERE m.id = NEW.mistake_id
      AND a.is_correct = 0
      AND q.id = NEW.question_id
      AND q.course_instance_id = NEW.course_instance_id
      AND q.knowledge_module_id = NEW.knowledge_module_id
      AND m.question_id = NEW.question_id
      AND m.course_instance_id = NEW.course_instance_id
      AND m.knowledge_module_id = NEW.knowledge_module_id
  ))
  OR
  (NEW.evidence_type IN ('redo_correct', 'redo_incorrect') AND EXISTS (
    SELECT 1
    FROM mistakes m
    JOIN practice_answers a ON a.id = NEW.source_practice_answer_id
    JOIN questions redo_q ON redo_q.id = a.question_id
    WHERE m.id = NEW.mistake_id
      AND ((NEW.evidence_type = 'redo_correct' AND a.is_correct = 1)
        OR (NEW.evidence_type = 'redo_incorrect' AND a.is_correct = 0))
      AND redo_q.origin_question_id = NEW.question_id
      AND redo_q.course_instance_id = NEW.course_instance_id
      AND redo_q.knowledge_module_id = NEW.knowledge_module_id
      AND m.question_id = NEW.question_id
      AND m.course_instance_id = NEW.course_instance_id
      AND m.knowledge_module_id = NEW.knowledge_module_id
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'mistake evidence source mismatch');
END;

CREATE TRIGGER validate_mistake_evidence_update
BEFORE UPDATE OF mistake_id, source_practice_answer_id, evidence_type, course_instance_id, knowledge_module_id, question_id
ON mistake_evidence
FOR EACH ROW
WHEN NOT (
  (NEW.evidence_type = 'practice_error' AND EXISTS (
    SELECT 1
    FROM mistakes m
    JOIN practice_answers a ON a.id = NEW.source_practice_answer_id
    JOIN questions q ON q.id = a.question_id
    WHERE m.id = NEW.mistake_id
      AND a.is_correct = 0
      AND q.id = NEW.question_id
      AND q.course_instance_id = NEW.course_instance_id
      AND q.knowledge_module_id = NEW.knowledge_module_id
      AND m.question_id = NEW.question_id
      AND m.course_instance_id = NEW.course_instance_id
      AND m.knowledge_module_id = NEW.knowledge_module_id
  ))
  OR
  (NEW.evidence_type IN ('redo_correct', 'redo_incorrect') AND EXISTS (
    SELECT 1
    FROM mistakes m
    JOIN practice_answers a ON a.id = NEW.source_practice_answer_id
    JOIN questions redo_q ON redo_q.id = a.question_id
    WHERE m.id = NEW.mistake_id
      AND ((NEW.evidence_type = 'redo_correct' AND a.is_correct = 1)
        OR (NEW.evidence_type = 'redo_incorrect' AND a.is_correct = 0))
      AND redo_q.origin_question_id = NEW.question_id
      AND redo_q.course_instance_id = NEW.course_instance_id
      AND redo_q.knowledge_module_id = NEW.knowledge_module_id
      AND m.question_id = NEW.question_id
      AND m.course_instance_id = NEW.course_instance_id
      AND m.knowledge_module_id = NEW.knowledge_module_id
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'mistake evidence source mismatch');
END;
`;
