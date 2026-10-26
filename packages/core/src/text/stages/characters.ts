// Character-level stages: line endings, invisible characters, spaces, emoji, NFC, bullets, quotes.
import type { Edit } from '../trace/trace.ts';
import {
  describeCodePoint,
  describeCodePoints,
  graphemes,
  isEmojiGrapheme,
  isInvisible,
  isKeycap,
  keycapText,
  isUnusualSpace,
  isWordChar,
} from '../unicode.ts';
import { editsForMatches, type Stage } from './context.ts';

const all = () => true;
const multiline: Stage['appliesTo'] = ({ field }) => field.multiline;

export const lineEndings: Stage = {
  rules: ['lines.endings'],
  appliesTo: all,
  run: (text) =>
    editsForMatches(
      text,
      // Matching control characters is the point: vertical tab and form feed are line breaks.
      // eslint-disable-next-line no-control-regex
      /\r\n|[\r\u000B\u000C\u0085\u2028\u2029]/gu,
      'lines.endings',
      (m) => (m[0] === '\u2029' ? '\n\n' : '\n'),
      (m) => describeCodePoints(m[0]),
    ),
};

export const invisible: Stage = {
  rules: ['chars.invisible'],
  appliesTo: all,
  run(text, { preserve }) {
    const edits: Edit[] = [];
    for (const { segment, index } of graphemes(text)) {
      if (isEmojiGrapheme(segment, preserve)) continue; // ZWJ and tags inside emoji: stage 5
      let offset = 0;
      for (const char of segment) {
        const cp = char.codePointAt(0)!;
        if (isInvisible(cp)) {
          const start = index + offset;
          const last = edits[edits.length - 1];
          if (last && last.end === start) {
            last.end += char.length;
            last.detail = `${last.detail}, ${describeCodePoint(cp)}`;
          } else {
            edits.push({
              start,
              end: start + char.length,
              replacement: '',
              ruleId: 'chars.invisible',
              detail: describeCodePoint(cp),
            });
          }
        }
        offset += char.length;
      }
    }
    return edits;
  },
};

export const spaces: Stage = {
  rules: ['chars.spaces'],
  appliesTo: all,
  run(text) {
    const edits: Edit[] = [];
    let index = 0;
    for (const char of text) {
      const cp = char.codePointAt(0)!;
      if (isUnusualSpace(cp)) {
        const last = edits[edits.length - 1];
        if (last && last.end === index) {
          last.end += char.length;
          last.replacement += ' ';
          last.detail = `${last.detail}, ${describeCodePoint(cp)}`;
        } else {
          edits.push({
            start: index,
            end: index + char.length,
            replacement: ' ',
            ruleId: 'chars.spaces',
            detail: describeCodePoint(cp),
          });
        }
      }
      index += char.length;
    }
    return edits;
  },
};

export const emoji: Stage = {
  rules: ['chars.emoji', 'chars.emoji-presentation'],
  appliesTo: all,
  run(text, { preserve }) {
    const edits: Edit[] = [];
    const clusters = graphemes(text);
    for (let i = 0; i < clusters.length; i++) {
      const { segment, index } = clusters[i]!;
      if (isKeycap(segment)) {
        // 1\uFE0F\u20E3 is the digit 1 drawn as an emoji: keep the character, drop the presentation.
        edits.push({
          start: index,
          end: index + segment.length,
          replacement: keycapText(segment),
          ruleId: 'chars.emoji',
          detail: `${segment} → ${keycapText(segment)}`,
        });
        continue;
      }
      if (isEmojiGrapheme(segment, preserve)) {
        // Remove a run of adjacent emoji as one change.
        let start = index;
        let end = index + segment.length;
        let j = i;
        while (
          j + 1 < clusters.length &&
          !isKeycap(clusters[j + 1]!.segment) &&
          isEmojiGrapheme(clusters[j + 1]!.segment, preserve)
        ) {
          j += 1;
          end = clusters[j]!.index + clusters[j]!.segment.length;
        }
        // Neighbours as the reader sees them (a keycap cluster reads as its digit).
        const previous = clusters[i - 1]?.segment;
        const next = clusters[j + 1]?.segment;
        const before = previous === undefined ? undefined : lastOf(visibleText(previous));
        const after = next === undefined ? undefined : firstOf(visibleText(next));
        const previousEnd = edits[edits.length - 1]?.end ?? 0;
        let replacement = '';
        if (isWordChar(before) && isWordChar(after)) {
          // Keep words apart: "Great😀app" becomes "Great app", not "Greatapp".
          replacement = ' ';
        } else if (previous === ' ' && !isWordChar(after) && start - 1 >= previousEnd) {
          // "everywhere 🇬🇧!" becomes "everywhere!", and "a 😀 b" becomes "a b".
          start -= 1;
        } else if ((before === undefined || before === '\n') && next === ' ') {
          // "😀 Great" at the start of a line becomes "Great".
          end += 1;
        }
        edits.push({
          start,
          end,
          replacement,
          ruleId: 'chars.emoji',
          detail: text.slice(index, clusters[j]!.index + clusters[j]!.segment.length),
        });
        i = j;
        continue;
      }
      // A presentation selector on anything else (®\uFE0F, ™\uFE0F, a letter) is dropped; the symbol stays.
      // Every selector in the cluster goes, including a stray one with no base character.
      const base = String.fromCodePoint(segment.codePointAt(0)!);
      let offset = 0;
      for (const char of segment) {
        if (char === '\uFE0E' || char === '\uFE0F') {
          const start = index + offset;
          const last = edits[edits.length - 1];
          if (last && last.ruleId === 'chars.emoji-presentation' && last.end === start) {
            last.end += 1;
          } else {
            edits.push({
              start,
              end: start + 1,
              replacement: '',
              ruleId: 'chars.emoji-presentation',
              detail:
                offset === 0
                  ? describeCodePoint(char.codePointAt(0)!)
                  : `${describeCodePoint(char.codePointAt(0)!)} after ${base}`,
            });
          }
        }
        offset += char.length;
      }
    }
    return edits;
  },
};

export const nfc: Stage = {
  rules: ['chars.nfc'],
  appliesTo: all,
  run(text) {
    const edits: Edit[] = [];
    for (const { segment, index } of graphemes(text)) {
      const composed = segment.normalize('NFC');
      if (composed !== segment) {
        edits.push({
          start: index,
          end: index + segment.length,
          replacement: composed,
          ruleId: 'chars.nfc',
          detail: `${describeCodePoints(segment)} → ${describeCodePoints(composed)}`,
        });
      }
    }
    return edits;
  },
};

// Unambiguous bullet glyphs may be followed directly by text; *, - and · need a space. Leading
// spaces are absorbed (line trimming runs later). The private-use code points are the Symbol and
// Wingdings bullets Word emits in plain-text copies of lists.
const BULLETS = /^ *(?:([•▪◦‣○●■□➢➤►▸\uF0B7\uF0A7\uF076\uF0D8\uF0FC]) *|([*·-]) +)/gmu;

export const bullets: Stage = {
  rules: ['chars.bullets'],
  appliesTo: multiline,
  run: (text, { standards }) =>
    editsForMatches(
      text,
      BULLETS,
      'chars.bullets',
      (m) => {
        // A bare glyph with nothing after it on the line is not a list item.
        const after = text.charAt(m.index + m[0].length);
        return after === '' || after === '\n' ? null : standards.rules.lists.bullet;
      },
      (m) => `${describeCodePoint((m[1] ?? m[2])!.codePointAt(0)!)} → en dash`,
    ),
};

const QUOTES: Readonly<Record<string, string>> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
};

export const quotes: Stage = {
  rules: ['chars.quotes'],
  appliesTo: ({ straightQuotes }) => straightQuotes,
  run: (text) =>
    editsForMatches(
      text,
      /[‘’‚‛“”„‟]/gu,
      'chars.quotes',
      (m) => QUOTES[m[0]]!,
      (m) => describeCodePoint(m[0].codePointAt(0)!),
    ),
};

/** The characters of a cluster that render, with a keycap read as its digit. */
function visibleText(cluster: string): string {
  if (isKeycap(cluster)) return keycapText(cluster);
  return Array.from(cluster)
    .filter((c) => c !== '\uFE0E' && c !== '\uFE0F' && !isInvisible(c.codePointAt(0)!))
    .join('');
}

const lastOf = (s: string): string | undefined => Array.from(s).pop();
const firstOf = (s: string): string | undefined => Array.from(s)[0];
