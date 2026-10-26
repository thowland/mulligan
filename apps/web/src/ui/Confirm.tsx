import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Confirm.module.css';

interface ConfirmProps {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'warning' | 'failure';
}

/**
 * An inline confirmation (role alertdialog). Focus moves to the safe choice, Cancel, when it
 * appears, and Escape cancels.
 */
export function Confirm({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'warning',
}: ConfirmProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  useEffect(() => {
    const node = root.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    node?.addEventListener('keydown', onKeyDown);
    return () => node?.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      ref={root}
      className={styles.confirm}
      data-tone={tone}
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={children ? `${id}-body` : undefined}
    >
      <p id={`${id}-title`} className={styles.title}>
        {title}
      </p>
      {children && (
        <div id={`${id}-body`} className={styles.body}>
          {children}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" ref={cancel} className={styles.secondary} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
