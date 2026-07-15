import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// 避免 React 18 在 act 环境下输出 "The current testing environment is not configured to support act(...)"。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { MaterialUploadPage } from '../src/pages/material-upload-page';

const STUB_COURSE = {
  id: '11111111-1111-4111-8111-111111111111',
  semesterId: 'sem-1',
  name: '线性代数',
  retakeOfCourseInstanceId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const pendingQualityMaterial = {
  id: '22222222-2222-4222-8222-222222222222',
  courseInstanceId: STUB_COURSE.id,
  fileType: 'text',
  status: 'pending_quality_check',
  title: 'AI 失败讲义',
  originalFilename: 'ai-failed.txt',
  fileSizeBytes: 1024,
  hasNote: false,
  knowledgeModuleCount: 0,
  conversionRetryCount: 1,
  aiRetryCount: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:01:00.000Z',
} as const;

const conversionFailedMaterial = {
  id: '33333333-3333-4333-8333-333333333333',
  courseInstanceId: STUB_COURSE.id,
  fileType: 'pdf',
  status: 'conversion_failed',
  title: '转换失败讲义',
  originalFilename: 'conversion-failed.pdf',
  fileSizeBytes: 2048,
  hasNote: false,
  knowledgeModuleCount: 0,
  conversionRetryCount: 3,
  aiRetryCount: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:01:00.000Z',
} as const;

let mockMaterials: unknown[] = [pendingQualityMaterial];

vi.mock('../src/api/study-rhythm-api', () => ({
  getCourses: vi.fn(async () => [STUB_COURSE]),
}));

vi.mock('../src/api/note-builder-api', () => ({
  getMaterials: vi.fn(async () => ({
    items: mockMaterials,
    pagination: { page: 1, pageSize: 20, total: mockMaterials.length, hasMore: false },
  })),
  uploadMaterial: vi.fn(async () => pendingQualityMaterial),
  retryConversion: vi.fn(async () => ({})),
  retryAiGeneration: vi.fn(async () => ({})),
  replaceText: vi.fn(async () => ({ id: pendingQualityMaterial.id, status: 'converted', jobStatus: 'pending' })),
}));

vi.mock('../src/components/app-navigation', () => ({
  AppNavigation: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockMaterials = [pendingQualityMaterial];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderAndSelectCourse() {
  await act(async () => {
    root.render(<MaterialUploadPage semesterId="sem-1" />);
  });
  await flush();

  const select = container.querySelector<HTMLSelectElement>('select[aria-label="选择课程"]');
  expect(select, '课程选择框应渲染').not.toBeNull();
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => {
    nativeSetter.call(select, STUB_COURSE.id);
    select!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

async function typeIntoTextarea(value: string) {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
  expect(textarea, '人工补文 textarea 应渲染').not.toBeNull();
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    nativeSetter.call(textarea, value);
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}

function clickButton(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(label)
  );
  expect(button, `应找到按钮：${label}`).not.toBeNull();
  act(() => {
    button!.click();
  });
  return button!;
}

describe('MaterialUploadPage 人工补文恢复闭环', () => {
  it('pending_quality_check 可展开完整正文表单，提交 trim 后的 payload 并刷新列表', async () => {
    await renderAndSelectCourse();

    expect(container.textContent).toContain('需要人工补文');
    expect(container.textContent).toContain('AI 生成笔记失败');
    expect(container.textContent).toContain('重试生成笔记');
    clickButton('替换正文后重新生成');
    expect(container.textContent).toContain('请粘贴完整正文，而不是只补一小段');

    const submitBeforeInput = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('重新生成笔记')
    );
    expect(submitBeforeInput?.disabled).toBe(true);

    await typeIntoTextarea('  人工补文后的完整正文  ');
    expect(container.textContent).toContain('10 / 1,048,576 字');
    clickButton('重新生成笔记');
    await flush();

    const { replaceText, getMaterials } = await import('../src/api/note-builder-api');
    expect(replaceText).toHaveBeenCalledWith('sem-1', pendingQualityMaterial.id, '人工补文后的完整正文');
    expect(getMaterials).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('人工正文已提交，正在重新生成笔记');
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('conversion_failed 同时提供重试转换和粘贴完整正文入口，取消会关闭表单', async () => {
    mockMaterials = [conversionFailedMaterial];
    await renderAndSelectCourse();

    expect(container.textContent).toContain('转换失败');
    expect(container.textContent).toContain('原始文件已保留');
    expect(container.textContent).toContain('重试转换');
    clickButton('粘贴完整正文后继续');
    expect(container.querySelector('textarea')).not.toBeNull();

    await typeIntoTextarea('转换失败后的人工正文');
    clickButton('取消');
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('replaceText API 失败时在资料卡内显示错误，继续输入会清除错误', async () => {
    const { replaceText } = await import('../src/api/note-builder-api');
    (replaceText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('已有待执行或运行中的任务'));

    await renderAndSelectCourse();
    clickButton('替换正文后重新生成');
    await typeIntoTextarea('第一次提交的正文');
    clickButton('重新生成笔记');
    await flush();

    expect(container.textContent).toContain('已有待执行或运行中的任务');
    await typeIntoTextarea('修改后的正文');
    expect(container.textContent).not.toContain('已有待执行或运行中的任务');
  });
});
