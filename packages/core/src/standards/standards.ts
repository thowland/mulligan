import { RULES } from '../findings/catalog.ts';
import type { Finding } from '../findings/types.ts';
import type { Result } from '../result.ts';
import { standardsHash } from './hash.ts';
import { standardsSchema, type Standards } from './schema.ts';
import bundledDocument from './standards.json' with { type: 'json' };

export interface StandardsInfo {
  rulesetVersion: string;
  standardsHash: string;
}

/** Validate a standards document (bundled or supplied by a caller such as the future CLI). */
export function parseStandards(document: unknown): Result<Standards> {
  const parsed = standardsSchema.safeParse(document);
  if (parsed.success) return { ok: true, value: deepFreeze(parsed.data) };

  const findings: Finding[] = parsed.error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return {
      ruleId: 'standards.invalid',
      severity: RULES['standards.invalid']!.severity!,
      subject: { kind: 'standards', path },
      message: path ? `${path}: ${issue.message}` : issue.message,
    };
  });
  return { ok: false, findings };
}

let bundled: { standards: Standards; info: StandardsInfo } | undefined;

function loadBundled(): { standards: Standards; info: StandardsInfo } {
  if (bundled) return bundled;
  const result = parseStandards(bundledDocument);
  if (!result.ok) {
    // The bundled file is validated in the test suite; reaching this is a build defect.
    throw new Error(
      `Bundled standards are invalid:\n${result.findings.map((f) => f.message).join('\n')}`,
    );
  }
  bundled = {
    standards: result.value,
    info: Object.freeze({
      rulesetVersion: result.value.rulesetVersion,
      standardsHash: standardsHash(bundledDocument),
    }),
  };
  return bundled;
}

/** The standards bundled with this library version (validated and frozen). */
export function getStandards(): Standards {
  return loadBundled().standards;
}

/** Ruleset version and fingerprint of the bundled standards. */
export function getStandardsInfo(): StandardsInfo {
  return loadBundled().info;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
