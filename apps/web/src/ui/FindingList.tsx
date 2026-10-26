import type { Finding, Severity } from '@mulligan/core';
import styles from './FindingList.module.css';

const LABEL: Record<Severity, string> = { pass: 'Pass', warning: 'Warning', failure: 'Failure' };
const ORDER: Record<Severity, number> = { failure: 0, warning: 1, pass: 2 };

interface FindingListProps {
  findings: readonly Finding[];
  /** Show passing checks individually rather than as a count. */
  showPasses?: boolean;
}

/** Findings, worst first. Severity is spelled out, never conveyed by colour alone. */
export function FindingList({ findings, showPasses = false }: FindingListProps) {
  const sorted = [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const visible = showPasses ? sorted : sorted.filter((f) => f.severity !== 'pass');
  const passes = findings.length - visible.length;

  return (
    <ul className={styles.list}>
      {visible.map((finding, index) => (
        <li
          key={`${finding.ruleId}-${index}`}
          className={styles.item}
          data-severity={finding.severity}
        >
          <span className={styles.severity}>{LABEL[finding.severity]}</span>
          <span>{finding.message}</span>
        </li>
      ))}
      {passes > 0 && (
        <li className={styles.item} data-severity="pass">
          <span className={styles.severity}>Pass</span>
          <span>
            {passes} {passes === 1 ? 'check' : 'checks'} passed
          </span>
        </li>
      )}
    </ul>
  );
}
