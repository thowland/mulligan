import { describe, expect, it } from 'vitest';
import {
  checkRendered,
  decodeFailedFinding,
  getStandards,
  inspectImage,
  inspectionFindings,
  isImageInspectError,
  planImage,
  renderFailureFinding,
  type ImagePlan,
  type RenderedImage,
} from '../src/index.ts';
import { ascii, pngBytes } from './helpers/image-bytes.ts';

const standards = getStandards();
const planFor = (presetId: string, width = 2000, height = 4000): ImagePlan =>
  planImage(
    { sourceId: 's', fileName: 'a.png', width, height },
    standards.presets.find((p) => p.id === presetId)!,
    standards,
  );

const rendered = (bytes: Uint8Array, overrides: Partial<RenderedImage> = {}): RenderedImage => ({
  bytes,
  mimeType: 'image/png',
  width: 0,
  height: 0,
  measured: { hadTransparentPixels: false },
  ...overrides,
});

const byRule = (findings: { ruleId: string; severity: string }[]) =>
  Object.fromEntries(findings.map((f) => [f.ruleId, f.severity]));

describe('checkRendered', () => {
  it('passes a compliant RGB output', () => {
    const plan = planFor('iphone-6.9');
    const findings = checkRendered(plan, rendered(pngBytes({ width: 1320, height: 2868 })));
    expect(byRule(findings)).toEqual({
      'image.output.format': 'pass',
      'image.output.dimensions': 'pass',
      'image.output.alpha': 'pass',
      'image.transparency-flattened': 'pass',
    });
    expect(findings[0]?.subject).toMatchObject({ kind: 'file', presetId: 'iphone-6.9' });
  });

  it('fails wrong dimensions, an alpha channel and a wrong format', () => {
    const plan = planFor('apple-icon', 1024, 1024);
    const findings = checkRendered(
      plan,
      rendered(pngBytes({ width: 1000, height: 1024, colorType: 6 }), { mimeType: 'image/jpeg' }),
    );
    expect(byRule(findings)).toMatchObject({
      'image.output.format': 'failure',
      'image.output.dimensions': 'failure',
      'image.output.alpha': 'failure',
    });
    expect(findings.find((f) => f.ruleId === 'image.output.dimensions')?.message).toBe(
      'Output is 1000 × 1024, expected 1024 × 1024.',
    );
  });

  it('treats tRNS as an alpha channel', () => {
    const plan = planFor('apple-icon', 1024, 1024);
    const findings = checkRendered(
      plan,
      rendered(pngBytes({ width: 1024, height: 1024, chunks: ['tRNS'] })),
    );
    expect(byRule(findings)['image.output.alpha']).toBe('failure');
  });

  it('permits alpha and enforces the size limit for the Play icon', () => {
    const plan = planFor('play-icon', 512, 512);
    const small = checkRendered(
      plan,
      rendered(pngBytes({ width: 512, height: 512, colorType: 6 })),
    );
    expect(byRule(small)).toEqual({
      'image.output.format': 'pass',
      'image.output.dimensions': 'pass',
      'image.output.alpha': 'pass',
      'image.output.size': 'pass',
    });
    const bigBytes = new Uint8Array(1048577);
    bigBytes.set(pngBytes({ width: 512, height: 512, colorType: 6 }));
    const big = checkRendered(plan, rendered(bigBytes));
    expect(big.find((f) => f.ruleId === 'image.output.size')).toMatchObject({
      severity: 'failure',
      data: { bytes: 1048577, limit: 1048576 },
    });
  });

  it('warns when transparency was flattened', () => {
    const plan = planFor('apple-icon', 1024, 1024);
    const findings = checkRendered(
      plan,
      rendered(pngBytes({ width: 1024, height: 1024 }), {
        measured: { hadTransparentPixels: true },
      }),
    );
    expect(findings.find((f) => f.ruleId === 'image.transparency-flattened')).toMatchObject({
      severity: 'warning',
      message: 'Transparent areas were filled with #FFFFFF.',
    });
  });

  it('describes the background generically when no flatten colour is set', () => {
    const plan = { ...planFor('apple-icon', 1024, 1024) };
    delete plan.flatten;
    const findings = checkRendered(
      plan,
      rendered(pngBytes({ width: 1024, height: 1024 }), {
        measured: { hadTransparentPixels: true },
      }),
    );
    expect(findings.at(-1)?.message).toBe(
      'Transparent areas were filled with the background colour.',
    );
  });

  it('fails unreadable output', () => {
    const findings = checkRendered(planFor('iphone-6.9'), rendered(ascii('nope')));
    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: 'image.output.format',
        severity: 'failure',
        message: 'Output is not a readable image: Not a PNG or JPEG file.',
      }),
    ]);
  });
});

describe('inspection and decode findings', () => {
  const ref = { groupId: 'screenshot', sourceId: 's', fileName: 'x.png' };

  it('maps inspection errors to rule ids', () => {
    const unsupported = inspectImage(ascii('<html>'));
    const malformed = inspectImage(pngBytes().subarray(0, 20));
    if (!isImageInspectError(unsupported) || !isImageInspectError(malformed)) {
      throw new Error('expected inspection errors');
    }
    expect(inspectionFindings(unsupported, ref)).toEqual([
      {
        ruleId: 'image.unsupported-type',
        severity: 'failure',
        subject: { kind: 'file', ...ref },
        message: 'Not a PNG or JPEG file.',
      },
    ]);
    expect(inspectionFindings(malformed, ref)[0]?.ruleId).toBe('image.decode-failed');
  });

  it('builds a decode failure finding', () => {
    expect(decodeFailedFinding(ref, 'Broken.')).toMatchObject({
      ruleId: 'image.decode-failed',
      severity: 'failure',
      message: 'Broken.',
    });
  });

  it('maps render failures to findings by kind', () => {
    expect(renderFailureFinding(ref, { kind: 'decode', message: 'Bad data.' })).toMatchObject({
      ruleId: 'image.decode-failed',
      severity: 'failure',
      message: 'Bad data.',
      subject: { kind: 'file', fileName: ref.fileName },
    });
    expect(renderFailureFinding(ref, { kind: 'encode', message: 'No PNG.' }).message).toBe(
      'Encoding failed: No PNG.',
    );
    expect(renderFailureFinding(ref, { kind: 'crash', message: 'gone' })).toMatchObject({
      ruleId: 'image.decode-failed',
      message: 'The renderer stopped: gone',
    });
    expect(
      renderFailureFinding(ref, { kind: 'memory', message: 'Array buffer allocation failed' }),
    ).toMatchObject({
      ruleId: 'image.too-large',
      severity: 'failure',
      message:
        'The browser ran out of memory processing this image (Array buffer allocation failed). Try a smaller file.',
    });
  });
});
