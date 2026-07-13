import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiRequest } from '../hooks/use-api-request';
import { getKnowledgeModules, getNote } from '../api/note-builder-api';
import { getStudyTasks } from '../api/study-rhythm-api';
import type { KnowledgeModuleDto, StudyTaskDto } from '@ai-studybuddy/shared';
import { AppNavigation } from '../components/app-navigation';
import { FeedbackMessage } from '../components/feedback-message';
import { MarkdownNote } from '../components/markdown-note';
import { MindMap } from '../components/mind-map';
import { KnowledgeModuleList } from '../components/knowledge-module-list';

interface NotePageProps {
  semesterId: string | null;
}

export function NotePage({ semesterId }: NotePageProps) {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();

  const noteFetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId || !noteId) return Promise.reject(new Error('缺少学期或笔记 ID'));
      return getNote(semesterId, noteId, signal);
    },
    [semesterId, noteId]
  );

  const {
    data: note,
    loading: noteLoading,
    error: noteError,
    refetch: refetchNote,
  } = useApiRequest(noteFetcher, [semesterId, noteId]);

  const courseInstanceId = note?.knowledgeModules?.[0]?.courseInstanceId;

  const modulesFetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId || !courseInstanceId) return Promise.reject(new Error('缺少课程信息'));
      return getKnowledgeModules(semesterId, courseInstanceId, signal).then((page) => page.items);
    },
    [semesterId, courseInstanceId]
  );

  const tasksFetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId || !courseInstanceId) return Promise.reject(new Error('缺少课程信息'));
      return getStudyTasks(semesterId, courseInstanceId, signal);
    },
    [semesterId, courseInstanceId]
  );

  const { data: modules, loading: modulesLoading } = useApiRequest<KnowledgeModuleDto[]>(modulesFetcher, [
    semesterId,
    courseInstanceId,
  ]);

  const { data: tasks } = useApiRequest<StudyTaskDto[]>(tasksFetcher, [semesterId, courseInstanceId]);

  const displayedModules = useMemo(() => {
    if (note && note.knowledgeModules.length > 0) return note.knowledgeModules;
    return modules ?? [];
  }, [note, modules]);

  if (!semesterId) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage state="empty" message="请先在本页顶部输入有效的学期 ID，才能查看笔记。" />
      </div>
    );
  }

  if (!noteId) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage
          state="error"
          message="笔记 ID 缺失，请从资料页面的“查看笔记”入口进入。"
          onRetry={() => navigate('/materials')}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <AppNavigation />
      <h1>笔记</h1>

      {noteLoading && <FeedbackMessage state="loading" />}
      {!noteLoading && noteError && <FeedbackMessage state="error" message={noteError} onRetry={refetchNote} />}
      {!noteLoading && !noteError && note && (
        <>
          <section className="card">
            <h2>笔记正文</h2>
            <MarkdownNote markdown={note.markdown} />
          </section>

          {note.mindMap && (
            <section className="card">
              <h2>思维导图</h2>
              <MindMap data={note.mindMap.data} />
            </section>
          )}

          {note.highlights.length > 0 && (
            <section className="card">
              <h2>重点摘录</h2>
              <ul className="highlight-list">
                {note.highlights.map((highlight, index) => (
                  <li key={index}>
                    <span className={`badge badge-${highlight.importance}`}>{highlight.importance}</span>
                    {highlight.content}
                    {highlight.position && <span className="text-muted">（{highlight.position}）</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>知识模块</h2>
            {modulesLoading ? (
              <FeedbackMessage state="loading" />
            ) : (
              <KnowledgeModuleList modules={displayedModules} tasks={tasks ?? []} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
