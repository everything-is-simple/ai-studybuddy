import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { MistakeStatus } from '@ai-studybuddy/shared';
import { getMistakes, getWeakPoints } from '../api/error-fixer-api';
import { getCourses, getExam } from '../api/study-rhythm-api';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';

interface MistakeListPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

const STATUS_LABELS: Record<MistakeStatus, string> = {
  pending_review: '待复盘',
  needs_review: '需要复习',
  mastered: '已掌握',
};

const CAUSE_LABELS: Record<string, string> = {
  concept_unclear: '概念不清',
  misread: '审题错误',
  formula_error: '公式错误',
  step_missing: '步骤缺失',
  time_pressure: '时间不足',
  other: '其他',
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

export function MistakeListPage({ semesterId, onSemesterError }: MistakeListPageProps) {
  const { examId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isGlobalMode = !examId;
  const [statusFilter, setStatusFilter] = useState<MistakeStatus | ''>('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(searchParams.get('courseInstanceId') ?? '');

  const coursesFetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId || !isGlobalMode) return Promise.resolve([]);
      return getCourses(semesterId, signal);
    },
    [semesterId, isGlobalMode]
  );

  const { data: courses, loading: coursesLoading } = useApiRequest(coursesFetcher, [coursesFetcher]);

  useEffect(() => {
    if (!isGlobalMode) return;
    const requestedCourseId = searchParams.get('courseInstanceId');
    if (requestedCourseId) {
      setSelectedCourseId(requestedCourseId);
    }
  }, [isGlobalMode, searchParams]);

  const effectiveCourseId = useMemo(() => {
    if (!isGlobalMode) return undefined;
    return selectedCourseId;
  }, [isGlobalMode, selectedCourseId]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!semesterId) return null;
      if (!isGlobalMode && !examId) return null;

      let courseInstanceId: string;
      let examName: string | undefined;
      let examIdValue: string | undefined;

      if (isGlobalMode) {
        if (!effectiveCourseId) return null;
        courseInstanceId = effectiveCourseId;
      } else {
        const exam = await getExam(semesterId, examId, signal);
        courseInstanceId = exam.courseInstanceId;
        examName = exam.name;
        examIdValue = exam.id;
      }

      const [mistakes, weakPoints] = await Promise.all([
        getMistakes(
          semesterId,
          courseInstanceId,
          {
            status: statusFilter || undefined,
            knowledgeModuleId: moduleFilter || undefined,
          },
          signal
        ),
        getWeakPoints(semesterId, courseInstanceId, signal),
      ]);
      return { examName, examId: examIdValue, courseInstanceId, mistakes, weakPoints };
    },
    [examId, isGlobalMode, effectiveCourseId, moduleFilter, semesterId, statusFilter]
  );

  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);

  const handleCourseChange = (courseInstanceId: string) => {
    setSelectedCourseId(courseInstanceId);
    setSearchParams(courseInstanceId ? { courseInstanceId } : {}, { replace: true });
  };

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建或选择当前学期，才能查看错题本。" />
      </div>
    );
  }

  if (error && (error.includes('学期不存在') || error.includes('学期尚未就绪'))) {
    onSemesterError?.();
  }

  const moduleOptions = data
    ? [...new Map(data.mistakes.items.map((item) => [item.knowledgeModuleId, item.knowledgeModuleTitle]))]
    : [];

  return (
    <div className="page mistake-list-page">
      {!isGlobalMode && <Link to={`/exams/${examId}`}>返回考试工作台</Link>}
      {data?.examId && data?.courseInstanceId && (
        <ExamContextNav examId={data.examId} courseInstanceId={data.courseInstanceId} active="mistakes" />
      )}
      <header className="card">
        <p className="workbench-eyebrow">查漏补缺 · 错题本</p>
        <h1>{data?.examName ? `${data.examName} 的错题` : '错题本'}</h1>
      </header>

      {isGlobalMode && (
        <section className="card">
          <h2>选择课程</h2>
          {coursesLoading && <FeedbackMessage state="loading" />}
          {!coursesLoading && courses && courses.length === 0 && (
            <FeedbackMessage state="empty" message="还没有课程，请先去“课程”页面创建。" />
          )}
          {!coursesLoading && courses && courses.length > 0 && (
            <select
              value={selectedCourseId}
              onChange={(event) => handleCourseChange(event.target.value)}
              aria-label="选择课程"
            >
              <option value="">请选择课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          )}
        </section>
      )}

      {loading && <FeedbackMessage state="loading" message="正在加载错题…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}

      {data && data.weakPoints.items.length > 0 && (
        <section className="card weak-points" data-testid="weak-points">
          <h2>薄弱点</h2>
          <p className="text-muted">由多次错误证据归纳，点击可筛选对应错题。</p>
          <ul>
            {data.weakPoints.items.map((point) => (
              <li key={point.id}>
                <button
                  type="button"
                  className={moduleFilter === point.knowledgeModuleId ? 'weak-point-active' : ''}
                  onClick={() =>
                    setModuleFilter((current) => (current === point.knowledgeModuleId ? '' : point.knowledgeModuleId))
                  }
                >
                  {point.knowledgeModuleTitle}
                </button>
                <span className="text-muted">
                  {point.status === 'active' ? '待加强' : '已掌握'} · 证据 {point.evidenceCount} 条 · 最近{' '}
                  {formatDateTime(point.latestDetectedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section className="card" data-testid="mistake-list">
          <div className="mistake-filters">
            <label htmlFor="statusFilter">状态筛选</label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as MistakeStatus | '')}
            >
              <option value="">全部状态</option>
              <option value="pending_review">待复盘</option>
              <option value="needs_review">需要复习</option>
              <option value="mastered">已掌握</option>
            </select>
            {moduleOptions.length > 0 && (
              <>
                <label htmlFor="moduleFilter">知识模块</label>
                <select
                  id="moduleFilter"
                  value={moduleFilter}
                  onChange={(event) => setModuleFilter(event.target.value)}
                >
                  <option value="">全部模块</option>
                  {moduleOptions.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {data.mistakes.items.length === 0 ? (
            <FeedbackMessage
              state="empty"
              message={
                statusFilter || moduleFilter ? '当前筛选条件下没有错题。' : '当前没有待处理的错题，去练习区做一组题吧。'
              }
            />
          ) : (
            <ul className="mistake-items">
              {data.mistakes.items.map((mistake) => (
                <li key={mistake.id} className={`mistake-item mistake-${mistake.status}`}>
                  <div className="mistake-item-head">
                    <span className={`status-badge status-${mistake.status}`}>{STATUS_LABELS[mistake.status]}</span>
                    <span className="text-muted">
                      {QUESTION_TYPE_LABELS[mistake.questionType] ?? mistake.questionType} ·{' '}
                      {mistake.knowledgeModuleTitle} · 错误 {mistake.errorCount} 次
                    </span>
                  </div>
                  <p className="mistake-stem-preview">{mistake.stemPreview}</p>
                  <div className="mistake-item-foot">
                    <span className="text-muted">
                      最近错误 {formatDateTime(mistake.latestErrorAt)}
                      {mistake.errorCauseCategory
                        ? ` · 错因：${CAUSE_LABELS[mistake.errorCauseCategory] ?? mistake.errorCauseCategory}`
                        : ''}
                    </span>
                    <Link
                      className="button-link"
                      to={isGlobalMode ? `/mistakes/${mistake.id}` : `/mistakes/${mistake.id}?examId=${examId}`}
                    >
                      查看与改错
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.mistakes.total > data.mistakes.items.length && (
            <p className="text-muted">共 {data.mistakes.total} 条错题，当前仅显示第一页。</p>
          )}
        </section>
      )}
    </div>
  );
}

export default MistakeListPage;
