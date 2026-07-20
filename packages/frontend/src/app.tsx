import { Fragment, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { CurrentSemesterDto, SemesterSummaryDto } from '@ai-studybuddy/shared';
import { AppNavigation } from './components/app-navigation';
import { PageState } from './components/page-state';
import { getConfigurationStatus, type ConfigurationStatus } from './api/configuration-api';
import { getCurrentSemester } from './api/semester-api';
import { CoursePage } from './pages/course-page';
import { DailyStudyHomePage } from './pages/daily-study-home-page';
import { MaterialUploadPage } from './pages/material-upload-page';
import { SemesterPage } from './pages/semester-page';

const NotePage = lazy(() => import('./pages/note-page'));
const ExamWorkbenchPage = lazy(() => import('./pages/exam-workbench-page'));
const PracticeStartPage = lazy(() => import('./pages/practice-start-page'));
const MockExamStartPage = lazy(() => import('./pages/mock-exam-start-page'));
const MockExamPaperPage = lazy(() => import('./pages/mock-exam-paper-page'));
const MockExamSessionPage = lazy(() => import('./pages/mock-exam-session-page'));
const MockExamResultPage = lazy(() => import('./pages/mock-exam-result-page'));
const PracticeSessionPage = lazy(() => import('./pages/practice-session-page'));
const PracticeResultPage = lazy(() => import('./pages/practice-result-page'));
const PracticeHistoryPage = lazy(() => import('./pages/practice-history-page'));
const PracticeHistoryResultPage = lazy(() => import('./pages/practice-history-result-page'));
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
    setCurrentState((previous) => ({
      status: 'none',
      semester: null,
      message: current.recoveredFromStaleCurrent
        ? '已清理失效的当前学期，请重新选择或创建学期。'
        : previous.status === 'none'
          ? previous.message
          : null,
    }));
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
    if (currentState.status === 'loading' || currentState.status === 'error') return;
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

  const renderSemesterRoute = useCallback(
    (renderContent: (activeSemesterId: string) => ReactNode, loadingTitle: string) => {
      if (semesterId) {
        return <Fragment key={semesterId}>{renderContent(semesterId)}</Fragment>;
      }
      if (currentState.status === 'loading') {
        return <PageState state="loading" title={loadingTitle} message="请稍候，正在读取本机当前学期。" />;
      }
      if (currentState.status === 'error') {
        return (
          <PageState
            state="error"
            title="当前学期恢复失败"
            message={currentState.message}
            actionLabel="重新读取当前学期"
            onAction={refreshCurrentSemester}
          />
        );
      }
      return <Navigate to="/semesters" replace />;
    },
    [currentState.message, currentState.status, refreshCurrentSemester, semesterId]
  );

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
          <Route path="/semesters" element={<SemesterPage current={currentSemester} currentMessage={currentState.message} onCurrentChange={handleCurrentChange} />} />
          <Route
            path="/semesters/:semesterId/practice-history"
            element={
              <Suspense fallback={<PageState state="loading" title="正在加载练习历史" />}>
                <PracticeHistoryPage />
              </Suspense>
            }
          />
          <Route
            path="/semesters/:semesterId/practice-history/:sessionId"
            element={
              <Suspense fallback={<PageState state="loading" title="正在加载练习结果" />}>
                <PracticeHistoryResultPage />
              </Suspense>
            }
          />
          <Route
            path="/courses"
            element={
              renderSemesterRoute(
                (activeSemesterId) => <CoursePage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />,
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/materials"
            element={
              renderSemesterRoute(
                (activeSemesterId) => <MaterialUploadPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />,
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/notes/:noteId"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载笔记" />}>
                    <NotePage semesterId={activeSemesterId} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/exams/:examId"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载考试项目" />}>
                    <ExamWorkbenchPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/exams/:examId/practice"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载练习发起页" />}>
                    <PracticeStartPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/exams/:examId/mock-exam"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载模拟考入口" />}>
                    <MockExamStartPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/mock-exam-papers/:paperId"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载模拟卷" />}>
                    <MockExamPaperPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/mock-exam-attempts/:attemptId"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载模拟考作答" />}>
                    <MockExamSessionPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/mock-exam-attempts/:attemptId/result"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载模拟考结果" />}>
                    <MockExamResultPage semesterId={activeSemesterId} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/practice-sessions/:sessionId"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载练习" />}>
                    <PracticeSessionPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/practice-sessions/:sessionId/result"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载练习结果" />}>
                    <PracticeResultPage semesterId={activeSemesterId} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/exams/:examId/mistakes"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载错题本" />}>
                    <MistakeListPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/mistakes/:mistakeId"
            element={
              renderSemesterRoute(
                (activeSemesterId) => (
                  <Suspense fallback={<PageState state="loading" title="正在加载错题详情" />}>
                    <MistakeDetailPage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />
                  </Suspense>
                ),
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<PageState state="loading" title="正在加载配置中心" />}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="/"
            element={
              renderSemesterRoute(
                (activeSemesterId) => <DailyStudyHomePage semesterId={activeSemesterId} onSemesterError={handleSemesterError} />,
                '正在恢复当前学期'
              )
            }
          />
          <Route
            path="*"
            element={
              renderSemesterRoute(
                () => (
                  <PageState
                    state="error"
                    title="页面不存在"
                    message="这个入口还没有开放，请使用全局导航返回学生旅程。"
                  />
                ),
                '正在恢复当前学期'
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}
