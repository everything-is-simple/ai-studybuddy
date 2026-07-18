import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DailyStudyHomeDto } from '@ai-studybuddy/shared';
import { ApiClientError } from '../api/api-client';
import { getDailyStudyHome } from '../api/daily-study-home-api';

function localCalendarDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <p className="daily-home-empty">{children}</p>;
}

function nextActionReason(kind: DailyStudyHomeDto['nextAction'] extends infer Action ? Action extends { kind: infer Kind } ? Kind : never : never) {
  const reasons = {
    quality_material: '资料需要先人工处理，避免后续学习依据不完整。',
    today_task: '这是今天到期的学习任务。',
    tomorrow_task: '明天已有安排，今天先完成准备。',
    error_review: '已有错题复习任务，优先巩固薄弱点。',
    upcoming_exam: '这是最近一场已确认考试。',
  } as const;
  return reasons[kind];
}

export function DailyStudyHomePage({ semesterId, onSemesterError }: { semesterId: string; onSemesterError: () => void }) {
  const [state, setState] = useState<{ loading: boolean; data: DailyStudyHomeDto | null; error: string | null }>({ loading: true, data: null, error: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await getDailyStudyHome(semesterId, localCalendarDate());
      setState({ loading: false, data, error: null });
    } catch (error) {
      if (error instanceof ApiClientError && (error.code === 'SEMESTER_NOT_FOUND' || error.code === 'SEMESTER_NOT_READY')) {
        onSemesterError();
        return;
      }
      setState({ loading: false, data: null, error: error instanceof Error ? error.message : '每日首页加载失败' });
    }
  }, [onSemesterError, semesterId]);
  useEffect(() => { void load(); }, [load]);
  if (state.loading) return <div className="page">正在加载每日学习首页…</div>;
  if (state.error) return <section className="page daily-home" aria-labelledby="daily-home-title"><h1 id="daily-home-title">每日学习首页</h1><p className="error-message">{state.error}</p><button type="button" onClick={() => void load()}>重新加载</button></section>;
  const data = state.data;
  if (!data) return null;
  const isEmpty = !data.todayTasks.length && !data.tomorrowTasks.length && !data.tomorrowSchedule.length && !data.upcomingExams.length && !data.pendingQualityMaterials.length && !data.errorReviews.length;
  return <section className="page daily-home" aria-labelledby="daily-home-title">
    <header className="daily-home-header"><div><h1 id="daily-home-title">每日学习首页</h1><p>{data.date} · 只显示当前学期的学习安排</p></div><Link to="/courses">查看课程</Link></header>
    {data.nextAction ? <section className="daily-home-next"><h2>下一步</h2><Link to={data.nextAction.path}>{data.nextAction.title}</Link><p>{nextActionReason(data.nextAction.kind)}</p></section> : null}
    {isEmpty ? <p className="daily-home-empty">当前学期暂时没有待办、临近考试、待质检资料或错题复习。可以从课程页补充学习计划。</p> : null}
    <div className="daily-home-grid">
      <section className="daily-home-card"><h2>今日待办</h2>{data.todayTasks.length ? <ul>{data.todayTasks.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.courseName}{item.deadlineAt ? ` · ${item.deadlineAt.slice(11, 16)} 截止` : ''}</span></li>)}</ul> : <EmptyCard>今天没有到期任务。</EmptyCard>}</section>
      <section className="daily-home-card"><h2>明日准备</h2>{data.tomorrowTasks.length ? <ul>{data.tomorrowTasks.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.courseName}</span></li>)}</ul> : <EmptyCard>明天没有已安排任务。</EmptyCard>}</section>
      <section className="daily-home-card"><h2>明日课程</h2>{data.tomorrowSchedule.length ? <ul>{data.tomorrowSchedule.map((item) => <li key={item.id}><Link to={`/courses/${item.courseInstanceId}`}>{item.courseName}</Link><span>{item.startTime}–{item.endTime}{item.location ? ` · ${item.location}` : ''}</span></li>)}</ul> : <EmptyCard>明天没有已登记课程。</EmptyCard>}</section>
      <section className="daily-home-card"><h2>临近考试</h2>{data.upcomingExams.length ? <ul>{data.upcomingExams.map((item) => <li key={item.id}><Link to={`/exams/${item.id}`}>{item.name}</Link><span>{item.courseName} · {item.daysUntil === 0 ? '今天' : `${item.daysUntil} 天后`}</span></li>)}</ul> : <EmptyCard>没有已确认的临近考试。</EmptyCard>}</section>
      <section className="daily-home-card"><h2>待质检资料</h2>{data.pendingQualityMaterials.length ? <ul>{data.pendingQualityMaterials.map((item) => <li key={item.id}><Link to={`/materials?courseInstanceId=${item.courseInstanceId}`}>{item.title}</Link><span>{item.courseName} · {item.status === 'conversion_failed' ? '转换失败，待修正' : '待人工质检'}</span></li>)}</ul> : <EmptyCard>没有待处理资料。</EmptyCard>}</section>
      <section className="daily-home-card"><h2>错题复习</h2>{data.errorReviews.length ? <ul>{data.errorReviews.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.courseName}</span></li>)}</ul> : <EmptyCard>没有已计划的错题复习。</EmptyCard>}</section>
    </div>
  </section>;
}
