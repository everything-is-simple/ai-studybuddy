import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AssessmentAttemptDto,
  CourseInstanceDto,
  StudyTaskDto,
  StudyTaskStatus,
  StudyTaskType,
} from '@ai-studybuddy/shared';
import {
  confirmExam,
  createStudyTask,
  getCourses,
  getExam,
  getExams,
  getStudyTasks,
  updateStudyTaskStatus,
} from '../api/study-rhythm-api';
import { AppNavigation } from '../components/app-navigation';
import { FeedbackMessage } from '../components/feedback-message';
import { useApiRequest } from '../hooks/use-api-request';
import { calendarDayDistance, formatExamCountdown, isWithinCalendarDayWindow } from './exam-workbench-date';

interface ExamWorkbenchPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

interface WorkbenchData {
  exam: AssessmentAttemptDto;
  courses: CourseInstanceDto[];
  exams: AssessmentAttemptDto[];
  tasks: StudyTaskDto[];
}

const TASK_TYPE_OPTIONS: Array<{ value: StudyTaskType; label: string }> = [
  { value: 'material_note', label: '资料整理' },
  { value: 'practice', label: '练习任务' },
  { value: 'error_review', label: '错题复习任务' },
  { value: 'custom', label: '自定义任务' },
];

export function ExamWorkbenchPage({ semesterId, onSemesterError }: ExamWorkbenchPageProps) {
  const { examId = '' } = useParams();
  const [confirming, setConfirming] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<StudyTaskType>('custom');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<WorkbenchData | null> => {
      if (!semesterId || !examId) return null;
      const [exam, courses, exams, tasks] = await Promise.all([
        getExam(semesterId, examId, signal),
        getCourses(semesterId, signal),
        getExams(semesterId, undefined, signal),
        getStudyTasks(semesterId, undefined, signal),
      ]);
      return { exam, courses, exams, tasks };
    },
    [examId, semesterId]
  );

  const { data, loading, error, refetch } = useApiRequest(fetcher, [fetcher]);

  useEffect(() => {
    if (!data?.exam) return;
    setTaskTitle('');
    setTaskType('custom');
    setEstimatedMinutes('');
    setDeadlineAt(data.exam.confirmationStatus === 'confirmed' ? toLocalDateTimeInput(data.exam.examAt) : '');
    setActionMessage(null);
    setActionError(null);
  }, [data?.exam.id, data?.exam.examAt, data?.exam.confirmationStatus]);

  const courseById = useMemo(
    () => new Map((data?.courses ?? []).map((course) => [course.id, course])),
    [data?.courses]
  );
  const taskGroups = useMemo(() => groupTasksByExam(data?.tasks ?? []), [data?.tasks]);
  const currentTasks = useMemo(
    () => (data?.tasks ?? []).filter((task) => task.assessmentAttemptId === examId),
    [data?.tasks, examId]
  );
  const currentDoneCount = currentTasks.filter((task) => task.status === 'done').length;
  const confirmedExams = useMemo(
    () =>
      (data?.exams ?? [])
        .filter((exam) => exam.confirmationStatus === 'confirmed')
        .sort((a, b) => a.examAt.localeCompare(b.examAt)),
    [data?.exams]
  );
  const recentConfirmedExams = confirmedExams
    .filter((exam) => calendarDayDistance(exam.examAt) >= 0)
    .slice(0, 5);
  const pendingExams = (data?.exams ?? []).filter((exam) => exam.confirmationStatus === 'pending');
  const nearbyExams = data
    ? confirmedExams.filter(
        (exam) => exam.id !== data.exam.id && isWithinCalendarDayWindow(exam.examAt, data.exam.examAt, 7)
      )
    : [];
  const nearbyExamIds = new Set(nearbyExams.map((exam) => exam.id));
  const nearbyTasks = data
    ? data.tasks.filter(
        (task) =>
          !!task.assessmentAttemptId &&
          nearbyExamIds.has(task.assessmentAttemptId) &&
          !!task.deadlineAt &&
          isWithinCalendarDayWindow(task.deadlineAt, data.exam.examAt, 7)
      )
    : [];

  const handleConfirm = async () => {
    if (!semesterId || !examId) return;
    setConfirming(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await confirmExam(semesterId, examId);
      setActionMessage('考试日期已确认');
      refetch();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '考试确认失败';
      setActionError(message);
      if (message.includes('学期不存在')) onSemesterError?.();
    } finally {
      setConfirming(false);
    }
  };

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!semesterId || !data || !taskTitle.trim() || !deadlineAt) return;
    setCreatingTask(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await createStudyTask({
        semesterId,
        courseInstanceId: data.exam.courseInstanceId,
        assessmentAttemptId: data.exam.id,
        type: taskType,
        title: taskTitle.trim(),
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        deadlineAt: new Date(deadlineAt).toISOString(),
      });
      setTaskTitle('');
      setEstimatedMinutes('');
      setActionMessage('学习任务已创建');
      refetch();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : '任务创建失败');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleTaskStatus = async (taskId: string, status: StudyTaskStatus) => {
    if (!semesterId) return;
    setUpdatingTaskId(taskId);
    setActionError(null);
    setActionMessage(null);
    try {
      await updateStudyTaskStatus({ semesterId, taskId, status });
      setActionMessage(status === 'done' ? '任务已完成' : '任务已开始');
      refetch();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : '任务状态更新失败');
      refetch();
    } finally {
      setUpdatingTaskId(null);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage state="empty" message="请先设置当前学期 ID，才能打开考试项目。" />
      </div>
    );
  }

  return (
    <div className="page exam-workbench">
      <AppNavigation />
      {loading && !data && <FeedbackMessage state="loading" message="正在加载考试项目…" />}
      {error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
      {actionMessage && <FeedbackMessage state="success" message={actionMessage} />}
      {actionError && <FeedbackMessage state="error" message={actionError} />}

      {data && (
        <>
          <header className="workbench-header card">
            <div>
              <p className="workbench-eyebrow">考试项目</p>
              <h1>{data.exam.name}</h1>
              <p>{courseById.get(data.exam.courseInstanceId)?.name ?? '未知课程'}</p>
            </div>
            <div className="workbench-metrics">
              <div>
                <span>考试日期</span>
                <strong>{formatDateTime(data.exam.examAt)}</strong>
              </div>
              {data.exam.confirmationStatus === 'confirmed' && (
                <>
                  <div>
                    <span>倒计时</span>
                    <strong>{formatExamCountdown(data.exam.examAt)}</strong>
                  </div>
                  <div>
                    <span>任务进度</span>
                    <strong>
                      {currentDoneCount} / {currentTasks.length}
                    </strong>
                  </div>
                </>
              )}
            </div>
          </header>

          {data.exam.confirmationStatus !== 'confirmed' ? (
            <section className="card pending-exam-panel">
              <h2>考试日期待确认</h2>
              <p>确认后才会启用正式倒计时、任务进度和考试项目计划。</p>
              {data.exam.confirmationStatus === 'pending' ? (
                <button type="button" onClick={() => void handleConfirm()} disabled={confirming}>
                  {confirming ? '确认中…' : '确认考试日期'}
                </button>
              ) : (
                <p>当前状态不允许确认，请返回课程页核对考试信息。</p>
              )}
            </section>
          ) : (
            <>
              {confirmedExams.length > 1 && (
                <section className="card exam-switcher" aria-label="切换已确认考试">
                  <h2>切换考试项目</h2>
                  <div className="exam-switcher-links">
                    {confirmedExams.map((exam) => (
                      <Link key={exam.id} to={`/exams/${exam.id}`} aria-current={exam.id === examId ? 'page' : undefined}>
                        {exam.name}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section className="workbench-grid">
                <div className="card">
                  <h2>近期考试概览</h2>
                  {recentConfirmedExams.length === 0 ? (
                    <p className="text-muted">暂无未来已确认考试。</p>
                  ) : (
                    <ul className="overview-list">
                      {recentConfirmedExams.map((exam) => {
                        const examTasks = taskGroups.get(exam.id) ?? [];
                        return (
                          <li key={exam.id} data-exam-id={exam.id}>
                            <strong>{exam.name}</strong>
                            <span>{courseById.get(exam.courseInstanceId)?.name}</span>
                            <span>{formatDateTime(exam.examAt)}</span>
                            <span>{formatExamCountdown(exam.examAt)}</span>
                            <span>
                              {examTasks.filter((task) => task.status === 'done').length} / {examTasks.length}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {pendingExams.length > 0 && (
                    <div className="pending-overview">
                      <h3>待确认考试</h3>
                      <ul className="overview-list">
                        {pendingExams.map((exam) => (
                          <li key={exam.id} data-exam-id={exam.id}>
                            <strong>{exam.name}</strong>
                            <span>{courseById.get(exam.courseInstanceId)?.name}</span>
                            <span>待确认</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="card" data-testid="nearby-items">
                  <h2>日期附近提示</h2>
                  {nearbyExams.length === 0 && nearbyTasks.length === 0 ? (
                    <p className="text-muted">当前考试前后 7 天暂无其他已确认考试或关联任务。</p>
                  ) : (
                    <>
                      <ul className="nearby-list">
                        {nearbyExams.map((exam) => (
                          <li key={exam.id}>
                            {exam.name} · {formatDateTime(exam.examAt)}
                          </li>
                        ))}
                        {nearbyTasks.map((task) => (
                          <li key={task.id}>
                            {task.title} · {task.deadlineAt ? formatDateTime(task.deadlineAt) : '无截止时间'}
                          </li>
                        ))}
                      </ul>
                      <p className="text-muted">仅供查看，不会自动改期或平衡任务。</p>
                    </>
                  )}
                </div>
              </section>

              <section className="card workbench-materials">
                <h2>资料</h2>
                <p>进入当前课程资料页，继续上传或查看笔记。</p>
                <Link className="button-link" to={`/materials?courseInstanceId=${data.exam.courseInstanceId}`}>
                  打开本课程资料
                </Link>
              </section>

              <section className="card" data-testid="task-plan">
                <h2>计划</h2>
                <form className="task-form" onSubmit={handleCreateTask}>
                  <label htmlFor="taskTitle">任务标题</label>
                  <input
                    id="taskTitle"
                    name="taskTitle"
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    required
                    disabled={creatingTask}
                  />
                  <label htmlFor="taskType">任务类型</label>
                  <select
                    id="taskType"
                    name="taskType"
                    value={taskType}
                    onChange={(event) => setTaskType(event.target.value as StudyTaskType)}
                    disabled={creatingTask}
                  >
                    {TASK_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="estimatedMinutes">预计分钟数（可选）</label>
                  <input
                    id="estimatedMinutes"
                    name="estimatedMinutes"
                    type="number"
                    min="1"
                    value={estimatedMinutes}
                    onChange={(event) => setEstimatedMinutes(event.target.value)}
                    disabled={creatingTask}
                  />
                  <label htmlFor="deadlineAt">截止时间</label>
                  <input
                    id="deadlineAt"
                    name="deadlineAt"
                    type="datetime-local"
                    value={deadlineAt}
                    onChange={(event) => setDeadlineAt(event.target.value)}
                    required
                    disabled={creatingTask}
                  />
                  <button type="submit" disabled={creatingTask || !taskTitle.trim() || !deadlineAt}>
                    {creatingTask ? '创建中…' : '创建任务'}
                  </button>
                </form>

                {currentTasks.length === 0 ? (
                  <FeedbackMessage state="empty" message="还没有任务，先创建第一项任务。" />
                ) : (
                  <ul className="task-list" data-testid="current-task-list">
                    {currentTasks.map((task) => (
                      <li key={task.id} className={task.derivedOverdue ? 'task-overdue' : undefined}>
                        <div>
                          <strong>{task.title}</strong>
                          <span>{formatTaskStatus(task.status)}</span>
                          {task.deadlineAt && <span>截止：{formatDateTime(task.deadlineAt)}</span>}
                        </div>
                        {task.status === 'todo' && (
                          <button
                            type="button"
                            disabled={updatingTaskId === task.id}
                            onClick={() => void handleTaskStatus(task.id, 'doing')}
                          >
                            开始学习
                          </button>
                        )}
                        {task.status === 'doing' && (
                          <button
                            type="button"
                            disabled={updatingTaskId === task.id}
                            onClick={() => void handleTaskStatus(task.id, 'done')}
                          >
                            标记完成
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function groupTasksByExam(tasks: StudyTaskDto[]): Map<string, StudyTaskDto[]> {
  const grouped = new Map<string, StudyTaskDto[]>();
  for (const task of tasks) {
    if (!task.assessmentAttemptId) continue;
    const group = grouped.get(task.assessmentAttemptId) ?? [];
    group.push(task);
    grouped.set(task.assessmentAttemptId, group);
  }
  return grouped;
}

function toLocalDateTimeInput(iso: string): string {
  const value = new Date(iso);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN');
}

function formatTaskStatus(status: StudyTaskStatus): string {
  const labels: Record<StudyTaskStatus, string> = {
    todo: '待办',
    doing: '进行中',
    pending_quality_check: '待质检',
    done: '已完成',
    skipped: '已跳过',
  };
  return labels[status];
}

export default ExamWorkbenchPage;

