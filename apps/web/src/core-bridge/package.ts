// Adapter between the Package tab and @mulligan/core: layout, counts, verification and manifest
// all come from the library (spec §8).
import {
  buildManifest,
  checkEntryContent,
  checkGroupCounts,
  checkSourceLimits,
  getStandards,
  planPackage,
  serializeManifest,
  type FileRef,
  type Finding,
  type ManifestInput,
  type PackagePlan,
} from '@mulligan/core';
import { SOURCE_LIMITS } from '../config.ts';

export interface PackageSource {
  id: string;
  fileName: string;
}

export type SourcesByGroup = Readonly<Record<string, readonly PackageSource[]>>;

const toGroups = (sources: SourcesByGroup) =>
  Object.entries(sources).map(([groupId, list]) => ({
    groupId,
    sources: list.map((s) => ({ sourceId: s.id, fileName: s.fileName })),
  }));

export function packagePlan(
  sources: SourcesByGroup,
  presetIds: readonly string[],
  listing = false,
): PackagePlan {
  return planPackage({ groups: toGroups(sources), presetIds, listing }, getStandards());
}

export function groupCountFindings(
  sources: SourcesByGroup,
  presetIds: readonly string[],
): Finding[] {
  const groups = Object.entries(sources).map(([groupId, list]) => ({
    groupId,
    count: list.length,
  }));
  return checkGroupCounts({ groups, presetIds }, getStandards());
}

/** File-size check, made before a dropped file is read. */
export function fileSizeFinding(byteLength: number, ref: FileRef): Finding {
  return checkSourceLimits({ byteLength }, SOURCE_LIMITS, ref);
}

/** Pixel-count check from the header, made before the image is decoded. */
export function pixelFinding(
  dimensions: { byteLength: number; width: number; height: number },
  ref: FileRef,
): Finding {
  return checkSourceLimits(dimensions, SOURCE_LIMITS, ref);
}

export function verifyEntry(path: string, bytes: Uint8Array): Finding | null {
  return checkEntryContent(path, bytes);
}

export function manifestJson(input: ManifestInput): string {
  return serializeManifest(buildManifest(input));
}
