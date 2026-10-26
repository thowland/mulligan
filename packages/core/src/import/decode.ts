// Text decoding for imported templates (spec §6.9). Agencies on Windows often save CSV from Excel,
// which produces UTF-8 with a BOM, UTF-16 ("Unicode Text") or Windows-1252.

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
  /** True when the encoding was announced by a byte-order mark. */
  bom: boolean;
}

/** BOM first; otherwise strict UTF-8; otherwise Windows-1252, which decodes any byte sequence. */
export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decode('utf-8', bytes.subarray(3)), encoding: 'utf-8', bom: true };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decode('utf-16le', bytes.subarray(2)), encoding: 'utf-16le', bom: true };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decode('utf-16be', bytes.subarray(2)), encoding: 'utf-16be', bom: true };
  }
  try {
    return { text: decode('utf-8', bytes, true), encoding: 'utf-8', bom: false };
  } catch {
    return { text: decode('windows-1252', bytes), encoding: 'windows-1252', bom: false };
  }
}

function decode(label: TextEncodingName, bytes: Uint8Array, fatal = false): string {
  // ignoreBOM keeps a second, stray BOM visible to normalization rather than silently dropped.
  return new TextDecoder(label, { fatal, ignoreBOM: true }).decode(bytes);
}
