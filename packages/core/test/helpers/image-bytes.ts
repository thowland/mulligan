// Builders for synthetic PNG and JPEG headers. inspectImage reads headers only, so these need no
// valid pixel data or CRCs.

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u16 = (value: number, little = false) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, value, little);
  return b;
};

const u32 = (value: number, little = false) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, little);
  return b;
};

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

function chunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  return concat(u32(data.length), ascii(type), data, u32(0));
}

export interface PngOptions {
  width?: number;
  height?: number;
  bitDepth?: number;
  colorType?: number;
  /** Ancillary chunks placed between IHDR and IDAT. */
  chunks?: string[];
}

export function pngBytes({
  width = 100,
  height = 200,
  bitDepth = 8,
  colorType = 2,
  chunks = [],
}: PngOptions = {}): Uint8Array {
  const ihdr = concat(u32(width), u32(height), Uint8Array.of(bitDepth, colorType, 0, 0, 0));
  return concat(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', ihdr),
    ...chunks.map((type) => chunk(type, new Uint8Array(4))),
    chunk('IDAT', new Uint8Array(8)),
    chunk('IEND'),
  );
}

export function segment(marker: number, data: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(0xff, marker), u16(data.length + 2), data);
}

export function exifSegment(orientation: number, little = false, tag = 0x0112): Uint8Array {
  const tiff = concat(
    ascii(little ? 'II' : 'MM'),
    u16(42, little),
    u32(8, little),
    u16(1, little),
    u16(tag, little),
    u16(3, little),
    u32(1, little),
    u16(orientation, little),
    u16(0),
    u32(0, little),
  );
  return segment(0xe1, concat(ascii('Exif\0\0'), tiff));
}

export function sofSegment(width: number, height: number, components = 3, marker = 0xc0) {
  return segment(
    marker,
    concat(Uint8Array.of(8), u16(height), u16(width), Uint8Array.of(components)),
  );
}

export function jpegBytes(...segments: Uint8Array[]): Uint8Array {
  return concat(
    Uint8Array.of(0xff, 0xd8),
    ...segments,
    Uint8Array.of(0xff, 0xda, 0, 2, 0xff, 0xd9),
  );
}

export { ascii, concat };
