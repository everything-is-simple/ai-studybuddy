import { useCallback, useRef, useState } from 'react';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  accept?: string;
}

export function FileDropzone({ onFileSelect, disabled, accept }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      onFileSelect(file);
    },
    [disabled, onFileSelect]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div
      className={`file-dropzone ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="拖拽文件到此处上传，或按 Enter 选择文件"
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          inputRef.current?.click();
        }
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <p>拖拽文件到此处，或点击选择文件</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => handleFile(event.target.files?.[0])}
        hidden
      />
    </div>
  );
}
