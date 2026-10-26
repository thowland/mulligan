import { useId, useRef, useState, type DragEvent } from 'react';
import styles from './DropZone.module.css';

interface DropZoneProps {
  label: string;
  hint: string;
  /** Called with the dropped or chosen files, in the order received. */
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  /** Test id for the hidden file input (one per zone). */
  inputTestId?: string;
}

/**
 * A keyboard-operable drop target. Only `DataTransfer.files` is read: dragged links and HTML are
 * ignored, so a drag from another page cannot import a remote resource (spec §10.2).
 */
export function DropZone({
  label,
  hint,
  onFiles,
  multiple = false,
  inputTestId = 'file-input',
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const hintId = useId();

  const accept = (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length > 0) onFiles(multiple ? list : list.slice(0, 1));
  };

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setActive(true);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setActive(false);
    accept(event.dataTransfer.files);
  };

  return (
    <div
      className={styles.zone}
      data-dropzone
      data-active={active}
      onDragOver={onDragOver}
      onDragLeave={() => setActive(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        className={styles.button}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      <p id={hintId} className={styles.hint}>
        {hint}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple={multiple}
        hidden
        data-testid={inputTestId}
        onChange={(event) => {
          accept(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
