import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { CurrentSemesterDto, SemesterSummaryDto } from '@ai-studybuddy/shared';
import { AppNavigation } from './components/app-navigation';
import { getConfigurationStatus, type ConfigurationStatus } from './api/configuration-api';
import { getCurrentSemester } from './api/semester-api';
import { CoursePage } from './pages/course-page';
import { DailyStudyHomePage } from './pages/daily-study-home-page';
import { MaterialUploadPage } from './pages/material-upload-page';
import { SemesterPage } from './pages/semester-page';

const NotePage = lazy(() => import('./pages/note-page'));
const ExamWorkbenchPage = lazy(() => import('./pages/exam-workbench-page'));
const PracticeStartPage = lazy(() => import('./pages/practice-start-page'));
const PracticeSessionPage = lazy(() => import('./pages/practice-session-page'));
const PracticeResultPage = lazy(() => import('./pages/practice-result-page'));
const MistakeListPage = lazy(() => import('./pages/mistake-list-page'));
const MistakeDetailPage = lazy(() => import('./pages/mistake-detail-page'));
const SettingsPage = lazy(() => import('./pages/settings-page'));

type CurrentSemesterState =
  | { status: 'loading'; semester: null; message: null }
  | { status: 'ready'; semester: SemesterSummaryDto; message: string | null }
  | { status: 'none'; semester: null; message: string | null }
  | { status: 'error'; semester: null; message: string };

const loadingCurrentState: CurrentSemesterState = { status: 'loading', semester: null, message: null };

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentState, setCurrentState] = useState<CurrentSemesterState>(loadingCurrentState);
  const [configurationStatus, setConfigurationStatus] = useState<ConfigurationStatus | null>(null);

  const applyCurrent = useCallback((current: CurrentSemesterDto) => {
    if (current.semester) {
      setCurrentState({ status: 'ready', semester: current.semester, message: null });
      return;
    }
    setCurrentState({
      status: 'none',
      semester: null,
      message: current.recoveredFromStaleCurrent ? '已清理失效的当前学期，请重新选择或创建学期。' : null,
    });
  }, []);

  const refreshCurrentSemester = useCallback(async () => {
    setCurrentState(loadingCurrentState);
    try {
      applyCurrent(await getCurrentSemester());
    } catch (error) {
      setCurrentState({
        status: 'error',
        semester: null,
        message: error instanceof Error ? error.message : '当前学期恢复失败',
      });
    }
  }, [applyCurrent]);

  useEffect(() => {
    void refreshCurrentSemester();
  }, [refreshCurrentSemester]);

  useEffect(() => {
    void getConfigurationStatus()
      .then(setConfigurationStatus)
      .catch(() => setConfigurationStatus(null));
  }, []);

  useEffect(() => {
    if (currentState.status === 'loading') return;
    const publicPath = location.pathname.startsWith('/semesters') || location.pathname.startsWith('/settings');
    if (!currentState.semester && !publicPath) {
      navigate('/semesters', { replace: true });
    }
  }, [currentState.semester, currentState.status, location.pathname, navigate]);

  const showFirstRunGuide =
    configurationStatus !== null &&
    configurationStatus.ai.status === 'unconfigured' &&
    configurationStatus.smtp.status === 'unconfigured' &&
    configurationStatus.feishu.status === 'unconfigured';

  const handleSemesterError = useCallback(() => {
    void refreshCurrentSemester().finally(() => navigate('/semesters', { replace: true }));
  }, [navigate, refreshCurrentSemester]);

  const handleCurrentChange = useCallback(
    (current: CurrentSemesterDto) => {
      applyCurrent(current);
    },
    [applyCurrent]
  );

  const currentSemester = currentState.semester;
  const semesterId = currentSemester?.id ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">AI StudyBuddy</div>
        <div className="semester-status-card" aria-live="polite">
          {currentState.status === 'loading' && <span>正在恢复当前学期…</span>}
          {currentState.status === 'ready' && currentSemester && (
            <>
              <span className="semester-status-label">当前学期</span>
              <strong>{currentSemester.semesterCode}</strong>
              <span>
                {currentSemester.teachingStartDate} 至 {currentSemester.teachingEndDate}
              </span>
            </>
          )}
          {currentState.status === 'none' && <span>尚未选择当前学期</span>}
          {currentState.status === 'error' && <span>当前学期状态读取失败</span>}
          <Link to="/semesters">管理学期</Link>
        </div>
        {currentState.message && (
          <p className={currentState.status === 'error' ? 'semester-error' : 'semester-warning'} role="status">
            {currentState.message}
          </p>
        )}
        <AppNavigation />
      </header>

      <main className="app-main">
        {showFirstRunGuide && (
          <aside className="first-run-guide" role="status">
            <strong>首次使用建议先完成本机配置。</strong>
            <span>AI、QQ SMTP 和飞书未配置时，系统会降级运行。</span>
            <Link to="/settings">进入配置中心</Link>
          </aside>
        )}
        <Routes>
          <Route path="/semesters" element={<SemesterPage current={currentSemester} onCurrentChange={handleCurrentChange} />} />
          <Route
            path="/courses"
            element={
              semesterId ? (
                <CoursePage semesterId={semesterId} onSemesterError={handleSemesterError} />
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/materials"
            element={
              semesterId ? (
                <MaterialUploadPage semesterId={semesterId} onSemesterError={handleSemesterError} />
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/notes/:noteId"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载笔记…</div>}>
                  <NotePage semesterId={semesterId} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/exams/:examId"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载考试项目…</div>}>
                  <ExamWorkbenchPage semesterId={semesterId} onSemesterError={handleSemesterError} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/exams/:examId/practice"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载练习发起页…</div>}>
                  <PracticeStartPage semesterId={semesterId} onSemesterError={handleSemesterError} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/practice-sessions/:sessionId"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载练习…</div>}>
                  <PracticeSessionPage semesterId={semesterId} onSemesterError={handleSemesterError} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/practice-sessions/:sessionId/result"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载练习结果…</div>}>
                  <PracticeResultPage semesterId={semesterId} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/exams/:examId/mistakes"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载错题本…</div>}>
                  <MistakeListPage semesterId={semesterId} onSemesterError={handleSemesterError} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/mistakes/:mistakeId"
            element={
              semesterId ? (
                <Suspense fallback={<div className="page">正在加载错题详情…</div>}>
                  <MistakeDetailPage semesterId={semesterId} onSemesterError={handleSemesterError} />
                </Suspense>
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<div className="page">正在加载配置中心…</div>}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="/"
            element={
              semesterId ? (
                <DailyStudyHomePage semesterId={semesterId} onSemesterError={handleSemesterError} />
              ) : currentState.status === 'loading' ? (
                <div className="page">正在恢复当前学期…</div>
              ) : (
                <Navigate to="/semesters" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to={semesterId ? '/courses' : '/semesters'} replace />} />
        </Routes>
      </main>
    </div>
  );
}