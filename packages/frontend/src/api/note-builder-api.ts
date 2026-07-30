import type { KnowledgeModuleDto, MaterialDto } from '@ai-studybuddy/shared';
import { getApiUrl, request, requestPage, upload, type ApiPage } from './api-client';

export interface NoteDetail {
  id: string;
  materialId: string;
  markdown: string;
  highlights: Array<{ content: string; importance: string; position: string }>;
  mindMap?: { id: string; format: string; data: string };
  knowledgeModules: KnowledgeModuleDto[];
  model?: string;
  promptVersion?: string;
  tokenCount?: number;
  generationDurationMs?: number;
  createdAt: string;
}

export function getMaterials(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<ApiPage<MaterialDto>> {
  const params = new URLSearchParams();
  params.set('semesterId', semesterId);
  params.set('courseInstanceId', courseInstanceId);
  return requestPage<MaterialDto>(`/materials?${params.toString()}`, { signal });
}

export function getMaterial(
  semesterId: string,
  materialId: string,
  signal?: AbortSignal
): Promise<
  MaterialDto & {
    normalizedText?: { id: string; charCount: number; preview: string; metadata: Record<string, unknown> };
  }
> {
  return request(`/materials/${encodeURIComponent(materialId)}?semesterId=${encodeURIComponent(semesterId)}`, {
    signal,
  });
}

export function uploadMaterial(
  data: { semesterId: string; courseInstanceId: string; title?: string; file: File },
  signal?: AbortSignal
): Promise<MaterialDto> {
  const formData = new FormData();
  formData.append('semesterId', data.semesterId);
  formData.append('courseInstanceId', data.courseInstanceId);
  if (data.title) formData.append('title', data.title);
  formData.append('file', data.file);
  return upload<MaterialDto>('/materials/upload', formData, signal);
}

export function getOriginalPdfUrl(semesterId: string, materialId: string): string {
  const params = new URLSearchParams({ semesterId });
  return getApiUrl(`/materials/${encodeURIComponent(materialId)}/original-pdf?${params.toString()}`);
}

export function retryConversion(semesterId: string, materialId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/materials/${encodeURIComponent(materialId)}/retry-conversion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId }),
    signal,
  });
}

export function retryAiGeneration(semesterId: string, materialId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/materials/${encodeURIComponent(materialId)}/retry-ai-generation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId }),
    signal,
  });
}

export function generateNote(semesterId: string, materialId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/materials/${encodeURIComponent(materialId)}/generate-note`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId }),
    signal,
  });
}

export function replaceText(
  semesterId: string,
  materialId: string,
  text: string,
  signal?: AbortSignal
): Promise<unknown> {
  return request(`/materials/${encodeURIComponent(materialId)}/replace-text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId, text }),
    signal,
  });
}

export function getNote(semesterId: string, noteId: string, signal?: AbortSignal): Promise<NoteDetail> {
  return request<NoteDetail>(`/notes/${encodeURIComponent(noteId)}?semesterId=${encodeURIComponent(semesterId)}`, {
    signal,
  });
}

export function updateNote(semesterId: string, noteId: string, markdown: string, signal?: AbortSignal): Promise<{ id: string; updatedAt: string }> {
  return request(`/notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semesterId, markdown }),
    signal,
  });
}

export function getKnowledgeModules(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<ApiPage<KnowledgeModuleDto>> {
  const params = new URLSearchParams();
  params.set('semesterId', semesterId);
  params.set('courseInstanceId', courseInstanceId);
  return requestPage<KnowledgeModuleDto>(`/knowledge-modules?${params.toString()}`, { signal });
}
