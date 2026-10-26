// Unit tests for parts of the text pipeline the fixtures do not reach directly.
import { describe, expect, it } from 'vitest';
import {
  countText,
  extractBaseline,
  getStandards,
  normalizeField,
  overflowOffset,
  parseStandards,
  processListing,
  wordTokens,
  type Standards,
} from '../src/index.ts';
import bundled from '../src/standards/standards.json' with { type: 'json' };
import { integrityFinding } from '../src/text/pipeline.ts';
import { Trace } from '../src/text/trace/trace.ts';

const standards = getStandards();
const field = (id: string) => standards.fields.find((f) => f.id === id)!;

function withCounting(method: 'utf16' | 'codepoints' | 'graphemes'): Standards {
  const document = structuredClone(bundled);
  document.rules.counting.chars = method;
  const result = parseStandards(document);
  if (!result.ok) throw new Error('invalid standards');
  return result.value;
}

describe('Trace', () => {
  const trace = () => new Trace('abc def', new Set(), { 'chars.emoji': true });

  it('rejects overlapping, unsorted or out-of-range edits', () => {
    const t = trace();
    const edit = (start: number, end: number) => ({ start, end, replacement: '', ruleId: 'x' });
    expect(() => t.apply([edit(2, 4), edit(3, 5)])).toThrow(/overlapping/);
    expect(() => t.apply([edit(3, 2)])).toThrow(/invalid/);
    expect(() => t.apply([edit(0, 99)])).toThrow(/invalid/);
  });

  it('skips edits that change nothing', () => {
    const t = trace();
    t.apply([{ start: 0, end: 1, replacement: 'a', ruleId: 'x' }]);
    expect(t.changes()).toEqual([]);
  });

  it('maps insertions at the end and in empty text to points', () => {
    const t = trace();
    t.apply([{ start: 7, end: 7, replacement: '!', ruleId: 'x' }]);
    expect(t.text).toBe('abc def!');
    expect(t.changes()[0]!.baselineSpan).toEqual({ start: 7, end: 7 });
    const empty = new Trace('', new Set(), {});
    expect(empty.baselineSpanOf(0, 0)).toEqual({ start: 0, end: 0 });
  });

  it('gives repeated edits of one span unique ids', () => {
    const t = trace();
    t.apply([{ start: 0, end: 1, replacement: 'A', ruleId: 'x' }]);
    t.apply([{ start: 0, end: 1, replacement: 'B', ruleId: 'x' }]);
    expect(t.changes().map((c) => c.id)).toEqual(['x@0:1', 'x@0:1~2']);
  });

  it('suppresses only revertible rules', () => {
    const t = new Trace('a😀b', new Set(['chars.emoji@1:3', 'ws.trim-field@0:1']), {
      'chars.emoji': true,
    });
    t.apply([
      { start: 0, end: 1, replacement: '', ruleId: 'ws.trim-field' },
      { start: 1, end: 3, replacement: '', ruleId: 'chars.emoji' },
    ]);
    expect(t.text).toBe('😀b');
    expect(t.changes().map((c) => [c.id, c.reverted])).toEqual([
      ['ws.trim-field@0:1', false],
      ['chars.emoji@1:3', true],
    ]);
    // The reverted emoji is still located in the output.
    expect(t.changes()[1]!.outputSpan).toEqual({ start: 0, end: 2 });
  });

  it('locates baseline spans that no longer exist in the output', () => {
    const t = trace();
    t.apply([{ start: 3, end: 4, replacement: '', ruleId: 'x' }]);
    expect(t.text).toBe('abcdef');
    expect(t.outputSpanOfBaseline({ start: 3, end: 4 })).toEqual({ start: 3, end: 3 });
    expect(t.outputSpanOfBaseline({ start: 4, end: 7 })).toEqual({ start: 3, end: 6 });
    t.apply([{ start: 3, end: 6, replacement: '', ruleId: 'y' }]);
    expect(t.outputSpanOfBaseline({ start: 6, end: 7 })).toEqual({ start: 3, end: 3 });
  });
});

describe('extractBaseline', () => {
  it('uses plain text when there is no HTML', () => {
    expect(extractBaseline({ text: 'plain' }, standards)).toEqual({
      baseline: 'plain',
      fromHtml: false,
      changes: [],
    });
    expect(extractBaseline({ text: 'plain', html: '  ' }, standards).fromHtml).toBe(false);
  });

  it('keeps preformatted whitespace and separates table cells', () => {
    const { baseline } = extractBaseline(
      { text: '', html: '<pre>a  b\n c</pre><table><tr><td>x</td><td>y</td></tr></table>' },
      standards,
    );
    expect(baseline).toBe('a  b\n c\nx y');
  });

  it('ignores breaks before any text, empty list items and stray closing tags', () => {
    const { baseline, changes } = extractBaseline(
      { text: '', html: '<br><br>Hi</p><ul><li></li><li>One</li></ul>' },
      standards,
    );
    expect(baseline).toBe('Hi\n\n– One');
    expect(changes.map((c) => c.ruleId)).toEqual(['html.extract', 'html.list-item']);
    expect(changes[0]!.detail).toMatch(/tags removed, 0 entities decoded/);
  });

  it('reads letter markers in Word lists as ordered', () => {
    const html =
      '<p class=MsoListParagraph><![if !supportLists]>a)&nbsp;<![endif]>First</p><p style="mso-list:l0 level1"><![if !supportLists]>b)<![endif]>Second</p>';
    expect(extractBaseline({ text: '', html }, standards).baseline).toBe('a) First\nb) Second');
  });

  it('counts a single tag and entity in the summary', () => {
    const { changes } = extractBaseline({ text: '', html: '<b>x &amp; y</b>' }, standards);
    expect(changes[0]!.detail).toBe('2 tags removed, 1 entity decoded');
  });
});

describe('counting', () => {
  const text = 'é👍🏽a';

  it('counts bytes, UTF-16 units, code points and graphemes', () => {
    expect(countText(text, 'bytes', standards)).toBe(2 + 8 + 1);
    expect(countText(text, 'chars', withCounting('utf16'))).toBe(1 + 4 + 1);
    expect(countText(text, 'chars', withCounting('codepoints'))).toBe(1 + 2 + 1);
    expect(countText(text, 'chars', withCounting('graphemes'))).toBe(3);
  });

  it('reports overflow at a whole grapheme', () => {
    expect(overflowOffset(text, { max: 3, unit: 'chars' }, standards)).toBe(1);
    expect(overflowOffset(text, { max: 6, unit: 'chars' }, standards)).toBeNull();
  });
});

describe('integrity', () => {
  const subject = { kind: 'listing' } as const;
  const preserve = new Set(standards.rules.emoji.preserve);

  it('reports the first differing word', () => {
    expect(integrityFinding('one two three', 'one too three', preserve, subject)).toMatchObject({
      severity: 'failure',
      data: { word: 2 },
      message: expect.stringContaining('“two” → “too”'),
    });
  });

  it('reports a missing trailing word', () => {
    expect(integrityFinding('one two', 'one', preserve, subject)).toMatchObject({
      severity: 'failure',
      message: expect.stringContaining('“two” → “”'),
    });
  });

  it('tokenizes what a reader sees', () => {
    expect(wordTokens('Great😀app — 1\uFE0F\u20E3 ca\u200Bfe\u0301\u2028end', preserve)).toEqual([
      'Great',
      'app',
      '1',
      'café',
      'end',
    ]);
  });
});

describe('normalizeField options', () => {
  it('records the locale on findings', () => {
    const result = normalizeField({ text: 'x' }, field('apple.name'), standards, { locale: 'fr' });
    expect(result.findings[0]!.subject).toMatchObject({ kind: 'field', locale: 'fr' });
  });

  it('reports a single pending change in check mode', () => {
    const result = normalizeField({ text: 'Example ' }, field('apple.name'), standards, {
      mode: 'check',
    });
    expect(result.findings.find((f) => f.ruleId === 'text.not-normalized')).toMatchObject({
      severity: 'warning',
      message: 'Normalizing would make 1 change.',
    });
  });
});

describe('processListing', () => {
  it('returns every field in configuration order, empty when absent', () => {
    const result = processListing({ fields: { 'apple.name': { text: 'Example' } } }, standards);
    expect(result.locale).toBe(standards.locales.default);
    expect(result.fields.map((f) => f.fieldId)).toEqual(standards.fields.map((f) => f.id));
    expect(result.fields.find((f) => f.fieldId === 'google.title')!.output).toBe('');
    expect(result.listingFindings).toEqual([]);
  });

  it('applies per-field options and the listing locale', () => {
    const result = processListing(
      { locale: 'en-GB', fields: { 'apple.description': { text: '“Hi”' } } },
      standards,
      { fields: { 'apple.description': { straightQuotes: true } } },
    );
    const description = result.fields.find((f) => f.fieldId === 'apple.description')!;
    expect(description.output).toBe('"Hi"');
    expect(description.findings[0]!.subject).toMatchObject({ locale: 'en-GB' });
  });

  it('checks keyword overlap against the text as given in check mode', () => {
    const result = processListing(
      {
        fields: {
          'apple.name': { text: 'Example  Health' },
          'apple.keywords': { text: 'health , diary' },
        },
      },
      standards,
      { mode: 'check' },
    );
    const keywords = result.fields.find((f) => f.fieldId === 'apple.keywords')!;
    expect(keywords.findings.find((f) => f.ruleId === 'keywords.overlaps-name')).toMatchObject({
      severity: 'warning',
      data: { matches: 'health' },
    });
    expect(keywords.findings.find((f) => f.ruleId === 'text.not-normalized')?.severity).toBe(
      'warning',
    );
  });
});
