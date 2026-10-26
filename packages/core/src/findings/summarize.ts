import type { Finding, Severity, Summary } from './types.ts';

const RANK: Record<Severity, number> = { pass: 0, warning: 1, failure: 2 };

export function worstSeverity(severities: Iterable<Severity>): Severity {
  let worst: Severity = 'pass';
  for (const severity of severities) {
    if (RANK[severity] > RANK[worst]) worst = severity;
  }
  return worst;
}

export function summarize(findings: readonly Finding[]): Summary {
  const counts: Record<Severity, number> = { pass: 0, warning: 0, failure: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return { counts, worst: worstSeverity(findings.map((f) => f.severity)) };
}
