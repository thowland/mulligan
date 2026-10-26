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

/** Footer showing the worst result in the workspace and the standards in force. */
export function StatusBar({ versions, status }: StatusBarProps) {
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
      </div>
    </footer>
  );
}
