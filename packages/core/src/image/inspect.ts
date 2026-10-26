// Header-only inspection of PNG and JPEG files (spec §7.1). Pixels are never decoded here,
// so dimensions can be checked before a renderer allocates memory for a hostile file.

export type ImageType = 'image/png' | 'image/jpeg';

export interface ImageInfo {
  type: ImageType;
  /** Stored dimensions, before EXIF orientation. */
  width: number;
  height: number;
  /** EXIF orientation 1–8 (1 when absent). */
  orientation: number;
  /** Dimensions as displayed, after EXIF orientation. Crops are planned in this space. */
  orientedWidth: number;
  orientedHeight: number;
  /** True for PNG colour types 4/6, or any PNG with a tRNS chunk. */
  hasAlphaChannel: boolean;
  /** PNG colour type (0, 2, 3, 4, 6); undefined for JPEG. */
  colorType?: number;
  bitDepth: number;
  animated: boolean;
  iccProfile: boolean;
  cmyk: boolean;
}

export interface ImageInspectError {
  error: 'unsupported-type' | 'malformed';
  message: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isImageInspectError(
  value: ImageInfo | ImageInspectError,
): value is ImageInspectError {
  return 'error' in value;
}

export interface InspectOptions {
  /**
   * The bytes are the whole file: also verify that it is not truncated (PNG reaches IEND,
   * JPEG reaches EOI). Browsers differ on truncated files; some decode them partially.
   */
  complete?: boolean;
}

/** Identify a PNG or JPEG by its magic bytes and read its header. */
export function inspectImage(
  bytes: Uint8Array,
  options: InspectOptions = {},
): ImageInfo | ImageInspectError {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    const info = inspectPng(bytes);
    if (options.complete && !isImageInspectError(info) && !pngIsComplete(bytes)) {
      return malformed('PNG file is truncated.');
    }
    return info;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const info = inspectJpeg(bytes);
    if (options.complete && !isImageInspectError(info) && !jpegIsComplete(bytes)) {
      return malformed('JPEG file is truncated.');
    }
    return info;
  }
  return { error: 'unsupported-type', message: 'Not a PNG or JPEG file.' };
}

function pngIsComplete(bytes: Uint8Array): boolean {
  const dv = view(bytes);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const end = offset + 12 + dv.getUint32(offset);
    if (end > bytes.length) return false;
    if (ascii(bytes, offset + 4, 4) === 'IEND') return true;
    offset = end;
  }
  return false;
}

/**
 * Walks the marker segments to the first start-of-scan (so EXIF thumbnails, which are complete
 * JPEGs inside APP1, are skipped), then looks for EOI. Entropy-coded data stuffs 0xFF bytes, so
 * FF D9 after the scan header can only be a marker.
 */
function jpegIsComplete(bytes: Uint8Array): boolean {
  const dv = view(bytes);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset + 1] !== 0xda) {
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) offset += 1;
    else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) offset += 2;
    else offset += 2 + dv.getUint16(offset + 2);
  }
  for (let i = offset + 2; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return true;
  }
  return false;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

const malformed = (message: string): ImageInspectError => ({ error: 'malformed', message });

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function inspectPng(bytes: Uint8Array): ImageInfo | ImageInspectError {
  const dv = view(bytes);
  // IHDR must be the first chunk: length 13 at offset 8, type at 12, data at 16.
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== 'IHDR') {
    return malformed('PNG header is missing or truncated.');
  }
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  const bitDepth = bytes[24]!;
  const colorType = bytes[25]!;
  if (width === 0 || height === 0) return malformed('PNG has zero width or height.');
  if (![0, 2, 3, 4, 6].includes(colorType)) return malformed('PNG has an invalid colour type.');

  let transparency = false;
  let animated = false;
  let iccProfile = false;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = dv.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'tRNS') transparency = true;
    else if (type === 'acTL') animated = true;
    else if (type === 'iCCP') iccProfile = true;
    offset += 12 + length;
  }

  return {
    type: 'image/png',
    width,
    height,
    orientation: 1,
    orientedWidth: width,
    orientedHeight: height,
    hasAlphaChannel: colorType === 4 || colorType === 6 || transparency,
    colorType,
    bitDepth,
    animated,
    iccProfile,
    cmyk: false,
  };
}

const isSof = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function inspectJpeg(bytes: Uint8Array): ImageInfo | ImageInspectError {
  const dv = view(bytes);
  let orientation = 1;
  let iccProfile = false;
  let frame: { width: number; height: number; bitDepth: number; components: number } | null = null;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return malformed('JPEG marker structure is corrupt.');
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2; // standalone markers carry no length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI or start of scan
    const length = dv.getUint16(offset + 2);
    const dataStart = offset + 4;
    if (length < 2) return malformed('JPEG segment length is invalid.');

    if (isSof(marker) && dataStart + 6 <= bytes.length) {
      frame = {
        bitDepth: bytes[dataStart]!,
        height: dv.getUint16(dataStart + 1),
        width: dv.getUint16(dataStart + 3),
        components: bytes[dataStart + 5]!,
      };
    } else if (marker === 0xe1 && ascii(bytes, dataStart, 6) === 'Exif\0\0') {
      orientation = readExifOrientation(bytes, dataStart + 6, offset + 2 + length) ?? orientation;
    } else if (marker === 0xe2 && ascii(bytes, dataStart, 12) === 'ICC_PROFILE\0') {
      iccProfile = true;
    }
    offset += 2 + length;
  }

  if (!frame) return malformed('JPEG dimensions not found.');
  if (frame.width === 0 || frame.height === 0) return malformed('JPEG has zero width or height.');
  const swap = orientation >= 5;
  return {
    type: 'image/jpeg',
    width: frame.width,
    height: frame.height,
    orientation,
    orientedWidth: swap ? frame.height : frame.width,
    orientedHeight: swap ? frame.width : frame.height,
    hasAlphaChannel: false,
    bitDepth: frame.bitDepth,
    animated: false,
    iccProfile,
    cmyk: frame.components === 4,
  };
}

/** Reads tag 0x0112 from IFD0 of a TIFF structure; returns undefined when absent or invalid. */
function readExifOrientation(bytes: Uint8Array, tiff: number, end: number): number | undefined {
  if (tiff + 8 > end || end > bytes.length) return undefined;
  const dv = view(bytes);
  const order = ascii(bytes, tiff, 2);
  if (order !== 'II' && order !== 'MM') return undefined;
  const little = order === 'II';
  const ifd = tiff + dv.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return undefined;
  const count = dv.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return undefined;
    if (dv.getUint16(entry, little) === 0x0112) {
      const value = dv.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}
