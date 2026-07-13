import type { ReactNode } from 'react';

interface FeedbackMessageProps {
  state: 'loading' | 'empty' | 'error' | 'success';
  message?: string;
  children?: ReactNode;
  onRetry?: () => void;
}

export function FeedbackMessage({ state, message, children, onRetry }: FeedbackMessageProps) {
  if (state === 'loading') {
    return <div className="feedback feedback-loading">{message ?? '加载中…'}</div>;
  }

  if (state === 'empty') {
    return <div className="feedback feedback-empty">{message ?? '暂无数据'}</div>;
  }

  if (state === 'error') {
    return (
      <div className="feedback feedback-error">
        <span>{message ?? '出错了，请稍后重试'}</span>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    );
  }

  if (state === 'success' && message) {
    return <div className="feedback feedback-success">{message}</div>;
  }

  return children ?? null;
}
