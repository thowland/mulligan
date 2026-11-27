// Output file naming (spec §8.1, §10.4). User-supplied names never reach a path in any form other
// than the slug, which is restricted to [a-z0-9-]. The app name reaches only the ZIP's own file
// name, as a stem restricted to [A-Za-z0-9-].
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

export const DEFAULT_PACKAGE_STEM = 'mulligan';
const MAX_STEM_LENGTH = 40;

/**
 * The start of the ZIP's file name, from the app name the user typed: `carePlusAR` stays as it
 * is, `Care Plus AR!` becomes `Care-Plus-AR`, and a name with nothing usable gives `mulligan`.
 * Capitals are kept, because the name is the user's own.
 */
export function packageStem(appName: string): string {
  const stem = appName
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_STEM_LENGTH)
    .replace(/-+$/, '');
  if (stem === '') return DEFAULT_PACKAGE_STEM;
  return RESERVED.test(stem.toLowerCase()) ? `${stem}-app` : stem;
}

/** Two-digit sequence numbers, three when a group has more than 99 files. */
export function sequenceLabel(sequence: number, groupSize: number): string {
  return String(sequence).padStart(groupSize > 99 ? 3 : 2, '0');
}

/** `{folder}/{seq}_{slug}[_{suffix}].{ext}`, e.g. `iphone-6.3/01_home-screen.png`. */
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
