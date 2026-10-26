// Source size limits (spec §10.4, §10.8) and per-preset image counts (spec §5.2 group.count).
// The limit values belong to the caller (the web app and the CLI have different constraints);
// the decisions and messages belong here.
import type { Finding } from '../findings/types.ts';
import type { Standards } from '../standards/schema.ts';
import { checkFinding, fileSubject, type FileRef } from './findings.ts';

export interface SourceLimits {
  maxFileBytes: number;
  maxPixels: number;
}

const megabytes = (bytes: number) => `${Math.round((bytes / 1048576) * 10) / 10} MB`;
const megapixels = (pixels: number) => `${Math.round((pixels / 1e6) * 10) / 10} MP`;

/**
 * Checks a source against the caller's limits. Call it with the file size alone before reading
 * the file, and again with the header dimensions before decoding, so neither an oversized file
 * nor a decompression bomb is ever loaded.
 */
export function checkSourceLimits(
  source: { byteLength: number; width?: number; height?: number },
  limits: SourceLimits,
  ref: FileRef,
): Finding {
  const subject = fileSubject(ref);
  if (source.byteLength > limits.maxFileBytes) {
    return checkFinding(
      'image.too-large',
      subject,
      false,
      `File is ${megabytes(source.byteLength)}; the limit is ${megabytes(limits.maxFileBytes)}.`,
      { bytes: source.byteLength, limit: limits.maxFileBytes },
    );
  }
  if (source.width !== undefined && source.height !== undefined) {
    const pixels = source.width * source.height;
    if (pixels > limits.maxPixels) {
      return checkFinding(
        'image.too-large',
        subject,
        false,
        `Image is ${megapixels(pixels)}; the limit is ${megapixels(limits.maxPixels)}.`,
        { pixels, limit: limits.maxPixels },
      );
    }
  }
  return checkFinding('image.too-large', subject, true, 'Within the size limits.');
}

export interface GroupCountInput {
  groups: { groupId: string; count: number }[];
  presetIds: readonly string[];
}

/** One finding per selected preset: does its group hold an allowed number of images? */
export function checkGroupCounts(input: GroupCountInput, s: Standards): Finding[] {
  const selected = new Set(input.presetIds);
  return s.presets
    .filter((preset) => selected.has(preset.id))
    .map((preset) => {
      const count = input.groups.find((g) => g.groupId === preset.group)?.count ?? 0;
      const { min, max } = preset.count;
      const ok = count >= min && count <= max;
      const range = min === max ? `${min}` : `${min}–${max}`;
      const noun = (n: number) => (n === 1 ? 'image' : 'images');
      return checkFinding(
        'group.count',
        { kind: 'group', groupId: preset.group, presetId: preset.id },
        ok,
        ok
          ? `${count} ${noun(count)} (${range} allowed).`
          : `${preset.name} takes ${range} ${noun(max)}; ${count} provided.`,
        { count, min, max },
      );
    });
}
