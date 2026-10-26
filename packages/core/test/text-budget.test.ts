// Time budgets: no pattern applied to user text may backtrack catastrophically (spec §10.4), and a
// field of realistic length normalizes within the interactive budget (spec §9.4).
import { describe, expect, it } from 'vitest';
import { getStandards, normalizeField } from '../src/index.ts';

const standards = getStandards();
const fields = ['apple.description', 'apple.name', 'apple.keywords'].map((id) =>
  standards.fields.find((f) => f.id === id)!,
);
const SIZE = 100_000;
const fill = (unit: string, tail = 'x') => unit.repeat(Math.ceil(SIZE / unit.length)) + tail;

// Shapes that make backtracking engines go quadratic or worse.
const ADVERSARIAL: [string, string][] = [
  ['spaces', fill(' ')],
  ['newlines', fill('\n')],
  ['spaces and newlines', fill(' \n')],
  ['hyphen wraps', fill('a-\n')],
  ['punctuation', fill('!?')],
  ['dots', fill('.')],
  ['bullets', fill('•')],
  ['dash bullets', fill('- ')],
  ['emoji', fill('😀')],
  ['zero-width spaces', fill('​')],
  ['separators', fill(' , ; ')],
  ['capitals', fill('A')],
  ['terms', fill('free ')],
  ['numbers', fill('1')],
  ['digits and dots', fill('1.')],
];

const now = () => globalThis.performance.now();
const isCi = Boolean((globalThis as { process?: { env?: { CI?: string } } }).process?.env?.CI);
const isNode = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions
  ?.node;

describe('regular-expression budget', () => {
  it.each(ADVERSARIAL)('normalizes 100 KB of %s in linear time', (_name, text) => {
    for (const field of fields) {
      const started = now();
      normalizeField({ text }, field, standards);
      // Generous for slow CI browsers; quadratic behaviour takes minutes at this size.
      expect(now() - started, field.id).toBeLessThan(4000);
    }
  });

  it('extracts 100 KB of nested markup in linear time', () => {
    const html = fill('<p><b>a</b><![if !supportLists]>1.<![endif]></p>');
    const started = now();
    normalizeField({ text: '', html }, fields[0]!, standards);
    expect(now() - started).toBeLessThan(4000);
  });

  it('keeps the configured patterns linear', () => {
    const { rejoin, discouraged } = standards.rules;
    for (const source of [rejoin.listItemPattern, discouraged.repeatedPunctuation]) {
      const pattern = new RegExp(source, 'gu');
      for (const [, text] of ADVERSARIAL) {
        const started = now();
        Array.from(text.matchAll(pattern));
        expect(now() - started, source).toBeLessThan(250);
      }
    }
  });
});

describe('interactive budget', () => {
  it('normalizes a 4,000-character description within 10 ms (median, Node)', () => {
    const paragraph =
      'Example Health helps you keep a clear record of how you feel, so conversations with your\ncare team start from the facts. Log symptoms, mood and sleep in a few taps 😀.\n\n– Daily diary\n– Reminders\n\n';
    const text = paragraph.repeat(Math.ceil(4000 / paragraph.length)).slice(0, 4000);
    const field = fields[0]!;
    for (let i = 0; i < 3; i++) normalizeField({ text }, field, standards); // warm up
    const times = Array.from({ length: 9 }, () => {
      const started = now();
      normalizeField({ text }, field, standards);
      return now() - started;
    }).sort((a, b) => a - b);
    // The 10 ms target applies to Node on a developer machine. Browsers, and CI runners (shared
    // VMs running this under coverage alongside the browser projects), are slower and noisier;
    // there the bound only catches a gross regression.
    expect(times[4]!).toBeLessThan(isNode && !isCi ? 10 : 50);
  });
});
