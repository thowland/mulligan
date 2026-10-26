// Plain-language notes for every rule in the core catalog, shown on the help page. The rules
// themselves live in @mulligan/core; these only explain them. A test fails when a rule is added to
// the catalog without a note here.
import type { Standards } from '@mulligan/core';
import { SOURCE_LIMITS } from '../../config.ts';
import { formatBytes } from '../format.ts';

type Context = Pick<Standards, 'input' | 'rules'>;
type Note = string | ((context: Context) => string);

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

export const RULE_NOTES: Readonly<Record<string, Note>> = {
  'standards.invalid':
    'The rules file built into Mulligan failed validation, which only happens with a broken build. Reload the page, and report it if it persists.',

  'html.extract':
    'Copy pasted with formatting from Word, Google Docs or a web page is converted to plain text, with paragraphs separated by a blank line, since neither store accepts formatting.',
  'html.list-item':
    'Each item of a bulleted or numbered list in formatted copy becomes its own line, starting with an en dash or its number.',
  'lines.endings':
    'Windows and older Mac line endings are converted to a single line feed, so the rules that work line by line see every source the same way.',
  'chars.nfc':
    'An accented letter stored as a plain letter followed by a separate accent mark is combined into one character. The text looks the same, and the count then matches what the stores count.',
  'chars.invisible':
    'Zero-width spaces, joiners, soft hyphens and byte-order marks are removed. They arrive with copy from documents and web pages, use up the limit, and can interfere with store search.',
  'chars.spaces':
    'Non-breaking, thin and other unusual spaces are replaced with an ordinary space.',
  'chars.emoji': ({ rules }) =>
    `Emoji are removed, together with their skin-tone modifiers and joined sequences, because both stores reject or discourage them in listing copy. ${rules.emoji.preserve.join(', ')} are kept.`,
  'chars.emoji-presentation':
    'The invisible selector that asks for a symbol such as ™ to be drawn as an emoji is removed, and the symbol itself stays.',
  'chars.bullets': ({ rules }) =>
    `In multi-line fields, a bullet character such as • or ▪ at the start of a line, or a * or - followed by a space, is replaced with “${rules.lists.bullet.trim()}”, which both stores display reliably. A * or - elsewhere in a line is left alone.`,
  'chars.quotes':
    'Curly quotes and apostrophes are replaced with straight ones. This runs only on fields where Straighten curly quotes is ticked, and primes such as 5′ are left alone.',
  'ws.trim-lines': 'Spaces and tabs at the start and end of each line are removed.',
  'ws.collapse-spaces':
    'A run of two or more spaces inside a line becomes one, which also closes the gap an emoji leaves behind when it is removed.',
  'lines.rejoin':
    'In multi-line fields, a line break in the middle of a sentence, of the kind copying from a PDF or a hard-wrapped email leaves behind, is replaced with a space. A break is kept after a line that ends in sentence punctuation, before a list item and between paragraphs. A short heading without punctuation is joined to the paragraph after it; revert that change when it happens, and the revert is remembered.',
  'lines.rejoin-hyphen':
    'A word split across two lines at a hyphen, as in “multi-” and “platform”, is rejoined without a space. The hyphen stays, because removing it could change the word.',
  'lines.collapse-blank': 'Two or more blank lines in a row become one.',
  'lines.single-line':
    'A line break in a single-line field is replaced with a space, or with a comma in the keywords field.',
  'ws.trim-field': 'Spaces and blank lines at the very start and end of the field are removed.',
  'keywords.separators':
    'Keywords are separated by a single comma with no spaces around it, and empty entries are dropped, since every space counts against the 100-byte limit. Semicolons and line breaks between keywords become commas; spaces inside a keyword are kept.',

  'text.limit.max':
    'The cleaned text is longer than the store allows. The part past the limit is highlighted. Mulligan never shortens copy, because that would change the wording, so this needs an edit from you or the agency.',
  'text.limit.min': 'The cleaned text is shorter than the minimum the store accepts.',
  'text.required': 'The store requires this field and it is empty.',
  'text.discouraged.all-caps': ({ rules }) =>
    `A word of ${rules.discouraged.allCaps.minLetters} or more letters is written entirely in capitals, which both stores discourage in names and short descriptions.${rules.discouraged.allCaps.allow.length > 0 ? ` Allowed: ${rules.discouraged.allCaps.allow.join(', ')}.` : ''}`,
  'text.discouraged.punctuation':
    'Repeated exclamation marks, question marks or full stops, such as “!!” or “...”, which the stores discourage. A single ellipsis character (…) is allowed.',
  'text.discouraged.terms': ({ rules }) =>
    `A promotional term that the store guidelines discourage in titles and short descriptions, matched as a whole word regardless of case or accents. The terms are ${rules.discouraged.terms.map((t) => `“${t}”`).join(', ')}.`,
  'text.emoji-present':
    'The cleaned text still contains emoji, usually because their removal was reverted.',
  'text.unclassified-chars':
    'A character that is not a letter, number, punctuation mark, common symbol or space, such as ✓, ★ or a private-use character from a symbol font. Some of these are intentional, so Mulligan reports them and leaves the decision to you.',
  'text.newline-in-single-line':
    'A single-line field still contains a line break, usually because a change was reverted.',
  'text.not-normalized':
    'Reported only when copy is checked without being cleaned, a mode meant for the planned command-line tool. The web app always cleans, so this does not appear here.',
  'keywords.duplicate':
    'The same keyword appears more than once, ignoring differences of case and accents.',
  'keywords.overlaps-name':
    'A keyword repeats a word from the App name or Subtitle. Apple already searches those words, so repeating one in keywords uses bytes without adding anything.',
  'integrity.wording':
    'A safeguard: the words and numbers of the cleaned text differ from the source. Cleanup is built never to cause this, so if it appears, keep the source text and report the problem.',
  'import.unknown-field':
    'The template names a field Mulligan does not know, and that row was skipped.',
  'import.malformed': 'The template file could not be read as CSV or JSON.',
  'import.too-large':
    'The template file, or one of the values in it, is larger than Mulligan accepts.',
  'import.duplicate-field':
    'The template names the same field more than once, and the last value was used.',
  'import.unsupported-locale': 'The template is for a locale Mulligan does not support yet.',

  'image.unsupported-type':
    'The file is not a PNG or JPEG. Mulligan judges this from the file’s contents, so a renamed file is caught too.',
  'image.decode-failed':
    'The file looks like a PNG or JPEG but could not be decoded, most often because it is truncated or damaged.',
  'image.too-large': () =>
    `The file is larger than ${formatBytes(SOURCE_LIMITS.maxFileBytes)}, or larger than ${(SOURCE_LIMITS.maxPixels / 1_000_000).toLocaleString('en-US')} million pixels once decoded. The limit protects the browser’s memory.`,
  'image.upscaled': ({ input }) =>
    `The source is smaller than the area it has to fill, so it was enlarged${input.upscaleWarnAbove > 1 ? ` by more than ${input.upscaleWarnAbove}×` : ''} and will look soft. A larger export from the agency fixes it.`,
  'image.crop-loss': ({ input }) =>
    `More than ${percent(input.cropLossWarnAbove)} of the image was cropped away across the direction the crop does not protect, for example a landscape capture cut down to a portrait screenshot. Losing the bottom of a long, top-anchored screenshot is expected and is not reported.`,
  'image.transparency-flattened':
    'The source has transparent areas and the preset does not allow transparency, so they were filled with the preset’s background color, white unless noted.',
  'image.output.dimensions':
    'A check on the rendered file: its dimensions do not match the preset. This points to a fault in Mulligan and should be reported.',
  'image.output.alpha':
    'A check on the rendered file: it has an alpha channel, which the preset does not allow. This points to a fault in Mulligan and should be reported.',
  'image.output.format':
    'A check on the rendered file: it is not in the format the preset requires. This points to a fault in Mulligan and should be reported.',
  'image.output.size':
    'The rendered file is larger than the store’s size limit for this preset, which can happen with very detailed or noisy images. A simpler source image brings it under.',
  'group.count':
    'The number of images is outside the range the store accepts for a selected preset, for example a single Android phone screenshot where Google Play needs at least two.',
  'package.path-collision':
    'A safeguard: two files in the package would have the same name. This points to a fault in the rules file and should be reported.',
  'package.extension':
    'A safeguard: a file in the package would have an unexpected name or extension, so it was left out.',
  'package.entry-type':
    'A safeguard: a file’s contents do not match its extension, checked just before the package is written, so it was left out.',
};

export function ruleNote(ruleId: string, context: Context): string | undefined {
  const note = RULE_NOTES[ruleId];
  return typeof note === 'function' ? note(context) : note;
}
