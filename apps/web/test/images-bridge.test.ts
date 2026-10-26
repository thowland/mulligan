import { describe, expect, it } from 'vitest';
import {
  decodeFailure,
  defaultSelection,
  downloadName,
  groupById,
  inspectSource,
  planFor,
  presetById,
  presetsInGroup,
  storeLabel,
  verifyOutput,
  worstOf,
  type SourceImage,
} from '../src/core-bridge/images.ts';
import { pngFile } from './helpers/images.ts';

const source = (width = 1290, height = 12000): SourceImage => {
  const outcome = inspectSource('id-1', 'Home Screen.png', 'screenshot', pngFile(width, height));
  if (!outcome.ok) throw new Error('expected a valid source');
  return outcome.source;
};

describe('image core bridge', () => {
  it('looks up groups, presets and stores from the standards', () => {
    expect(groupById('screenshot').label).toBe('Screenshots');
    expect(() => groupById('banner')).toThrow(/Unknown group/);
    expect(presetsInGroup('icon').map((p) => p.id)).toEqual(['play-icon', 'apple-icon']);
    expect(presetById('ipad-13').width).toBe(2064);
    expect(() => presetById('nope')).toThrow(/Unknown preset/);
    expect(storeLabel('apple')).toBe('Apple App Store');
    expect(storeLabel('amazon')).toBe('amazon');
    expect(defaultSelection('screenshot')).toEqual(['iphone-6.9', 'android-phone']);
  });

  it('accepts a complete PNG and records its header', () => {
    expect(source().info).toMatchObject({ type: 'image/png', orientedWidth: 1290 });
  });

  it('rejects unsupported and truncated files with findings', () => {
    const html = inspectSource('x', 'page.png', 'screenshot', new TextEncoder().encode('<html>'));
    expect(html).toMatchObject({
      ok: false,
      findings: [{ ruleId: 'image.unsupported-type', subject: { fileName: 'page.png' } }],
    });
    const truncated = inspectSource('x', 'cut.png', 'screenshot', pngFile(10, 10).subarray(0, 40));
    expect(truncated).toMatchObject({ ok: false, findings: [{ ruleId: 'image.decode-failed' }] });
  });

  it('plans with oriented dimensions and verifies output through core', () => {
    const plan = planFor(source(), 'iphone-6.9');
    expect(plan.crop).toEqual({ x: 0, y: 0, width: 1290, height: 2803 });
    const findings = verifyOutput(plan, {
      bytes: pngFile(1320, 2868),
      mimeType: 'image/png',
      width: 1320,
      height: 2868,
      measured: { hadTransparentPixels: false },
    });
    expect(worstOf(findings)).toBe('pass');
    expect(worstOf([...plan.findings, ...findings])).toBe('warning');
  });

  it('builds decode failures and download names', () => {
    expect(decodeFailure(source(), 'Broken.')).toMatchObject({
      ruleId: 'image.decode-failed',
      message: 'Broken.',
      subject: { sourceId: 'id-1' },
    });
    expect(downloadName(source(), 'iphone-6.9')).toBe('iphone-6.9_01_home-screen.png');
    expect(downloadName(source(), 'apple-icon')).toBe('icons_01_home-screen_apple-1024.png');
  });
});
