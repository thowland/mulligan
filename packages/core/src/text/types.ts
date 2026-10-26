import type { Finding } from '../findings/types.ts';
import type { LimitUnit } from '../standards/schema.ts';

/** Raw field input as received from a paste, typing or an import (spec §6.1). */
export interface RawFieldInput {
  /** text/plain flavour, or typed or imported text. */
  text: string;
  /** text/html flavour when pasted from a rich source. */
  html?: string;
}

/** `${ruleId}@${baselineStart}:${baselineEnd}`, stable for a given baseline (spec §6.3). */
export type ChangeId = string;

export interface Span {
  start: number;
  end: number;
}

export interface Change {
  id: ChangeId;
  ruleId: string;
  /** In the baseline text. */
  baselineSpan: Span;
  /** In the cleaned text. */
  outputSpan: Span;
  before: string;
  after: string;
  revertible: boolean;
  reverted: boolean;
  detail?: string;
}

export interface NormalizeOptions {
  /** Overrides the field's default. */
  straightQuotes?: boolean;
  /** Reverted changes; only revertible rules can be suppressed. */
  suppress?: ReadonlySet<ChangeId>;
  /** 'check' evaluates the input as-is and reports text.not-normalized when changes would occur. */
  mode?: 'fix' | 'check';
  /** Locale recorded on findings; defaults to the standards' default locale. */
  locale?: string;
}

export interface FieldCount {
  value: number;
  limit: number;
  unit: LimitUnit;
  /** Offset in the cleaned text of the first character past the limit, or null. */
  overflowAt: number | null;
}

export interface FieldResult {
  fieldId: string;
  /** The "Original" shown in the side-by-side view. */
  baseline: string;
  /** Cleaned text. */
  output: string;
  changes: Change[];
  findings: Finding[];
  count: FieldCount;
}

export interface ListingInput {
  locale?: string;
  /** Raw input per field id. Fields that are absent are treated as empty. */
  fields: Readonly<Record<string, RawFieldInput>>;
}

export interface ListingOptions {
  mode?: 'fix' | 'check';
  /** Per-field options (straight quotes, suppressed changes). */
  fields?: Readonly<Record<string, Omit<NormalizeOptions, 'mode' | 'locale'>>>;
}

export interface ListingResult {
  locale: string;
  /** One result per field defined in the standards, in configuration order. */
  fields: FieldResult[];
  /** Findings about the listing as a whole (none in v1; cross-field findings attach to fields). */
  listingFindings: Finding[];
}
