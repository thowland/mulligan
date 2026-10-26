import { useEffect, useRef, useState } from 'react';
import styles from './CopyButton.module.css';

type CopyState = 'idle' | 'copied' | 'failed';

/** Copies the cleaned text for pasting into App Store Connect or the Play Console. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        disabled={text === ''}
        onClick={() => void copy()}
        aria-label={`Copy cleaned ${label}`}
      >
        Copy
      </button>
      <span role="status" className={styles.status}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: select and copy' : ''}
      </span>
    </span>
  );
}
