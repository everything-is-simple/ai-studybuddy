import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScheduleEntryDto } from '@ai-studybuddy/shared';
import { useApiRequest } from '../hooks/use-api-request';
import {
  confirmExam,
  createCourse,
  createExam,
  createScheduleEntry,
  deleteCourse,
  deleteScheduleEntry,
  getCourses,
  getExams,
  getScheduleEntries,
  getStudyTasks,
  updateCourse,
  updateExam,
  updateScheduleEntry,
} from '../api/study-rhythm-api';
import { FeedbackMessage } from '../components/feedback-message';
import { formatExamCountdown } from './exam-workbench-date';
import type { CourseWithExams } from '../types/view-models';

interface CoursePageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

interface CoursePageData {
  semesterId: string;
  courses: CourseWithExams[];
  scheduleEntries: ScheduleEntryDto[];
}

interface ScheduleFormState {
  courseInstanceId: string;
  weekday: string;
  startTime: string;
  endTime: string;
  location: string;
}

interface ExamFormState {
  name: string;
  examAt: string;
  goal: string;
}

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
const emptyScheduleForm: ScheduleFormState = {
  courseInstanceId: '',
  weekday: '1',
  startTime: '',
  endTime: '',
  location: '',
};
const emptyExamForm: ExamFormState = { name: '', examAt: '', goal: '' };

export function CoursePage({ semesterId, onSemesterError }: CoursePageProps) {
  const [courseName, setCourseName] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseName, setEditingCourseName] = useState('');
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);

  const [activeExamCourseId, setActiveExamCourseId] = useState<string | null>(null);
  const [submittingExamFor, setSubmittingExamFor] = useState<string | null>(null);
  const [examForm, setExamForm] = useState<ExamFormState>(emptyExamForm);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editingExamForm, setEditingExamForm] = useState<ExamFormState>(emptyExamForm);
  const [savingExamId, setSavingExamId] = useState<string | null>(null);
  const [confirmingExamId, setConfirmingExamId] = useState<string | null>(null);
  const [examActionErrors, setExamActionErrors] = useState<Record<string, string>>({});

  const [editingScheduleEntryId, setEditingScheduleEntryId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(emptyScheduleForm);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [removingScheduleId, setRemovingScheduleId] = useState<string | null>(null);
  const [scheduleActionError, setScheduleActionError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentSemesterRef = useRef(semesterId);

  useEffect(() => {
    currentSemesterRef.current = semesterId;
    setCourseName('');
    setEditingCourseId(null);
    setEditingCourseName('');
    setDeletingCourseId(null);
    setActiveExamCourseId(null);
    setSubmittingExamFor(null);
    setExamForm(emptyExamForm);
    setEditingExamId(null);
    setEditingExamForm(emptyExamForm);
    setConfirmingExamId(null);
    setExamActionErrors({});
    setEditingScheduleEntryId(null);
    setScheduleForm(emptyScheduleForm);
    setSavingSchedule(false);
    setRemovingScheduleId(null);
    setScheduleActionError(null);
    setSuccessMessage(null);
    setActionError(null);
  }, [semesterId]);

  const coursesFetcher = useCallback(
    async (signal: AbortSignal): Promise<CoursePageData | null> => {
      if (!semesterId) return null;
      const [courses, scheduleEntries] = await Promise.all([
        getCourses(semesterId, signal),
        getScheduleEntries(semesterId, signal),
      ]);
      const withDetails = await Promise.all(
        courses.map(async (course) => {
          const [exams, tasks] = await Promise.all([
            getExams(semesterId, course.id, signal),
            getStudyTasks(semesterId, course.id, signal),
          ]);
          return { course, exams, tasks };
        })
      );
      return { semesterId, courses: withDetails, scheduleEntries };
    },
    [semesterId]
  );

  const { data, loading, error, refetch } = useApiRequest(coursesFetcher, [semesterId]);
  const pageData = data?.semesterId === semesterId ? data : null;
  const sortedCourses = useMemo(
    () => [...(pageData?.courses ?? [])].sort((a, b) => a.course.name.localeCompare(b.course.name, 'zh-CN')),
    [pageData]
  );
  const scheduleEntries = useMemo(
    () =>
      [...(pageData?.scheduleEntries ?? [])].sort(
        (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)
      ),
    [pageData]
  );

  const reportActionError = (
    actionSemesterId: string,
    err: unknown,
    fallback: string,
    target?: 'schedule' | 'exam'
  ) => {
    if (currentSemesterRef.current !== actionSemesterId) return;
    const message = err instanceof Error ? err.message : fallback;
    if (message.includes('学期不存在')) {
      onSemesterError?.();
      return;
    }
    if (target === 'schedule') setScheduleActionError(message);
    else if (target === 'exam') setExamActionErrors((current) => ({ ...current, general: message }));
    else setActionError(message);
  };

  const handleCreateCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!semesterId || !courseName.trim()) return;
    const actionSemesterId = semesterId;
    setCreatingCourse(true);
    setSuccessMessage(null);
    setActionError(null);
    try {
      await createCourse({ semesterId: actionSemesterId, name: courseName.trim() });
      if (currentSemesterRef.current !== actionSemesterId) return;
      setCourseName('');
      setSuccessMessage('课程已创建');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '创建课程失败');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setCreatingCourse(false);
    }
  };

  const handleSaveCourse = async (courseId: string) => {
    if (!semesterId || !editingCourseName.trim()) return;
    const actionSemesterId = semesterId;
    setSavingCourseId(courseId);
    setSuccessMessage(null);
    setActionError(null);
    try {
      await updateCourse(actionSemesterId, courseId, { name: editingCourseName.trim() });
      if (currentSemesterRef.current !== actionSemesterId) return;
      setEditingCourseId(null);
      setEditingCourseName('');
      setSuccessMessage('课程名称已更新');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '更新课程名称失败');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setSavingCourseId(null);
    }
  };

  const handleDeleteCourse = async (courseId: string, courseName: string) => {
    if (!semesterId) return;
    if (!globalThis.confirm(`确定删除课程“${courseName}”吗？已有课表、考试或学习资料的课程不能直接删除。`)) return;
    const actionSemesterId = semesterId;
    setDeletingCourseId(courseId);
    setSuccessMessage(null);
    setActionError(null);
    try {
      await deleteCourse(actionSemesterId, courseId);
      if (currentSemesterRef.current !== actionSemesterId) return;
      setSuccessMessage('课程已删除');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '删除课程失败');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setDeletingCourseId(null);
    }
  };

  const handleExamFieldChange = (courseInstanceId: string, patch: Partial<ExamFormState>) => {
    setActiveExamCourseId((previous) => (previous === null ? courseInstanceId : previous));
    setExamForm((previous) => ({ ...previous, ...patch }));
  };

  const handleCreateExam = async (event: React.FormEvent, courseInstanceId: string) => {
    event.preventDefault();
    if (!semesterId || !examForm.name.trim() || !examForm.examAt) return;
    const actionSemesterId = semesterId;
    setSubmittingExamFor(courseInstanceId);
    setSuccessMessage(null);
    setActionError(null);
    try {
      await createExam({
        semesterId: actionSemesterId,
        courseInstanceId,
        name: examForm.name.trim(),
        attemptType: 'normal',
        examAt: new Date(examForm.examAt).toISOString(),
        goal: examForm.goal.trim() || undefined,
      });
      if (currentSemesterRef.current !== actionSemesterId) return;
      setExamForm(emptyExamForm);
      setActiveExamCourseId(null);
      setSuccessMessage('考试目标已创建，下一步请确认考试日期');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '创建考试目标失败');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setSubmittingExamFor(null);
    }
  };

  const handleConfirmExam = async (examId: string) => {
    if (!semesterId) return;
    const actionSemesterId = semesterId;
    setConfirmingExamId(examId);
    setSuccessMessage(null);
    setExamActionErrors((current) => {
      const next = { ...current };
      delete next[examId];
      return next;
    });
    try {
      await confirmExam(actionSemesterId, examId);
      if (currentSemesterRef.current !== actionSemesterId) return;
      setSuccessMessage('考试日期已确认，可以进入考试项目');
      refetch();
    } catch (err) {
      if (currentSemesterRef.current === actionSemesterId) {
        const message = err instanceof Error ? err.message : '考试确认失败';
        setExamActionErrors((current) => ({ ...current, [examId]: message }));
      }
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setConfirmingExamId(null);
    }
  };

  const handleSaveExam = async (examId: string) => {
    if (!semesterId || !editingExamForm.name.trim() || !editingExamForm.examAt) return;
    const actionSemesterId = semesterId;
    setSavingExamId(examId);
    setSuccessMessage(null);
    setActionError(null);
    try {
      await updateExam(actionSemesterId, examId, {
        name: editingExamForm.name.trim(),
        examAt: new Date(editingExamForm.examAt).toISOString(),
        goal: editingExamForm.goal.trim(),
      });
      if (currentSemesterRef.current !== actionSemesterId) return;
      setEditingExamId(null);
      setEditingExamForm(emptyExamForm);
      setSuccessMessage('考试目标已更新');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '更新考试目标失败');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setSavingExamId(null);
    }
  };

  const resetScheduleForm = () => {
    setEditingScheduleEntryId(null);
    setScheduleForm(emptyScheduleForm);
    setScheduleActionError(null);
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!semesterId) return;
    const courseInstanceId = scheduleForm.courseInstanceId || sortedCourses[0]?.course.id;
    if (!courseInstanceId || !scheduleForm.startTime || !scheduleForm.endTime) return;
    const actionSemesterId = semesterId;
    const payload = {
      courseInstanceId,
      weekday: Number(scheduleForm.weekday) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      startTime: scheduleForm.startTime,
      endTime: scheduleForm.endTime,
      location: scheduleForm.location.trim() || undefined,
    };
    setSavingSchedule(true);
    setScheduleActionError(null);
    setSuccessMessage(null);
    try {
      if (editingScheduleEntryId) await updateScheduleEntry(actionSemesterId, editingScheduleEntryId, payload);
      else await createScheduleEntry({ semesterId: actionSemesterId, ...payload });
      if (currentSemesterRef.current !== actionSemesterId) return;
      resetScheduleForm();
      setSuccessMessage(editingScheduleEntryId ? '课表条目已更新' : '课表条目已添加');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '保存课表条目失败', 'schedule');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setSavingSchedule(false);
    }
  };

  const handleRemoveSchedule = async (entryId: string) => {
    if (!semesterId) return;
    const actionSemesterId = semesterId;
    setRemovingScheduleId(entryId);
    setScheduleActionError(null);
    setSuccessMessage(null);
    try {
      await deleteScheduleEntry(actionSemesterId, entryId);
      if (currentSemesterRef.current !== actionSemesterId) return;
      if (editingScheduleEntryId === entryId) resetScheduleForm();
      setSuccessMessage('课表条目已移除');
      refetch();
    } catch (err) {
      reportActionError(actionSemesterId, err, '移除课表条目失败', 'schedule');
    } finally {
      if (currentSemesterRef.current === actionSemesterId) setRemovingScheduleId(null);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <FeedbackMessage state="empty" message="请先创建并选择当前学期，再维护课程与考试目标。" />
      </div>
    );
  }

  return (
    <div className="page course-page">
      <h1>课程与考试目标</h1>
      <p className="text-muted">当前学期内维护课程、完整周课表和考试目标；切换学期后会重新加载对应数据。</p>
      {successMessage && <FeedbackMessage state="success" message={successMessage} />}
      {actionError && <FeedbackMessage state="error" message={actionError} onRetry={() => setActionError(null)} />}

      <section className="course-create-section" aria-labelledby="course-create-heading">
        <h2 id="course-create-heading">创建课程</h2>
        <form onSubmit={handleCreateCourse} className="course-create-form">
          <label htmlFor="new-course-name">课程名称</label>
          <input
            id="new-course-name"
            type="text"
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            required
          />
          <button type="submit" disabled={creatingCourse}>
            {creatingCourse ? '创建中…' : '创建课程'}
          </button>
        </form>
      </section>

      {loading && <FeedbackMessage state="loading" message="正在加载课程、课表与考试目标…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          <section className="schedule-section" aria-labelledby="schedule-heading">
            <h2 id="schedule-heading">完整周课表</h2>
            {scheduleEntries.length === 0 && <p className="text-muted">暂无已登记课表</p>}
            <div className="weekly-schedule" aria-label="完整周课表">
              {weekdayLabels.map((label, weekday) => {
                const entries = scheduleEntries.filter((entry) => entry.weekday === weekday);
                return (
                  <section key={label} className="weekday-column" aria-label={label}>
                    <h3>{label}</h3>
                    {entries.length === 0 ? (
                      <p className="text-muted">暂无课程</p>
                    ) : (
                      <ul className="schedule-entry-list">
                        {entries.map((entry) => (
                          <li key={entry.id} className="schedule-entry">
                            <strong>{entry.courseName}</strong>
                            <span>
                              {entry.startTime}–{entry.endTime}
                            </span>
                            {entry.location && <span>{entry.location}</span>}
                            <div className="schedule-entry-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingScheduleEntryId(entry.id);
                                  setScheduleForm({
                                    courseInstanceId: entry.courseInstanceId,
                                    weekday: String(entry.weekday),
                                    startTime: entry.startTime,
                                    endTime: entry.endTime,
                                    location: entry.location ?? '',
                                  });
                                  setScheduleActionError(null);
                                }}
                              >
                                编辑课表条目
                              </button>
                              <button
                                type="button"
                                disabled={removingScheduleId === entry.id}
                                onClick={() => void handleRemoveSchedule(entry.id)}
                              >
                                {removingScheduleId === entry.id ? '移除中…' : '移除课表条目'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            <form className="schedule-form" onSubmit={handleSaveSchedule}>
              <h3>{editingScheduleEntryId ? '编辑课表条目' : '添加课表条目'}</h3>
              {sortedCourses.length === 0 ? (
                <p className="text-muted">请先创建课程，才可添加课表条目。</p>
              ) : (
                <>
                  <label>
                    课表课程
                    <select
                      aria-label="课表课程"
                      value={scheduleForm.courseInstanceId || sortedCourses[0].course.id}
                      onChange={(event) =>
                        setScheduleForm((current) => ({ ...current, courseInstanceId: event.target.value }))
                      }
                    >
                      {sortedCourses.map(({ course }) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    星期
                    <select
                      aria-label="星期"
                      value={scheduleForm.weekday}
                      onChange={(event) => setScheduleForm((current) => ({ ...current, weekday: event.target.value }))}
                    >
                      {weekdayLabels.map((label, weekday) => (
                        <option key={label} value={weekday}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    开始时间
                    <input
                      aria-label="开始时间"
                      type="time"
                      value={scheduleForm.startTime}
                      onChange={(event) =>
                        setScheduleForm((current) => ({ ...current, startTime: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    结束时间
                    <input
                      aria-label="结束时间"
                      type="time"
                      value={scheduleForm.endTime}
                      onChange={(event) => setScheduleForm((current) => ({ ...current, endTime: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    上课地点
                    <input
                      aria-label="上课地点"
                      type="text"
                      value={scheduleForm.location}
                      onChange={(event) => setScheduleForm((current) => ({ ...current, location: event.target.value }))}
                    />
                  </label>
                  <div className="schedule-form-actions">
                    <button type="submit" disabled={savingSchedule}>
                      {savingSchedule ? '保存中…' : editingScheduleEntryId ? '保存课表条目' : '添加课表条目'}
                    </button>
                    {editingScheduleEntryId && (
                      <button type="button" onClick={resetScheduleForm}>
                        取消编辑
                      </button>
                    )}
                  </div>
                </>
              )}
            </form>
            {scheduleActionError && (
              <FeedbackMessage
                state="error"
                message={scheduleActionError}
                onRetry={() => setScheduleActionError(null)}
              />
            )}
          </section>

          <section aria-labelledby="course-list-heading">
            <h2 id="course-list-heading">课程列表</h2>
            {sortedCourses.length === 0 ? (
              <FeedbackMessage state="empty" message="当前学期还没有课程，请先创建课程。" />
            ) : (
              <ul className="course-list">
                {sortedCourses.map(({ course, exams }) => (
                  <li key={course.id} className="course-item">
                    <div className="course-header">
                      {editingCourseId === course.id ? (
                        <>
                          <label>
                            编辑课程名称
                            <input
                              aria-label="编辑课程名称"
                              type="text"
                              value={editingCourseName}
                              onChange={(event) => setEditingCourseName(event.target.value)}
                              required
                            />
                          </label>
                          <button
                            type="button"
                            disabled={savingCourseId === course.id}
                            onClick={() => void handleSaveCourse(course.id)}
                          >
                            {savingCourseId === course.id ? '保存中…' : '保存课程名称'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCourseId(null);
                              setEditingCourseName('');
                            }}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>{course.name}</strong>
                          {course.retakeOfCourseInstanceId && <span className="badge">重修</span>}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCourseId(course.id);
                              setEditingCourseName(course.name);
                              setActionError(null);
                            }}
                          >
                            编辑课程名称
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteCourse(course.id, course.name)}
                            disabled={deletingCourseId === course.id}
                          >
                            {deletingCourseId === course.id ? '删除中…' : '删除课程'}
                          </button>
                        </>
                      )}
                    </div>

                    <div className="exam-section">
                      <h3>考试目标</h3>
                      {exams.length === 0 ? (
                        <p className="text-muted">暂无考试目标</p>
                      ) : (
                        <ul className="exam-list">
                          {exams.map((exam) => (
                            <li key={exam.id} className="exam-item">
                              <strong>{exam.name}</strong>
                              <span>时间：{new Date(exam.examAt).toLocaleString('zh-CN')}</span>
                              <span>状态：{formatConfirmationStatus(exam.confirmationStatus)}</span>
                              {exam.goal && <span>目标：{exam.goal}</span>}
                              {exam.confirmationStatus === 'confirmed' && (
                                <span>正式倒计时：{formatExamCountdown(exam.examAt)}</span>
                              )}
                              {exam.confirmationStatus === 'pending' && <span>等待重新确认</span>}
                              {editingExamId === exam.id ? (
                                <form
                                  className="exam-edit-form"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void handleSaveExam(exam.id);
                                  }}
                                >
                                  <label>
                                    考试名称
                                    <input
                                      aria-label="编辑考试名称"
                                      type="text"
                                      value={editingExamForm.name}
                                      onChange={(event) =>
                                        setEditingExamForm((current) => ({ ...current, name: event.target.value }))
                                      }
                                      required
                                    />
                                  </label>
                                  <label>
                                    考试日期
                                    <input
                                      aria-label="编辑考试日期"
                                      type="datetime-local"
                                      value={editingExamForm.examAt}
                                      onChange={(event) =>
                                        setEditingExamForm((current) => ({ ...current, examAt: event.target.value }))
                                      }
                                      required
                                    />
                                  </label>
                                  <label>
                                    考试目标
                                    <input
                                      aria-label="编辑考试目标"
                                      type="text"
                                      value={editingExamForm.goal}
                                      onChange={(event) =>
                                        setEditingExamForm((current) => ({ ...current, goal: event.target.value }))
                                      }
                                    />
                                  </label>
                                  <button type="submit" disabled={savingExamId === exam.id}>
                                    {savingExamId === exam.id ? '保存中…' : '保存考试'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingExamId(null);
                                      setEditingExamForm(emptyExamForm);
                                    }}
                                  >
                                    取消编辑
                                  </button>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingExamId(exam.id);
                                    setEditingExamForm({
                                      name: exam.name,
                                      examAt: toDateTimeLocal(exam.examAt),
                                      goal: exam.goal ?? '',
                                    });
                                    setActionError(null);
                                  }}
                                >
                                  编辑考试
                                </button>
                              )}
                              {exam.confirmationStatus === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmExam(exam.id)}
                                  disabled={confirmingExamId === exam.id}
                                >
                                  {confirmingExamId === exam.id ? '确认中…' : '确认考试日期'}
                                </button>
                              )}
                              {exam.confirmationStatus === 'confirmed' && (
                                <Link to={`/exams/${exam.id}`}>进入考试项目</Link>
                              )}
                              {examActionErrors[exam.id] && (
                                <p className="form-error" role="alert">
                                  {examActionErrors[exam.id]}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {examActionErrors.general && (
                        <FeedbackMessage
                          state="error"
                          message={examActionErrors.general}
                          onRetry={() =>
                            setExamActionErrors((current) => {
                              const next = { ...current };
                              delete next.general;
                              return next;
                            })
                          }
                        />
                      )}
                      {(() => {
                        const isActive = activeExamCourseId === null || activeExamCourseId === course.id;
                        const isSubmitting = submittingExamFor === course.id;
                        const disabled = !isActive || isSubmitting;
                        return (
                          <form onSubmit={(event) => handleCreateExam(event, course.id)} className="form-inline">
                            <input
                              type="text"
                              placeholder="考试名称"
                              value={isActive ? examForm.name : ''}
                              onChange={(event) => handleExamFieldChange(course.id, { name: event.target.value })}
                              disabled={disabled}
                              required
                            />
                            <input
                              type="datetime-local"
                              value={isActive ? examForm.examAt : ''}
                              onChange={(event) => handleExamFieldChange(course.id, { examAt: event.target.value })}
                              disabled={disabled}
                              required
                            />
                            <input
                              type="text"
                              placeholder="考试目标（可选）"
                              value={isActive ? examForm.goal : ''}
                              onChange={(event) => handleExamFieldChange(course.id, { goal: event.target.value })}
                              disabled={disabled}
                            />
                            <button type="submit" disabled={disabled}>
                              {isSubmitting ? '保存中…' : '添加考试'}
                            </button>
                          </form>
                        );
                      })()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatConfirmationStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    rejected: '已拒绝',
    superseded: '已替代',
  };
  return labels[status] ?? status;
}
