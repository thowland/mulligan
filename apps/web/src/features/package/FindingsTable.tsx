import type { Finding, Severity } from '@mulligan/core';
import { useMemo, useState } from 'react';
import { ruleTitle } from '../../core-bridge/listing.ts';
import { subjectLabel } from '../../core-bridge/package.ts';
import styles from './FindingsTable.module.css';

type SortKey = 'severity' | 'subject' | 'rule' | 'message';
type Direction = 'ascending' | 'descending';

const LABEL: Record<Severity, string> = { pass: 'Pass', warning: 'Warning', failure: 'Failure' };
const RANK: Record<Severity, number> = { pass: 0, warning: 1, failure: 2 };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'severity', label: 'Severity' },
  { key: 'subject', label: 'Subject' },
  { key: 'rule', label: 'Check' },
  { key: 'message', label: 'Message' },
];

interface Row {
  key: string;
  severity: Severity;
  subject: string;
  rule: string;
  message: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Every warning and failure in the workspace in one sortable table (spec §9.3). Passing checks
 * are counted rather than listed. Severity is spelled out, never conveyed by colour alone.
 */
export function FindingsTable({ findings }: { findings: readonly Finding[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: 'severity',
    direction: 'descending',
  });

  const rows = useMemo<Row[]>(
    () =>
      findings
        .filter((f) => f.severity !== 'pass')
        .map((f, index) => ({
          key: `${index}-${f.ruleId}`,
          severity: f.severity,
          subject: subjectLabel(f),
          rule: ruleTitle(f.ruleId),
          message: f.message,
        })),
    [findings],
  );
  const passes = findings.length - rows.length;

  const sorted = useMemo(() => {
    const factor = sort.direction === 'ascending' ? 1 : -1;
    const compare = (a: Row, b: Row) =>
      sort.key === 'severity'
        ? RANK[a.severity] - RANK[b.severity]
        : collator.compare(a[sort.key], b[sort.key]);
    // Ties fall back to subject order, so the table reads predictably.
    return [...rows].sort(
      (a, b) => factor * compare(a, b) || collator.compare(a.subject, b.subject),
    );
  }, [rows, sort]);

  const toggle = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: key === 'severity' ? 'descending' : 'ascending' },
    );

  if (rows.length === 0) {
    return (
      <p className={styles.allPass} data-severity="pass">
        <span className={styles.severity}>Pass</span>
        {passes === 0
          ? 'Nothing to check yet.'
          : `All ${passes} ${passes === 1 ? 'check passes' : 'checks pass'}.`}
      </p>
    );
  }

  return (
    <>
      <div className={styles.wrap}>
        <table className={styles.table} aria-label="Findings">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sort.key === column.key ? sort.direction : 'none'}
                >
                  <button type="button" className={styles.sort} onClick={() => toggle(column.key)}>
                    {column.label}
                    <span aria-hidden="true" className={styles.arrow}>
                      {sort.key === column.key ? (sort.direction === 'ascending' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.key} data-severity={row.severity}>
                <td>
                  <span className={styles.severity}>{LABEL[row.severity]}</span>
                </td>
                <td>{row.subject}</td>
                <td>{row.rule}</td>
                <td className={styles.message}>{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {passes > 0 && (
        <p className={styles.passes}>
          {passes} other {passes === 1 ? 'check passes' : 'checks pass'}.
        </p>
      )}
    </>
  );
}
