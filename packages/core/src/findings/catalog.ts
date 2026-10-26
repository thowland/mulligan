import type { Severity } from './types.ts';

export type RuleKind = 'change' | 'check';

export interface RuleInfo {
  id: string;
  kind: RuleKind;
  title: string;
  /** Severity a check reports when it does not pass. Changes carry no severity. */
  severity?: Exclude<Severity, 'pass'>;
}

const change = (id: string, title: string): RuleInfo => ({ id, kind: 'change', title });
const check = (id: string, severity: Exclude<Severity, 'pass'>, title: string): RuleInfo => ({
  id,
  kind: 'check',
  severity,
  title,
});

const entries: readonly RuleInfo[] = [
  // Standards
  check('standards.invalid', 'failure', 'Standards configuration is invalid'),

  // Text changes (spec §5.2, §6.4)
  change('html.extract', 'HTML converted to text'),
  change('html.list-item', 'List item converted to a bullet line'),
  change('lines.endings', 'Line endings normalized'),
  change('chars.nfc', 'Unicode composed (NFC)'),
  change('chars.invisible', 'Invisible character removed'),
  change('chars.spaces', 'Unusual space replaced'),
  change('chars.emoji', 'Emoji removed'),
  change('chars.emoji-presentation', 'Emoji presentation selector removed'),
  change('chars.bullets', 'Bullet replaced with en dash'),
  change('chars.quotes', 'Curly quote straightened'),
  change('ws.trim-lines', 'Line trimmed'),
  change('ws.collapse-spaces', 'Repeated spaces collapsed'),
  change('lines.rejoin', 'Hard-wrapped line rejoined'),
  change('lines.rejoin-hyphen', 'Hyphenated line break rejoined'),
  change('lines.collapse-blank', 'Blank lines collapsed'),
  change('lines.single-line', 'Line break removed from single-line field'),
  change('ws.trim-field', 'Field trimmed'),
  change('keywords.separators', 'Keyword separators normalized'),

  // Text checks
  check('text.limit.max', 'failure', 'Text exceeds the field limit'),
  check('text.limit.min', 'failure', 'Text is shorter than the field minimum'),
  check('text.required', 'failure', 'Required field is empty'),
  check('text.discouraged.all-caps', 'warning', 'Word in capitals'),
  check('text.discouraged.punctuation', 'warning', 'Repeated punctuation'),
  check('text.discouraged.terms', 'warning', 'Promotional term'),
  check('text.emoji-present', 'warning', 'Emoji present'),
  check('text.unclassified-chars', 'warning', 'Unclassified characters'),
  check('text.newline-in-single-line', 'failure', 'Line break in single-line field'),
  check('text.not-normalized', 'warning', 'Text is not normalized'),
  check('keywords.duplicate', 'warning', 'Duplicate keyword'),
  check('keywords.overlaps-name', 'warning', 'Keyword repeats a word from the name or subtitle'),
  check('integrity.wording', 'failure', 'Wording changed during normalization'),
  check('import.unknown-field', 'warning', 'Unknown field in template'),
  check('import.malformed', 'failure', 'Template could not be parsed'),

  // Image checks (spec §5.2, §7)
  check('image.unsupported-type', 'failure', 'Unsupported file type'),
  check('image.decode-failed', 'failure', 'Image could not be decoded'),
  check('image.too-large', 'failure', 'Image exceeds size limits'),
  check('image.upscaled', 'warning', 'Image upscaled'),
  check('image.crop-loss', 'warning', 'Large part of the image cropped away'),
  check('image.transparency-flattened', 'warning', 'Transparency flattened'),
  check('image.output.dimensions', 'failure', 'Output dimensions do not match the preset'),
  check('image.output.alpha', 'failure', 'Output has an alpha channel'),
  check('image.output.format', 'failure', 'Output format does not match the preset'),
  check('image.output.size', 'failure', 'Output file is too large'),
  check('group.count', 'warning', 'Number of images outside the store range'),
];

export const RULES: Readonly<Record<string, RuleInfo>> = Object.freeze(
  Object.fromEntries(entries.map((rule) => [rule.id, Object.freeze(rule)])),
);

export function isChangeRule(id: string): boolean {
  return RULES[id]?.kind === 'change';
}
