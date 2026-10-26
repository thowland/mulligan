import type { FieldDef, LimitUnit, Standards } from '../standards/schema.ts';
import { graphemes } from './unicode.ts';

const encoder = new TextEncoder();

function unitsOf(text: string, unit: LimitUnit, standards: Standards): number {
  if (unit === 'bytes') return encoder.encode(text).length;
  switch (standards.rules.counting.chars) {
    case 'utf16':
      return text.length;
    case 'codepoints':
      return Array.from(text).length;
    case 'graphemes':
      return graphemes(text).length;
  }
}

/** Length of `text` in the field's unit (spec §6.5). */
export function countText(text: string, unit: LimitUnit, standards: Standards): number {
  return unitsOf(text, unit, standards);
}

/**
 * Offset of the first grapheme that takes the text past `limit.max`, or null when the text fits.
 * Whole graphemes are reported, so a highlight never splits a character.
 */
export function overflowOffset(
  text: string,
  limit: FieldDef['limit'],
  standards: Standards,
): number | null {
  let total = 0;
  for (const { segment, index } of graphemes(text)) {
    total += unitsOf(segment, limit.unit, standards);
    if (total > limit.max) return index;
  }
  return null;
}
