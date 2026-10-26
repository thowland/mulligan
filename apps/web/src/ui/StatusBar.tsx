import { useId, useState } from 'react';
import type { VersionInfo } from '../core-bridge/standards.ts';
import type { WorkspaceStatus } from '../features/status/useWorkspaceStatus.ts';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  versions: VersionInfo;
  status: WorkspaceStatus;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function statusText({ worst, warnings, failures }: WorkspaceStatus): string {
  if (worst === 'idle') return 'Ready';
  if (worst === 'pass') return 'All checks pass';
  if (failures === 0) return plural(warnings, 'warning');
  return warnings === 0
    ? plural(failures, 'failure')
    : `${plural(failures, 'failure')} · ${plural(warnings, 'warning')}`;
}

/** Footer showing the standards in force, with an expandable About panel. */
export function StatusBar({ versions, status }: StatusBarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <footer className={styles.bar}>
      <div className={styles.row}>
        <span className={styles.status} role="status" data-status={status.worst}>
          <span className={styles.dot} aria-hidden="true" />
          {statusText(status)}
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
