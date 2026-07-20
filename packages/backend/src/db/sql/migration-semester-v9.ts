// ============================================================
// 学期库 migration v9：S5 模拟考 Schema 与生成结果基线
// - mock_exam_papers：归属已确认考试的模拟卷生成事实
// - mock_exam_questions：模拟卷题目，独立于 S3 practice questions
// - mock_exam_attempts：学生限时作答尝试与成绩统计事实
// - mock_exam_answers：逐题作答与客观题批改结果
// - mock_exam_module_analyses：按知识模块聚合的结果摘要
// S5 只读复用 S2/S3/S4 摘要输入，不反写 S3/S4 历史事实。
// ============================================================

export const SEMESTER_V9_SQL = `
CREATE TABLE mock_exam_papers (
  id TEXT PRIMARY KEY,
  course_instance_id TEXT NOT NULL,
  assessment_attempt_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK(status IN ('generated', 'retired')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  question_count INTEGER NOT NULL
    CHECK(typeof(question_count) = 'integer' AND question_count BETWEEN 1 AND 50),
  time_limit_seconds INTEGER NOT NULL
    CHECK(typeof(time_limit_seconds) = 'integer' AND time_limit_seconds > 0),
  total_points INTEGER NOT NULL
    CHECK(typeof(total_points) = 'integer' AND total_points > 0),
  difficulty_preference TEXT NOT NULL DEFAULT 'mixed'
    CHECK(difficulty_preference IN ('easy', 'medium', 'hard', 'mixed')),
  source_summary_json TEXT NOT NULL
    CHECK(json_valid(source_summary_json) = 1 AND json_type(source_summary_json) = 'object'),
  generation_prompt_version TEXT NOT NULL CHECK(length(trim(generation_prompt_version)) > 0),
  ai_model TEXT NOT NULL CHECK(length(trim(ai_model)) > 0),
  source_hash TEXT NOT NULL CHECK(length(trim(source_hash)) BETWEEN 8 AND 128),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE
);

CREATE TABLE mock_exam_questions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
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
  point_value INTEGER NOT NULL DEFAULT 1
    CHECK(typeof(point_value) = 'integer' AND point_value > 0),
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
  FOREIGN KEY(paper_id) REFERENCES mock_exam_papers(id) ON DELETE CASCADE,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE
);

CREATE TABLE mock_exam_attempts (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  course_instance_id TEXT NOT NULL,
  assessment_attempt_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress', 'submitted', 'graded')),
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  graded_at TEXT,
  total_score INTEGER
    CHECK(total_score IS NULL OR (typeof(total_score) = 'integer' AND total_score >= 0 AND total_score <= total_points)),
  total_points INTEGER NOT NULL
    CHECK(typeof(total_points) = 'integer' AND total_points > 0),
  correct_rate REAL
    CHECK(correct_rate IS NULL OR (typeof(correct_rate) IN ('integer', 'real')
      AND correct_rate >= 0.0 AND correct_rate <= 1.0)),
  overtime INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(overtime) = 'integer' AND overtime IN (0, 1)),
  total_duration_seconds INTEGER
    CHECK(total_duration_seconds IS NULL OR
      (typeof(total_duration_seconds) = 'integer' AND total_duration_seconds >= 0)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(paper_id) REFERENCES mock_exam_papers(id) ON DELETE CASCADE,
  FOREIGN KEY(course_instance_id) REFERENCES course_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(assessment_attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE
);

CREATE TABLE mock_exam_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  student_answer TEXT,
  is_correct INTEGER
    CHECK(is_correct IS NULL OR (typeof(is_correct) = 'integer' AND is_correct IN (0, 1))),
  score_awarded INTEGER
    CHECK(score_awarded IS NULL OR (typeof(score_awarded) = 'integer' AND score_awarded >= 0)),
  time_spent_seconds INTEGER
    CHECK(time_spent_seconds IS NULL OR
      (typeof(time_spent_seconds) = 'integer' AND time_spent_seconds >= 0)),
  answer_order INTEGER NOT NULL
    CHECK(typeof(answer_order) = 'integer' AND answer_order >= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY(attempt_id) REFERENCES mock_exam_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES mock_exam_questions(id) ON DELETE CASCADE
);

CREATE TABLE mock_exam_module_analyses (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  knowledge_module_id TEXT NOT NULL,
  question_count INTEGER NOT NULL
    CHECK(typeof(question_count) = 'integer' AND question_count > 0),
  correct_count INTEGER NOT NULL
    CHECK(typeof(correct_count) = 'integer' AND correct_count >= 0 AND correct_count <= question_count),
  score_awarded INTEGER NOT NULL
    CHECK(typeof(score_awarded) = 'integer' AND score_awarded >= 0 AND score_awarded <= total_points),
  total_points INTEGER NOT NULL
    CHECK(typeof(total_points) = 'integer' AND total_points > 0),
  correct_rate REAL NOT NULL
    CHECK(typeof(correct_rate) IN ('integer', 'real') AND correct_rate >= 0.0 AND correct_rate <= 1.0),
  weak_signal INTEGER NOT NULL DEFAULT 0
    CHECK(typeof(weak_signal) = 'integer' AND weak_signal IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(attempt_id) REFERENCES mock_exam_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_module_id) REFERENCES knowledge_modules(id) ON DELETE CASCADE
);

CREATE INDEX idx_mock_exam_papers_assessment
  ON mock_exam_papers(assessment_attempt_id, generated_at DESC);
CREATE INDEX idx_mock_exam_papers_course
  ON mock_exam_papers(course_instance_id, generated_at DESC);
CREATE INDEX idx_mock_exam_questions_paper
  ON mock_exam_questions(paper_id, question_order);
CREATE UNIQUE INDEX idx_mock_exam_questions_paper_order
  ON mock_exam_questions(paper_id, question_order);
CREATE INDEX idx_mock_exam_questions_module
  ON mock_exam_questions(knowledge_module_id, created_at DESC);
CREATE INDEX idx_mock_exam_attempts_paper
  ON mock_exam_attempts(paper_id, created_at DESC);
CREATE INDEX idx_mock_exam_attempts_assessment
  ON mock_exam_attempts(assessment_attempt_id, created_at DESC);
CREATE INDEX idx_mock_exam_answers_attempt
  ON mock_exam_answers(attempt_id, answer_order);
CREATE UNIQUE INDEX idx_mock_exam_answers_attempt_question
  ON mock_exam_answers(attempt_id, question_id);
CREATE UNIQUE INDEX idx_mock_exam_answers_attempt_order
  ON mock_exam_answers(attempt_id, answer_order);
CREATE UNIQUE INDEX idx_mock_exam_module_analyses_attempt_module
  ON mock_exam_module_analyses(attempt_id, knowledge_module_id);

CREATE TRIGGER validate_mock_exam_papers_insert
BEFORE INSERT ON mock_exam_papers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM assessment_attempts a
  WHERE a.id = NEW.assessment_attempt_id
    AND a.course_instance_id = NEW.course_instance_id
    AND a.confirmation_status = 'confirmed'
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam assessment relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_papers_update
BEFORE UPDATE OF course_instance_id, assessment_attempt_id ON mock_exam_papers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM assessment_attempts a
  WHERE a.id = NEW.assessment_attempt_id
    AND a.course_instance_id = NEW.course_instance_id
    AND a.confirmation_status = 'confirmed'
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam assessment relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_questions_insert
BEFORE INSERT ON mock_exam_questions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_papers p
  JOIN knowledge_modules km ON km.id = NEW.knowledge_module_id
  WHERE p.id = NEW.paper_id
    AND p.course_instance_id = NEW.course_instance_id
    AND km.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam question relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_questions_update
BEFORE UPDATE OF paper_id, course_instance_id, knowledge_module_id, question_order ON mock_exam_questions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_papers p
  JOIN knowledge_modules km ON km.id = NEW.knowledge_module_id
  WHERE p.id = NEW.paper_id
    AND p.course_instance_id = NEW.course_instance_id
    AND km.course_instance_id = NEW.course_instance_id
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam question relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_attempts_insert
BEFORE INSERT ON mock_exam_attempts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_papers p
  WHERE p.id = NEW.paper_id
    AND p.course_instance_id = NEW.course_instance_id
    AND p.assessment_attempt_id = NEW.assessment_attempt_id
    AND p.total_points = NEW.total_points
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam attempt relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_attempts_update
BEFORE UPDATE OF paper_id, course_instance_id, assessment_attempt_id, total_points ON mock_exam_attempts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_papers p
  WHERE p.id = NEW.paper_id
    AND p.course_instance_id = NEW.course_instance_id
    AND p.assessment_attempt_id = NEW.assessment_attempt_id
    AND p.total_points = NEW.total_points
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam attempt relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_answers_insert
BEFORE INSERT ON mock_exam_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_attempts a
  JOIN mock_exam_questions q ON q.id = NEW.question_id
  WHERE a.id = NEW.attempt_id
    AND q.paper_id = a.paper_id
    AND q.question_order = NEW.answer_order
    AND (NEW.score_awarded IS NULL OR NEW.score_awarded <= q.point_value)
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam answer relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_answers_update
BEFORE UPDATE OF attempt_id, question_id, answer_order, score_awarded ON mock_exam_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_attempts a
  JOIN mock_exam_questions q ON q.id = NEW.question_id
  WHERE a.id = NEW.attempt_id
    AND q.paper_id = a.paper_id
    AND q.question_order = NEW.answer_order
    AND (NEW.score_awarded IS NULL OR NEW.score_awarded <= q.point_value)
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam answer relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_module_analyses_insert
BEFORE INSERT ON mock_exam_module_analyses
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_attempts a
  JOIN mock_exam_questions q ON q.paper_id = a.paper_id AND q.knowledge_module_id = NEW.knowledge_module_id
  WHERE a.id = NEW.attempt_id
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam module analysis relation mismatch');
END;

CREATE TRIGGER validate_mock_exam_module_analyses_update
BEFORE UPDATE OF attempt_id, knowledge_module_id ON mock_exam_module_analyses
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM mock_exam_attempts a
  JOIN mock_exam_questions q ON q.paper_id = a.paper_id AND q.knowledge_module_id = NEW.knowledge_module_id
  WHERE a.id = NEW.attempt_id
)
BEGIN
  SELECT RAISE(ABORT, 'mock exam module analysis relation mismatch');
END;
`;
