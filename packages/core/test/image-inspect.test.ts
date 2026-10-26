import { describe, expect, it } from 'vitest';
import { inspectImage, isImageInspectError } from '../src/index.ts';
import {
  ascii,
  concat,
  exifSegment,
  jpegBytes,
  pngBytes,
  segment,
  sofSegment,
} from './helpers/image-bytes.ts';

describe('inspectImage – PNG', () => {
  it('reads dimensions, bit depth and colour type', () => {
    expect(inspectImage(pngBytes({ width: 1290, height: 12000 }))).toEqual({
      type: 'image/png',
      width: 1290,
      height: 12000,
      orientation: 1,
      orientedWidth: 1290,
      orientedHeight: 12000,
      hasAlphaChannel: false,
      colorType: 2,
      bitDepth: 8,
      animated: false,
      iccProfile: false,
      cmyk: false,
    });
  });

  it.each([
    [0, false],
    [2, false],
    [3, false],
    [4, true],
    [6, true],
  ])('colour type %i → alpha channel %s', (colorType, alpha) => {
    expect(inspectImage(pngBytes({ colorType }))).toMatchObject({
      colorType,
      hasAlphaChannel: alpha,
    });
  });

  it('treats a tRNS chunk as an alpha channel and detects iCCP and acTL', () => {
    expect(
      inspectImage(pngBytes({ colorType: 2, chunks: ['tRNS', 'iCCP', 'acTL'] })),
    ).toMatchObject({ hasAlphaChannel: true, iccProfile: true, animated: true });
  });

  it('reads 16-bit depth', () => {
    expect(inspectImage(pngBytes({ bitDepth: 16 }))).toMatchObject({ bitDepth: 16 });
  });

  it('stops scanning at the end of the available bytes', () => {
    const header = pngBytes({ chunks: ['tEXt'] }).subarray(0, 40);
    expect(inspectImage(header)).toMatchObject({ width: 100, height: 200 });
  });

  it.each([
    ['truncated header', pngBytes().subarray(0, 20), 'PNG header is missing or truncated.'],
    ['zero width', pngBytes({ width: 0 }), 'PNG has zero width or height.'],
    ['invalid colour type', pngBytes({ colorType: 5 }), 'PNG has an invalid colour type.'],
  ])('rejects a %s as malformed', (_name, bytes, message) => {
    expect(inspectImage(bytes)).toEqual({ error: 'malformed', message });
  });

  it('rejects a PNG whose first chunk is not IHDR', () => {
    const bytes = pngBytes();
    bytes.set(ascii('tEXt'), 12);
    expect(inspectImage(bytes)).toMatchObject({ error: 'malformed' });
  });
});

describe('inspectImage – JPEG', () => {
  it('reads dimensions from the frame header', () => {
    expect(inspectImage(jpegBytes(sofSegment(1000, 2000)))).toEqual({
      type: 'image/jpeg',
      width: 1000,
      height: 2000,
      orientation: 1,
      orientedWidth: 1000,
      orientedHeight: 2000,
      hasAlphaChannel: false,
      bitDepth: 8,
      animated: false,
      iccProfile: false,
      cmyk: false,
    });
  });

  it('reads progressive frame headers', () => {
    expect(inspectImage(jpegBytes(sofSegment(300, 400, 3, 0xc2)))).toMatchObject({
      width: 300,
      height: 400,
    });
  });

  it.each([
    [1, false],
    [3, false],
    [5, true],
    [6, true],
    [8, true],
  ])('applies EXIF orientation %i (swap %s), big- and little-endian', (orientation, swap) => {
    for (const little of [false, true]) {
      const info = inspectImage(jpegBytes(exifSegment(orientation, little), sofSegment(600, 400)));
      expect(info).toMatchObject({
        orientation,
        orientedWidth: swap ? 400 : 600,
        orientedHeight: swap ? 600 : 400,
      });
    }
  });

  it('ignores invalid or missing orientation values', () => {
    expect(inspectImage(jpegBytes(exifSegment(9), sofSegment(10, 20)))).toMatchObject({
      orientation: 1,
    });
    expect(
      inspectImage(jpegBytes(exifSegment(6, false, 0x010f), sofSegment(10, 20))),
    ).toMatchObject({ orientation: 1 });
  });

  it('ignores EXIF data with a bad byte order or offsets past the segment', () => {
    const badOrder = exifSegment(6);
    badOrder.set(ascii('XX'), 10);
    expect(inspectImage(jpegBytes(badOrder, sofSegment(10, 20)))).toMatchObject({ orientation: 1 });

    const badOffset = exifSegment(6);
    new DataView(badOffset.buffer).setUint32(14, 1000);
    expect(inspectImage(jpegBytes(badOffset, sofSegment(10, 20)))).toMatchObject({
      orientation: 1,
    });

    // An entry count that runs past the segment, with no orientation in the readable entry.
    const badCount = exifSegment(6, false, 0x010f);
    new DataView(badCount.buffer).setUint16(18, 50);
    expect(inspectImage(jpegBytes(badCount, sofSegment(10, 20)))).toMatchObject({ orientation: 1 });

    const tiny = segment(0xe1, concat(ascii('Exif\0\0'), ascii('MM')));
    expect(inspectImage(jpegBytes(tiny, sofSegment(10, 20)))).toMatchObject({ orientation: 1 });
  });

  it('detects ICC profiles and CMYK', () => {
    const icc = segment(0xe2, concat(ascii('ICC_PROFILE\0'), new Uint8Array(4)));
    expect(inspectImage(jpegBytes(icc, sofSegment(10, 20, 4)))).toMatchObject({
      iccProfile: true,
      cmyk: true,
    });
  });

  it('skips fill bytes, restart markers and unrelated segments', () => {
    const bytes = jpegBytes(
      Uint8Array.of(0xff, 0xff),
      Uint8Array.of(0xff, 0xd0),
      Uint8Array.of(0xff, 0x01),
      segment(0xc4, new Uint8Array(10)),
      segment(0xe0, ascii('JFIF\0')),
      sofSegment(64, 32),
    );
    expect(inspectImage(bytes)).toMatchObject({ width: 64, height: 32 });
  });

  it.each([
    ['no frame header', jpegBytes(segment(0xe0, ascii('JFIF\0'))), 'JPEG dimensions not found.'],
    ['zero height', jpegBytes(sofSegment(10, 0)), 'JPEG has zero width or height.'],
    [
      'broken marker',
      concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0), Uint8Array.of(0x00, 0x11, 0, 0)),
      'JPEG marker structure is corrupt.',
    ],
    [
      'invalid length',
      Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0),
      'JPEG segment length is invalid.',
    ],
  ])('rejects %s as malformed', (_name, bytes, message) => {
    expect(inspectImage(bytes)).toEqual({ error: 'malformed', message });
  });
});

describe('inspectImage – complete-file check', () => {
  it('accepts complete PNG and JPEG files', () => {
    expect(inspectImage(pngBytes(), { complete: true })).toMatchObject({ type: 'image/png' });
    expect(inspectImage(jpegBytes(sofSegment(10, 20)), { complete: true })).toMatchObject({
      type: 'image/jpeg',
    });
  });

  it('rejects a PNG without IEND or with a chunk running past the end', () => {
    const png = pngBytes();
    expect(inspectImage(png.subarray(0, png.length - 12), { complete: true })).toEqual({
      error: 'malformed',
      message: 'PNG file is truncated.',
    });
    expect(inspectImage(png.subarray(0, png.length - 14), { complete: true })).toMatchObject({
      error: 'malformed',
    });
    // Header-only inspection still succeeds on the same bytes.
    expect(inspectImage(png.subarray(0, png.length - 14))).toMatchObject({ width: 100 });
  });

  it('rejects a JPEG without EOI, ignoring an EOI inside an embedded EXIF thumbnail', () => {
    const jpeg = jpegBytes(sofSegment(10, 20));
    expect(inspectImage(jpeg.subarray(0, jpeg.length - 2), { complete: true })).toEqual({
      error: 'malformed',
      message: 'JPEG file is truncated.',
    });
    const thumbnail = segment(
      0xe1,
      concat(ascii('Exif\0\0'), Uint8Array.of(0xff, 0xda, 0x00, 0x02, 0xff, 0xd9)),
    );
    const withThumbnail = jpegBytes(
      thumbnail,
      Uint8Array.of(0xff, 0xff),
      Uint8Array.of(0xff, 0xd0),
      sofSegment(10, 20),
    );
    expect(inspectImage(withThumbnail, { complete: true })).toMatchObject({ type: 'image/jpeg' });
    expect(
      inspectImage(withThumbnail.subarray(0, withThumbnail.length - 2), { complete: true }),
    ).toMatchObject({ error: 'malformed' });
  });

  it('reports header errors before completeness', () => {
    expect(inspectImage(pngBytes({ colorType: 5 }), { complete: true })).toEqual({
      error: 'malformed',
      message: 'PNG has an invalid colour type.',
    });
  });
});

describe('inspectImage – other content', () => {
  it.each([
    ['HTML', ascii('<!doctype html>')],
    ['GIF', ascii('GIF89a')],
    ['SVG', ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['empty', new Uint8Array()],
  ])('rejects %s as an unsupported type', (_name, bytes) => {
    const result = inspectImage(bytes);
    expect(isImageInspectError(result)).toBe(true);
    expect(result).toEqual({ error: 'unsupported-type', message: 'Not a PNG or JPEG file.' });
  });

  it('distinguishes results from errors', () => {
    expect(isImageInspectError(inspectImage(pngBytes()))).toBe(false);
  });
});
