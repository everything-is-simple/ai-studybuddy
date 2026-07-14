import { useCallback, useMemo, useState } from 'react';
import { useApiRequest } from '../hooks/use-api-request';
import { useMaterialPolling } from '../hooks/use-material-polling';
import { getCourses } from '../api/study-rhythm-api';
import { retryAiGeneration, retryConversion, uploadMaterial } from '../api/note-builder-api';
import { AppNavigation } from '../components/app-navigation';
import { FeedbackMessage } from '../components/feedback-message';
import { FileDropzone } from '../components/file-dropzone';
import { MaterialStatus } from '../components/material-status';
import type { CourseInstanceDto } from '@ai-studybuddy/shared';

interface MaterialUploadPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

export function MaterialUploadPage({ semesterId, onSemesterError }: MaterialUploadPageProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const coursesFetcher = useCallback(
    (signal: AbortSignal) => {
      if (!semesterId) return Promise.resolve<CourseInstanceDto[]>([]);
      return getCourses(semesterId, signal);
    },
    [semesterId]
  );

  const {
    data: courses,
    loading: coursesLoading,
    error: coursesError,
    refetch: refetchCourses,
  } = useApiRequest(coursesFetcher, [semesterId]);

  const enabled = Boolean(semesterId && selectedCourseId);
  const {
    materials,
    loading: materialsLoading,
    error: materialsError,
    refetch: refetchMaterials,
  } = useMaterialPolling(semesterId, selectedCourseId, enabled);

  const sortedMaterials = useMemo(() => {
    return [...materials].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [materials]);

  const handleUpload = async () => {
    if (!semesterId || !selectedCourseId || !selectedFile) return;
    setUploading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await uploadMaterial({
        semesterId,
        courseInstanceId: selectedCourseId,
        title: selectedFile.name,
        file: selectedFile,
      });
      setSelectedFile(null);
      setSuccessMessage('资料已上传，正在后台处理');
      await refetchMaterials();
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败';
      setErrorMessage(message);
      if (message.includes('学期不存在')) {
        onSemesterError?.();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRetryConversion = async (materialId: string) => {
    if (!semesterId) return;
    try {
      await retryConversion(semesterId, materialId);
      await refetchMaterials();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '重试失败');
    }
  };

  const handleRetryAi = async (materialId: string) => {
    if (!semesterId) return;
    try {
      await retryAiGeneration(semesterId, materialId);
      await refetchMaterials();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '重试失败');
    }
  };

  const selectedCourse = courses?.find((c) => c.id === selectedCourseId);

  if (!semesterId) {
    return (
      <div className="page">
        <AppNavigation />
        <FeedbackMessage state="empty" message="请先在本页顶部输入有效的学期 ID，才能上传和管理资料。" />
      </div>
    );
  }

  return (
    <div className="page">
      <AppNavigation />
      <h1>资料上传</h1>

      {successMessage && <FeedbackMessage state="success" message={successMessage} />}
      {errorMessage && <FeedbackMessage state="error" message={errorMessage} onRetry={() => setErrorMessage(null)} />}

      <section className="card">
        <h2>选择课程</h2>
        {coursesLoading && <FeedbackMessage state="loading" />}
        {!coursesLoading && coursesError && (
          <FeedbackMessage state="error" message={coursesError} onRetry={refetchCourses} />
        )}
        {!coursesLoading && !coursesError && courses && courses.length === 0 && (
          <FeedbackMessage state="empty" message="还没有课程，请先去“课程”页面创建。" />
        )}
        {!coursesLoading && !coursesError && courses && courses.length > 0 && (
          <select
            value={selectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
            aria-label="选择课程"
          >
            <option value="">请选择课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {selectedCourse && (
        <section className="card">
          <h2>上传资料到“{selectedCourse.name}”</h2>
          <FileDropzone
            onFileSelect={setSelectedFile}
            disabled={uploading}
            accept=".pdf,.txt,.docx,.pptx,.jpg,.jpeg,.png,.webp"
          />
          {selectedFile && (
            <div className="selected-file">
              已选择：{selectedFile.name}（{formatBytes(selectedFile.size)}）
            </div>
          )}
          <button type="button" onClick={handleUpload} disabled={!selectedFile || uploading} className="button-primary">
            {uploading ? '上传中…' : '上传资料'}
          </button>
        </section>
      )}

      {selectedCourseId && (
        <section className="card">
          <h2>资料处理状态</h2>
          {materialsLoading && materials.length === 0 && <FeedbackMessage state="loading" />}
          {materialsError && (
            <FeedbackMessage state="error" message={materialsError} onRetry={refetchMaterials} />
          )}
          {sortedMaterials.length === 0 && !materialsLoading && !materialsError && (
            <FeedbackMessage state="empty" message="该课程还没有资料，上传一个吧" />
          )}
          {sortedMaterials.length > 0 && (
            <div className="material-list">
              {sortedMaterials.map((material) => (
                <MaterialStatus
                  key={material.id}
                  material={material}
                  onRetryConversion={() => handleRetryConversion(material.id)}
                  onRetryAi={() => handleRetryAi(material.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
