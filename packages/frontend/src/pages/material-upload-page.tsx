import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiRequest } from '../hooks/use-api-request';
import { useMaterialPolling } from '../hooks/use-material-polling';
import { getCourses } from '../api/study-rhythm-api';
import {
  generateNote,
  getOriginalPdfUrl,
  replaceText,
  retryAiGeneration,
  retryConversion,
  uploadMaterial,
} from '../api/note-builder-api';
import { saveClassCaptureToNotes, transcribeClassCapture } from '../api/class-capture-api';
import { FeedbackMessage } from '../components/feedback-message';
import { FileDropzone } from '../components/file-dropzone';
import { MaterialStatus } from '../components/material-status';
import type { CourseInstanceDto } from '@ai-studybuddy/shared';

interface MaterialUploadPageProps {
  semesterId: string | null;
  onSemesterError?: () => void;
}

export function MaterialUploadPage({ semesterId, onSemesterError }: MaterialUploadPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replaceMaterialId, setReplaceMaterialId] = useState<string | null>(null);
  const [replacementText, setReplacementText] = useState('');
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementSubmittingId, setReplacementSubmittingId] = useState<string | null>(null);
  const [courseContextMessage, setCourseContextMessage] = useState<string | null>(null);
  const [classCaptureFile, setClassCaptureFile] = useState<File | null>(null);
  const [classCaptureTitle, setClassCaptureTitle] = useState('');
  const [classCapturePermissionConfirmed, setClassCapturePermissionConfirmed] = useState(false);
  const [classCaptureTranscribing, setClassCaptureTranscribing] = useState(false);
  const [classCaptureSaving, setClassCaptureSaving] = useState(false);
  const [classCaptureText, setClassCaptureText] = useState('');
  const [classCaptureError, setClassCaptureError] = useState<string | null>(null);

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

  useEffect(() => {
    if (coursesLoading || coursesError || !courses) return;
    const requestedCourseId = searchParams.get('courseInstanceId');
    if (!requestedCourseId) return;
    if (courses.some((course) => course.id === requestedCourseId)) {
      setSelectedCourseId(requestedCourseId);
      setCourseContextMessage(null);
      return;
    }
    setSelectedCourseId('');
    setCourseContextMessage('链接中的课程无效或已不属于当前学期，请重新选择课程。');
  }, [courses, coursesError, coursesLoading, searchParams]);

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

  const handleGenerateNote = async (materialId: string) => {
    if (!semesterId) return;
    try {
      await generateNote(semesterId, materialId);
      setSuccessMessage('已提交生成笔记请求；笔记生成仅在你主动点击后开始。');
      await refetchMaterials();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '生成笔记请求失败');
    }
  };

  const handleClassCaptureTranscribe = async () => {
    if (!semesterId || !selectedCourseId || !classCaptureFile) return;
    const title = classCaptureTitle.trim();
    if (!classCapturePermissionConfirmed) {
      setClassCaptureError('请先确认课堂录音已获得老师和相关同学允许。');
      return;
    }
    if (!title) {
      setClassCaptureError('请为这段课堂录音填写标题。');
      return;
    }
    setClassCaptureTranscribing(true);
    setClassCaptureError(null);
    setClassCaptureText('');
    try {
      const transcript = await transcribeClassCapture({
        semesterId,
        courseInstanceId: selectedCourseId,
        title,
        permissionConfirmed: true,
        file: classCaptureFile,
      });
      setClassCaptureText(transcript.text);
    } catch (err) {
      setClassCaptureError(err instanceof Error ? err.message : '课堂录音转写失败');
    } finally {
      setClassCaptureTranscribing(false);
    }
  };

  const handleClassCaptureSave = async () => {
    if (!semesterId || !selectedCourseId) return;
    const title = classCaptureTitle.trim();
    const text = classCaptureText.trim();
    if (!text) {
      setClassCaptureError('请确认转写文本不为空后再保存。');
      return;
    }
    setClassCaptureSaving(true);
    setClassCaptureError(null);
    try {
      await saveClassCaptureToNotes({
        semesterId,
        courseInstanceId: selectedCourseId,
        title,
        permissionConfirmed: classCapturePermissionConfirmed,
        text,
      });
      setSuccessMessage('已保存为 S2 资料文本；需要生成笔记时，请在资料卡中主动点击“生成笔记”。');
      setClassCaptureFile(null);
      setClassCaptureTitle('');
      setClassCapturePermissionConfirmed(false);
      setClassCaptureText('');
      await refetchMaterials();
    } catch (err) {
      setClassCaptureError(err instanceof Error ? err.message : '保存课堂转写失败');
    } finally {
      setClassCaptureSaving(false);
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
        <FeedbackMessage state="empty" message="请先在本页顶部输入有效的学期 ID，才能上传和管理资料。" />
      </div>
    );
  }

  return (
    <div className="page">
      <h1>资料上传</h1>

      {successMessage && <FeedbackMessage state="success" message={successMessage} />}
      {errorMessage && <FeedbackMessage state="error" message={errorMessage} onRetry={() => setErrorMessage(null)} />}
      {courseContextMessage && <FeedbackMessage state="error" message={courseContextMessage} />}

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
              const courseInstanceId = event.target.value;
              setSelectedCourseId(courseInstanceId);
              setCourseContextMessage(null);
              setSearchParams(courseInstanceId ? { courseInstanceId } : {}, { replace: true });
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

      {selectedCourse && (
        <section className="card">
          <h2>课堂录音转文字</h2>
          <p>仅支持本机 16 kHz、单声道、16-bit PCM WAV。静音、多人重叠说话、噪声或低音量场景可能不准确。</p>
          <label className="class-capture-permission">
            <input
              type="checkbox"
              checked={classCapturePermissionConfirmed}
              onChange={(event) => setClassCapturePermissionConfirmed(event.target.checked)}
              disabled={classCaptureTranscribing || classCaptureSaving}
            />
            我确认这段课堂录音已获得老师和相关同学允许，仅用于本机学习整理。
          </label>
          <label htmlFor="class-capture-title">录音标题</label>
          <input
            id="class-capture-title"
            value={classCaptureTitle}
            onChange={(event) => setClassCaptureTitle(event.target.value)}
            maxLength={200}
            disabled={classCaptureTranscribing || classCaptureSaving}
            placeholder="例如：第三章函数课堂讲解"
          />
          <FileDropzone
            onFileSelect={setClassCaptureFile}
            disabled={classCaptureTranscribing || classCaptureSaving}
            accept=".wav,audio/wav,audio/x-wav"
          />
          {classCaptureFile && <div className="selected-file">已选择：{classCaptureFile.name}（{formatBytes(classCaptureFile.size)}）</div>}
          <button
            type="button"
            className="button-primary"
            onClick={handleClassCaptureTranscribe}
            disabled={!classCaptureFile || !classCapturePermissionConfirmed || !classCaptureTitle.trim() || classCaptureTranscribing || classCaptureSaving}
          >
            {classCaptureTranscribing ? '转写中…' : '转写录音'}
          </button>
          {classCaptureError && <p className="manual-text-error">{classCaptureError}</p>}
          {classCaptureText && (
            <div className="manual-text-recovery">
              <label htmlFor="class-capture-transcript">可编辑转写文本</label>
              <textarea
                id="class-capture-transcript"
                value={classCaptureText}
                onChange={(event) => setClassCaptureText(event.target.value)}
                maxLength={1048576}
                rows={10}
                disabled={classCaptureSaving}
              />
              <div className="manual-text-footer">
                <span>{classCaptureText.trim().length.toLocaleString()} / 1,048,576 字</span>
                <button type="button" className="button-primary" onClick={handleClassCaptureSave} disabled={!classCaptureText.trim() || classCaptureSaving}>
                  {classCaptureSaving ? '保存中…' : '保存为 S2 笔记输入'}
                </button>
              </div>
            </div>
          )}
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
                    onGenerateNote={() => handleGenerateNote(material.id)}
                    originalPdfUrl={
                      semesterId && material.fileType === 'pdf' ? getOriginalPdfUrl(semesterId, material.id) : undefined
                    }
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
