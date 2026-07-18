import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';

export type MindMapRenderer = ComponentType<{ data: string }>;

const LazyMindMap = lazy(async () => {
  const module = await import('./mind-map');
  return { default: module.MindMap };
});

interface MindMapErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface MindMapErrorBoundaryState {
  hasError: boolean;
}

export class MindMapErrorBoundary extends Component<MindMapErrorBoundaryProps, MindMapErrorBoundaryState> {
  state: MindMapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MindMapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: MindMapErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return <div className="feedback feedback-empty">暂无法展示思维导图</div>;
    }

    return this.props.children;
  }
}

interface LazyMindMapSectionProps {
  data: string;
  renderer?: MindMapRenderer;
}

export function LazyMindMapSection({ data, renderer: Renderer = LazyMindMap }: LazyMindMapSectionProps) {
  return (
    <MindMapErrorBoundary resetKey={data}>
      <Suspense fallback={<div className="feedback feedback-loading">正在加载思维导图…</div>}>
        <Renderer data={data} />
      </Suspense>
    </MindMapErrorBoundary>
  );
}