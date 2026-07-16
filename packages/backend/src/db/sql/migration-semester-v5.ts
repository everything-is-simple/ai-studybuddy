// ============================================================
// 学期库 migration v5：S4 错题归档与薄弱点数据库基线
// - mistakes：按原题聚合的错题复盘单元
// - mistake_evidence：逐条错误证据，source_practice_answer_id 唯一
// - weak_points：同课程实例 + 知识模块的多证据薄弱点
// S4 只消费 S3 practice_answers.is_correct = 0 的只读事实。
// ============================================================

export const SEMESTER_V5_SQL = `
CREATE TABLE mistakes (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  assessment_attempt_id TEXT,
  knowledge_module_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  first_practice_answer_id TEXT NOT NULL,
  latest_practice_answer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK(status IN ('pending_review', 'needs_review', 'mastered')),
  error_count INTEGER NOT NULL
    CHECK(typeof(error_count) = 'integer' AND error_count >= 1),
  first_error_at TEXT NOT NULL,
  latest_error_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY(first_practice_answer_id) REFERENCES practice_answers(id) ON DELETE CASCADE,
  FOREIGN KEY(latest_practice_answer_id) REFERENCES practice_answers(id) ON DELETE CASCADE
);

CREATE TABLE mistake_evidence (
  id TEXT PRIMARY KEY,
  mistake_id TEXT NOT NULL,
  source_practice_answer_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('practice_error')),
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

CREATE TABLE weak_points (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  knowledge_module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'mastered')),
  evidence_count INTEGER NOT NULL
    CHECK(typeof(evidence_count) = 'integer' AND evidence_count >= 2),
  first_detected_at TEXT NOT NULL,
  latest_detected_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_mistakes_question
  ON mistakes(question_id);
CREATE INDEX idx_mistakes_course_status
  ON mistakes(course_instance_id, status, latest_error_at DESC);
CREATE INDEX idx_mistakes_module_status
  ON mistakes(knowledge_module_id, status, latest_error_at DESC);
CREATE INDEX idx_mistakes_latest_error
  ON mistakes(latest_error_at DESC);

CREATE UNIQUE INDEX idx_mistake_evidence_source_answer
  ON mistake_evidence(source_practice_answer_id);
CREATE INDEX idx_mistake_evidence_mistake
  ON mistake_evidence(mistake_id, occurred_at DESC);
CREATE INDEX idx_mistake_evidence_module
  ON mistake_evidence(course_instance_id, knowledge_module_id, occurred_at DESC);

CREATE UNIQUE INDEX idx_weak_points_module
  ON weak_points(course_instance_id, knowledge_module_id);
CREATE INDEX idx_weak_points_course_status
  ON weak_points(course_instance_id, status, latest_detected_at DESC);

CREATE TRIGGER validate_mistakes_insert
BEFORE INSERT ON mistakes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = NEW.question_id
    AND q.course_instance_id = NEW.course_instance_id
    AND q.knowledge_module_id = NEW.knowledge_module_id
)
BEGIN
  SELECT RAISE(ABORT, 'mistake question relation mismatch');
END;

CREATE TRIGGER validate_mistakes_update
BEFORE UPDATE OF course_instance_id, assessment_attempt_id, knowledge_module_id, question_id ON mistakes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = NEW.question_id
    AND q.course_instance_id = NEW.course_instance_id
    AND q.knowledge_module_id = NEW.knowledge_module_id
)
BEGIN
  SELECT RAISE(ABORT, 'mistake question relation mismatch');
END;

CREATE TRIGGER validate_mistake_answers_insert
BEFORE INSERT ON mistakes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM practice_answers first_answer
  JOIN practice_answers latest_answer ON latest_answer.id = NEW.latest_practice_answer_id
  WHERE first_answer.id = NEW.first_practice_answer_id
    AND first_answer.question_id = NEW.question_id
    AND first_answer.is_correct = 0
    AND latest_answer.question_id = NEW.question_id
    AND latest_answer.is_correct = 0
)
BEGIN
  SELECT RAISE(ABORT, 'mistake answer relation mismatch');
END;

CREATE TRIGGER validate_mistake_answers_update
BEFORE UPDATE OF question_id, first_practice_answer_id, latest_practice_answer_id ON mistakes
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM practice_answers first_answer
  JOIN practice_answers latest_answer ON latest_answer.id = NEW.latest_practice_answer_id
  WHERE first_answer.id = NEW.first_practice_answer_id
    AND first_answer.question_id = NEW.question_id
    AND first_answer.is_correct = 0
    AND latest_answer.question_id = NEW.question_id
    AND latest_answer.is_correct = 0
)
BEGIN
  SELECT RAISE(ABORT, 'mistake answer relation mismatch');
END;

CREATE TRIGGER validate_mistake_evidence_insert
BEFORE INSERT ON mistake_evidence
FOR EACH ROW
WHEN NOT EXISTS (
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
)
BEGIN
  SELECT RAISE(ABORT, 'mistake evidence source mismatch');
END;

CREATE TRIGGER validate_mistake_evidence_update
BEFORE UPDATE OF mistake_id, source_practice_answer_id, course_instance_id, knowledge_module_id, question_id
ON mistake_evidence
FOR EACH ROW
WHEN NOT EXISTS (
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
)
BEGIN
  SELECT RAISE(ABORT, 'mistake evidence source mismatch');
END;

CREATE TRIGGER validate_weak_points_insert
BEFORE INSERT ON weak_points
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM knowledge_modules m
  WHERE m.id = NEW.knowledge_module_id
    AND m.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'weak point module relation mismatch');
END;

CREATE TRIGGER validate_weak_points_update
BEFORE UPDATE OF course_instance_id, knowledge_module_id ON weak_points
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM knowledge_modules m
  WHERE m.id = NEW.knowledge_module_id
    AND m.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'weak point module relation mismatch');
END;
`;
