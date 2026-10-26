// Whitespace and line stages: trimming, collapsing, rejoining hard wraps, single-line fields.
import type { Edit } from '../trace/trace.ts';
import { editsForMatches, type Stage } from './context.ts';

const all = () => true;

// Trimming scans by hand: `/ +$/m` backtracks quadratically on long runs of spaces (spec §10.4).
export const trimLines: Stage = {
  rules: ['ws.trim-lines'],
  appliesTo: all,
  run(text) {
    const edits: Edit[] = [];
    let lineStart = 0;
    while (lineStart <= text.length) {
      const newline = text.indexOf('\n', lineStart);
      const lineEnd = newline < 0 ? text.length : newline;
      let lead = lineStart;
      while (lead < lineEnd && text[lead] === ' ') lead += 1;
      if (lead === lineEnd) {
        if (lead > lineStart) edits.push(trim(lineStart, lineEnd, 'ws.trim-lines'));
      } else {
        let trail = lineEnd;
        while (text[trail - 1] === ' ') trail -= 1;
        if (lead > lineStart) edits.push(trim(lineStart, lead, 'ws.trim-lines'));
        if (trail < lineEnd) edits.push(trim(trail, lineEnd, 'ws.trim-lines'));
      }
      if (newline < 0) break;
      lineStart = newline + 1;
    }
    return edits;
  },
};

function trim(start: number, end: number, ruleId: string): Edit {
  return { start, end, replacement: '', ruleId };
}

export const collapseSpaces: Stage = {
  rules: ['ws.collapse-spaces'],
  appliesTo: all,
  run: (text) => editsForMatches(text, / {2,}/g, 'ws.collapse-spaces', () => ' '),
};

export const rejoin: Stage = {
  rules: ['lines.rejoin', 'lines.rejoin-hyphen'],
  appliesTo: ({ field }) => field.multiline,
  run(text, { standards }) {
    const { terminal, listItemPattern, joinHyphenated } = standards.rules.rejoin;
    const terminalChars = new Set(Array.from(terminal));
    const listItem = new RegExp(listItemPattern, 'u');
    const lines = text.split('\n');
    const edits: Edit[] = [];
    let offset = 0;
    // Decisions look at the line as joined so far, so a second pass makes the same decisions.
    // Only its tail and whether it has words matter; tracking those keeps the stage linear.
    const WORD = /[\p{L}\p{N}]/u;
    const TAIL = 24;
    let previous = summarize(lines[0]!);
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!;
      const next = lines[i + 1]!;
      const breakAt = offset + line.length;
      offset = breakAt + 1;
      const before = previous;
      previous = summarize(next);
      if (before.empty || next === '') continue; // paragraph separator
      const last = Array.from(before.tail).pop()!;
      // A line without words (a stray bullet, a rule of dashes) is not a wrapped sentence.
      if (terminalChars.has(last) || listItem.test(next) || !before.hasWords) continue;
      const hyphenated = joinHyphenated && /\p{L}-$/u.test(before.tail) && /^\p{L}/u.test(next);
      const separator = hyphenated ? '' : ' ';
      previous = {
        empty: false,
        hasWords: true,
        tail: `${before.tail}${separator}${next.slice(-TAIL)}`.slice(-TAIL),
      };
      edits.push({
        start: breakAt,
        end: breakAt + 1,
        replacement: separator,
        ruleId: hyphenated ? 'lines.rejoin-hyphen' : 'lines.rejoin',
        detail: `…${before.tail.slice(-20)}⏎${next.slice(0, 20)}…`,
      });
    }
    return edits;

    function summarize(lineText: string) {
      return { empty: lineText === '', hasWords: WORD.test(lineText), tail: lineText.slice(-TAIL) };
    }
  },
};

export const collapseBlank: Stage = {
  rules: ['lines.collapse-blank'],
  appliesTo: ({ field }) => field.multiline,
  run: (text) => editsForMatches(text, /\n{3,}/g, 'lines.collapse-blank', () => '\n\n'),
};

export const singleLine: Stage = {
  rules: ['lines.single-line'],
  appliesTo: ({ field }) => !field.multiline && field.kind === 'text',
  run: (text) =>
    editsForMatches(text, /[ \n]*\n[ \n]*/g, 'lines.single-line', (m) =>
      m.index === 0 || m.index + m[0].length === text.length ? '' : ' ',
    ),
};

export const trimField: Stage = {
  rules: ['ws.trim-field'],
  appliesTo: all,
  run(text) {
    const isSpace = (c: string | undefined) => c === ' ' || c === '\n';
    let lead = 0;
    while (lead < text.length && isSpace(text[lead])) lead += 1;
    if (lead === text.length) return lead > 0 ? [trim(0, lead, 'ws.trim-field')] : [];
    let trail = text.length;
    while (isSpace(text[trail - 1])) trail -= 1;
    const edits: Edit[] = [];
    if (lead > 0) edits.push(trim(0, lead, 'ws.trim-field'));
    if (trail < text.length) edits.push(trim(trail, text.length, 'ws.trim-field'));
    return edits;
  },
};

const SEPARATORS = new Set([' ', '\n', ',', ';', '，', '、']);

/**
 * keywords.separators: every run of separator characters that contains a comma, semicolon,
 * full-width comma, ideographic comma or line break becomes a single comma; such runs at either
 * end are dropped. Spaces inside a keyword are kept. Scans once, so it is linear-time.
 */
export const keywordSeparators: Stage = {
  rules: ['keywords.separators'],
  appliesTo: ({ field }) => field.kind === 'keywords',
  run(text) {
    const edits: Edit[] = [];
    let i = 0;
    while (i < text.length) {
      if (!SEPARATORS.has(text[i]!)) {
        i += 1;
        continue;
      }
      const start = i;
      let separating = false;
      while (i < text.length && SEPARATORS.has(text[i]!)) {
        if (text[i] !== ' ') separating = true;
        i += 1;
      }
      if (!separating) continue;
      const atEdge = start === 0 || i === text.length;
      const replacement = atEdge ? '' : ',';
      if (text.slice(start, i) !== replacement) {
        edits.push({ start, end: i, replacement, ruleId: 'keywords.separators' });
      }
    }
    return edits;
  },
};
