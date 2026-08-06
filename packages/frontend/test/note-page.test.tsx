import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotePage } from '../src/pages/note-page';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const getNoteMock = vi.fn();
const updateNoteMock = vi.fn();
const getKnowledgeModulesMock = vi.fn();
const getStudyTasksMock = vi.fn();

vi.mock('../src/api/note-builder-api', () => ({
  getNote: (...args: unknown[]) => getNoteMock(...args),
  updateNote: (...args: unknown[]) => updateNoteMock(...args),
  getKnowledgeModules: (...args: unknown[]) => getKnowledgeModulesMock(...args),
}));
vi.mock('../src/api/study-rhythm-api', () => ({ getStudyTasks: (...args: unknown[]) => getStudyTasksMock(...args) }));
vi.mock('../src/components/markdown-note', () => ({
  MarkdownNote: ({ markdown }: { markdown: string }) => <output>{markdown}</output>,
}));
vi.mock('../src/components/lazy-mind-map', () => ({ LazyMindMapSection: () => null }));
vi.mock('../src/components/knowledge-module-list', () => ({ KnowledgeModuleList: () => null }));

const note = {
  id: 'note-1',
  materialId: 'material-1',
  markdown: '# 合成笔记',
  highlights: [],
  knowledgeModules: [
    {
      id: 'module-1',
      courseInstanceId: 'course-1',
      materialId: 'material-1',
      title: '合成模块',
      importance: 'medium',
      difficulty: 'easy',
      learnStatus: 'not_started',
      createdAt: '2026-07-30T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-30T00:00:00.000Z',
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderPage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/notes/note-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/notes/:noteId" element={<NotePage semesterId="semester-1" />} /></Routes>
      </MemoryRouter>
    );
  });
  return { container, root };
}

describe('NotePage 笔记编辑', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    getNoteMock.mockReset();
    updateNoteMock.mockReset();
    getKnowledgeModulesMock.mockReset();
    getStudyTasksMock.mockReset();
    getNoteMock.mockResolvedValue(note);
    updateNoteMock.mockResolvedValue({ id: note.id, updatedAt: '2026-07-30T00:01:00.000Z' });
    getKnowledgeModulesMock.mockResolvedValue({
      items: note.knowledgeModules,
      pagination: { page: 1, pageSize: 20, total: 1, hasMore: false },
    });
    getStudyTasksMock.mockResolvedValue([]);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it('edits Markdown through the formal API and refetches the note', async () => {
    ({ container, root } = renderPage());
    await flush();

    const edit = [...container!.querySelectorAll('button')].find((button) => button.textContent === '编辑笔记');
    expect(edit).not.toBeNull();
    await act(async () => {
      edit!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container!.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑笔记正文"]');
    expect(textarea?.value).toBe(note.markdown);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(textarea, '# 已编辑的合成笔记');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const save = [...container!.querySelectorAll('button')].find((button) => button.textContent === '保存笔记');
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(updateNoteMock).toHaveBeenCalledWith('semester-1', 'note-1', '# 已编辑的合成笔记');
    expect(getNoteMock).toHaveBeenCalledTimes(2);
    expect(container!.textContent).toContain('笔记已保存');
  });
});
