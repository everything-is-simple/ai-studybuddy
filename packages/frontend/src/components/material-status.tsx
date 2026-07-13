import { Link } from 'react-router-dom';
import type { MaterialDto } from '@ai-studybuddy/shared';

interface MaterialStatusProps {
  material: MaterialDto;
  onRetryConversion?: (material: MaterialDto) => void;
  onRetryAi?: (material: MaterialDto) => void;
  onReplaceText?: (material: MaterialDto) => void;
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

export function MaterialStatus({ material, onRetryConversion, onRetryAi, onReplaceText }: MaterialStatusProps) {
  const label = STATUS_LABELS[material.status] ?? material.status;

  return (
    <div className="material-status">
      <div className="material-status-header">
        <strong>{material.title ?? material.originalFilename ?? '未命名资料'}</strong>
        <span className={`status-badge status-${material.status}`}>{label}</span>
      </div>
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
        {material.status === 'conversion_failed' && onRetryConversion && (
          <button type="button" onClick={() => onRetryConversion(material)}>
            重试转换
          </button>
        )}
        {material.status === 'pending_quality_check' && onReplaceText && (
          <button type="button" onClick={() => onReplaceText(material)}>
            手动补充文本
          </button>
        )}
        {material.status === 'pending_quality_check' && onRetryAi && (
          <button type="button" onClick={() => onRetryAi(material)}>
            重试生成笔记
          </button>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
