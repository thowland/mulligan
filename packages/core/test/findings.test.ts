import { describe, expect, it } from 'vitest';
import { RULES, isChangeRule, summarize, worstSeverity, type Finding } from '../src/index.ts';

const finding = (severity: Finding['severity']): Finding => ({
  ruleId: 'text.required',
  severity,
  subject: { kind: 'listing' },
  message: 'm',
});

describe('summarize', () => {
  it('reports pass with zero counts for no findings', () => {
    expect(summarize([])).toEqual({ counts: { pass: 0, warning: 0, failure: 0 }, worst: 'pass' });
  });

  it('counts by severity and reports the worst', () => {
    const summary = summarize([finding('pass'), finding('warning'), finding('pass')]);
    expect(summary).toEqual({ counts: { pass: 2, warning: 1, failure: 0 }, worst: 'warning' });
    expect(summarize([finding('failure'), finding('warning')]).worst).toBe('failure');
  });

  it('orders severities pass < warning < failure', () => {
    expect(worstSeverity(['warning', 'failure', 'pass'])).toBe('failure');
    expect(worstSeverity(['pass'])).toBe('pass');
  });
});

describe('RULES catalog', () => {
  it('keys every rule by its own id', () => {
    for (const [key, rule] of Object.entries(RULES)) expect(rule.id).toBe(key);
  });

  it('gives every check a non-pass severity and no change a severity', () => {
    const rules = Object.values(RULES);
    const checks = rules.filter((rule) => rule.kind === 'check');
    const changes = rules.filter((rule) => rule.kind === 'change');
    expect(checks.map((rule) => rule.severity)).toEqual(
      checks.map(() => expect.stringMatching(/^(warning|failure)$/)),
    );
    expect(changes.map((rule) => rule.severity)).toEqual(changes.map(() => undefined));
  });

  it('is frozen', () => {
    expect(Object.isFrozen(RULES)).toBe(true);
    expect(Object.isFrozen(RULES['lines.rejoin'])).toBe(true);
  });

  it('distinguishes change rules', () => {
    expect(isChangeRule('lines.rejoin')).toBe(true);
    expect(isChangeRule('text.limit.max')).toBe(false);
    expect(isChangeRule('no.such.rule')).toBe(false);
  });
});
