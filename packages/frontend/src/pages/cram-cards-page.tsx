import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CramFlashcardDto } from '@ai-studybuddy/shared';
import { getCramCards } from '../api/cram-cards-api';
import { getExam } from '../api/study-rhythm-api';
import { ExamContextNav } from '../components/exam-context-nav';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';
import { useCramSession } from '../hooks/use-cram-session';

interface CramCardsPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

const SOURCE_LABELS: Record<CramFlashcardDto['sources'][number]['kind'], string> = {
  knowledge_module: '知识模块',
  weak_point: '薄弱点证据',
  mistake: '未掌握错题',
};

function formatRemaining(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CramCardsPage({ semesterId, onSemesterError }: CramCardsPageProps) {
  const { examId = '' } = useParams();
  const [durationMinutes, setDurationMinutes] = useState<5 | 10 | 15>(10);
  const fetcher = useCallback(async (signal: AbortSignal) => {
    if (!semesterId || !examId) return null;
    const exam = await getExam(semesterId, examId, signal);
    if (exam.confirmationStatus !== 'confirmed') return { exam, cram: null };
    const cram = await getCramCards(semesterId, examId, signal);
    return { exam, cram };
  }, [examId, semesterId]);
  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);
  const cards = data?.cram?.cards ?? [];
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const session = useCramSession({ semesterId, assessmentAttemptId: data?.exam.id ?? null, cardIds });
  const currentCard = session.snapshot ? cards.find((card) => card.id === session.snapshot?.currentCardId) ?? null : null;

  if (!semesterId) {
    return <div className="page"><FeedbackMessage state="empty" message="请先创建或选择当前学期，才能进行临考速背。" /></div>;
  }
  if (error && (error.includes('学期不存在') || error.includes('学期尚未就绪'))) onSemesterError?.();

  const workbenchPath = examId ? `/exams/${encodeURIComponent(examId)}` : '/courses';
  const mistakePath = examId ? `/exams/${encodeURIComponent(examId)}/mistakes` : '/courses';
  const materialPath = data?.exam.courseInstanceId ? `/materials?courseInstanceId=${encodeURIComponent(data.exam.courseInstanceId)}` : '/materials';
  const canNavigate = Boolean(session.snapshot && !session.isExpired && currentCard);
  const go = (offset: number) => {
    if (!session.snapshot || session.isExpired) return;
    const target = session.snapshot.cardIds[session.currentIndex + offset];
    if (target) session.visit(target);
  };

  return (
    <div className="page cram-cards-page">
      <Link to={workbenchPath}>返回考试项目</Link>
      {loading && !data && <FeedbackMessage state="loading" message="正在整理临考速背卡片…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {data && (
        <>
          <ExamContextNav examId={data.exam.id} courseInstanceId={data.exam.courseInstanceId} active="cram" />
          <header className="card cram-header">
            <p className="workbench-eyebrow">考前集中复习 · 临考速背</p>
            <h1>{data.exam.name} 的临考速背</h1>
            <p className="text-muted">卡片只使用知识模块摘要与风险信号，不展示原题、答案、作答或资料原文。</p>
          </header>
          {data.exam.confirmationStatus !== 'confirmed' && <FeedbackMessage state="empty" message="请先确认考试信息，确认后才能开始临考速背。" />}
          {data.exam.confirmationStatus === 'confirmed' && cards.length === 0 && (
            <section className="card cram-empty" data-testid="cram-empty">
              <h2>暂时没有可安全展示的速背卡片</h2>
              <p>请先补充知识模块摘要，或在既有练习和错题本中人工复习。</p>
              <div className="cram-manual-links"><Link className="button-link" to={mistakePath}>查看错题本</Link><Link className="button-link" to={materialPath}>查看知识资料</Link></div>
            </section>
          )}
          {data.exam.confirmationStatus === 'confirmed' && cards.length > 0 && session.isHydrated && !session.snapshot && (
            <section className="card cram-setup" data-testid="cram-setup">
              <h2>选择本次翻阅时长</h2>
              <p className="text-muted">倒计时按真实时间计算；切换页面或刷新不会暂停。</p>
              <div className="cram-duration-options" role="radiogroup" aria-label="临考速背时长">
                {([5, 10, 15] as const).map((minutes) => <button key={minutes} type="button" role="radio" aria-checked={durationMinutes === minutes} className={durationMinutes === minutes ? 'active' : undefined} onClick={() => setDurationMinutes(minutes)}>{minutes} 分钟</button>)}
              </div>
              <button type="button" className="primary-button" onClick={() => session.start(durationMinutes)}>开始速背</button>
              {!session.canPersist && <p className="text-muted">当前浏览器无法保存本次进度；仍可开始，但刷新后会重新开始。</p>}
            </section>
          )}
          {currentCard && session.snapshot && (
            <section className="card cram-session" data-testid="cram-session">
              <header className="cram-session-header"><div><h2>第 {session.currentIndex + 1} / {session.snapshot.cardIds.length} 张</h2><p>已阅 {session.snapshot.viewedCardIds.length} 张</p></div><div className="cram-timer" aria-live="polite"><strong>{formatRemaining(session.remainingSeconds)}</strong><span>{session.isExpired ? '本次翻阅已结束' : '剩余时间'}</span></div></header>
              {session.isExpired && <FeedbackMessage state="empty" message="本次限时翻阅已结束。当前卡片仍可翻转，但不能继续切换。" />}
              <article className={`cram-flashcard ${session.snapshot.flipped ? 'is-flipped' : ''}`} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); session.toggleFlipped(); } if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); go(1); } }}>
                <div className="cram-card-face"><p className="workbench-eyebrow">{currentCard.importance === 'critical' ? '核心重点' : '知识模块'}</p><h3>{currentCard.title}</h3><p>{session.snapshot.flipped ? (currentCard.examRelevance ?? currentCard.contentSummary) : (currentCard.contentSummary ?? currentCard.examRelevance)}</p></div>
                <footer><div className="cram-source-list">{currentCard.sources.map((source) => <span key={source.kind}>{SOURCE_LABELS[source.kind]} {source.kind === 'knowledge_module' ? '' : `${source.count} 条`}</span>)}</div><button type="button" onClick={session.toggleFlipped} aria-pressed={session.snapshot.flipped}>{session.snapshot.flipped ? '查看摘要面' : '翻转查看考点'}</button></footer>
              </article>
              <div className="cram-controls"><button type="button" onClick={() => go(-1)} disabled={!canNavigate || session.currentIndex === 0}>上一张</button><button type="button" onClick={() => go(1)} disabled={!canNavigate || session.currentIndex >= session.snapshot.cardIds.length - 1}>下一张</button><button type="button" onClick={session.restart}>重新开始</button></div>
              <div className="cram-manual-links"><Link className="button-link" to={mistakePath}>人工复习错题</Link><Link className="button-link" to={materialPath}>查看知识资料</Link></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default CramCardsPage;
