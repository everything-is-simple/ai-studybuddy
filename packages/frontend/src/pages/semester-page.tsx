import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CurrentSemesterDto, SemesterPreviewDto, SemesterSummaryDto, TimetablePreviewEntryDto } from '@ai-studybuddy/shared';
import { ApiClientError } from '../api/api-client';
import { archiveSemester, confirmSemester, listArchivedSemesters, listSemesters, previewSemesterTimetable, selectCurrentSemester } from '../api/semester-api';

interface SemesterPageProps {
  current: SemesterSummaryDto | null;
  currentMessage?: string | null;
  onCurrentChange: (current: CurrentSemesterDto) => void;
}

interface FormState {
  studentName: string;
  semesterCode: string;
  teachingStartDate: string;
  teachingEndDate: string;
  finalArchiveDate: string;
  file: File | null;
}

const emptyForm: FormState = {
  studentName: '',
  semesterCode: '',
  teachingStartDate: '',
  teachingEndDate: '',
  finalArchiveDate: '',
  file: null,
};

export function SemesterPage({ current, currentMessage = null, onCurrentChange }: SemesterPageProps) {
  const navigate = useNavigate();
  const [semesters, setSemesters] = useState<SemesterSummaryDto[]>([]);
  const [archivedSemesters, setArchivedSemesters] = useState<SemesterSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [preview, setPreview] = useState<SemesterPreviewDto | null>(null);
  const [entries, setEntries] = useState<TimetablePreviewEntryDto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresStudentName = semesters.length + archivedSemesters.length === 0;

  const loadSemesterLists = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [activeItems, archivedItems] = await Promise.all([listSemesters(signal), listArchivedSemesters(signal)]);
      setSemesters(activeItems);
      setArchivedSemesters(archivedItems);
      setListError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setListError(err instanceof Error ? err.message : '学期列表加载失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSemesterLists(controller.signal);
    return () => controller.abort();
  }, [current?.id, loadSemesterLists]);

  const currentId = current?.id ?? null;
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)), [entries]);

  async function handleSelect(semesterId: string) {
    setSubmitting(true);
    setError(null);
    try {
      const selected = await selectCurrentSemester(semesterId);
      onCurrentChange(selected);
      navigate('/courses', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换学期失败');
    } finally {
      setSubmitting(false);
    }
  }



  async function handleArchive(semester: SemesterSummaryDto) {
    if (semester.id === currentId) {
      setError('当前学期不能归档，请先切换到其他学期。');
      return;
    }
    const confirmed = window.confirm('归档后该学期只能查看历史，不能再切换为当前学期或新增/修改课程、考试、练习、错题数据。确认归档？');
    if (!confirmed) return;
    setSubmitting(true);
    setError(null);
    setArchiveMessage(null);
    try {
      const archived = await archiveSemester(semester.id);
      await loadSemesterLists();
      setArchiveMessage(`${archived.semesterCode} 已归档，可在归档学期中只读查看练习历史。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '归档学期失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.file) {
      setError('请上传课程表图片');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = await previewSemesterTimetable({
        semesterCode: form.semesterCode,
        teachingStartDate: form.teachingStartDate,
        teachingEndDate: form.teachingEndDate,
        finalArchiveDate: form.finalArchiveDate || undefined,
        studentName: requiresStudentName ? form.studentName : undefined,
        timetableImage: form.file,
      });
      setPreview(next);
      setEntries(next.entries);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : '课程表预览失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await confirmSemester({
        previewId: preview.previewId,
        semesterCode: preview.semesterCode,
        teachingStartDate: preview.teachingStartDate,
        teachingEndDate: preview.teachingEndDate,
        finalArchiveDate: preview.finalArchiveDate,
        studentName: requiresStudentName ? form.studentName : undefined,
        entries,
      });
      onCurrentChange(created.current);
      setPreview(null);
      setEntries([]);
      setForm(emptyForm);
      navigate('/courses', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建学期失败');
    } finally {
      setSubmitting(false);
    }
  }

  function updateEntry(clientId: string, patch: Partial<TimetablePreviewEntryDto>) {
    setEntries((items) => items.map((entry) => (entry.clientId === clientId ? { ...entry, ...patch } : entry)));
  }

  return (
    <section className="page semester-page">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Phase 1-T09A</p>
          <h1>学期管理</h1>
          <p className="page-intro">创建、选择与切换当前学期；课程、考试、任务和时间线会按当前学期隔离。</p>
        </div>
      </div>

      {!current && <div className="empty-state">还没有可用学期。请先创建第一个学期，之后系统会自动恢复当前学期。</div>}
      {current && <div className="current-semester-card">当前学期：<strong>{current.semesterCode}</strong>（{current.teachingStartDate} 至 {current.teachingEndDate}）</div>}
      {currentMessage && <p className="feedback warning" role="status">{currentMessage}</p>}
      {listError && <p className="feedback error">{listError}</p>}
      {error && <p className="feedback error" role="alert">{error}</p>}
      {archiveMessage && <p className="feedback success" role="status">{archiveMessage}</p>}

      <section className="panel">
        <h2>已有学期</h2>
        {loading ? <p>正在加载学期列表…</p> : semesters.length === 0 ? <p>暂无学期。</p> : (
          <ul className="semester-list">
            {semesters.map((semester) => (
              <li key={semester.id}>
                <div>
                  <strong>{semester.semesterCode}</strong>
                  <span>{semester.teachingStartDate} 至 {semester.teachingEndDate}</span>
                </div>
                <div className="semester-actions">
                  <Link to={`/semesters/${semester.id}/practice-history`}>查看练习历史</Link>
                  {semester.id === currentId ? <span className="semester-active">当前</span> : (
                    <>
                      <button type="button" onClick={() => void handleSelect(semester.id)} disabled={submitting}>切换到此学期</button>
                      <button type="button" className="secondary" onClick={() => void handleArchive(semester)} disabled={submitting}>归档此学期</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>


      <section className="panel">
        <h2>归档学期</h2>
        {loading ? <p>正在加载归档学期…</p> : archivedSemesters.length === 0 ? <p>暂无归档学期。</p> : (
          <ul className="semester-list archived-semester-list">
            {archivedSemesters.map((semester) => (
              <li key={semester.id}>
                <div>
                  <strong>{semester.semesterCode}</strong>
                  <span>{semester.teachingStartDate} 至 {semester.teachingEndDate}</span>
                  {semester.archivedAt && <span>归档时间：{semester.archivedAt.slice(0, 10)}</span>}
                </div>
                <div className="semester-actions">
                  <span className="semester-active">只读</span>
                  <Link to={`/semesters/${semester.id}/practice-history`}>查看练习历史</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>创建新学期</h2>
        <form className="semester-form" onSubmit={(event) => void handlePreview(event)}>
          {requiresStudentName && (
            <label>学生姓名
              <input value={form.studentName} onChange={(event) => setForm({ ...form, studentName: event.target.value })} required aria-describedby="student-name-help" />
              <span id="student-name-help" className="field-help">首次创建需要填写；后续学期会复用此学生。</span>
            </label>
          )}
          <label>学期名称
            <input value={form.semesterCode} onChange={(event) => setForm({ ...form, semesterCode: event.target.value })} required placeholder="例如 2026 春季学期" />
          </label>
          <label>开始日期
            <input type="date" value={form.teachingStartDate} onChange={(event) => setForm({ ...form, teachingStartDate: event.target.value })} required />
          </label>
          <label>结束日期
            <input type="date" value={form.teachingEndDate} onChange={(event) => setForm({ ...form, teachingEndDate: event.target.value })} required />
          </label>
          <label>归档日期（可选）
            <input type="date" value={form.finalArchiveDate} onChange={(event) => setForm({ ...form, finalArchiveDate: event.target.value })} />
          </label>
          <label>课程表图片
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })} required />
          </label>
          <button type="submit" disabled={submitting}>{submitting ? '处理中…' : '预览课程表'}</button>
        </form>
      </section>

      {preview && (
        <section className="panel">
          <h2>确认课程表预览</h2>
          <p>规则解析置信度仅表示本机规则解析文本的把握度，请确认后再创建。</p>
          {preview.warnings.map((warning) => <p className="feedback warning" key={warning}>{warning}</p>)}
          <div className="timetable-preview-table">
            {sortedEntries.map((entry) => (
              <div className="timetable-preview-row" key={entry.clientId}>
                <label>课程<input value={entry.courseName} onChange={(event) => updateEntry(entry.clientId, { courseName: event.target.value })} /></label>
                <label>星期<input type="number" min="0" max="6" value={entry.weekday} onChange={(event) => updateEntry(entry.clientId, { weekday: Number(event.target.value) as TimetablePreviewEntryDto['weekday'] })} /></label>
                <label>开始<input value={entry.startTime} onChange={(event) => updateEntry(entry.clientId, { startTime: event.target.value })} /></label>
                <label>结束<input value={entry.endTime} onChange={(event) => updateEntry(entry.clientId, { endTime: event.target.value })} /></label>
                <label>地点<input value={entry.location ?? ''} onChange={(event) => updateEntry(entry.clientId, { location: event.target.value })} /></label>
                <span>规则解析置信度：{entry.parserConfidence == null ? '—' : Math.round(entry.parserConfidence * 100) + '%'}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => void handleConfirm()} disabled={submitting || entries.length === 0}>{submitting ? '创建中…' : '确认创建并切换'}</button>
        </section>
      )}
    </section>
  );
}
