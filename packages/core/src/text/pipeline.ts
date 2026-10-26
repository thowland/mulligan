import type { Finding, Subject } from '../findings/types.ts';
import type { FieldDef, Standards } from '../standards/schema.ts';
import {
  checkCharacters,
  checkDiscouraged,
  checkKeywordDuplicates,
  checkKeywordOverlap,
  checkLimits,
  finding,
  type CheckContext,
} from './checks/checks.ts';
import { countText, overflowOffset } from './count.ts';
import { extractBaseline } from './extract/extract.ts';
import {
  bullets,
  emoji,
  invisible,
  lineEndings,
  nfc,
  quotes,
  spaces,
} from './stages/characters.ts';
import type { Stage, StageContext } from './stages/context.ts';
import {
  collapseBlank,
  collapseSpaces,
  keywordSeparators,
  rejoin,
  singleLine,
  trimField,
  trimLines,
} from './stages/whitespace.ts';
import { Trace } from './trace/trace.ts';
import type {
  Change,
  FieldResult,
  ListingInput,
  ListingOptions,
  ListingResult,
  NormalizeOptions,
  RawFieldInput,
} from './types.ts';
import {
  graphemes,
  isEmojiGrapheme,
  isInvisible,
  isKeycap,
  keycapText,
  isVariationSelector,
} from './unicode.ts';

/**
 * Stage order (spec §6.4). NFC runs after invisible-character and emoji removal, because removing
 * a character can bring a base letter next to a combining mark; composing afterwards keeps
 * normalization idempotent.
 */
export const STAGES: readonly Stage[] = [
  lineEndings,
  invisible,
  spaces,
  emoji,
  nfc,
  bullets,
  quotes,
  trimLines,
  collapseSpaces,
  rejoin,
  collapseBlank,
  singleLine,
  trimField,
  keywordSeparators,
];

const NO_SUPPRESSION: ReadonlySet<string> = new Set();

/** Normalize and check one field (spec §6). Pure: no side effects. */
export function normalizeField(
  input: RawFieldInput,
  field: FieldDef,
  standards: Standards,
  options: NormalizeOptions = {},
): FieldResult {
  const preserve = new Set(standards.rules.emoji.preserve);
  const context: StageContext = {
    field,
    standards,
    preserve,
    straightQuotes: options.straightQuotes ?? field.options.straightQuotes,
  };

  const extraction = extractBaseline(input, standards);
  const trace = new Trace(
    extraction.baseline,
    options.suppress ?? NO_SUPPRESSION,
    standards.rules.revertible,
  );
  for (const stage of STAGES) {
    if (stage.appliesTo(context)) trace.apply(stage.run(trace.text, context));
  }

  const output = trace.text;
  const extractionChanges: Change[] = extraction.changes.map((change) => ({
    id: `${change.ruleId}@${change.baselineSpan.start}:${change.baselineSpan.end}`,
    ruleId: change.ruleId,
    baselineSpan: change.baselineSpan,
    outputSpan:
      change.ruleId === 'html.extract'
        ? { start: 0, end: output.length }
        : trace.outputSpanOfBaseline(change.baselineSpan),
    before: change.before,
    after: change.after,
    revertible: false,
    reverted: false,
    ...(change.detail === undefined ? {} : { detail: change.detail }),
  }));
  const changes = [...extractionChanges, ...trace.changes()];

  const mode = options.mode ?? 'fix';
  const evaluated = mode === 'check' ? extraction.baseline : output;
  const checkContext: CheckContext = {
    field,
    standards,
    preserve,
    subject: {
      kind: 'field',
      fieldId: field.id,
      store: field.store,
      locale: options.locale ?? standards.locales.default,
    },
  };

  const findings: Finding[] = [
    ...checkLimits(evaluated, checkContext),
    ...checkDiscouraged(evaluated, checkContext),
    ...checkCharacters(evaluated, checkContext),
    ...checkKeywordDuplicates(evaluated, checkContext),
    integrityFinding(extraction.baseline, output, preserve, checkContext.subject),
  ];
  if (mode === 'check') {
    const applied = trace.changes().filter((c) => !c.reverted).length;
    findings.push(
      finding(
        'text.not-normalized',
        applied === 0,
        checkContext,
        applied === 0
          ? 'Text is already normalized.'
          : `Normalizing would make ${applied} ${applied === 1 ? 'change' : 'changes'}.`,
        { changes: applied },
      ),
    );
  }

  return {
    fieldId: field.id,
    baseline: extraction.baseline,
    output,
    changes,
    findings,
    count: {
      value: countText(evaluated, field.limit.unit, standards),
      limit: field.limit.max,
      unit: field.limit.unit,
      overflowAt: overflowOffset(evaluated, field.limit, standards),
    },
  };
}

/** Normalize and check every field of a listing, then run cross-field checks (spec §6.6). */
export function processListing(
  listing: ListingInput,
  standards: Standards,
  options: ListingOptions = {},
): ListingResult {
  const locale = listing.locale ?? standards.locales.default;
  const results = standards.fields.map((field) =>
    normalizeField(listing.fields[field.id] ?? { text: '' }, field, standards, {
      ...options.fields?.[field.id],
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      locale,
    }),
  );

  const byId = new Map(results.map((result) => [result.fieldId, result]));
  const evaluated = (id: string) => {
    const result = byId.get(id)!;
    return options.mode === 'check' ? result.baseline : result.output;
  };
  for (const field of standards.fields) {
    if (field.kind !== 'keywords' || field.related.length === 0) continue;
    const related = field.related.map((id) => ({
      label: standards.fields.find((f) => f.id === id)!.label,
      text: evaluated(id),
    }));
    byId.get(field.id)!.findings.push(
      checkKeywordOverlap(evaluated(field.id), related, {
        field,
        standards,
        preserve: new Set(standards.rules.emoji.preserve),
        subject: { kind: 'field', fieldId: field.id, store: field.store, locale },
      }),
    );
  }

  return { locale, fields: results, listingFindings: [] };
}

const LINE_BREAKS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);
// Enclosing marks (the keycap U+20E3) are emoji presentation, not part of a word.
const ENCLOSING_MARK = /\p{Me}/u;

// Joiners and tag characters build emoji sequences, so they survive until clusters are formed.
const EMOJI_BUILDERS = /[\u200D\u{E0020}-\u{E007F}]/u;

/**
 * The words a reader sees: letters, digits and marks, with invisible characters and
 * presentation selectors dropped and emoji and line breaks treated as separators. Invisible
 * characters go first, as they never render, so clusters form as the reader sees them.
 */
export function wordTokens(text: string, preserve: ReadonlySet<string>): string[] {
  let rendered = '';
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (LINE_BREAKS.has(cp)) rendered += ' ';
    else if (!isInvisible(cp) || EMOJI_BUILDERS.test(char)) rendered += char;
  }
  let visible = '';
  for (const { segment } of graphemes(rendered)) {
    if (isKeycap(segment)) {
      visible += keycapText(segment);
      continue;
    }
    if (isEmojiGrapheme(segment, preserve)) {
      visible += ' ';
      continue;
    }
    for (const char of segment) {
      const cp = char.codePointAt(0)!;
      if (LINE_BREAKS.has(cp)) visible += ' ';
      else if (!isInvisible(cp) && !isVariationSelector(cp) && !ENCLOSING_MARK.test(char)) {
        visible += char;
      }
    }
  }
  // A word starts with a letter or digit; marks count only when attached to one, so an orphaned
  // combining mark (which renders on nothing) is not a word.
  return Array.from(
    visible.normalize('NFC').matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu),
    (m) => m[0],
  );
}

/** integrity.wording (spec §6.7): the word sequence must survive normalization unchanged. */
export function integrityFinding(
  baseline: string,
  output: string,
  preserve: ReadonlySet<string>,
  subject: Subject,
): Finding {
  const before = wordTokens(baseline, preserve);
  const after = wordTokens(output, preserve);
  let differs = before.length !== after.length ? Math.min(before.length, after.length) : -1;
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    if (before[i] !== after[i]) {
      differs = i;
      break;
    }
  }
  if (differs < 0) {
    return finding('integrity.wording', true, { subject }, 'Wording is unchanged.');
  }
  return finding(
    'integrity.wording',
    false,
    { subject },
    `Wording changed at word ${differs + 1} (“${before[differs] ?? ''}” → “${after[differs] ?? ''}”). This is a Mulligan defect; please report it.`,
    { word: differs + 1 },
  );
}
