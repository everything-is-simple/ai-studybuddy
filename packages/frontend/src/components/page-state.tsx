import type { ReactNode } from 'react';

type PageStateKind = 'loading' | 'empty' | 'error' | 'success';

interface PageStateProps {
  state: PageStateKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export function PageState({ state, title, message, actionLabel, onAction, children }: PageStateProps) {
  const role = state === 'loading' || state === 'success' ? 'status' : state === 'error' ? 'alert' : undefined;
  return (
    <section
      className={`page-state page-state-${state}`}
      data-testid="page-state"
      data-page-state={state}
      role={role}
      aria-live={role ? 'polite' : undefined}
    >
      <h1>{title}</h1>
      {message && <p>{message}</p>}
      {children}
      {onAction && actionLabel && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}
