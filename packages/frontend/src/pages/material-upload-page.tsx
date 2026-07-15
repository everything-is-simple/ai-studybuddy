import { useCallback, useMemo, useState } from 'react';
import { useApiRequest } from '../hooks/use-api-request';
import { useMaterialPolling } from '../hooks/use-material-polling';
import { getCourses } from '../api/study-rhythm-api';
import { replaceText, retryAiGeneration, retryConversion, uploadMaterial } from '../api/note-builder-api';
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
  const [replaceMaterialId, setReplaceMaterialId] = useState<string | null>(null);
  const [replacementText, setReplacementText] = useState('');
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementSubmittingId, setReplacementSubmittingId] = useState<string | null>(null);

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

  const handleOpenReplaceText = (materialId: string) => {
    setReplaceMaterialId(materialId);
    setReplacementText('');
    setReplacementError(null);
    setErrorMessage(null);
  };

  const handleCancelReplaceText = () => {
    setReplaceMaterialId(null);
    setReplacementText('');
    setReplacementError(null);
  };

  const handleSubmitReplaceText = async (materialId: string) => {
    if (!semesterId) return;
    const trimmedText = replacementText.trim();
    if (!trimmedText) {
      setReplacementError('请粘贴一份完整正文后再重新生成笔记。');
      return;
    }
    if (trimmedText.length > 1048576) {
      setReplacementError('正文不能超过 1,048,576 字符。');
      return;
    }

    setReplacementSubmittingId(materialId);
    setReplacementError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await replaceText(semesterId, materialId, trimmedText);
      setSuccessMessage('人工正文已提交，正在重新生成笔记');
      handleCancelReplaceText();
      await refetchMaterials();
    } catch (err) {
      setReplacementError(err instanceof Error ? err.message : '人工正文提交失败');
    } finally {
      setReplacementSubmittingId(null);
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
            onChange={(event) => {
              setSelectedCourseId(event.target.value);
              handleCancelReplaceText();
            }}
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
              {sortedMaterials.map((material) => {
                const isReplacing = replaceMaterialId === material.id;
                const isSubmittingReplacement = replacementSubmittingId === material.id;
                const trimmedLength = replacementText.trim().length;
                return (
                  <MaterialStatus
                    key={material.id}
                    material={material}
                    onRetryConversion={() => handleRetryConversion(material.id)}
                    onRetryAi={() => handleRetryAi(material.id)}
                    onReplaceText={() => handleOpenReplaceText(material.id)}
                    actionsDisabled={isSubmittingReplacement}
                  >
                    {isReplacing && (
                      <form
                        className="manual-text-recovery"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleSubmitReplaceText(material.id);
                        }}
                      >
                        <p className="manual-text-hint">
                          请粘贴完整正文，而不是只补一小段。系统会保留原始上传文件，并用这份正文重新生成笔记。
                        </p>
                        <label htmlFor={`manual-text-${material.id}`}>完整正文</label>
                        <textarea
                          id={`manual-text-${material.id}`}
                          value={replacementText}
                          onChange={(event) => {
                            setReplacementText(event.target.value);
                            if (replacementError) setReplacementError(null);
                          }}
                          maxLength={1048576}
                          disabled={isSubmittingReplacement}
                          placeholder="例如：粘贴从 PDF / 课件 / 图片中整理出的完整可读正文……"
                          rows={8}
                        />
                        <div className="manual-text-footer">
                          <span>{trimmedLength.toLocaleString()} / 1,048,576 字</span>
                          <div className="manual-text-buttons">
                            <button type="button" onClick={handleCancelReplaceText} disabled={isSubmittingReplacement}>
                              取消
                            </button>
                            <button type="submit" className="button-primary" disabled={isSubmittingReplacement || trimmedLength === 0}>
                              {isSubmittingReplacement ? '提交中…' : '重新生成笔记'}
                            </button>
                          </div>
                        </div>
                        {replacementError && <p className="manual-text-error">{replacementError}</p>}
                      </form>
                    )}
                  </MaterialStatus>
                );
              })}
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
