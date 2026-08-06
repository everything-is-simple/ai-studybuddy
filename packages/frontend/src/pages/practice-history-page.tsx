import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PracticeHistoryListResponseDto } from '@ai-studybuddy/shared';
import { getPracticeHistory, type PracticeHistoryFilters } from '../api/practice-runner-api';
import { PageState } from '../components/page-state';

const defaultResponse: PracticeHistoryListResponseDto = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, hasMore: false },
};

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildFilters(searchParams: URLSearchParams): PracticeHistoryFilters {
  return {
    courseInstanceId: searchParams.get('courseInstanceId') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
    page: positiveInt(searchParams.get('page'), 1),
    pageSize: positiveInt(searchParams.get('pageSize'), 20),
  };
}

function percent(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

export function PracticeHistoryPage() {
  const { semesterId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => buildFilters(searchParams), [searchParams]);
  const [data, setData] = useState<PracticeHistoryListResponseDto>(defaultResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!semesterId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getPracticeHistory(semesterId, filters, controller.signal)
      .then(setData)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '练习历史加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [semesterId, filters]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['courseInstanceId', 'status', 'dateFrom', 'dateTo']) {
      const value = String(form.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    next.set('page', '1');
    next.set('pageSize', String(filters.pageSize ?? 20));
    setSearchParams(next);
  }

  if (!semesterId) {
    return <PageState state="error" title="缺少学期" message="请从学期管理页进入练习历史。" />;
  }

  return (
    <section className="page practice-history-page">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Phase 1-T09E</p>
          <h1>练习历史</h1>
          <p className="page-intro">按指定学期只读查看已完成练习；归档学期也会保留这里的历史结果。</p>
        </div>
        <Link to="/semesters">返回学期管理</Link>
      </div>

      <form className="history-filter-form panel" onSubmit={handleSubmit}>
        <label>
          课程 ID
          <input
            name="courseInstanceId"
            defaultValue={filters.courseInstanceId ?? ''}
            placeholder="可选 courseInstanceId"
          />
        </label>
        <label>
          状态
          <select name="status" defaultValue={filters.status ?? ''}>
            <option value="">全部</option>
            <option value="graded">已评分</option>
            <option value="submitted">已提交</option>
            <option value="in_progress">进行中</option>
          </select>
        </label>
        <label>
          开始日期
          <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ''} />
        </label>
        <label>
          结束日期
          <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ''} />
        </label>
        <button type="submit">筛选</button>
      </form>

      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <PageState state="loading" title="正在加载练习历史" />
      ) : data.items.length === 0 ? (
        <PageState state="empty" title="暂无练习历史" message="完成并评分的练习会出现在这里。" />
      ) : (
        <section className="panel">
          <h2>历史记录</h2>
          <p className="page-intro">
            共 {data.pagination.total} 条，当前第 {data.pagination.page} 页。
          </p>
          <ul className="practice-history-list">
            {data.items.map((item) => (
              <li key={item.id} className="practice-history-item">
                <div>
                  <strong>{item.courseName}</strong>
                  <span>{item.assessmentName ?? '未关联考试'}</span>
                  <span>
                    {item.gradedAt?.slice(0, 10) ?? item.submittedAt?.slice(0, 10) ?? item.startedAt.slice(0, 10)}
                  </span>
                </div>
                <div>
                  <span>{item.questionCount} 题</span>
                  <span>正确率 {percent(item.correctRate)}</span>
                  {item.overtime && <span className="feedback warning">超时</span>}
                </div>
                <Link to={`/semesters/${semesterId}/practice-history/${item.id}`}>查看结果</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

export default PracticeHistoryPage;
