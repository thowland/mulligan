// listing/listing.json and listing/listing.txt (spec §8.3): the cleaned listing, traceable to the
// standards that produced it. The JSON form is accepted back by parseListingJson.
import { worstSeverity } from '../findings/summarize.ts';
import type { Finding, Severity } from '../findings/types.ts';
import type { Standards } from '../standards/schema.ts';
import { getStandardsInfo } from '../standards/standards.ts';
import type { Change, FieldResult, ListingResult } from '../text/types.ts';
import { LIBRARY_VERSION } from '../version.ts';

export interface ListingExportMeta {
  /** ISO 8601 timestamp of the export. */
  exportedAt: string;
  /** Per-field options in force (straight quotes), recorded with each field. */
  options?: Readonly<Record<string, { straightQuotes: boolean }>>;
}

export interface ListingExportField {
  value: string;
  count: number;
  limit: number;
  unit: FieldResult['count']['unit'];
  status: Severity;
  findings: Finding[];
  changes: Change[];
  options: { straightQuotes: boolean };
}

export interface ListingExport {
  mulliganListing: 1;
  libraryVersion: string;
  rulesetVersion: string;
  standardsHash: string;
  exportedAt: string;
  locale: string;
  status: Severity;
  fields: Record<string, ListingExportField>;
  listingFindings: Finding[];
}

/** Worst severity across every field and listing-level finding. */
export function listingStatus(result: ListingResult): Severity {
  return worstSeverity([
    ...result.fields.flatMap((f) => f.findings.map((x) => x.severity)),
    ...result.listingFindings.map((x) => x.severity),
  ]);
}

export function buildListingExport(
  result: ListingResult,
  standards: Standards,
  meta: ListingExportMeta,
): ListingExport {
  const { rulesetVersion, standardsHash } = getStandardsInfo();
  const byId = new Map(standards.fields.map((f) => [f.id, f]));
  const fields: Record<string, ListingExportField> = {};
  for (const field of result.fields) {
    const def = byId.get(field.fieldId)!;
    fields[field.fieldId] = {
      value: field.output,
      count: field.count.value,
      limit: field.count.limit,
      unit: field.count.unit,
      status: worstSeverity(field.findings.map((f) => f.severity)),
      findings: field.findings,
      changes: field.changes,
      options: meta.options?.[field.fieldId] ?? { ...def.options },
    };
  }
  return {
    mulliganListing: 1,
    libraryVersion: LIBRARY_VERSION,
    rulesetVersion,
    standardsHash,
    exportedAt: meta.exportedAt,
    locale: result.locale,
    status: listingStatus(result),
    fields,
    listingFindings: result.listingFindings,
  };
}

export function serializeListingJson(
  result: ListingResult,
  standards: Standards,
  meta: ListingExportMeta,
): string {
  return `${JSON.stringify(buildListingExport(result, standards, meta), null, 2)}\n`;
}

/**
 * A plain-text copy sheet: one block per non-empty field, headed by store, label and count,
 * for people to read and copy from.
 */
export function serializeListingText(
  result: ListingResult,
  standards: Standards,
  meta: ListingExportMeta,
): string {
  const { rulesetVersion } = getStandardsInfo();
  const stores = new Map(standards.stores.map((s) => [s.id, s.label]));
  const byId = new Map(standards.fields.map((f) => [f.id, f]));
  const blocks = result.fields
    .filter((field) => field.output !== '')
    .map((field) => {
      const def = byId.get(field.fieldId)!;
      const unit = field.count.unit === 'bytes' ? 'bytes' : 'chars';
      const header = `== ${stores.get(def.store)} · ${def.label} (${field.count.value}/${field.count.limit} ${unit}) ==`;
      return `${header}\n${field.output}\n`;
    });
  const preamble =
    `Mulligan listing · exported ${meta.exportedAt} · ruleset ${rulesetVersion} · ` +
    `library ${LIBRARY_VERSION}\n`;
  return [preamble, ...blocks].join('\n');
}
