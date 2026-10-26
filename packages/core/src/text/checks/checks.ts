// Checks run on text independently of what normalization did (spec §6.6), so they work on
// already-clean text and catch anything a reverted change left behind.
import { RULES } from '../../findings/catalog.ts';
import type { Finding, Severity, Subject } from '../../findings/types.ts';
import type { FieldDef, Standards } from '../../standards/schema.ts';
import { countText, overflowOffset } from '../count.ts';
import {
  describeCodePoint,
  foldChar,
  foldWithMap,
  graphemes,
  isClassified,
  isEmojiGrapheme,
  isWordChar,
} from '../unicode.ts';

export type FindingData = NonNullable<Finding['data']>;

export interface CheckContext {
  field: FieldDef;
  standards: Standards;
  subject: Subject;
  preserve: ReadonlySet<string>;
}

export function finding(
  ruleId: string,
  pass: boolean,
  context: Pick<CheckContext, 'subject'>,
  message: string,
  data?: FindingData,
  span?: { start: number; end: number },
): Finding {
  const severity: Severity = pass ? 'pass' : RULES[ruleId]!.severity!;
  return {
    ruleId,
    severity,
    subject: context.subject,
    message,
    ...(data ? { data } : {}),
    ...(span ? { span } : {}),
  };
}

const unitLabel = (unit: string, n: number) =>
  unit === 'bytes' ? (n === 1 ? 'byte' : 'bytes') : n === 1 ? 'character' : 'characters';

export function checkLimits(text: string, context: CheckContext): Finding[] {
  const { field, standards } = context;
  const { limit } = field;
  const count = countText(text, limit.unit, standards);
  const findings: Finding[] = [];

  if (field.required) {
    findings.push(
      finding(
        'text.required',
        text !== '',
        context,
        text === '' ? `${field.label} is required.` : `${field.label} is filled in.`,
      ),
    );
  }

  const over = count > limit.max;
  const overflowAt = over ? overflowOffset(text, limit, standards) : null;
  findings.push(
    finding(
      'text.limit.max',
      !over,
      context,
      over
        ? `${count} of ${limit.max} ${unitLabel(limit.unit, limit.max)}: ${count - limit.max} over the limit. Shorten the approved copy; Mulligan does not truncate.`
        : `${count} of ${limit.max} ${unitLabel(limit.unit, limit.max)}.`,
      { count, limit: limit.max, unit: limit.unit },
      overflowAt === null ? undefined : { start: overflowAt, end: text.length },
    ),
  );

  if (limit.min !== undefined) {
    const short = text !== '' && count < limit.min;
    findings.push(
      finding(
        'text.limit.min',
        !short,
        context,
        short
          ? `${count} ${unitLabel(limit.unit, count)}: at least ${limit.min} required.`
          : `At least ${limit.min} ${unitLabel(limit.unit, limit.min)}.`,
        { count, min: limit.min, unit: limit.unit },
      ),
    );
  }
  return findings;
}

export function checkDiscouraged(text: string, context: CheckContext): Finding[] {
  if (!context.field.checks.includes('discouraged')) return [];
  const { discouraged } = context.standards.rules;

  // Words in capitals, not on the allow-list.
  const allow = new Set(discouraged.allCaps.allow.map((w) => w.toUpperCase()));
  const caps: { word: string; index: number }[] = [];
  for (const match of text.matchAll(/[\p{L}\p{M}]+/gu)) {
    const word = match[0];
    const letters = Array.from(word.replace(/\p{M}/gu, '')).length;
    const cased = word.toUpperCase() !== word.toLowerCase();
    if (letters >= discouraged.allCaps.minLetters && cased && word === word.toUpperCase()) {
      if (!allow.has(word.toUpperCase())) caps.push({ word, index: match.index });
    }
  }

  // Repeated punctuation.
  const punctuation = Array.from(
    text.matchAll(new RegExp(discouraged.repeatedPunctuation, 'gu')),
    (m) => ({ word: m[0], index: m.index }),
  ).filter((m) => m.word !== '');

  // Promotional terms: whole word, case- and accent-insensitive.
  const { folded, map } = foldWithMap(text);
  const terms: { word: string; index: number }[] = [];
  for (const term of discouraged.terms) {
    const needle = Array.from(term, foldChar).join('');
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      from = at + 1;
      const before = at > 0 ? folded[at - 1] : undefined;
      const after = folded[at + needle.length];
      if (isWordChar(before) || isWordChar(after)) continue;
      const start = map[at]!;
      const end = (map[at + needle.length - 1] ?? start) + 1;
      terms.push({ word: text.slice(start, end), index: start });
    }
  }
  terms.sort((a, b) => a.index - b.index);

  return [
    report(
      'text.discouraged.all-caps',
      caps,
      context,
      'Words in capitals',
      'No words in capitals.',
    ),
    report(
      'text.discouraged.punctuation',
      punctuation,
      context,
      'Repeated punctuation',
      'No repeated punctuation.',
    ),
    report(
      'text.discouraged.terms',
      terms,
      context,
      'Promotional terms the stores discourage',
      'No discouraged promotional terms.',
    ),
  ];
}

function report(
  ruleId: string,
  matches: { word: string; index: number }[],
  context: CheckContext,
  label: string,
  passMessage: string,
): Finding {
  if (matches.length === 0) return finding(ruleId, true, context, passMessage);
  const list = [...new Set(matches.map((m) => m.word))];
  const first = matches[0]!;
  return finding(
    ruleId,
    false,
    context,
    `${label}: ${list.map((w) => `“${w}”`).join(', ')}.`,
    { matches: list.join(', '), count: matches.length },
    { start: first.index, end: first.index + first.word.length },
  );
}

export function checkCharacters(text: string, context: CheckContext): Finding[] {
  const emoji: { word: string; index: number }[] = [];
  const unclassified = new Map<string, number>();
  for (const { segment, index } of graphemes(text)) {
    if (isEmojiGrapheme(segment, context.preserve)) {
      emoji.push({ word: segment, index });
      continue;
    }
    let offset = 0;
    for (const char of segment) {
      if (!isClassified(char, context.preserve) && !unclassified.has(char)) {
        unclassified.set(char, index + offset);
      }
      offset += char.length;
    }
  }

  const findings: Finding[] = [
    report('text.emoji-present', emoji, context, 'Emoji present', 'No emoji.'),
  ];
  if (unclassified.size === 0) {
    findings.push(
      finding('text.unclassified-chars', true, context, 'All characters are recognized.'),
    );
  } else {
    for (const [char, index] of unclassified) {
      const name = describeCodePoint(char.codePointAt(0)!);
      findings.push(
        finding(
          'text.unclassified-chars',
          false,
          context,
          `Unrecognized character ${char} (${name}) at position ${index + 1}; check it before submission.`,
          { char, codePoint: name },
          { start: index, end: index + char.length },
        ),
      );
    }
  }

  if (!context.field.multiline) {
    const at = text.indexOf('\n');
    findings.push(
      finding(
        'text.newline-in-single-line',
        at < 0,
        context,
        at < 0 ? 'No line breaks.' : `${context.field.label} must be a single line.`,
        undefined,
        at < 0 ? undefined : { start: at, end: at + 1 },
      ),
    );
  }
  return findings;
}

/** Keyword list: comma-separated entries with their offsets. */
export function keywordEntries(text: string): { keyword: string; index: number }[] {
  const entries: { keyword: string; index: number }[] = [];
  let index = 0;
  for (const keyword of text.split(',')) {
    if (keyword.trim() !== '') entries.push({ keyword: keyword.trim(), index });
    index += keyword.length + 1;
  }
  return entries;
}

export const foldKeyword = (s: string): string =>
  Array.from(s.normalize('NFKC'), foldChar).join('').trim();

export function checkKeywordDuplicates(text: string, context: CheckContext): Finding[] {
  if (context.field.kind !== 'keywords') return [];
  const seen = new Set<string>();
  const duplicates: { word: string; index: number }[] = [];
  for (const { keyword, index } of keywordEntries(text)) {
    const key = foldKeyword(keyword);
    if (seen.has(key)) duplicates.push({ word: keyword, index });
    seen.add(key);
  }
  return [
    report(
      'keywords.duplicate',
      duplicates,
      context,
      'Duplicate keywords',
      'No duplicate keywords.',
    ),
  ];
}

/** Words of the related fields (app name, subtitle) that keywords should not repeat. */
export function checkKeywordOverlap(
  text: string,
  related: readonly { label: string; text: string }[],
  context: CheckContext,
): Finding {
  const words = new Map<string, string>();
  for (const { label, text: relatedText } of related) {
    for (const match of relatedText.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
      words.set(foldKeyword(match[0]), label);
    }
  }
  const overlaps: { word: string; index: number }[] = [];
  for (const { keyword, index } of keywordEntries(text)) {
    for (const match of keyword.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
      if (words.has(foldKeyword(match[0]))) {
        overlaps.push({
          word: match[0],
          index: index + text.slice(index).indexOf(keyword) + match.index,
        });
      }
    }
  }
  const labels = related.map((r) => r.label.toLowerCase()).join(' or ');
  return report(
    'keywords.overlaps-name',
    overlaps,
    context,
    `Keywords repeating words from the ${labels}`,
    `No keyword repeats the ${labels}.`,
  );
}
