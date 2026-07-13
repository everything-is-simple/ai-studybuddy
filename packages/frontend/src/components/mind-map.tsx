import { useEffect, useRef, useState } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

interface MindMapProps {
  data: string;
}

export function MindMap({ data }: MindMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!svgRef.current) return;

    let mm: Markmap | null = null;
    try {
      const transformer = new Transformer();
      const { root } = transformer.transform('#');
      mm = Markmap.create(svgRef.current, {}, root);
      markmapRef.current = mm;
    } catch {
      setError(true);
      return;
    }

    return () => {
      mm?.destroy();
      markmapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mm = markmapRef.current;
    if (!mm || !data) return;

    try {
      const transformer = new Transformer();
      const { root } = transformer.transform(data);
      mm.setData(root);
      mm.fit();
      setError(false);
    } catch {
      setError(true);
    }
  }, [data]);

  if (error) {
    return <div className="feedback feedback-empty">暂无法展示思维导图</div>;
  }

  return (
    <div className="mind-map">
      <svg ref={svgRef} style={{ width: '100%', height: '320px' }} />
    </div>
  );
}
