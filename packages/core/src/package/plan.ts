// ZIP layout (spec §8.1–8.2) and the packaging safety checks (spec §10.4).
import { RULES } from '../findings/catalog.ts';
import type { Finding, Subject } from '../findings/types.ts';
import { inspectImage, isImageInspectError } from '../image/inspect.ts';
import type { Standards } from '../standards/schema.ts';
import { outputPath } from './naming.ts';

export interface PackageSourceRef {
  sourceId: string;
  fileName: string;
}

export interface PackageInput {
  /** Sources per group, in the user's order; the order sets the sequence numbers. */
  groups: { groupId: string; sources: readonly PackageSourceRef[] }[];
  /** Selected presets; only those whose group has sources produce entries. */
  presetIds: readonly string[];
  /** Include `listing/listing.json` and `listing/listing.txt` (spec §8.2). */
  listing?: boolean;
}

export type PackageEntry =
  | {
      kind: 'image';
      path: string;
      groupId: string;
      sourceId: string;
      presetId: string;
      sequence: number;
    }
  | { kind: 'manifest'; path: 'manifest.json' }
  | { kind: 'listing'; path: string; format: 'json' | 'txt' };

/** Paths of the listing exports inside the package. */
export const LISTING_PATHS = Object.freeze({
  json: 'listing/listing.json',
  txt: 'listing/listing.txt',
});

export interface PackagePlan {
  entries: PackageEntry[];
  findings: Finding[];
}

/** The only file types a package may contain (spec §10.4). */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.json', '.txt'];

const SAFE_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;
const PACKAGE: Subject = { kind: 'package' };

function failure(ruleId: string, message: string, path: string): Finding {
  return { ruleId, severity: RULES[ruleId]!.severity!, subject: PACKAGE, message, data: { path } };
}

/** Rejects absolute or traversing paths, unsafe characters and disallowed extensions. */
export function checkEntryPath(path: string): Finding | null {
  const extension = path.slice(path.lastIndexOf('.'));
  const safe = SAFE_PATH.test(path) && !path.split('/').some((part) => /^\.+$/.test(part));
  if (safe && path.includes('.') && ALLOWED_EXTENSIONS.includes(extension)) return null;
  return failure('package.extension', `"${path}" is not an allowed package path.`, path);
}

/**
 * Lays out the package: `manifest.json` first, then one entry per (source × selected preset in its
 * group), with sequence numbers per group in the user's order, identical across that group's
 * presets (spec §8.1), then the listing exports when requested.
 */
export function planPackage(input: PackageInput, s: Standards): PackagePlan {
  const entries: PackageEntry[] = [{ kind: 'manifest', path: 'manifest.json' }];
  const findings: Finding[] = [];
  const seen = new Set<string>(['manifest.json']);
  const selected = new Set(input.presetIds);

  for (const group of s.groups) {
    const sources = input.groups.find((g) => g.groupId === group.id)?.sources ?? [];
    if (sources.length === 0) continue;
    const presets = s.presets.filter((p) => p.group === group.id && selected.has(p.id));
    for (const preset of presets) {
      sources.forEach((source, index) => {
        const sequence = index + 1;
        const path = outputPath(sequence, sources.length, source.fileName, preset);
        const invalid = checkEntryPath(path);
        if (invalid) {
          findings.push(invalid);
          return;
        }
        if (seen.has(path)) {
          findings.push(
            failure('package.path-collision', `Two outputs would both be named "${path}".`, path),
          );
          return;
        }
        seen.add(path);
        entries.push({
          kind: 'image',
          path,
          groupId: group.id,
          sourceId: source.sourceId,
          presetId: preset.id,
          sequence,
        });
      });
    }
  }
  if (input.listing) {
    entries.push(
      { kind: 'listing', path: LISTING_PATHS.json, format: 'json' },
      { kind: 'listing', path: LISTING_PATHS.txt, format: 'txt' },
    );
  }
  return { entries, findings };
}

/**
 * Verifies that an entry's bytes are what its extension says, immediately before it is written,
 * so nothing but the declared file types can reach a download (spec §10.4).
 */
export function checkEntryContent(path: string, bytes: Uint8Array): Finding | null {
  const invalid = checkEntryPath(path);
  if (invalid) return invalid;
  const extension = path.slice(path.lastIndexOf('.'));
  let ok: boolean;
  if (extension === '.png' || extension === '.jpg') {
    const info = inspectImage(bytes);
    ok =
      !isImageInspectError(info) &&
      info.type === (extension === '.png' ? 'image/png' : 'image/jpeg');
  } else {
    ok = isUtf8(bytes) && (extension === '.txt' || isJson(bytes));
  }
  return ok
    ? null
    : failure('package.entry-type', `"${path}" does not contain a valid ${extension} file.`, path);
}

function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return !bytes.includes(0);
  } catch {
    return false;
  }
}

function isJson(bytes: Uint8Array): boolean {
  try {
    JSON.parse(new TextDecoder().decode(bytes));
    return true;
  } catch {
    return false;
  }
}
