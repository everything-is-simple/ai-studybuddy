import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MaterialDto } from '@ai-studybuddy/shared';

interface MaterialStatusProps {
  material: MaterialDto;
  onRetryConversion?: (material: MaterialDto) => void;
  onRetryAi?: (material: MaterialDto) => void;
  onReplaceText?: (material: MaterialDto) => void;
  onGenerateNote?: (material: MaterialDto) => void;
  actionsDisabled?: boolean;
  children?: ReactNode;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待处理',
  converting: '格式转换中',
  converted: '转换完成，准备生成笔记',
  note_generating: '笔记生成中',
  completed: '已完成',
  conversion_failed: '转换失败',
  pending_quality_check: '需要人工补文',
};

const STATUS_DESCRIPTIONS: Partial<Record<string, string>> = {
  conversion_failed: '原始文件已保留。可以重试转换，也可以粘贴一份完整正文继续生成笔记。',
  pending_quality_check: 'AI 生成笔记失败。可以先重试生成；如果正文需要更正，请替换完整正文后重新生成。',
};

export function MaterialStatus({
  material,
  onRetryConversion,
  onRetryAi,
  onReplaceText,
  onGenerateNote,
  actionsDisabled = false,
  children,
}: MaterialStatusProps) {
  const label = STATUS_LABELS[material.status] ?? material.status;
  const description = STATUS_DESCRIPTIONS[material.status];

  return (
    <div className="material-status">
      <div className="material-status-header">
        <strong>{material.title ?? material.originalFilename ?? '未命名资料'}</strong>
        <span className={`status-badge status-${material.status}`}>{label}</span>
      </div>
      {description && <p className="material-status-description">{description}</p>}
      <div className="material-status-meta">
        {material.fileType && <span>类型：{material.fileType}</span>}
        {material.fileSizeBytes !== undefined && <span>大小：{formatBytes(material.fileSizeBytes)}</span>}
        {material.knowledgeModuleCount !== undefined && <span>知识模块：{material.knowledgeModuleCount}</span>}
      </div>
      <div className="material-status-actions">
        {material.noteId && (
          <Link to={`/notes/${material.noteId}`} className="button-link">
            查看笔记
          </Link>
        )}
        {material.status === 'converted' && !material.noteId && onGenerateNote && (
          <button type="button" onClick={() => onGenerateNote(material)} disabled={actionsDisabled}>
            生成笔记
          </button>
        )}
        {material.status === 'conversion_failed' && onRetryConversion && (
          <button type="button" onClick={() => onRetryConversion(material)} disabled={actionsDisabled}>
            重试转换
          </button>
        )}
        {material.status === 'conversion_failed' && onReplaceText && (
          <button type="button" onClick={() => onReplaceText(material)} disabled={actionsDisabled}>
            粘贴完整正文后继续
          </button>
        )}
        {material.status === 'pending_quality_check' && onReplaceText && (
          <button type="button" onClick={() => onReplaceText(material)} disabled={actionsDisabled}>
            替换正文后重新生成
          </button>
        )}
        {material.status === 'pending_quality_check' && onRetryAi && (
          <button type="button" onClick={() => onRetryAi(material)} disabled={actionsDisabled}>
            重试生成笔记
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
