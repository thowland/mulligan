import { describe, expect, it } from 'vitest';
import { checkGroupCounts, checkSourceLimits, getStandards } from '../src/index.ts';

const limits = { maxFileBytes: 50 * 1048576, maxPixels: 150_000_000 };
const ref = { groupId: 'screenshot', sourceId: 's', fileName: 'big.png' };

describe('checkSourceLimits', () => {
  it('passes a file within both limits', () => {
    expect(
      checkSourceLimits({ byteLength: 1000, width: 1290, height: 12000 }, limits, ref),
    ).toEqual({
      ruleId: 'image.too-large',
      severity: 'pass',
      subject: { kind: 'file', ...ref },
      message: 'Within the size limits.',
    });
  });

  it('checks the file size alone before the file is read', () => {
    expect(checkSourceLimits({ byteLength: 62 * 1048576 }, limits, ref)).toMatchObject({
      severity: 'failure',
      message: 'File is 62 MB; the limit is 50 MB.',
      data: { bytes: 62 * 1048576, limit: 50 * 1048576 },
    });
    expect(checkSourceLimits({ byteLength: 10 }, limits, ref).severity).toBe('pass');
  });

  it('rejects header dimensions over the pixel limit (decompression bombs)', () => {
    expect(
      checkSourceLimits({ byteLength: 50_000, width: 100_000, height: 100_000 }, limits, ref),
    ).toMatchObject({
      severity: 'failure',
      message: 'Image is 10000 MP; the limit is 150 MP.',
      data: { pixels: 1e10, limit: 150_000_000 },
    });
  });
});

describe('checkGroupCounts', () => {
  const s = getStandards();

  it('reports one finding per selected preset against its store range', () => {
    const findings = checkGroupCounts(
      {
        groups: [{ groupId: 'screenshot', count: 1 }],
        presetIds: ['iphone-6.9', 'android-phone', 'apple-icon'],
      },
      s,
    );
    expect(findings.map((f) => [f.subject, f.severity, f.message])).toEqual([
      [
        { kind: 'group', groupId: 'screenshot', presetId: 'iphone-6.9' },
        'pass',
        '1 image (1–10 allowed).',
      ],
      [
        { kind: 'group', groupId: 'screenshot', presetId: 'android-phone' },
        'warning',
        'Android phone screenshot takes 2–8 images; 1 provided.',
      ],
      [
        { kind: 'group', groupId: 'icon', presetId: 'apple-icon' },
        'warning',
        'Apple App Store icon takes 1 image; 0 provided.',
      ],
    ]);
    expect(findings[1]?.data).toEqual({ count: 1, min: 2, max: 8 });
  });

  it('flags too many images and pluralises counts', () => {
    const [finding] = checkGroupCounts(
      { groups: [{ groupId: 'screenshot', count: 9 }], presetIds: ['android-phone'] },
      s,
    );
    expect(finding?.message).toBe('Android phone screenshot takes 2–8 images; 9 provided.');
    const [ok] = checkGroupCounts(
      { groups: [{ groupId: 'screenshot', count: 3 }], presetIds: ['android-phone'] },
      s,
    );
    expect(ok?.message).toBe('3 images (2–8 allowed).');
  });

  it('returns nothing when no presets are selected', () => {
    expect(checkGroupCounts({ groups: [], presetIds: [] }, s)).toEqual([]);
  });
});
