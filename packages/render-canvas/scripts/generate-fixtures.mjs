// Generates the shared image fixtures in fixtures/images (spec §13.2) deterministically.
// Expected values in each expected.json are worked out by hand from the crop rules in
// spec §7.2, not produced by the code under test.
//
//   node packages/render-canvas/scripts/generate-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { encode as encodePng } from 'fast-png';
import jpeg from 'jpeg-js';

const root = new URL('../../../fixtures/images/', import.meta.url);

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fills an RGBA buffer from a colour function (x, y) => [r, g, b, a]. */
function paint(width, height, colour) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = colour(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const rgbOnly = (rgba) => rgba.filter((_, i) => i % 4 !== 3);

/** A website-like capture: status bar, header, then cards with text-like bars. */
function capture(width, height, seed) {
  const random = mulberry32(seed);
  const cards = [];
  for (let top = 260; top < height; top += 420) {
    const lines = [];
    for (let line = 0; line < 6; line++) lines.push(0.35 + random() * 0.55);
    cards.push({ top, hue: Math.floor(random() * 4), lines });
  }
  const tints = [
    [232, 244, 236],
    [236, 240, 250],
    [250, 240, 232],
    [244, 236, 248],
  ];
  return paint(width, height, (x, y) => {
    if (y < 60) return [20, 24, 22];
    if (y < 220) return x % 160 < 8 ? [255, 255, 255] : [47, 125, 79];
    const card = cards.find((c) => y >= c.top && y < c.top + 380);
    if (!card || x < 40 || x >= width - 40) return [246, 247, 245];
    const local = y - card.top;
    const line = Math.floor((local - 40) / 50);
    if (local >= 40 && line < 6 && (local - 40) % 50 < 22) {
      const end = 80 + (width - 200) * card.lines[line];
      if (x >= 80 && x < end) return [40, 44, 42];
    }
    return tints[card.hue];
  });
}

function png(width, height, rgba, { channels = 3, depth = 8 } = {}) {
  if (depth === 16) {
    const wide = new Uint16Array(width * height * channels);
    const narrow = channels === 3 ? rgbOnly(rgba) : rgba;
    for (let i = 0; i < wide.length; i++) wide[i] = narrow[i] * 257;
    return encodePng({ width, height, data: wide, channels, depth: 16 });
  }
  const data = channels === 3 ? rgbOnly(rgba) : rgba;
  return encodePng({ width, height, data, channels, depth: 8 });
}

/** APP1 EXIF segment carrying only IFD0 tag 0x0112 (orientation), big-endian. */
function exifOrientationSegment(orientation) {
  const segment = new Uint8Array(36);
  const dv = new DataView(segment.buffer);
  dv.setUint16(0, 0xffe1);
  dv.setUint16(2, 34);
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  segment.set([0x4d, 0x4d, 0x00, 0x2a], 10); // "MM", 42
  dv.setUint32(14, 8); // IFD0 offset
  dv.setUint16(18, 1); // entry count
  dv.setUint16(20, 0x0112);
  dv.setUint16(22, 3); // SHORT
  dv.setUint32(24, 1);
  dv.setUint16(28, orientation);
  dv.setUint32(32, 0); // next IFD
  return segment;
}

function jpegWithExif(width, height, rgba, orientation) {
  const encoded = jpeg.encode({ data: rgba, width, height }, 92).data;
  const exif = exifOrientationSegment(orientation);
  const out = new Uint8Array(encoded.length + exif.length);
  out.set(encoded.subarray(0, 2));
  out.set(exif, 2);
  out.set(encoded.subarray(2), 2 + exif.length);
  return out;
}

const index = {};

function write(name, file, bytes, expected) {
  index[name] = expected;
  const dir = new URL(`${name}/`, root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(file, dir), bytes);
  writeFileSync(new URL('expected.json', dir), `${JSON.stringify(expected, null, 2)}\n`);
  console.log(`${name}/${file}  ${bytes.length} bytes`);
}

const source = (file, type, width, height, extra = {}) => ({
  file,
  type,
  width,
  height,
  orientation: 1,
  orientedWidth: width,
  orientedHeight: height,
  hasAlphaChannel: false,
  ...extra,
});

// 1. Long website capture: top-anchored crop keeps the header; bottom discarded.
write('long-capture', 'source.png', png(1290, 12000, capture(1290, 12000, 7)), {
  description: 'Long full-page website capture, 1290 × 12000',
  group: 'screenshot',
  source: source('source.png', 'image/png', 1290, 12000),
  presets: {
    'iphone-6.9': {
      crop: { x: 0, y: 0, width: 1290, height: 2803 },
      findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'pass' },
      golden: true,
    },
    'android-phone': {
      crop: { x: 0, y: 0, width: 1290, height: 2293 },
      findings: { 'image.upscaled': 'pass', 'image.crop-loss': 'pass' },
      golden: true,
    },
  },
});

// 2. Source already at the exact target size: no resampling.
write('exact-size', 'source.png', png(1320, 2868, capture(1320, 2868, 11)), {
  description: 'Exactly 1320 × 2868; passes through without resampling',
  group: 'screenshot',
  source: source('source.png', 'image/png', 1320, 2868),
  presets: {
    'iphone-6.9': {
      crop: { x: 0, y: 0, width: 1320, height: 2868 },
      findings: { 'image.upscaled': 'pass', 'image.crop-loss': 'pass' },
      golden: true,
    },
  },
});

// 3. Undersized icon with transparent rounded corners.
const iconRgba = paint(256, 256, (x, y) => {
  const r = 56;
  const cx = Math.min(Math.max(x, r), 255 - r);
  const cy = Math.min(Math.max(y, r), 255 - r);
  const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (!inside) return [0, 0, 0, 0];
  const ring = Math.hypot(x - 128, y - 128);
  return ring < 70 ? [255, 255, 255, 255] : [47, 125, 79, 255];
});
write('small-icon', 'source.png', png(256, 256, iconRgba, { channels: 4 }), {
  description: 'Undersized 256 × 256 icon with transparent corners',
  group: 'icon',
  source: source('source.png', 'image/png', 256, 256, { hasAlphaChannel: true }),
  presets: {
    'apple-icon': {
      crop: { x: 0, y: 0, width: 256, height: 256 },
      findings: {
        'image.upscaled': 'warning',
        'image.crop-loss': 'pass',
        'image.transparency-flattened': 'warning',
      },
      golden: true,
    },
    'play-icon': {
      crop: { x: 0, y: 0, width: 256, height: 256 },
      findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'pass' },
      golden: true,
    },
  },
});

// 4. Landscape capture dropped on a portrait preset.
write('landscape', 'source.png', png(2400, 1200, capture(2400, 1200, 3)), {
  description: 'Landscape 2400 × 1200 into a portrait preset',
  group: 'screenshot',
  source: source('source.png', 'image/png', 2400, 1200),
  presets: {
    'iphone-6.9': {
      crop: { x: 924, y: 0, width: 552, height: 1200 },
      findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'warning' },
      golden: true,
    },
  },
});

// 5. JPEG stored landscape with EXIF orientation 6 (displayed portrait). Displayed image has a
// red block at the top-left and a blue block at the bottom-right.
const shown = (xd, yd) => {
  if (xd < 100 && yd < 100) return [220, 30, 30];
  if (xd >= 300 && yd >= 500) return [30, 60, 220];
  return yd % 60 < 30 ? [240, 240, 240] : [200, 210, 205];
};
// Orientation 6 rotates stored pixels 90° clockwise: displayed (xd, yd) = stored (yd, H - 1 - xd).
const storedRgba = paint(600, 400, (xs, ys) => shown(400 - 1 - ys, xs));
write('exif-rotated', 'source.jpg', jpegWithExif(600, 400, storedRgba, 6), {
  description: 'JPEG stored 600 × 400 with EXIF orientation 6 (displayed 400 × 600)',
  group: 'screenshot',
  source: source('source.jpg', 'image/jpeg', 600, 400, {
    orientation: 6,
    orientedWidth: 400,
    orientedHeight: 600,
  }),
  presets: {
    'android-phone': {
      crop: { x: 31, y: 0, width: 338, height: 600 },
      findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'pass' },
      golden: true,
      samples: [
        { x: 50, y: 50, rgb: [220, 30, 30] },
        { x: 1000, y: 1800, rgb: [30, 60, 220] },
      ],
    },
  },
});

// 6. Plain JPEG source.
write(
  'photo',
  'source.jpg',
  jpeg.encode({ data: capture(1000, 2000, 5), width: 1000, height: 2000 }, 90).data,
  {
    description: 'JPEG 1000 × 2000 without EXIF',
    group: 'screenshot',
    source: source('source.jpg', 'image/jpeg', 1000, 2000),
    presets: {
      'android-tablet-7': {
        crop: { x: 0, y: 0, width: 1000, height: 1600 },
        findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'pass' },
        golden: true,
      },
    },
  },
);

// 7. 16-bit PNG.
write('sixteen-bit', 'source.png', png(400, 800, capture(400, 800, 9), { depth: 16 }), {
  description: '16-bit RGB PNG, 400 × 800',
  group: 'screenshot',
  source: source('source.png', 'image/png', 400, 800),
  presets: {
    'android-phone': {
      crop: { x: 0, y: 0, width: 400, height: 711 },
      findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'pass' },
      golden: true,
    },
  },
});

// 8. Transparent PNG into a no-alpha, centre-anchored preset.
const transparentRgba = paint(1200, 2400, (x, y) =>
  y > 1000 && y < 1400 ? [47, 125, 79, x < 600 ? 255 : 0] : [236, 240, 250, 255],
);
write('transparent', 'source.png', png(1200, 2400, transparentRgba, { channels: 4 }), {
  description: 'RGBA 1200 × 2400 with a half-transparent band, into the feature graphic',
  group: 'feature-graphic',
  source: source('source.png', 'image/png', 1200, 2400, { hasAlphaChannel: true }),
  presets: {
    'play-feature-graphic': {
      crop: { x: 0, y: 907, width: 1200, height: 586 },
      findings: {
        'image.upscaled': 'pass',
        'image.crop-loss': 'warning',
        'image.transparency-flattened': 'warning',
      },
      golden: true,
    },
  },
});

// 9. Worst-case (incompressible) icon for the Play icon's 1 MB limit.
const noise = mulberry32(42);
const noisyRgba = paint(512, 512, () => [
  Math.floor(noise() * 256),
  Math.floor(noise() * 256),
  Math.floor(noise() * 256),
  Math.floor(noise() * 256),
]);
write('noisy-icon', 'source.png', png(512, 512, noisyRgba, { channels: 4 }), {
  description:
    'Random-noise 512 × 512 RGBA icon at the 1 MB limit. A 512 × 512 RGBA image cannot meaningfully exceed 1 MB (its raw size equals the limit), so the size failure is covered by core unit tests.',
  group: 'icon',
  source: source('source.png', 'image/png', 512, 512, { hasAlphaChannel: true }),
  presets: {
    'play-icon': {
      crop: { x: 0, y: 0, width: 512, height: 512 },
      findings: {
        'image.upscaled': 'pass',
        'image.crop-loss': 'pass',
        'image.output.size': 'pass',
      },
      golden: false,
    },
  },
});

// 10. Valid header, truncated pixel data: inspection passes, decoding fails.
const truncatedSource = png(800, 1600, capture(800, 1600, 13));
write(
  'corrupt',
  'source.png',
  truncatedSource.subarray(0, Math.floor(truncatedSource.length / 3)),
  {
    description: 'PNG truncated part-way through its image data',
    group: 'screenshot',
    source: source('source.png', 'image/png', 800, 1600),
    // Header inspection passes; the complete-file check fails. Chromium also refuses to decode it,
    // while Firefox and WebKit decode the available rows.
    completeInspect: 'malformed',
    render: 'decode-failed',
    presets: {
      'iphone-6.9': {
        crop: { x: 32, y: 0, width: 736, height: 1600 },
        findings: { 'image.upscaled': 'warning', 'image.crop-loss': 'pass' },
        golden: false,
      },
    },
  },
);

// 11. A non-image renamed to .png.
write(
  'not-an-image',
  'source.png',
  new TextEncoder().encode('<!doctype html><html><body>Not an image</body></html>\n'),
  {
    description: 'HTML file renamed to .png',
    group: 'screenshot',
    inspect: 'unsupported-type',
    presets: {},
  },
);

// Aggregate of every case, so tests can import all expectations with one static JSON import.
writeFileSync(new URL('index.json', root), `${JSON.stringify(index, null, 2)}\n`);
