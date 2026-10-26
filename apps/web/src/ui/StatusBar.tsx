import { useId, useState } from 'react';
import type { VersionInfo } from '../core-bridge/standards.ts';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  versions: VersionInfo;
}

/** Footer showing the standards in force, with an expandable About panel. */
export function StatusBar({ versions }: StatusBarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <footer className={styles.bar}>
      <div className={styles.row}>
        <span className={styles.status}>
          <span className={styles.dot} aria-hidden="true" />
          Ready
        </span>
        <span className={styles.versions}>
          Ruleset {versions.rulesetVersion} · Library {versions.libraryVersion}
        </span>
        <button
          type="button"
          className={styles.about}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          About
        </button>
      </div>
      <section id={panelId} hidden={!open} aria-label="About Mulligan" className={styles.panel}>
        <p>
          Mulligan resizes store artwork and cleans listing copy entirely in your browser. Files and
          text never leave this device.
        </p>
        <dl>
          <div>
            <dt>Library version</dt>
            <dd>{versions.libraryVersion}</dd>
          </div>
          <div>
            <dt>Ruleset version</dt>
            <dd>{versions.rulesetVersion}</dd>
          </div>
          <div>
            <dt>Standards hash</dt>
            <dd>
              <code>{versions.standardsHash}</code>
            </dd>
          </div>
        </dl>
      </section>
    </footer>
  );
}
