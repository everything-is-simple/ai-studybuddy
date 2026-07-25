import type { ClassCaptureSavedMaterialDto, ClassCaptureTranscriptDto } from '@ai-studybuddy/shared';
import { NoteBuilderError, NoteBuilderService } from './note-builder-service';
import { WhisperCppAuralConverter, WhisperCppAuralConverterError, type AuralUploadedFile } from '../adapters/aural/whispercpp-aural-converter';

export class ClassCaptureError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ClassCaptureError';
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function confirmed(value: unknown): boolean {
  return value === true || value === 'true';
}

export class ClassCaptureService {
  constructor(
    private readonly converter = new WhisperCppAuralConverter(),
    private readonly noteBuilder = new NoteBuilderService()
  ) {}

  async transcribe(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    title: unknown;
    permissionConfirmed: unknown;
    file?: AuralUploadedFile;
  }): Promise<ClassCaptureTranscriptDto> {
    this.assertRequest(input);
    // 在启动本机进程前，先以既有 S2 语义确认学期与课程归属。
    this.noteBuilder.listMaterials({
      semesterId: input.semesterId,
      courseInstanceId: input.courseInstanceId,
      page: 1,
      pageSize: 1,
    });
    const result = await this.converter.transcribe(input.file!);
    return { text: result.text, charCount: result.text.length };
  }

  async saveToNotes(input: {
    semesterId: unknown;
    courseInstanceId: unknown;
    title: unknown;
    permissionConfirmed: unknown;
    text: unknown;
  }): Promise<ClassCaptureSavedMaterialDto> {
    this.assertRequest(input);
    try {
      const material = await this.noteBuilder.createNormalizedTextMaterial({
        semesterId: input.semesterId,
        courseInstanceId: input.courseInstanceId,
        title: input.title,
        text: input.text,
        sourceType: 'class_audio_transcription',
      });
      return { material };
    } catch (error) {
      if (error instanceof NoteBuilderError) throw error;
      throw error;
    }
  }

  private assertRequest(input: { semesterId: unknown; courseInstanceId: unknown; title: unknown; permissionConfirmed: unknown }): void {
    if (!confirmed(input.permissionConfirmed)) {
      throw new ClassCaptureError('CLASS_CAPTURE_PERMISSION_REQUIRED', 400, '请先确认课堂录音已获得相关人员允许');
    }
    const title = text(input.title);
    if (!title || title.length > 200) {
      throw new ClassCaptureError('INVALID_TITLE', 400, '标题长度必须为 1-200 字符');
    }
    if (!text(input.semesterId) || !text(input.courseInstanceId)) {
      throw new ClassCaptureError('MISSING_REQUIRED_FIELD', 400, 'semesterId 和 courseInstanceId 不能为空');
    }
  }
}

export { WhisperCppAuralConverterError };
