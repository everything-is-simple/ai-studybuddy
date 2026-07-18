import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { KnowledgeModuleDto, PracticeDifficultyPreference } from '@ai-studybuddy/shared';
import { createPracticeSession } from '../api/practice-runner-api';
import { getKnowledgeModules } from '../api/note-builder-api';
import { getExam } from '../api/study-rhythm-api';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';

interface PracticeStartPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

interface PracticeStartData {
  exam: Awaited<ReturnType<typeof getExam>>;
  modules: KnowledgeModuleDto[];
}

const DIFFICULTY_OPTIONS: Array<{ value: PracticeDifficultyPreference; label: string }> = [
  { value: 'mixed', label: '混合难度' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
];

export function PracticeStartPage({ semesterId, onSemesterError }: PracticeStartPageProps) {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState('10');
  const [difficultyPreference, setDifficultyPreference] = useState<PracticeDifficultyPreference>('mixed');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<PracticeStartData | null> => {
      if (!semesterId || !examId) return null;
      const exam = await getExam(semesterId, examId, signal);
      const modules = await getKnowledgeModules(semesterId, exam.courseInstanceId, signal);
      return { exam, modules: modules.items };
    },
    [examId, semesterId]
  );
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleModule = (moduleId: string) => {
    setActionError(null);
    setSelectedIds((current) => {
      if (current.includes(moduleId)) return current.filter((id) => id !== moduleId);
      if (current.length >= 10) {
        setActionError('一次最多选择 10 个知识模块');
        return current;
      }
      return [...current, moduleId];
    });
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!semesterId || !data) return;
    const count = Number(questionCount);
    const timeLimit = timeLimitSeconds.trim() ? Number(timeLimitSeconds) : null;
    if (selectedIds.length === 0) return setActionError('请至少选择 1 个知识模块');
    if (!Number.isInteger(count) || count < 5 || count > 20) return setActionError('题目数量必须是 5 到 20 的整数');
    if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit <= 0))
      return setActionError('限时秒数必须是正整数，或留空表示不限时');

    setCreating(true);
    setActionError(null);
    try {
      const session = await createPracticeSession({
        semesterId,
        courseInstanceId: data.exam.courseInstanceId,
        assessmentAttemptId: data.exam.id,
        knowledgeModuleIds: selectedIds,
        questionCount: count,
        difficultyPreference,
        timeLimitSeconds: timeLimit,
      });
      navigate(`/practice-sessions/${session.id}`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '生成练习失败，请稍后重试';
      setActionError(message);
      if (message.includes('学期不存在')) onSemesterError?.();
    } finally {
      setCreating(false);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能发起练习。" />
      </div>
    );
  }

  const workbenchPath = examId ? `/exams/${encodeURIComponent(examId)}` : '/courses';
  return (
    <div className="page practice-start-page">
      <Link to={workbenchPath}>返回考试项目</Link>
      {loading && !data && <FeedbackMessage state="loading" message="正在加载可练知识模块…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {actionError && <FeedbackMessage state="error" message={actionError} />}
      {data && (
        <>
          <ExamContextNav examId={data.exam.id} courseInstanceId={data.exam.courseInstanceId} active="practice" />
          <header className="card">
            <p className="workbench-eyebrow">练习发起</p>
            <h1>{data.exam.name}</h1>
            <p>选择当前课程的知识模块，生成一组客观题练习。</p>
          </header>
          {data.exam.confirmationStatus !== 'confirmed' ? (
            <section className="card">
              <FeedbackMessage state="empty" message="请先在考试项目中确认考试日期，再发起练习。" />
            </section>
          ) : data.modules.length === 0 ? (
            <section className="card">
              <FeedbackMessage state="empty" message="当前课程还没有可练的知识模块，请先完成资料笔记处理。" />
            </section>
          ) : (
            <form className="card practice-start-form" onSubmit={(event) => void handleCreate(event)}>
              <fieldset disabled={creating}>
                <legend>选择知识模块（已选 {selectedIds.length}/10）</legend>
                <div className="practice-module-list">
                  {data.modules.map((module) => (
                    <label key={module.id} className="practice-module-option">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(module.id)}
                        onChange={() => toggleModule(module.id)}
                      />
                      <span>
                        <strong>{module.title}</strong>
                        <small>
                          {module.importance} · {module.difficulty}
                        </small>
                        {module.contentSummary && <small>{module.contentSummary}</small>}
                      </span>
                    </label>
                  ))}
                </div>
                <label htmlFor="practice-question-count">题目数量（5–20）</label>
                <input
                  id="practice-question-count"
                  type="number"
                  min="5"
                  max="20"
                  step="1"
                  value={questionCount}
                  onChange={(event) => setQuestionCount(event.target.value)}
                />
                <label htmlFor="practice-difficulty">难度偏好</label>
                <select
                  id="practice-difficulty"
                  value={difficultyPreference}
                  onChange={(event) => setDifficultyPreference(event.target.value as PracticeDifficultyPreference)}
                >
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="practice-time-limit">限时秒数（留空表示不限时）</label>
                <input
                  id="practice-time-limit"
                  type="number"
                  min="1"
                  step="1"
                  value={timeLimitSeconds}
                  onChange={(event) => setTimeLimitSeconds(event.target.value)}
                />
                <button type="submit" disabled={creating}>
                  {creating ? '正在生成练习…' : '生成练习'}
                </button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export default PracticeStartPage;
