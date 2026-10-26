// Shared by the fixture test (browser and Node) and scripts/text-fixtures.ts (Node).
// Pure: callers load the files; this module turns a case into comparable results.
import {
  normalizeField,
  parseStandards,
  processListing,
  type Change,
  type Finding,
  type NormalizeOptions,
  type RawFieldInput,
  type Standards,
} from '../../src/index.ts';
import bundled from '../../src/standards/standards.json' with { type: 'json' };

export interface TextCase {
  description: string;
  field?: string;
  input?: RawFieldInput;
  options?: { straightQuotes?: boolean; mode?: 'fix' | 'check'; suppress?: string[] };
  /** Replaces top-level keys of the standards' `rules`. */
  rules?: Record<string, unknown>;
  listing?: Record<string, RawFieldInput>;
  /** Listing cases: the fields whose results are compared. */
  focus?: string[];
}

export interface ExpectedField {
  baseline?: string;
  output: string;
  changes: { rule: string; before: string; after: string; reverted?: true }[];
  findings: { rule: string; severity: string; message: string }[];
}

export type Expected = ExpectedField | { fields: Record<string, ExpectedField> };

export function standardsFor(testCase: TextCase): Standards {
  const document = structuredClone(bundled) as { rules: Record<string, unknown> };
  Object.assign(document.rules, testCase.rules ?? {});
  const result = parseStandards(document);
  if (!result.ok) throw new Error(result.findings.map((f) => f.message).join('\n'));
  return result.value;
}

const summarizeChanges = (changes: Change[]): ExpectedField['changes'] =>
  changes.map((c) => ({
    rule: c.ruleId,
    before: c.before,
    after: c.after,
    ...(c.reverted ? { reverted: true as const } : {}),
  }));

const summarizeFindings = (findings: Finding[]): ExpectedField['findings'] =>
  findings
    .filter((f) => f.severity !== 'pass')
    .map((f) => ({ rule: f.ruleId, severity: f.severity, message: f.message }));

/** Run a case; `html` is the content of input.html when the case has one. */
export function runTextCase(
  testCase: TextCase,
  html: string | undefined,
): { expected: Expected; findings: Finding[]; changes: Change[] } {
  const standards = standardsFor(testCase);
  if (testCase.listing) {
    const result = processListing({ fields: testCase.listing }, standards);
    const fields: Record<string, ExpectedField> = {};
    for (const id of testCase.focus ?? Object.keys(testCase.listing)) {
      const field = result.fields.find((f) => f.fieldId === id)!;
      fields[id] = {
        output: field.output,
        changes: summarizeChanges(field.changes),
        findings: summarizeFindings(field.findings),
      };
    }
    return {
      expected: { fields },
      findings: result.fields.flatMap((f) => f.findings),
      changes: result.fields.flatMap((f) => f.changes),
    };
  }

  const field = standards.fields.find((f) => f.id === testCase.field);
  if (!field) throw new Error(`Unknown field ${testCase.field}`);
  const input: RawFieldInput = {
    text: testCase.input?.text ?? '',
    ...(html === undefined ? {} : { html }),
  };
  const { suppress, ...rest } = testCase.options ?? {};
  const options: NormalizeOptions = {
    ...rest,
    ...(suppress ? { suppress: new Set(suppress) } : {}),
  };
  const result = normalizeField(input, field, standards, options);
  return {
    expected: {
      ...(html === undefined ? {} : { baseline: result.baseline }),
      output: result.output,
      changes: summarizeChanges(result.changes),
      findings: summarizeFindings(result.findings),
    },
    findings: result.findings,
    changes: result.changes,
  };
}
