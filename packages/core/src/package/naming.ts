// Output file naming (spec §8.1, §10.4). User-supplied names never reach a path in any form other
// than the slug, which is restricted to [a-z0-9-].
import type { PresetDef } from '../standards/schema.ts';

const MAX_SLUG_LENGTH = 60;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** `Home Screen (Final).PNG` → `home-screen-final`. */
export function sourceSlug(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]*$/, '');
  const slug = base
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  if (slug === '') return 'image';
  return RESERVED.test(slug) ? `${slug}-file` : slug;
}

/** Two-digit sequence numbers, three when a group has more than 99 files. */
export function sequenceLabel(sequence: number, groupSize: number): string {
  return String(sequence).padStart(groupSize > 99 ? 3 : 2, '0');
}

/** `{folder}/{seq}_{slug}[_{suffix}].{ext}`, e.g. `iphone-6.9/01_home-screen.png`. */
export function outputPath(
  sequence: number,
  groupSize: number,
  fileName: string,
  preset: Pick<PresetDef, 'folder' | 'fileSuffix' | 'format'>,
): string {
  const suffix = preset.fileSuffix ? `_${preset.fileSuffix}` : '';
  const extension = preset.format === 'jpeg' ? 'jpg' : 'png';
  return `${preset.folder}/${sequenceLabel(sequence, groupSize)}_${sourceSlug(fileName)}${suffix}.${extension}`;
}
