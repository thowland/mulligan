// Character classes shared by normalization stages and checks (spec §6.4, §6.6).

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export interface Grapheme {
  segment: string;
  index: number;
}

export function graphemes(text: string): Grapheme[] {
  return Array.from(segmenter.segment(text), ({ segment, index }) => ({ segment, index }));
}

// A keycap cluster: a base character, any presentation selectors, the enclosing keycap, and
// whatever else the cluster absorbed (extra selectors, a joiner).
const KEYCAP = /^[0-9#*][\uFE0E\uFE0F]*\u20E3/u;

/** A keycap emoji (1\uFE0F\u20E3, #\uFE0F\u20E3): its text is the base character. */
export const isKeycap = (g: string): boolean => KEYCAP.test(g);

/**
 * The text of a keycap cluster: its base character plus anything the cluster absorbed after the
 * keycap, without presentation selectors or invisible characters.
 */
export function keycapText(g: string): string {
  const rest = g.slice(g.indexOf('\u20E3') + 1);
  return (
    g.charAt(0) +
    Array.from(rest)
      .filter((c) => c !== '\uFE0E' && c !== '\uFE0F' && !isInvisible(c.codePointAt(0)!))
      .join('')
  );
}
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const TAG = /[\u{E0020}-\u{E007F}]/u;
const PRESENTATION_SELECTORS = /^[\uFE0E\uFE0F]+$/u;

/**
 * Whether a grapheme cluster is an emoji that should be removed. Code points in `preserve`
 * (®, ™, ©) are never emoji, with or without a presentation selector.
 */
export function isEmojiGrapheme(g: string, preserve: ReadonlySet<string>): boolean {
  const first = String.fromCodePoint(g.codePointAt(0)!);
  if (
    preserve.has(first) &&
    (g.length === first.length || PRESENTATION_SELECTORS.test(g.slice(first.length)))
  ) {
    return false;
  }
  if (KEYCAP.test(g) || REGIONAL_INDICATOR.test(g) || EMOJI_PRESENTATION.test(g)) return true;
  return PICTOGRAPHIC.test(g) && (g.includes('\uFE0F') || g.includes('\u200D') || TAG.test(g));
}

// Prepended concatenation marks are format characters that render visibly; keep them.
const VISIBLE_FORMAT = new Set([
  0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x06dd, 0x070f, 0x0890, 0x0891, 0x08e2, 0x110bd,
  0x110cd,
]);
const FORMAT_OR_CONTROL = /[\p{Cf}\p{Cc}]/u;

/** Invisible format and control characters removed by chars.invisible (not \n or \t). */
export function isInvisible(cp: number): boolean {
  if (cp === 0x0a || cp === 0x09 || VISIBLE_FORMAT.has(cp)) return false;
  return FORMAT_OR_CONTROL.test(String.fromCodePoint(cp));
}

const UNUSUAL_SPACES = new Set([
  0x09, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

/** Space characters replaced with an ordinary space by chars.spaces. */
export function isUnusualSpace(cp: number): boolean {
  return UNUSUAL_SPACES.has(cp);
}

export function isVariationSelector(cp: number): boolean {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}

const ALLOWED_CLASSES = /[\p{L}\p{M}\p{N}\p{P}\p{Sc}\p{Sm}\p{Sk}]/u;
const ALLOWED_SYMBOLS = new Set(['°', '№', '℃', '℉', '℗', '℠', '¦']);

/** Whether a character is in the allowed classes of spec §6.6. */
export function isClassified(char: string, preserve: ReadonlySet<string>): boolean {
  if (char === ' ' || char === '\n') return true;
  if (preserve.has(char) || ALLOWED_SYMBOLS.has(char)) return true;
  return ALLOWED_CLASSES.test(char);
}

const NAMES: Readonly<Record<number, string>> = {
  0x09: 'CHARACTER TABULATION',
  0x0b: 'LINE TABULATION',
  0x0c: 'FORM FEED',
  0x0d: 'CARRIAGE RETURN',
  0x85: 'NEXT LINE',
  0xa0: 'NO-BREAK SPACE',
  0xad: 'SOFT HYPHEN',
  0x061c: 'ARABIC LETTER MARK',
  0x2002: 'EN SPACE',
  0x2003: 'EM SPACE',
  0x2007: 'FIGURE SPACE',
  0x2009: 'THIN SPACE',
  0x200a: 'HAIR SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x202f: 'NARROW NO-BREAK SPACE',
  0x205f: 'MEDIUM MATHEMATICAL SPACE',
  0x2060: 'WORD JOINER',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
  0x2605: 'BLACK STAR',
  0x2713: 'CHECK MARK',
  0x3000: 'IDEOGRAPHIC SPACE',
  0xfe0e: 'VARIATION SELECTOR-15',
  0xfe0f: 'VARIATION SELECTOR-16',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
};

/** `U+200B ZERO WIDTH SPACE`, or `U+XXXX` when the name is not in the short table. */
export function describeCodePoint(cp: number): string {
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  const name = NAMES[cp];
  return name ? `${hex} ${name}` : hex;
}

export function describeCodePoints(text: string): string {
  return Array.from(text, (c) => describeCodePoint(c.codePointAt(0)!)).join(', ');
}

/** Lowercase, with accents stripped: used for whole-word and duplicate matching. */
export function foldChar(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Folded text plus a map from each folded UTF-16 index to its index in the source. */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const f = foldChar(char);
    for (let i = 0; i < f.length; i++) map.push(index);
    folded += f;
    index += char.length;
  }
  return { folded, map };
}

export const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}\p{M}]/u.test(char);
