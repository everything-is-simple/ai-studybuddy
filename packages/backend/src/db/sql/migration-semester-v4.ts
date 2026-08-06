// ============================================================
// 学期库 migration v4：S3 限时练习数据库基线
// - practice_sessions：练习会话、限时与汇总结果
// - questions：题目、来源证据与生成元数据
// - practice_answers：逐题作答与客观批改结果
// 跨表归属由外键、唯一索引和一致性 trigger 共同保护。
// ============================================================

export const SEMESTER_V4_SQL = `
CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  assessment_attempt_id TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress', 'submitted', 'graded')),
  question_count INTEGER NOT NULL
    CHECK(typeof(question_count) = 'integer' AND question_count BETWEEN 1 AND 20),
  time_limit_seconds INTEGER
    CHECK(time_limit_seconds IS NULL OR (typeof(time_limit_seconds) = 'integer' AND time_limit_seconds > 0)),
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  graded_at TEXT,
  total_score INTEGER
    CHECK(total_score IS NULL OR (typeof(total_score) = 'integer' AND total_score BETWEEN 0 AND question_count)),
  correct_rate REAL
    CHECK(correct_rate IS NULL OR (typeof(correct_rate) IN ('integer', 'real')
      AND correct_rate >= 0.0 AND correct_rate <= 1.0)),
  overtime INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(overtime) = 'integer' AND overtime IN (0, 1)),
  total_duration_seconds INTEGER
    CHECK(total_duration_seconds IS NULL OR
      (typeof(total_duration_seconds) = 'integer' AND total_duration_seconds >= 0)),
  difficulty_preference TEXT NOT NULL DEFAULT 'mixed'
    CHECK(difficulty_preference IN ('easy', 'medium', 'hard', 'mixed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id) ON DELETE SET NULL
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  practice_session_id TEXT NOT NULL,
  course_instance_id TEXT NOT NULL,
  knowledge_module_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('single_choice', 'multiple_choice', 'fill_blank')),
  stem TEXT NOT NULL CHECK(length(trim(stem)) BETWEEN 1 AND 2000),
  options_json TEXT,
  correct_answer TEXT NOT NULL CHECK(length(trim(correct_answer)) > 0),
  acceptable_answers_json TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
  explanation TEXT,
  source_evidence TEXT,
  ai_model TEXT NOT NULL CHECK(length(trim(ai_model)) > 0),
  prompt_version TEXT NOT NULL DEFAULT 's3-practice-v1.0' CHECK(length(trim(prompt_version)) > 0),
  question_order INTEGER NOT NULL
    CHECK(typeof(question_order) = 'integer' AND question_order >= 1),
  created_at TEXT NOT NULL,
  CHECK(
    (type IN ('single_choice', 'multiple_choice')
      AND options_json IS NOT NULL AND json_valid(options_json) = 1 AND json_type(options_json) = 'array'
      AND acceptable_answers_json IS NULL)
    OR
    (type = 'fill_blank' AND options_json IS NULL
      AND (acceptable_answers_json IS NULL OR
        (json_valid(acceptable_answers_json) = 1 AND json_type(acceptable_answers_json) = 'array')))
  ),
  FOREIGN KEY(practice_session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE
);

CREATE TABLE practice_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  student_answer TEXT,
  is_correct INTEGER
    CHECK(is_correct IS NULL OR (typeof(is_correct) = 'integer' AND is_correct IN (0, 1))),
  time_spent_seconds INTEGER
    CHECK(time_spent_seconds IS NULL OR
      (typeof(time_spent_seconds) = 'integer' AND time_spent_seconds >= 0)),
  answer_order INTEGER NOT NULL
    CHECK(typeof(answer_order) = 'integer' AND answer_order >= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX idx_practice_sessions_course
  ON practice_sessions(course_instance_id, created_at DESC);
CREATE INDEX idx_practice_sessions_assessment
  ON practice_sessions(assessment_attempt_id, created_at DESC);
CREATE INDEX idx_practice_sessions_status
  ON practice_sessions(status, created_at DESC);

CREATE INDEX idx_questions_session
  ON questions(practice_session_id, created_at);
CREATE INDEX idx_questions_module
  ON questions(knowledge_module_id, created_at DESC);
CREATE INDEX idx_questions_course_difficulty_type
  ON questions(course_instance_id, difficulty, type);
CREATE UNIQUE INDEX idx_questions_session_order
  ON questions(practice_session_id, question_order);

CREATE INDEX idx_practice_answers_session
  ON practice_answers(session_id, answer_order);
CREATE INDEX idx_practice_answers_question_correct
  ON practice_answers(question_id, is_correct);
CREATE UNIQUE INDEX idx_practice_answers_session_question
  ON practice_answers(session_id, question_id);
CREATE UNIQUE INDEX idx_practice_answers_session_order
  ON practice_answers(session_id, answer_order);

CREATE TRIGGER validate_practice_sessions_insert
BEFORE INSERT ON practice_sessions
FOR EACH ROW
WHEN NEW.assessment_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM assessment_attempts a
  WHERE a.id = NEW.assessment_attempt_id
    AND a.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'practice session assessment course mismatch');
END;

CREATE TRIGGER validate_practice_sessions_update
BEFORE UPDATE OF course_instance_id, assessment_attempt_id ON practice_sessions
FOR EACH ROW
WHEN (NEW.assessment_attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM assessment_attempts a
  WHERE a.id = NEW.assessment_attempt_id
    AND a.course_instance_id = NEW.course_instance_id
)) OR EXISTS (
  SELECT 1 FROM questions q
  WHERE q.practice_session_id = OLD.id
    AND q.course_instance_id <> NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'practice session relation mismatch');
END;

CREATE TRIGGER validate_questions_insert
BEFORE INSERT ON questions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM practice_sessions s
  WHERE s.id = NEW.practice_session_id
    AND s.course_instance_id = NEW.course_instance_id
) OR NOT EXISTS (
  SELECT 1 FROM knowledge_modules m
  WHERE m.id = NEW.knowledge_module_id
    AND m.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'question course relation mismatch');
END;

CREATE TRIGGER validate_questions_update
BEFORE UPDATE OF practice_session_id, course_instance_id, knowledge_module_id, question_order ON questions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM practice_sessions s
  WHERE s.id = NEW.practice_session_id
    AND s.course_instance_id = NEW.course_instance_id
) OR NOT EXISTS (
  SELECT 1 FROM knowledge_modules m
  WHERE m.id = NEW.knowledge_module_id
    AND m.course_instance_id = NEW.course_instance_id
) OR EXISTS (
  SELECT 1 FROM practice_answers a
  WHERE a.question_id = OLD.id
    AND (a.session_id <> NEW.practice_session_id OR a.answer_order <> NEW.question_order)
)
BEGIN
  SELECT RAISE(ABORT, 'question relation mismatch');
END;

CREATE TRIGGER validate_practice_answers_insert
BEFORE INSERT ON practice_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = NEW.question_id
    AND q.practice_session_id = NEW.session_id
    AND q.question_order = NEW.answer_order
)
BEGIN
  SELECT RAISE(ABORT, 'practice answer relation mismatch');
END;

CREATE TRIGGER validate_practice_answers_update
BEFORE UPDATE OF session_id, question_id, answer_order ON practice_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = NEW.question_id
    AND q.practice_session_id = NEW.session_id
    AND q.question_order = NEW.answer_order
)
BEGIN
  SELECT RAISE(ABORT, 'practice answer relation mismatch');
END;

CREATE TRIGGER validate_assessment_practice_course_update
BEFORE UPDATE OF course_instance_id ON assessment_attempts
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM practice_sessions s
  WHERE s.assessment_attempt_id = OLD.id
    AND s.course_instance_id <> NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'assessment practice course mismatch');
END;

CREATE TRIGGER validate_knowledge_module_question_course_update
BEFORE UPDATE OF course_instance_id ON knowledge_modules
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM questions q
  WHERE q.knowledge_module_id = OLD.id
    AND q.course_instance_id <> NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge module question course mismatch');
END;
`;
