// Listing template import (spec §6.9, §10.4). Templates are data: every value is checked against
// the standards' field ids, nothing is looked up by a user-supplied key on a plain object, and
// sizes are capped. Imported values then go through normalizeField like pasted text.
import { z } from 'zod';
import { RULES } from '../findings/catalog.ts';
import type { Finding, Subject } from '../findings/types.ts';
import type { FieldDef, Standards } from '../standards/schema.ts';
import type { RawFieldInput } from '../text/types.ts';
import { CsvError, parseCsv } from './csv.ts';
import { decodeTextBytes, type TextEncodingName } from './decode.ts';

/** Size caps for imported files and values (spec §10.4). */
export const IMPORT_LIMITS = Object.freeze({ maxBytes: 1_048_576, maxValueLength: 20_000 });

export type ImportFormat = 'json-template' | 'json-export' | 'csv';

export interface ImportResult {
  /** False when nothing could be imported because the file itself is unusable. */
  ok: boolean;
  format: ImportFormat | null;
  locale: string;
  /** Imported values by field id, in configuration order; only fields with a value appear. */
  fields: Record<string, RawFieldInput>;
  findings: Finding[];
}

export interface ImportFileResult extends ImportResult {
  encoding: TextEncodingName | null;
}

const LISTING: Subject = { kind: 'listing' };

// A value that carries markup is treated as an HTML paste, so its paragraph and list structure is
// interpreted rather than kept as literal tags.
const LOOKS_LIKE_HTML =
  /<\/?(?:p|br|li|ul|ol|div|span|b|i|u|em|strong|h[1-6]|a|table|tr|td|th)(?:\s[^<>]*)?\/?>/i;

function problem(ruleId: string, message: string, data?: Finding['data'], subject = LISTING) {
  return {
    ruleId,
    severity: RULES[ruleId]!.severity!,
    subject,
    message,
    ...(data ? { data } : {}),
  } satisfies Finding;
}

const fieldSubject = (field: FieldDef, locale: string): Subject => ({
  kind: 'field',
  fieldId: field.id,
  store: field.store,
  locale,
});

/** Collects imported values against the standards' fields, whatever the file format. */
class Collector {
  readonly findings: Finding[] = [];
  readonly locale: string;
  private readonly standards: Standards;
  private readonly byId: ReadonlyMap<string, FieldDef>;
  private readonly values = new Map<string, string>();

  constructor(standards: Standards, locale: string) {
    this.standards = standards;
    this.locale = locale;
    this.byId = new Map(standards.fields.map((f) => [f.id, f]));
  }

  add(rawId: string, value: string, where: string): void {
    const id = rawId.trim();
    if (id === '') return;
    const field = this.byId.get(id);
    if (!field) {
      this.findings.push(
        problem(
          'import.unknown-field',
          `${where}: "${truncate(id)}" is not a listing field; it was ignored.`,
          { field: truncate(id) },
        ),
      );
      return;
    }
    if (value.length > IMPORT_LIMITS.maxValueLength) {
      this.findings.push(
        problem(
          'import.too-large',
          `${where}: the ${field.label} value is ${value.length} characters, over the ${IMPORT_LIMITS.maxValueLength}-character import limit; it was ignored.`,
          { length: value.length, limit: IMPORT_LIMITS.maxValueLength },
          fieldSubject(field, this.locale),
        ),
      );
      return;
    }
    if (value.trim() === '') return;
    if (this.values.has(id)) {
      this.findings.push(
        problem(
          'import.duplicate-field',
          `${where}: ${field.label} appears more than once; the last value was used.`,
          { field: id },
          fieldSubject(field, this.locale),
        ),
      );
    }
    this.values.set(id, value);
  }

  result(format: ImportFormat): ImportResult {
    const fields: Record<string, RawFieldInput> = {};
    for (const field of this.standards.fields) {
      const value = this.values.get(field.id);
      if (value === undefined) continue;
      fields[field.id] = LOOKS_LIKE_HTML.test(value)
        ? { text: value, html: value }
        : { text: value };
    }
    return { ok: true, format, locale: this.locale, fields, findings: this.findings };
  }
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function failed(findings: Finding[], standards: Standards, format: ImportFormat | null = null) {
  return {
    ok: false,
    format,
    locale: standards.locales.default,
    fields: {},
    findings,
  } satisfies ImportResult;
}

function malformed(message: string, standards: Standards, format: ImportFormat | null = null) {
  return failed([problem('import.malformed', message)], standards, format);
}

/** Resolves a template's locale; an unsupported one is reported and the file is not imported. */
function resolveLocale(
  locale: string | undefined,
  standards: Standards,
): { ok: true; locale: string } | { ok: false; finding: Finding } {
  const value = locale?.trim() || standards.locales.default;
  if (standards.locales.supported.includes(value)) return { ok: true, locale: value };
  return {
    ok: false,
    finding: problem(
      'import.unsupported-locale',
      `Locale "${truncate(value)}" is not supported (supported: ${standards.locales.supported.join(', ')}).`,
      { locale: truncate(value) },
    ),
  };
}

const plainObject = z.custom<Record<string, unknown>>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  'must be an object',
);

const templateSchema = z.strictObject({
  mulliganTemplate: z.literal(1),
  locale: z.string().optional(),
  fields: plainObject,
});

// The export (spec §8.3) carries versions, counts and findings; only the values are imported.
const exportSchema = z.looseObject({
  mulliganListing: z.literal(1),
  locale: z.string().optional(),
  fields: plainObject,
});

/** Parses the JSON template, or a `listing.json` export (spec §6.9, §8.3). */
export function parseListingJson(text: string, standards: Standards): ImportResult {
  if (text.length > IMPORT_LIMITS.maxBytes) {
    return malformed('The file is larger than the 1 MB import limit.', standards);
  }
  let document: unknown;
  try {
    document = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    return malformed(
      `The file is not valid JSON (${error instanceof Error ? error.message : 'parse error'}).`,
      standards,
    );
  }

  const isExport =
    typeof document === 'object' && document !== null && Object.hasOwn(document, 'mulliganListing');
  const parsed = (isExport ? exportSchema : templateSchema).safeParse(document);
  const format: ImportFormat = isExport ? 'json-export' : 'json-template';
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const path = issue.path.map(String).join('.');
    return malformed(
      `The file is not a Mulligan listing template (${path ? `${path}: ` : ''}${issue.message}).`,
      standards,
      format,
    );
  }

  const locale = resolveLocale(parsed.data.locale, standards);
  if (!locale.ok) return failed([locale.finding], standards, format);
  const collector = new Collector(standards, locale.locale);
  for (const [id, entry] of Object.entries(parsed.data.fields)) {
    const value =
      isExport && typeof entry === 'object' && entry !== null && Object.hasOwn(entry, 'value')
        ? (entry as { value: unknown }).value
        : entry;
    if (typeof value !== 'string') {
      collector.findings.push(
        problem(
          'import.malformed',
          `fields.${truncate(id)}: the value must be text; it was ignored.`,
        ),
      );
      continue;
    }
    collector.add(id, value, `fields.${truncate(id)}`);
  }
  return collector.result(format);
}

/** Parses the CSV template: a header with `field` and `value` columns, optional `locale`. */
export function parseListingCsv(text: string, standards: Standards): ImportResult {
  if (text.length > IMPORT_LIMITS.maxBytes) {
    return malformed('The file is larger than the 1 MB import limit.', standards, 'csv');
  }
  let rows: string[][];
  try {
    rows = parseCsv(text.replace(/^\uFEFF/, '')).rows;
  } catch (error) {
    return malformed(
      `The file is not valid CSV: ${error instanceof CsvError ? error.message : 'parse error'}`,
      standards,
      'csv',
    );
  }
  const [header, ...records] = rows;
  const columns = (header ?? []).map((name) => name.trim().toLowerCase());
  const fieldColumn = columns.indexOf('field');
  const valueColumn = columns.indexOf('value');
  const localeColumn = columns.indexOf('locale');
  if (fieldColumn < 0 || valueColumn < 0) {
    return malformed(
      'The first row must name the columns, including "field" and "value".',
      standards,
      'csv',
    );
  }

  // Every row must name the same, supported locale.
  const locales = new Set(
    records.map((r) => (localeColumn < 0 ? '' : (r[localeColumn] ?? '').trim())),
  );
  if (locales.size > 1) {
    return malformed('All rows must use the same locale.', standards, 'csv');
  }
  const locale = resolveLocale([...locales][0], standards);
  if (!locale.ok) return failed([locale.finding], standards, 'csv');

  const collector = new Collector(standards, locale.locale);
  records.forEach((record, index) => {
    collector.add(record[fieldColumn] ?? '', record[valueColumn] ?? '', `Row ${index + 2}`);
  });
  return collector.result('csv');
}

/**
 * Decodes and parses an imported file: JSON when the name ends in `.json` or the text starts with
 * `{`, CSV otherwise.
 */
export function parseListingFile(
  bytes: Uint8Array,
  fileName: string,
  standards: Standards,
): ImportFileResult {
  if (bytes.length > IMPORT_LIMITS.maxBytes) {
    return {
      ...malformed('The file is larger than the 1 MB import limit.', standards),
      encoding: null,
    };
  }
  const { text, encoding } = decodeTextBytes(bytes);
  const json = /\.json$/i.test(fileName) || /^\s*\{/.test(text);
  const result = json ? parseListingJson(text, standards) : parseListingCsv(text, standards);
  return { ...result, encoding };
}
