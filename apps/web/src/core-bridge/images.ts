// Adapter between the image UI and @mulligan/core. Every decision (type, crop, scale, checks,
// naming) is made by the library (spec §2, §9.2).
import {
  checkRendered,
  decodeFailedFinding,
  getStandards,
  inspectImage,
  inspectionFindings,
  isImageInspectError,
  outputPath,
  planImage,
  sequenceLabel,
  summarize,
  type Finding,
  type GroupDef,
  type ImageInfo,
  type ImagePlan,
  type PresetDef,
  type RenderedImage,
  type Severity,
} from '@mulligan/core';

export interface SourceImage {
  id: string;
  fileName: string;
  groupId: string;
  bytes: Uint8Array;
  info: ImageInfo;
}

export type InspectOutcome = { ok: true; source: SourceImage } | { ok: false; findings: Finding[] };

export function allGroups(): readonly GroupDef[] {
  return getStandards().groups;
}

export function groupById(groupId: string): GroupDef {
  const group = getStandards().groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`Unknown group "${groupId}"`);
  return group;
}

export function presetsInGroup(groupId: string): PresetDef[] {
  return getStandards().presets.filter((p) => p.group === groupId);
}

export function presetById(presetId: string): PresetDef {
  const preset = getStandards().presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Unknown preset "${presetId}"`);
  return preset;
}

export function storeLabel(storeId: string): string {
  return getStandards().stores.find((s) => s.id === storeId)?.label ?? storeId;
}

export function defaultSelection(groupId: string): string[] {
  return presetsInGroup(groupId)
    .filter((p) => p.defaultSelected)
    .map((p) => p.id);
}

/** The given preset ids in configuration order. */
export function inConfigOrder(ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return getStandards()
    .presets.filter((p) => wanted.has(p.id))
    .map((p) => p.id);
}

/** Every preset selected by default, across all groups, in configuration order. */
export function defaultSelectionAll(): string[] {
  return getStandards()
    .presets.filter((p) => p.defaultSelected)
    .map((p) => p.id);
}

/** Inspect a whole file: type by magic bytes, header dimensions, truncation. */
export function inspectSource(
  id: string,
  fileName: string,
  groupId: string,
  bytes: Uint8Array,
): InspectOutcome {
  const info = inspectImage(bytes, { complete: true });
  if (isImageInspectError(info)) {
    return { ok: false, findings: inspectionFindings(info, { groupId, sourceId: id, fileName }) };
  }
  return { ok: true, source: { id, fileName, groupId, bytes, info } };
}

export function planFor(source: SourceImage, presetId: string): ImagePlan {
  return planImage(
    {
      sourceId: source.id,
      fileName: source.fileName,
      width: source.info.orientedWidth,
      height: source.info.orientedHeight,
    },
    presetById(presetId),
    getStandards(),
  );
}

export function verifyOutput(plan: ImagePlan, output: RenderedImage): Finding[] {
  return checkRendered(plan, output);
}

export function decodeFailure(source: SourceImage, message: string): Finding {
  return decodeFailedFinding(
    { groupId: source.groupId, sourceId: source.id, fileName: source.fileName },
    message,
  );
}

/** `01`, `02`… as used in output names (three digits beyond 99). */
export function sequenceLabelFor(sequence: number, groupSize: number): string {
  return sequenceLabel(sequence, groupSize);
}

/** The output's path inside the package, for example `iphone-6.9/01_home-screen.png`. */
export function packagePath(
  source: SourceImage,
  sequence: number,
  groupSize: number,
  presetId: string,
): string {
  return outputPath(sequence, groupSize, source.fileName, presetById(presetId));
}

/** File name for a single downloaded output: the package path with its folder flattened. */
export function downloadName(
  source: SourceImage,
  presetId: string,
  sequence = 1,
  groupSize = 1,
): string {
  return packagePath(source, sequence, groupSize, presetId).replace('/', '_');
}

export function worstOf(findings: readonly Finding[]): Severity {
  return summarize(findings).worst;
}
