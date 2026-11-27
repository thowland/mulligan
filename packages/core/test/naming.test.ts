import { describe, expect, it } from 'vitest';
import { getStandards, outputPath, packageStem, sequenceLabel, sourceSlug } from '../src/index.ts';

describe('sourceSlug', () => {
  it.each([
    ['Home Screen (Final).PNG', 'home-screen-final'],
    ['01_dashboard.png', '01-dashboard'],
    ['Café Crème.jpg', 'cafe-creme'],
    ['  --weird__name--.png', 'weird-name'],
    ['archive.tar.gz', 'archive-tar'],
    ['no-extension', 'no-extension'],
    ['😀.png', 'image'],
    ['.png', 'image'],
    ['日本語.png', 'image'],
  ])('%j → %j', (input, expected) => {
    expect(sourceSlug(input)).toBe(expected);
  });

  it('neutralises path traversal, separators and control characters', () => {
    expect(sourceSlug('../../evil.exe')).toBe('evil');
    expect(sourceSlug('C:\\Windows\\system32.png')).toBe('c-windows-system32');
    expect(sourceSlug('a\u0000b\u001fc.png')).toBe('a-b-c');
  });

  it('suffixes Windows reserved device names', () => {
    expect(sourceSlug('CON.png')).toBe('con-file');
    expect(sourceSlug('lpt9.jpg')).toBe('lpt9-file');
    expect(sourceSlug('console.png')).toBe('console');
  });

  it('caps the length at 60 characters without a trailing hyphen', () => {
    const slug = sourceSlug(`${'a'.repeat(59)} b c d.png`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toBe('a'.repeat(59));
    expect(sourceSlug(`${'x'.repeat(100)}.png`)).toHaveLength(60);
  });
});

describe('packageStem', () => {
  it.each([
    ['carePlusAR', 'carePlusAR'],
    ['  Care Plus AR!  ', 'Care-Plus-AR'],
    ['Café Crème 2', 'Cafe-Creme-2'],
    ['../../evil.exe', 'evil-exe'],
    ['C:\\Windows', 'C-Windows'],
    ['a\u0000b/c', 'a-b-c'],
    ['', 'mulligan'],
    ['   ', 'mulligan'],
    ['日本語 😀', 'mulligan'],
    ['CON', 'CON-app'],
    ['console', 'console'],
  ])('%j → %j', (input, expected) => {
    expect(packageStem(input)).toBe(expected);
  });

  it('caps the length at 40 characters without a trailing hyphen', () => {
    expect(packageStem(`${'a'.repeat(39)} b c`)).toBe('a'.repeat(39));
    expect(packageStem('x'.repeat(100))).toHaveLength(40);
  });
});

describe('outputPath', () => {
  const preset = (id: string) => getStandards().presets.find((p) => p.id === id)!;

  it('builds folder, padded sequence, slug and extension', () => {
    expect(outputPath(1, 6, 'Home Screen.png', preset('iphone-6.3'))).toBe(
      'iphone-6.3/01_home-screen.png',
    );
  });

  it('appends the preset suffix and uses .jpg for JPEG presets', () => {
    expect(outputPath(1, 1, 'Logo.png', preset('apple-icon'))).toBe('icons/01_logo_apple-1024.png');
    expect(outputPath(3, 4, 'x.png', { folder: 'f', format: 'jpeg' })).toBe('f/03_x.jpg');
  });

  it('pads to three digits for groups over 99', () => {
    expect(sequenceLabel(7, 99)).toBe('07');
    expect(sequenceLabel(7, 100)).toBe('007');
  });
});
