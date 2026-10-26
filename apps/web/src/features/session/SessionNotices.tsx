import { useSessionStore } from '../../state/session.ts';
import styles from './Session.module.css';

/**
 * Session messages under the header (spec §9.5, §10.7): in-memory mode, the one-time
 * "kept in this browser" notice, restore notices and files that were not saved.
 */
export function SessionNotices() {
  const mode = useSessionStore((s) => s.mode);
  const notices = useSessionStore((s) => s.notices);
  const unsaved = useSessionStore((s) => s.unsaved);
  const showSaveNotice = useSessionStore((s) => s.showSaveNotice);
  const dismissNotice = useSessionStore((s) => s.dismissNotice);
  const dismissSaveNotice = useSessionStore((s) => s.dismissSaveNotice);
  const clearError = useSessionStore((s) => s.clearError);

  if (
    mode !== 'memory' &&
    notices.length === 0 &&
    unsaved.length === 0 &&
    !showSaveNotice &&
    !clearError
  ) {
    return null;
  }

  return (
    <div className={styles.notices}>
      {clearError && (
        // Persistent: it stays until a later removal succeeds.
        <p className={styles.banner} data-tone="failure" role="status">
          <span>
            <strong>Saved work is still in this browser.</strong> {clearError}
          </span>
        </p>
      )}
      {mode === 'memory' && (
        <p className={styles.banner} data-tone="warning" role="alert">
          <span>
            <strong>Not saved on this device.</strong> This browser is not letting Mulligan keep
            your work (for example in a private window). Everything still works, but reloading or
            closing the tab loses it.
          </span>
        </p>
      )}
      {showSaveNotice && (
        <p className={styles.banner} role="status">
          <span>
            Your work is kept in this browser until you clear it, so you can close the tab and carry
            on later. Use <strong>Clear session</strong> on a shared computer.
          </span>
          <button type="button" className={styles.dismiss} onClick={dismissSaveNotice}>
            Got it
          </button>
        </p>
      )}
      {unsaved.length > 0 && (
        <p className={styles.banner} data-tone="warning" role="status">
          <span>
            Processed but not saved on this device (storage is full):{' '}
            {unsaved.map((f) => f.fileName).join(', ')}. They stay available until this tab closes.
          </span>
        </p>
      )}
      {notices.map((notice, index) => (
        <p key={`${index}-${notice}`} className={styles.banner} data-tone="warning" role="status">
          <span>{notice}</span>
          <button type="button" className={styles.dismiss} onClick={() => dismissNotice(index)}>
            Dismiss
          </button>
        </p>
      ))}
    </div>
  );
}
