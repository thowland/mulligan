import type { Severity } from '@mulligan/core';
import styles from './StatusBadge.module.css';

export type BadgeStatus = Severity | 'empty';

const LABELS: Record<BadgeStatus, { symbol: string; text: string }> = {
  pass: { symbol: '✓', text: 'Ready' },
  warning: { symbol: '!', text: 'Check warnings' },
  failure: { symbol: '✕', text: 'Fails checks' },
  empty: { symbol: '–', text: 'Optional, empty' },
};

/** Status shown with a symbol and words, never by colour alone (spec §9.6). */
export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { symbol, text } = LABELS[status];
  return (
    <span className={styles.badge} data-status={status}>
      <span aria-hidden="true" className={styles.symbol}>
        {symbol}
      </span>
      {text}
    </span>
  );
}
