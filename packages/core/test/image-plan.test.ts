import { describe, expect, it } from 'vitest';
import fixtures from '../../../fixtures/images/index.json' with { type: 'json' };
import {
  computeCrop,
  getStandards,
  parseStandards,
  planImage,
  resolveAnchor,
  type PresetDef,
  type Standards,
} from '../src/index.ts';

const standards = getStandards();
const preset = (id: string): PresetDef => standards.presets.find((p) => p.id === id)!;
const source = (width: number, height: number) => ({
  sourceId: 'src-1',
  fileName: 'Home Screen.png',
  width,
  height,
});
const severities = (findings: { ruleId: string; severity: string }[]) =>
  Object.fromEntries(findings.map((f) => [f.ruleId, f.severity]));

interface FixtureCase {
  group: string;
  source?: { orientedWidth: number; orientedHeight: number; file: string };
  presets: Record<string, { crop: object; findings: Record<string, string> }>;
}

describe('planImage against the shared fixtures', () => {
  const cases = Object.entries(fixtures as Record<string, FixtureCase>).filter(
    ([, c]) => c.source !== undefined,
  );

  it.each(cases)('%s', (_name, fixture) => {
    for (const [presetId, expected] of Object.entries(fixture.presets)) {
      const plan = planImage(
        source(fixture.source!.orientedWidth, fixture.source!.orientedHeight),
        preset(presetId),
        standards,
      );
      expect(plan.crop, presetId).toEqual(expected.crop);
      expect(plan.groupId).toBe(fixture.group);
      const planned = Object.fromEntries(
        Object.entries(expected.findings).filter(
          ([id]) => id === 'image.upscaled' || id === 'image.crop-loss',
        ),
      );
      expect(severities(plan.findings), presetId).toEqual(planned);
    }
  });
});

describe('planImage', () => {
  it('carries identity, target, format and alpha handling', () => {
    const plan = planImage(source(1290, 12000), preset('iphone-6.9'), standards);
    expect(plan).toMatchObject({
      presetId: 'iphone-6.9',
      groupId: 'screenshot',
      sourceId: 'src-1',
      fileName: 'Home Screen.png',
      source: { width: 1290, height: 12000 },
      target: { width: 1320, height: 2868 },
      format: 'png',
      alpha: false,
      flatten: '#FFFFFF',
    });
    expect(plan.scale).toBeCloseTo(1320 / 1290);
    expect(plan.maxBytes).toBeUndefined();
    expect(plan.findings[0]).toMatchObject({
      ruleId: 'image.upscaled',
      severity: 'warning',
      subject: {
        kind: 'file',
        groupId: 'screenshot',
        sourceId: 'src-1',
        fileName: 'Home Screen.png',
        presetId: 'iphone-6.9',
      },
      message: 'Upscaled 1.02× from a 1290 × 2803 crop; the result may be soft.',
      data: { factor: 1.02 },
    });
  });

  it('omits the flatten colour for alpha presets and includes the size limit', () => {
    const plan = planImage(source(512, 512), preset('play-icon'), standards);
    expect(plan.alpha).toBe(true);
    expect(plan.flatten).toBeUndefined();
    expect(plan.maxBytes).toBe(1048576);
    expect(plan.findings.map((f) => f.message)).toEqual([
      'No upscaling needed (scale 1.00×).',
      'Crop keeps the important part of the image.',
    ]);
  });

  it('reports crop loss on the unprotected axis with a readable message', () => {
    const plan = planImage(source(2400, 1200), preset('iphone-6.9'), standards);
    expect(plan.findings[1]).toMatchObject({
      ruleId: 'image.crop-loss',
      severity: 'warning',
      message:
        "Cropping removes 77% of the image's width. Check that the source suits this preset.",
      data: { loss: 0.77, axis: 'width' },
    });
  });

  it('reports height loss for a centre-anchored preset', () => {
    const plan = planImage(source(1000, 1000), preset('play-feature-graphic'), standards);
    expect(plan.findings[1]?.data).toEqual({ loss: 0.512, axis: 'height' });
  });

  it('uses a preset anchor over the group anchor and passes JPEG quality through', () => {
    const document = structuredClone(standards) as unknown as Record<string, unknown> & Standards;
    const presets = document.presets.map((p) =>
      p.id === 'android-phone'
        ? { ...p, anchor: { x: 'right', y: 'bottom' }, format: 'jpeg', jpegQuality: 0.8 }
        : p,
    );
    const parsed = parseStandards({ ...document, presets });
    expect(parsed.ok).toBe(true);
    const s = (parsed as { ok: true; value: Standards }).value;
    const plan = planImage(
      source(2000, 2000),
      s.presets.find((p) => p.id === 'android-phone')!,
      s,
    );
    expect(plan.crop).toEqual({ x: 875, y: 0, width: 1125, height: 2000 });
    expect(plan).toMatchObject({ format: 'jpeg', jpegQuality: 0.8 });
  });

  it('throws on a preset whose group is unknown (programmer error)', () => {
    expect(() =>
      planImage(source(10, 10), { ...preset('iphone-6.9'), group: 'banner' }, standards),
    ).toThrow(/unknown group "banner"/);
  });
});

describe('computeCrop', () => {
  it('honours every anchor position on both axes', () => {
    expect(computeCrop(300, 100, 100, 100, { x: 'left', y: 'top' }).x).toBe(0);
    expect(computeCrop(300, 100, 100, 100, { x: 'center', y: 'top' }).x).toBe(100);
    expect(computeCrop(300, 100, 100, 100, { x: 'right', y: 'top' }).x).toBe(200);
    expect(computeCrop(100, 300, 100, 100, { x: 'center', y: 'top' }).y).toBe(0);
    expect(computeCrop(100, 300, 100, 100, 'center').y).toBe(100);
    expect(computeCrop(100, 300, 100, 100, { x: 'center', y: 'bottom' }).y).toBe(200);
  });

  it('keeps at least one pixel for extreme aspect ratios', () => {
    expect(computeCrop(1, 10000, 1000, 1, 'center')).toEqual({
      x: 0,
      y: 4999,
      width: 1,
      height: 1,
    });
    expect(computeCrop(10000, 1, 1, 1000, 'top')).toEqual({ x: 4999, y: 0, width: 1, height: 1 });
  });
});

describe('resolveAnchor', () => {
  it('expands the shorthands', () => {
    expect(resolveAnchor('top')).toEqual({ x: 'center', y: 'top' });
    expect(resolveAnchor('center')).toEqual({ x: 'center', y: 'center' });
    expect(resolveAnchor({ x: 'left', y: 'bottom' })).toEqual({ x: 'left', y: 'bottom' });
  });
});
