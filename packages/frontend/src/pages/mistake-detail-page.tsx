import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { MistakeErrorCauseCategory } from '@ai-studybuddy/shared';
import {
  confirmMistakeErrorCause,
  createMistakeRedo,
  getMistake,
  updateMistakeStatus,
} from '../api/error-fixer-api';
import { ApiClientError } from '../api/api-client';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';

interface MistakeDetailPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: '待复盘',
  needs_review: '需要复习',
  mastered: '已掌握',
};

const CAUSE_OPTIONS: Array<{ value: MistakeErrorCauseCategory; label: string }> = [
  { value: 'concept_unclear', label: '概念不清' },
  { value: 'misread', label: '审题错误' },
  { value: 'formula_error', label: '公式错误' },
  { value: 'step_missing', label: '步骤缺失' },
  { value: 'time_pressure', label: '时间不足' },
  { value: 'other', label: '其他' },
];

const EVIDENCE_LABELS: Record<string, string> = {
  practice_error: '练习答错',
  redo_correct: '重做通过',
  redo_incorrect: '重做未通过',
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  fill_blank: '填空题',
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function errorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return '操作失败，请稍后重试';
}

export function MistakeDetailPage({ semesterId, onSemesterError }: MistakeDetailPageProps) {
  const { mistakeId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('examId') ?? '';
  const navigate = useNavigate();

  const [causeCategory, setCauseCategory] = useState<MistakeErrorCauseCategory | ''>('');
  const [causeNote, setCauseNote] = useState('');
  const [savingCause, setSavingCause] = useState(false);
  const [startingRedo, setStartingRedo] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!semesterId || !mistakeId) return null;
      return getMistake(semesterId, mistakeId, signal);
    },
    [mistakeId, semesterId]
  );
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能查看错题。" />
      </div>
    );
  }

  if (error && (error.includes('学期不存在') || error.includes('学期尚未就绪'))) {
    onSemesterError?.();
  }

  const handleConfirmCause = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!causeCategory || !data) return;
    setSavingCause(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await confirmMistakeErrorCause(data.id, {
        semesterId,
        category: causeCategory,
        note: causeNote.trim() || null,
      });
      setActionMessage('错因已确认');
      setCauseCategory('');
      setCauseNote('');
      refetch();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setSavingCause(false);
    }
  };

  const handleStartRedo = async () => {
    if (!data) return;
    setStartingRedo(true);
    setActionError(null);
    try {
      const session = await createMistakeRedo(data.id, { semesterId });
      navigate(`/practice-sessions/${session.id}?fromMistakeId=${data.id}&examId=${examId}`);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setStartingRedo(false);
    }
  };

  const handleUpdateStatus = async (status: 'mastered' | 'needs_review', confirm?: boolean) => {
    if (!data) return;
    setUpdatingStatus(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await updateMistakeStatus(data.id, { semesterId, status, ...(confirm ? { confirm: true } : {}) });
      setActionMessage(status === 'mastered' ? '已标记为已掌握' : '已重新打开为需要复习');
      refetch();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const hasRedoCorrect = data?.evidence.some((item) => item.evidenceType === 'redo_correct') ?? false;
  // 无 examId 查询参数时回退到错题自身关联的考试，保证"返回错题本"始终可用
  const backExamId = examId || data?.assessmentAttemptId || '';

  return (
    <div className="page mistake-detail-page">
      {backExamId ? (
        <Link to={`/exams/${backExamId}/mistakes`}>返回错题本</Link>
      ) : (
        <Link to="/courses">返回课程与考试</Link>
      )}

      {data && backExamId && (
        <ExamContextNav examId={backExamId} courseInstanceId={data.courseInstanceId} active="mistakes" />
      )}

      {loading && <FeedbackMessage state="loading" message="正在加载错题详情…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}

      {data && (
        <>
          <header className="card">
            <p className="workbench-eyebrow">错题详情</p>
            <div className="mistake-item-head">
              <span className={`status-badge status-${data.status}`}>{STATUS_LABELS[data.status]}</span>
              <span className="text-muted">
                {QUESTION_TYPE_LABELS[data.questionType] ?? data.questionType} · {data.knowledgeModuleTitle} · 错误{' '}
                {data.errorCount} 次 · 最近 {formatDateTime(data.latestErrorAt)}
              </span>
            </div>
          </header>

          <section className="card" data-testid="mistake-question">
            <h2>原题</h2>
            <p className="practice-stem">{data.stem}</p>
            {data.options && (
              <ul className="mistake-options">
                {data.options.map((option) => (
                  <li key={option}>{option}</li>
                ))}
              </ul>
            )}
            <dl className="mistake-answers">
              <div>
                <dt>我的答案</dt>
                <dd className="answer-wrong">{data.studentAnswer ?? '（未作答）'}</dd>
              </div>
              <div>
                <dt>正确答案</dt>
                <dd className="answer-right">{data.correctAnswer}</dd>
              </div>
            </dl>
            {data.explanation && (
              <>
                <h3>解析</h3>
                <p>{data.explanation}</p>
              </>
            )}
          </section>

          <section className="card" data-testid="mistake-cause">
            <h2>错因确认</h2>
            {data.errorCauseCategory ? (
              <p>
                已确认错因：
                <strong>{CAUSE_OPTIONS.find((item) => item.value === data.errorCauseCategory)?.label ?? data.errorCauseCategory}</strong>
                {data.errorCauseNote ? ` — ${data.errorCauseNote}` : ''}
                {data.errorCauseConfirmedAt ? `（${formatDateTime(data.errorCauseConfirmedAt)}）` : ''}
              </p>
            ) : (
              <p className="text-muted">还没有确认错因。想清楚为什么错，比背下答案更重要。</p>
            )}
            <form onSubmit={handleConfirmCause} className="mistake-cause-form">
              <label htmlFor="causeCategory">{data.errorCauseCategory ? '修改错因' : '选择错因'}</label>
              <select
                id="causeCategory"
                value={causeCategory}
                onChange={(event) => setCauseCategory(event.target.value as MistakeErrorCauseCategory | '')}
                disabled={savingCause}
              >
                <option value="">请选择…</option>
                {CAUSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label htmlFor="causeNote">补充说明（可选）</label>
              <textarea
                id="causeNote"
                value={causeNote}
                onChange={(event) => setCauseNote(event.target.value)}
                maxLength={500}
                rows={2}
                disabled={savingCause}
              />
              <button type="submit" disabled={!causeCategory || savingCause}>
                {savingCause ? '保存中…' : '确认错因'}
              </button>
            </form>
          </section>

          <section className="card" data-testid="mistake-actions">
            <h2>改错行动</h2>
            <div className="mistake-action-buttons">
              <button type="button" onClick={handleStartRedo} disabled={startingRedo || updatingStatus}>
                {startingRedo ? '正在创建重做…' : '原题重做'}
              </button>
              {data.status === 'needs_review' && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleUpdateStatus('mastered', !hasRedoCorrect)}
                  disabled={updatingStatus || startingRedo}
                  title={hasRedoCorrect ? '已有重做通过证据' : '尚无重做通过证据，将以学生确认方式标记'}
                >
                  {hasRedoCorrect ? '标记已掌握' : '我确认已掌握'}
                </button>
              )}
              {data.status === 'mastered' && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleUpdateStatus('needs_review')}
                  disabled={updatingStatus || startingRedo}
                >
                  重新打开复习
                </button>
              )}
            </div>
            {actionMessage && <FeedbackMessage state="success" message={actionMessage} />}
            {actionError && <FeedbackMessage state="error" message={actionError} />}
          </section>

          <section className="card" data-testid="mistake-evidence">
            <h2>证据时间线</h2>
            <ul className="mistake-evidence-list">
              {data.evidence.map((item) => (
                <li key={item.id}>
                  <span className={`evidence-badge evidence-${item.evidenceType}`}>
                    {EVIDENCE_LABELS[item.evidenceType] ?? item.evidenceType}
                  </span>
                  <span className="text-muted">{formatDateTime(item.occurredAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default MistakeDetailPage;
