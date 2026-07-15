import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CoursePage } from './pages/course-page';
import { MaterialUploadPage } from './pages/material-upload-page';

const NotePage = lazy(() => import('./pages/note-page'));
const ExamWorkbenchPage = lazy(() => import('./pages/exam-workbench-page'));

const SEMESTER_ID_KEY = 'ai-studybuddy:semesterId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function App() {
  const [semesterId, setSemesterId] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(SEMESTER_ID_KEY);
    if (saved && UUID_RE.test(saved)) {
      setSemesterId(saved);
      setInputValue(saved);
    }
  }, []);

  const handleApply = useCallback(() => {
    const value = inputValue.trim();
    if (!value) {
      setSemesterId('');
      localStorage.removeItem(SEMESTER_ID_KEY);
      setInputError(null);
      return;
    }
    if (!UUID_RE.test(value)) {
      setInputError('请输入有效的学期 ID（UUID 格式）');
      return;
    }
    setSemesterId(value);
    localStorage.setItem(SEMESTER_ID_KEY, value);
    setInputError(null);
  }, [inputValue]);

  const handleClear = useCallback(() => {
    setInputValue('');
    setSemesterId('');
    localStorage.removeItem(SEMESTER_ID_KEY);
    setInputError(null);
  }, []);

  const handleSemesterError = useCallback(() => {
    setSemesterId('');
    localStorage.removeItem(SEMESTER_ID_KEY);
    setInputError('学期不存在，请重新输入');
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">AI StudyBuddy</div>
        <div className="semester-bar">
          <label htmlFor="semesterId">当前学期 ID</label>
          <input
            id="semesterId"
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="输入 UUID 格式的学期 ID"
            aria-describedby="semesterId-help"
          />
          <button type="button" onClick={handleApply}>
            应用
          </button>
          <button type="button" onClick={handleClear} className="button-secondary">
            清除
          </button>
          {semesterId && <span className="semester-active">已设置</span>}
        </div>
        {inputError && (
          <p id="semesterId-help" className="semester-error">
            {inputError}
          </p>
        )}
      </header>

      <main className="app-main">
        <Routes>
          <Route
            path="/courses"
            element={<CoursePage semesterId={semesterId} onSemesterError={handleSemesterError} />}
          />
          <Route
            path="/materials"
            element={<MaterialUploadPage semesterId={semesterId} onSemesterError={handleSemesterError} />}
          />
          <Route
            path="/notes/:noteId"
            element={
              <Suspense fallback={<div className="page">正在加载笔记…</div>}>
                <NotePage semesterId={semesterId} />
              </Suspense>
            }
          />
          <Route
            path="/exams/:examId"
            element={
              <Suspense fallback={<div className="page">正在加载考试项目…</div>}>
                <ExamWorkbenchPage semesterId={semesterId} onSemesterError={handleSemesterError} />
              </Suspense>
            }
          />
          <Route path="/" element={<Navigate to="/courses" replace />} />
          <Route path="*" element={<Navigate to="/courses" replace />} />
        </Routes>
      </main>
    </div>
  );
}
