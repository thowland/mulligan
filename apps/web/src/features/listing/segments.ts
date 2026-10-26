// Presentation helpers for the side-by-side review (spec §9.3): split text into runs by the change
// spans that cover them, and show invisible characters in a readable form. No rules live here.

export interface Highlight {
  id: string;
  start: number;
  end: number;
}

export type Segment =
  | { kind: 'text'; text: string; ids: string[] }
  /** A zero-width change (an insertion in the original, a deletion in the cleaned text). */
  | { kind: 'point'; ids: string[] };

/** Splits `text` at every highlight boundary; each run lists the highlights covering it. */
export function segmentText(text: string, highlights: readonly Highlight[]): Segment[] {
  const ranges = highlights.filter((h) => h.start < h.end);
  const points = new Map<number, string[]>();
  for (const h of highlights) {
    if (h.start !== h.end) continue;
    points.set(h.start, [...(points.get(h.start) ?? []), h.id]);
  }
  const bounds = [
    ...new Set([0, text.length, ...ranges.flatMap((h) => [h.start, h.end]), ...points.keys()]),
  ]
    .filter((b) => b >= 0 && b <= text.length)
    .sort((a, b) => a - b);

  const segments: Segment[] = [];
  bounds.forEach((start, index) => {
    const ids = points.get(start);
    if (ids) segments.push({ kind: 'point', ids });
    const end = bounds[index + 1];
    if (end === undefined || end === start) return;
    const covering = ranges.filter((h) => h.start <= start && h.end >= end).map((h) => h.id);
    const previous = segments.at(-1);
    // Merge adjacent runs with the same highlights to keep the DOM small.
    if (previous?.kind === 'text' && sameIds(previous.ids, covering)) {
      previous.text += text.slice(start, end);
    } else {
      segments.push({ kind: 'text', text: text.slice(start, end), ids: covering });
    }
  });
  return segments;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export interface VisibleToken {
  text: string;
  /** True for a symbol standing in for an invisible or whitespace character. */
  symbol: boolean;
}

const NAMED: Record<string, string> = {
  '\n': '⏎',
  '\t': '⇥',
  ' ': '␣',
  ' ': 'NBSP',
  ' ': 'NNBSP',
  '​': 'ZWSP',
  '‌': 'ZWNJ',
  '‍': 'ZWJ',
  '⁠': 'WJ',
  '­': 'SHY',
  '﻿': 'BOM',
  '\u000B': 'VT',
  '\u000C': 'FF',
  '\r': 'CR',
  ' ': 'LS',
  ' ': 'PS',
  '️': 'VS16',
};

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{M}︀-️]/u;

/** Text with whitespace and invisible characters shown as named symbols. */
export function visibleTokens(text: string): VisibleToken[] {
  if (text === '') return [{ text: 'nothing', symbol: true }];
  const tokens: VisibleToken[] = [];
  for (const char of text) {
    const named = NAMED[char];
    const symbol =
      named ??
      (INVISIBLE.test(char)
        ? `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
        : null);
    if (symbol !== null) {
      tokens.push({ text: symbol, symbol: true });
      continue;
    }
    const previous = tokens.at(-1);
    if (previous && !previous.symbol) previous.text += char;
    else tokens.push({ text: char, symbol: false });
  }
  return tokens;
}

/** True when a run has nothing visible, so it needs a visible marker to be seen. */
export function isBlank(text: string): boolean {
  return /^[\s\p{Cf}]*$/u.test(text);
}
