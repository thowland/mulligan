// Property tests for the text pipeline (spec §6.7, §6.8, §13.3).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  getStandards,
  normalizeField,
  type Change,
  type FieldDef,
  type FieldResult,
  type Span,
} from '../src/index.ts';

const standards = getStandards();
const fieldById = (id: string) => standards.fields.find((f) => f.id === id)!;
const FIELDS: FieldDef[] = [
  fieldById('apple.description'), // multiline
  fieldById('apple.name'), // single line
  fieldById('apple.keywords'), // keywords
];

// Fragments chosen to collide: words, punctuation, every kind of whitespace and line break,
// emoji of every shape, invisible characters, bullets and hyphenated wraps.
const FRAGMENTS = [
  'alpha',
  'Beta',
  'GAMMA',
  'café',
  'cafe\u0301',
  'naïve',
  'résumé',
  '42',
  '#1',
  'multi-',
  '.',
  ',',
  '!',
  '?',
  ':',
  ';',
  '-',
  '–',
  '—',
  "'",
  '’',
  '“',
  '”',
  '(',
  ')',
  '*',
  '•',
  '·',
  ' ',
  '  ',
  '\n',
  '\n\n',
  '\n\n\n',
  '\r\n',
  '\r',
  '\t',
  '\u000B',
  '\u000C',
  '\u0085',
  '\u2028',
  '\u2029',
  '\u00A0',
  '\u202F',
  '\u3000',
  '\u200B',
  '\u200C',
  '\u200D',
  '\u00AD',
  '\uFEFF',
  '\u200E',
  '\u2060',
  '\uFE0F',
  '\u0301',
  '😀',
  '👍🏽',
  '👨\u200D👩\u200D👧',
  '🇬🇧',
  '1\uFE0F\u20E3',
  '#\uFE0F\u20E3',
  '❤\uFE0F',
  '®',
  '®\uFE0F',
  '™',
  '™\uFE0F',
  '©',
  '✓',
  '\uE000',
  '• ',
  '* ',
  '- ',
  '· ',
  '\uF0B7\t',
  '1. ',
  '– ',
];

const text = fc
  .array(fc.constantFrom(...FRAGMENTS), { maxLength: 40 })
  .map((parts) => parts.join(''));
const field = fc.constantFrom(...FIELDS);
const straightQuotes = fc.boolean();

const applied = (changes: Change[]) => changes.filter((c) => !c.reverted);

// TEXT_PROPERTY_RUNS raises the run count for a deeper local campaign (Node only).
const override = Number(
  (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[
    'TEXT_PROPERTY_RUNS'
  ],
);
const runs = (n: number) => (override > 0 ? override : n);

/** Remove the union of `spans` from `s`. */
function strip(s: string, spans: Span[]): string {
  // Spans are in UTF-16 code units, so index by code unit, not by code point.
  const removed = new Array<boolean>(s.length).fill(false);
  for (const { start, end } of spans) for (let i = start; i < end; i++) removed[i] = true;
  let kept = '';
  for (let i = 0; i < s.length; i++) if (!removed[i]) kept += s[i];
  return kept;
}

function soundness(result: FieldResult): void {
  const changes = applied(result.changes).filter((c) => !c.ruleId.startsWith('html.'));
  expect(
    strip(
      result.output,
      changes.map((c) => c.outputSpan),
    ),
  ).toBe(
    strip(
      result.baseline,
      changes.map((c) => c.baselineSpan),
    ),
  );
}

describe('text pipeline properties', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(text, field, straightQuotes, (input, def, quotes) => {
        const first = normalizeField({ text: input }, def, standards, { straightQuotes: quotes });
        const second = normalizeField({ text: first.output }, def, standards, {
          straightQuotes: quotes,
        });
        expect(second.output).toBe(first.output);
        expect(applied(second.changes)).toEqual([]);
      }),
      { numRuns: runs(300) },
    );
  });

  it('never changes the wording', () => {
    fc.assert(
      fc.property(text, field, straightQuotes, (input, def, quotes) => {
        const result = normalizeField({ text: input }, def, standards, { straightQuotes: quotes });
        const integrity = result.findings.find((f) => f.ruleId === 'integrity.wording')!;
        expect(integrity.severity, integrity.message).toBe('pass');
      }),
      { numRuns: runs(300) },
    );
  });

  it('records every change: text outside change spans is identical in baseline and output', () => {
    fc.assert(
      fc.property(text, field, (input, def) => {
        soundness(normalizeField({ text: input }, def, standards));
      }),
      { numRuns: runs(300) },
    );
  });

  it('keeps change ids stable when other changes are reverted', () => {
    fc.assert(
      fc.property(text, field, fc.nat(), (input, def, pick) => {
        const first = normalizeField({ text: input }, def, standards);
        const revertible = applied(first.changes).filter((c) => c.revertible);
        fc.pre(revertible.length > 0);
        const target = revertible[pick % revertible.length]!;
        const second = normalizeField({ text: input }, def, standards, {
          suppress: new Set([target.id]),
        });
        expect(second.changes.find((c) => c.id === target.id)?.reverted).toBe(true);
        // Changes in another paragraph (a blank line in the baseline lies between them and the
        // reverted change) are unaffected and keep their ids.
        const separated = (a: Span, b: Span) => {
          const [from, to] = a.end <= b.start ? [a.end, b.start] : [b.end, a.start];
          return from <= to && first.baseline.slice(from, to).includes('\n\n');
        };
        const secondIds = new Set(second.changes.map((c) => c.id));
        // Paragraphs exist only in multiline text fields; elsewhere line breaks are separators.
        const elsewhere = def.multiline
          ? applied(first.changes).filter((c) => separated(c.baselineSpan, target.baselineSpan))
          : [];
        expect(elsewhere.filter((c) => !secondIds.has(c.id)).map((c) => c.id)).toEqual([]);
        soundness(second);
      }),
      { numRuns: runs(200) },
    );
  });

  it('converges when every revertible change is reverted', () => {
    fc.assert(
      fc.property(text, field, (input, def) => {
        const suppress = new Set<string>();
        let result = normalizeField({ text: input }, def, standards);
        for (let round = 0; round < 6; round++) {
          const pending = applied(result.changes).filter((c) => c.revertible);
          if (pending.length === 0) break;
          pending.forEach((c) => suppress.add(c.id));
          result = normalizeField({ text: input }, def, standards, { suppress });
        }
        expect(applied(result.changes).filter((c) => c.revertible)).toEqual([]);
        soundness(result);
        const integrity = result.findings.find((f) => f.ruleId === 'integrity.wording')!;
        expect(integrity.severity).toBe('pass');
      }),
      { numRuns: runs(200) },
    );
  });

  it('extracts arbitrary HTML without throwing and yields idempotent output', () => {
    const TAGS = [
      '<p>',
      '</p>',
      '<br>',
      '<ul>',
      '</ul>',
      '<ol>',
      '</ol>',
      '<li>',
      '</li>',
      '<b>',
      '</b>',
      '<span>',
      '</span>',
      '<h2>',
      '</h2>',
      '<div>',
      '</div>',
      '<td>',
      '</td>',
      '<tr>',
      '</tr>',
      '&nbsp;',
      '&amp;',
      '&lt;',
      '&#8217;',
      '<o:p></o:p>',
      '<![if !supportLists]>',
      '<![endif]>',
      '<style>p{}</style>',
      '<!--StartFragment-->',
      '<!--EndFragment-->',
      '<pre>',
      '</pre>',
      '<img alt="x">',
      '<p class=MsoListParagraph>',
    ];
    const html = fc
      .array(fc.oneof(fc.constantFrom(...TAGS), fc.constantFrom(...FRAGMENTS)), { maxLength: 40 })
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(html, field, (input, def) => {
        const first = normalizeField({ text: '', html: input }, def, standards);
        const second = normalizeField({ text: first.output }, def, standards);
        expect(second.output).toBe(first.output);
        expect(first.baseline).not.toMatch(/<\/?(p|br|li|ul|ol|b|span|div|style)\b/);
        const integrity = first.findings.find((f) => f.ruleId === 'integrity.wording')!;
        expect(integrity.severity, integrity.message).toBe('pass');
      }),
      { numRuns: runs(200) },
    );
  });
});
