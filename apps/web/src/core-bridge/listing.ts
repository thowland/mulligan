// Adapter between the listing UI and @mulligan/core text processing. Every decision about the
// copy (cleaning, counting, checks) is made by the library (spec §2, §9.2).
import {
  RULES,
  extractBaseline,
  getStandards,
  processListing,
  type FieldResult,
  type RawFieldInput,
} from '@mulligan/core';

/** The text a rich paste converts to: paragraphs and list markers kept as text. */
export function plainTextOf(input: RawFieldInput): string {
  return extractBaseline(input, getStandards()).baseline;
}

export interface ListingDraft {
  inputs: Readonly<Record<string, RawFieldInput>>;
  straightQuotes: Readonly<Record<string, boolean>>;
}

/** Clean and check every field; results keyed by field id. */
export function cleanListing(draft: ListingDraft): Record<string, FieldResult> {
  const result = processListing({ fields: draft.inputs }, getStandards(), {
    fields: Object.fromEntries(
      Object.entries(draft.straightQuotes).map(([id, straightQuotes]) => [id, { straightQuotes }]),
    ),
  });
  return Object.fromEntries(result.fields.map((field) => [field.fieldId, field]));
}

/** Default value of the straight-quotes option for each field. */
export function straightQuoteDefaults(): Record<string, boolean> {
  return Object.fromEntries(getStandards().fields.map((f) => [f.id, f.options.straightQuotes]));
}

export function ruleTitle(ruleId: string): string {
  return RULES[ruleId]?.title ?? ruleId;
}
