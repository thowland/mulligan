import {
  checkRendered,
  getStandards,
  inspectImage,
  isImageInspectError,
  planImage,
  type ImageInfo,
  type ImagePlan,
} from '@mulligan/core';
import { describe, expect, it } from 'vitest';
import fixtures from '../../../fixtures/images/index.json' with { type: 'json' };
import {
  DecodeError,
  RENDERER_ID,
  createCanvasEngine,
  flatten,
  hasTransparency,
  previewSize,
  rgbaToRgb,
} from '../src/index.ts';
import {
  browserName,
  decodePng,
  pixelAt,
  readFixture,
  readFixtureIfExists,
  ssim,
  writeFixture,
} from './helpers.ts';

interface FixturePreset {
  crop: object;
  findings: Record<string, string>;
  golden: boolean;
  samples?: { x: number; y: number; rgb: number[] }[];
}
interface FixtureCase {
  description: string;
  group: string;
  source?: Omit<ImageInfo, 'colorType' | 'bitDepth' | 'animated' | 'iccProfile' | 'cmyk'> & {
    file: string;
  };
  inspect?: string;
  completeInspect?: string;
  render?: string;
  presets: Record<string, FixturePreset>;
}

const standards = getStandards();
const engine = createCanvasEngine();
const cases = Object.entries(fixtures as Record<string, FixtureCase>);
const GOLDEN_SSIM = 0.98;

function plan(name: string, info: ImageInfo, presetId: string): ImagePlan {
  return planImage(
    {
      sourceId: name,
      fileName: `${name}.png`,
      width: info.orientedWidth,
      height: info.orientedHeight,
    },
    standards.presets.find((p) => p.id === presetId)!,
    standards,
  );
}

async function load(
  name: string,
  fixture: FixtureCase,
): Promise<{ bytes: Uint8Array; info: ImageInfo }> {
  const bytes = await readFixture(`${name}/${fixture.source!.file}`);
  const info = inspectImage(bytes);
  if (isImageInspectError(info)) throw new Error(`${name}: ${info.message}`);
  return { bytes, info };
}

describe('fixtures: inspection', () => {
  it.each(cases.filter(([, c]) => c.inspect))('%s is rejected', async (name, fixture) => {
    expect(inspectImage(await readFixture(`${name}/source.png`))).toMatchObject({
      error: fixture.inspect,
    });
  });

  it.each(cases.filter(([, c]) => c.source))('%s', async (name, fixture) => {
    const file = fixture.source!.file;
    const result = inspectImage(await readFixture(`${name}/${file}`));
    const expected: Partial<ImageInfo> & { file?: string } = { ...fixture.source! };
    delete expected.file;
    expect(result).toMatchObject(expected);
    const complete = inspectImage(await readFixture(`${name}/${file}`), { complete: true });
    expect(complete).toMatchObject(
      fixture.completeInspect ? { error: fixture.completeInspect } : expected,
    );
  });
});

/** Goldens are recorded by the Chromium renderer (spec §13.4); delete one to re-record it. */
async function record(path: string, bytes: Uint8Array): Promise<Uint8Array> {
  if (browserName() !== 'chromium')
    throw new Error(`Missing golden ${path}; record it in Chromium`);
  await writeFixture(path, bytes);
  return bytes;
}

const renderable = cases.filter(([, c]) => c.source && c.render !== 'decode-failed');

describe('fixtures: full renders', () => {
  it.each(renderable)('%s', { timeout: 120_000 }, async (name, fixture) => {
    const { bytes, info } = await load(name, fixture);
    for (const [presetId, expected] of Object.entries(fixture.presets)) {
      const p = plan(name, info, presetId);
      const out = await engine.render({ source: bytes, plan: p });

      expect(out.width, presetId).toBe(p.target.width);
      expect(out.height, presetId).toBe(p.target.height);

      // Every output check passes unless the fixture expects otherwise.
      const findings = checkRendered(p, out);
      for (const finding of findings) {
        const want = expected.findings[finding.ruleId] ?? 'pass';
        expect(finding.severity, `${presetId} ${finding.ruleId}: ${finding.message}`).toBe(want);
      }

      // No-alpha presets must be true RGB PNGs (colour type 2); alpha presets RGBA.
      const decoded = decodePng(out.bytes);
      expect(decoded.channels, presetId).toBe(p.alpha ? 4 : 3);

      for (const sample of expected.samples ?? []) {
        const actual = pixelAt(decoded, sample.x, sample.y);
        actual.forEach((channel, i) => expect(Math.abs(channel - sample.rgb[i]!)).toBeLessThan(40));
      }

      if (!expected.golden) continue;
      const goldenPath = `${name}/golden/${presetId}.png`;
      const golden =
        (await readFixtureIfExists(goldenPath)) ?? (await record(goldenPath, out.bytes));
      const score = ssim(decoded, decodePng(golden));
      expect(score, `${presetId} SSIM against ${goldenPath}`).toBeGreaterThanOrEqual(GOLDEN_SSIM);
    }
  });
});

describe('exit criteria', () => {
  it('produces an Apple icon PNG with colour type 2 and no alpha channel', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['small-icon']!;
    const { bytes, info } = await load('small-icon', fixture);
    const out = await engine.render({
      source: bytes,
      plan: plan('small-icon', info, 'apple-icon'),
    });
    expect(inspectImage(out.bytes)).toMatchObject({
      width: 1024,
      height: 1024,
      colorType: 2,
      hasAlphaChannel: false,
    });
    expect(out.measured.hadTransparentPixels).toBe(true);
  });

  it('keeps the Play icon as RGBA (colour type 6)', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['small-icon']!;
    const { bytes, info } = await load('small-icon', fixture);
    const out = await engine.render({ source: bytes, plan: plan('small-icon', info, 'play-icon') });
    expect(inspectImage(out.bytes)).toMatchObject({ width: 512, height: 512, colorType: 6 });
    // The transparent corner survives.
    expect(pixelAt(decodePng(out.bytes), 0, 0)).toBeDefined();
    expect(decodePng(out.bytes).data[3]).toBe(0);
  });
});

describe('createCanvasEngine', () => {
  it('identifies itself', () => {
    expect(engine.id).toBe(RENDERER_ID);
  });

  it('renders previews within the requested edge, keeping the aspect ratio', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['long-capture']!;
    const { bytes, info } = await load('long-capture', fixture);
    const out = await engine.render({
      source: bytes,
      plan: plan('long-capture', info, 'iphone-6.9'),
      preview: { maxEdge: 480 },
    });
    expect({ width: out.width, height: out.height }).toEqual({ width: 221, height: 480 });
    expect(inspectImage(out.bytes)).toMatchObject({ width: 221, height: 480 });
  });

  it('encodes JPEG presets with the browser encoder', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['photo']!;
    const { bytes, info } = await load('photo', fixture);
    const jpegPlan: ImagePlan = {
      ...plan('photo', info, 'android-tablet-7'),
      format: 'jpeg',
      jpegQuality: 0.85,
    };
    const out = await engine.render({ source: bytes, plan: jpegPlan });
    expect(out.mimeType).toBe('image/jpeg');
    expect(inspectImage(out.bytes)).toMatchObject({
      type: 'image/jpeg',
      width: 1200,
      height: 1920,
    });
    expect(checkRendered(jpegPlan, out).every((f) => f.severity === 'pass')).toBe(true);
  });

  it('works with the pure-JavaScript resampler only', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['sixteen-bit']!;
    const { bytes, info } = await load('sixteen-bit', fixture);
    const out = await createCanvasEngine({ features: ['js'] }).render({
      source: bytes,
      plan: plan('sixteen-bit', info, 'android-phone'),
    });
    expect(out.width).toBe(1080);
  });

  it('accepts an ArrayBuffer source', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['exact-size']!;
    const { bytes, info } = await load('exact-size', fixture);
    const buffer = bytes.slice().buffer;
    const out = await engine.render({
      source: buffer,
      plan: plan('exact-size', info, 'iphone-6.9'),
    });
    expect(out.height).toBe(2868);
  });

  it('rejects a truncated file in Chromium; other engines decode the available rows', async () => {
    // Engines disagree here, which is why the app relies on inspectImage({ complete: true }).
    const fixture = (fixtures as Record<string, FixtureCase>)['corrupt']!;
    const { bytes, info } = await load('corrupt', fixture);
    const outcome = await engine
      .render({ source: bytes, plan: plan('corrupt', info, 'iphone-6.9') })
      .then(
        () => 'decoded',
        (error: unknown) => (error instanceof DecodeError ? 'decode-error' : String(error)),
      );
    expect(outcome).toBe(browserName() === 'chromium' ? 'decode-error' : 'decoded');
  });

  it('rejects bytes the browser cannot decode at all with a DecodeError', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['exact-size']!;
    const { info } = await load('exact-size', fixture);
    await expect(
      engine.render({
        source: new TextEncoder().encode('nope'),
        plan: plan('x', info, 'iphone-6.9'),
      }),
    ).rejects.toBeInstanceOf(DecodeError);
  });

  it('rejects a file whose decoded size differs from the plan', async () => {
    const fixture = (fixtures as Record<string, FixtureCase>)['exact-size']!;
    const { bytes, info } = await load('exact-size', fixture);
    const wrong = { ...plan('exact-size', info, 'iphone-6.9'), source: { width: 10, height: 10 } };
    await expect(engine.render({ source: bytes, plan: wrong })).rejects.toThrow(
      /Decoded size 1320 × 2868 differs from the header \(10 × 10\)/,
    );
  });
});

describe('pixel helpers', () => {
  it('computes preview sizes without enlarging', () => {
    expect(previewSize({ width: 1320, height: 2868 }, 480)).toEqual({ width: 221, height: 480 });
    expect(previewSize({ width: 1024, height: 500 }, 480)).toEqual({ width: 480, height: 234 });
    expect(previewSize({ width: 100, height: 50 }, 480)).toEqual({ width: 100, height: 50 });
    expect(previewSize({ width: 10000, height: 1 }, 480)).toEqual({ width: 480, height: 1 });
  });

  it('detects transparency', () => {
    expect(hasTransparency(Uint8Array.of(1, 2, 3, 255, 4, 5, 6, 255))).toBe(false);
    expect(hasTransparency(Uint8Array.of(1, 2, 3, 255, 4, 5, 6, 254))).toBe(true);
  });

  it('flattens over a background colour', () => {
    const px = Uint8Array.of(255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 128);
    flatten(px, '#FFFFFF');
    expect(Array.from(px)).toEqual([255, 0, 0, 255, 255, 255, 255, 255, 127, 127, 255, 255]);
  });

  it('drops the alpha channel', () => {
    expect(Array.from(rgbaToRgb(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8)))).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
  });
});
