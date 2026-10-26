// Runs every case under fixtures/text in Node and in each browser (implementation plan, Sprint 3).
// Update expected results with `node packages/core/scripts/text-fixtures.ts --write`, then review
// the diff by hand before committing.
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/index.ts';
import { runTextCase, type Expected, type TextCase } from './support/text-fixtures.ts';

const cases = import.meta.glob<TextCase>('../../../fixtures/text/*/case.json', {
  eager: true,
  import: 'default',
});
const html = import.meta.glob<string>('../../../fixtures/text/*/input.html', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const expected = import.meta.glob<Expected>('../../../fixtures/text/*/expected.json', {
  eager: true,
  import: 'default',
});

const caseName = (path: string) => path.split('/').slice(-2, -1)[0]!;
const entries = Object.entries(cases).map(([path, testCase]) => {
  const dir = path.slice(0, -'case.json'.length);
  return {
    name: caseName(path),
    testCase,
    html: html[`${dir}input.html`],
    expected: expected[`${dir}expected.json`],
  };
});

describe('text fixtures', () => {
  it('are present', () => {
    expect(entries.length).toBeGreaterThanOrEqual(25);
    expect(entries.filter((e) => e.expected === undefined).map((e) => e.name)).toEqual([]);
  });

  it.each(entries)('$name', ({ testCase, html: input, expected: want }) => {
    const { expected: got, findings } = runTextCase(testCase, input);
    expect(got).toEqual(want);
    // The wording invariant holds in every case (spec §6.7).
    expect(findings.filter((f) => f.ruleId === 'integrity.wording').map((f) => f.severity)).toEqual(
      findings.filter((f) => f.ruleId === 'integrity.wording').map(() => 'pass'),
    );
  });

  it('exercise every text rule', () => {
    const seenChanges = new Set<string>();
    const seenFailures = new Set<string>();
    const seenChecks = new Set<string>();
    for (const { testCase, html: input } of entries) {
      const { changes, findings } = runTextCase(testCase, input);
      changes.forEach((c) => seenChanges.add(c.ruleId));
      findings.forEach((f) => {
        seenChecks.add(f.ruleId);
        if (f.severity !== 'pass') seenFailures.add(f.ruleId);
      });
    }
    const textRule = (id: string) =>
      /^(html|lines|chars|ws|keywords|text|integrity)\./.test(id) && !id.startsWith('import.');
    const rules = Object.values(RULES).filter((r) => textRule(r.id));
    const changeRules = rules.filter((r) => r.kind === 'change').map((r) => r.id);
    // Every check must fire somewhere, except integrity.wording, which must never fire.
    const checkRules = rules
      .filter((r) => r.kind === 'check' && r.id !== 'integrity.wording')
      .map((r) => r.id);
    expect(changeRules.filter((id) => !seenChanges.has(id))).toEqual([]);
    expect(checkRules.filter((id) => !seenFailures.has(id))).toEqual([]);
    expect(seenChecks.has('integrity.wording')).toBe(true);
    expect(seenFailures.has('integrity.wording')).toBe(false);
  });
});
