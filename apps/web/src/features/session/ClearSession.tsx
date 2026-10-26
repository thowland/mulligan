import { useState } from 'react';
import { clearSession, useSessionStore } from '../../state/session.ts';
import { Confirm } from '../../ui/Confirm.tsx';
import styles from './Session.module.css';

interface ClearSessionProps {
  onClear?: () => Promise<void>;
}

/** "Clear session" in the header (spec §10.7): asks first, then removes everything. */
export function ClearSession({ onClear = clearSession }: ClearSessionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const mode = useSessionStore((s) => s.mode);

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className={styles.clear}>
      <button
        type="button"
        className={styles.clearButton}
        aria-expanded={confirming}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        Clear session
      </button>
      {confirming && (
        <div className={styles.clearConfirm}>
          <Confirm
            title="Clear this session?"
            confirmLabel="Clear session"
            tone="failure"
            onConfirm={() => void clear()}
            onCancel={() => setConfirming(false)}
          >
            <p>
              Every image, listing field and reverted change is removed
              {mode === 'saved' ? ' from this browser' : ''}. This cannot be undone.
            </p>
          </Confirm>
        </div>
      )}
    </div>
  );
}
