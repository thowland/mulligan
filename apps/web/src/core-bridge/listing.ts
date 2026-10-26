// Adapter between the listing UI and @mulligan/core text processing. Every decision about the
// copy (cleaning, counting, checks, import, export) is made by the library (spec §2, §9.2).
import {
  IMPORT_LIMITS,
  RULES,
  extractBaseline,
  getStandards,
  listingStatus,
  parseListingFile,
  processListing,
  serializeListingJson,
  serializeListingText,
  type ChangeId,
  type FieldResult,
  type Finding,
  type ImportFileResult,
  type ListingResult,
  type RawFieldInput,
  type Severity,
} from '@mulligan/core';

/** The text a rich paste converts to: paragraphs and list markers kept as text. */
export function plainTextOf(input: RawFieldInput): string {
  return extractBaseline(input, getStandards()).baseline;
}

export interface ListingDraft {
  inputs: Readonly<Record<string, RawFieldInput>>;
  straightQuotes: Readonly<Record<string, boolean>>;
  /** Reverted change ids per field. */
  reverted?: Readonly<Record<string, readonly ChangeId[]>>;
}

/** Clean and check the whole listing. */
export function processDraft(draft: ListingDraft): ListingResult {
  const ids = new Set([...Object.keys(draft.straightQuotes), ...Object.keys(draft.reverted ?? {})]);
  const fields: Record<string, { straightQuotes?: boolean; suppress?: ReadonlySet<ChangeId> }> = {};
  for (const id of ids) {
    const straightQuotes = draft.straightQuotes[id];
    const reverted = draft.reverted?.[id];
    fields[id] = {
      ...(straightQuotes === undefined ? {} : { straightQuotes }),
      ...(reverted && reverted.length > 0 ? { suppress: new Set(reverted) } : {}),
    };
  }
  return processListing({ fields: draft.inputs }, getStandards(), { fields });
}

/** Clean and check every field; results keyed by field id. */
export function cleanListing(draft: ListingDraft): Record<string, FieldResult> {
  return Object.fromEntries(processDraft(draft).fields.map((field) => [field.fieldId, field]));
}

/** Default value of the straight-quotes option for each field. */
export function straightQuoteDefaults(): Record<string, boolean> {
  return Object.fromEntries(getStandards().fields.map((f) => [f.id, f.options.straightQuotes]));
}

export function ruleTitle(ruleId: string): string {
  return RULES[ruleId]?.title ?? ruleId;
}

/** Whether any field has copy: only then does the listing count towards status and the package. */
export function hasListingInput(inputs: Readonly<Record<string, RawFieldInput>>): boolean {
  return Object.values(inputs).some((input) => input.text.trim() !== '' || !!input.html?.trim());
}

export interface ListingExportFiles {
  json: string;
  txt: string;
  status: Severity;
  findings: Finding[];
}

/** listing.json and listing.txt for the package (spec §8.3). */
export function exportListing(draft: ListingDraft, now: Date): ListingExportFiles {
  const standards = getStandards();
  const result = processDraft(draft);
  const meta = {
    exportedAt: now.toISOString(),
    options: Object.fromEntries(
      standards.fields.map((f) => [
        f.id,
        { straightQuotes: draft.straightQuotes[f.id] ?? f.options.straightQuotes },
      ]),
    ),
  };
  return {
    json: serializeListingJson(result, standards, meta),
    txt: serializeListingText(result, standards, meta),
    status: listingStatus(result),
    findings: [...result.fields.flatMap((field) => field.findings), ...result.listingFindings],
  };
}

export function listingFindings(draft: ListingDraft): Finding[] {
  const result = processDraft(draft);
  return [...result.fields.flatMap((field) => field.findings), ...result.listingFindings];
}

export const MAX_IMPORT_BYTES = IMPORT_LIMITS.maxBytes;

/** Decodes and parses an imported CSV or JSON template. */
export function importListingFile(bytes: Uint8Array, fileName: string): ImportFileResult {
  return parseListingFile(bytes, fileName, getStandards());
}

export function fieldLabel(fieldId: string): string {
  return getStandards().fields.find((f) => f.id === fieldId)?.label ?? fieldId;
}

/** Ids of the fields defined by the current standards. */
export function knownFieldIds(): Set<string> {
  return new Set(getStandards().fields.map((f) => f.id));
}

/**
 * Keeps only the reverted change ids that still exist for each field's current input. Ids can
 * go stale when a rules update changes extraction or normalization (spec §9.5).
 */
export function pruneReverts(draft: ListingDraft): {
  reverted: Record<string, ChangeId[]>;
  dropped: number;
} {
  const results = cleanListing(draft);
  const reverted: Record<string, ChangeId[]> = {};
  let dropped = 0;
  for (const [fieldId, ids] of Object.entries(draft.reverted ?? {})) {
    const valid = new Set(
      results[fieldId]?.changes.filter((c) => c.revertible).map((c) => c.id) ?? [],
    );
    const kept = ids.filter((id) => valid.has(id));
    dropped += ids.length - kept.length;
    if (kept.length > 0) reverted[fieldId] = kept;
  }
  return { reverted, dropped };
}
