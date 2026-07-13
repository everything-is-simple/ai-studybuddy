import { useCallback, useMemo, useState } from 'react';
import { useApiRequest } from '../hooks/use-api-request';
import { createCourse, createExam, getCourses, getExams, getStudyTasks } from '../api/study-rhythm-api';
import { AppNavigation } from '../components/app-navigation';
import { FeedbackMessage } from '../components/feedback-message';
import type { CourseWithExams } from '../types/view-models';

interface CoursePageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

export function CoursePage({ semesterId, onSemesterError }: CoursePageProps) {
  const [courseName, setCourseName] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [creatingExamFor, setCreatingExamFor] = useState<string | null>(null);
  const [examForm, setExamForm] = useState<{ name: string; examAt: string; goal: string }>({
    name: '',
    examAt: '',
    goal: '',
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const coursesFetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId) return Promise.resolve<CourseWithExams[]>([]);
      return getCourses(semesterId, signal).then(async (courses) => {
        const withDetails = await Promise.all(
          courses.map(async (course) => {
            const [exams, tasks] = await Promise.all([
              getExams(semesterId, course.id, signal).catch(() => []),
              getStudyTasks(semesterId, course.id, signal).catch(() => []),
            ]);
            return { course, exams, tasks };
          })
        );
        return withDetails;
      });
    },
    [semesterId]
  );

  const { data: courses, loading, error, refetch } = useApiRequest(coursesFetcher, [semesterId]);

  const sortedCourses = useMemo(() => {
    if (!courses) return [];
    return [...courses].sort((a, b) => a.course.name.localeCompare(b.course.name, 'zh-CN'));
  }, [courses]);

  const handleCreateCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!semesterId || !courseName.trim()) return;
    setCreatingCourse(true);
    setSuccessMessage(null);
    try {
      await createCourse({ semesterId, name: courseName.trim() });
      setCourseName('');
      setSuccessMessage('课程已创建');
      await refetch();
    } catch (err) {
      if (err instanceof Error && err.message.includes('学期不存在')) {
        onSemesterError?.();
      }
    } finally {
      setCreatingCourse(false);
    }
  };

  const handleCreateExam = async (event: React.FormEvent, courseInstanceId: string) => {
    event.preventDefault();
    if (!semesterId || !examForm.name.trim() || !examForm.examAt) return;
    setCreatingExamFor(courseInstanceId);
    setSuccessMessage(null);
    try {
      await createExam({
        semesterId,
        courseInstanceId,
        name: examForm.name.trim(),
        attemptType: 'normal',
        examAt: new Date(examForm.examAt).toISOString(),
        goal: examForm.goal.trim() || undefined,
      });
      setExamForm({ name: '', examAt: '', goal: '' });
      setCreatingExamFor(null);
      setSuccessMessage('考试目标已创建');
      await refetch();
    } catch (err) {
      if (err instanceof Error && err.message.includes('学期不存在')) {
        onSemesterError?.();
      }
      setCreatingExamFor(null);
    }
  };

  if (!semesterId) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage state="empty" message="请先在本页顶部输入有效的学期 ID，才能管理课程和考试目标。" />
      </div>
    );
  }

  return (
    <div className="page">
      <AppNavigation />
      <h1>课程与考试目标</h1>

      {successMessage && <FeedbackMessage state="success" message={successMessage} />}

      <section className="card">
        <h2>创建课程</h2>
        <form onSubmit={handleCreateCourse} className="form-row">
          <label htmlFor="courseName">课程名称</label>
          <input
            id="courseName"
            type="text"
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            placeholder="例如：线性代数"
            required
            disabled={creatingCourse}
          />
          <button type="submit" disabled={creatingCourse || !courseName.trim()}>
            {creatingCourse ? '创建中…' : '创建课程'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>课程列表</h2>
        {loading && <FeedbackMessage state="loading" />}
        {!loading && error && <FeedbackMessage state="error" message={error} onRetry={refetch} />}
        {!loading && !error && sortedCourses.length === 0 && (
          <FeedbackMessage state="empty" message="还没有课程，先创建一个吧" />
        )}
        {!loading && !error && sortedCourses.length > 0 && (
          <ul className="course-list">
            {sortedCourses.map(({ course, exams }) => (
              <li key={course.id} className="course-item">
                <div className="course-header">
                  <strong>{course.name}</strong>
                  {course.retakeOfCourseInstanceId && <span className="badge">重修</span>}
                </div>

                <div className="exam-section">
                  <h3>考试目标</h3>
                  {exams.length === 0 ? (
                    <p className="text-muted">暂无考试目标</p>
                  ) : (
                    <ul className="exam-list">
                      {exams.map((exam) => (
                        <li key={exam.id}>
                          <strong>{exam.name}</strong>
                          <span>时间：{new Date(exam.examAt).toLocaleString('zh-CN')}</span>
                          <span>状态：{exam.confirmationStatus}</span>
                          {exam.goal && <span>目标：{exam.goal}</span>}
                        </li>
                      ))}
                    </ul>
                  )}

                  <form onSubmit={(event) => handleCreateExam(event, course.id)} className="form-inline">
                    <input
                      type="text"
                      placeholder="考试名称"
                      value={creatingExamFor === course.id ? examForm.name : ''}
                      onChange={(event) => setExamForm((prev) => ({ ...prev, name: event.target.value }))}
                      disabled={creatingExamFor !== null && creatingExamFor !== course.id}
                      required
                    />
                    <input
                      type="datetime-local"
                      value={creatingExamFor === course.id ? examForm.examAt : ''}
                      onChange={(event) => setExamForm((prev) => ({ ...prev, examAt: event.target.value }))}
                      disabled={creatingExamFor !== null && creatingExamFor !== course.id}
                      required
                    />
                    <input
                      type="text"
                      placeholder="考试目标（可选）"
                      value={creatingExamFor === course.id ? examForm.goal : ''}
                      onChange={(event) => setExamForm((prev) => ({ ...prev, goal: event.target.value }))}
                      disabled={creatingExamFor !== null && creatingExamFor !== course.id}
                    />
                    <button type="submit" disabled={creatingExamFor !== null && creatingExamFor !== course.id}>
                      {creatingExamFor === course.id ? '保存中…' : '添加考试'}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
