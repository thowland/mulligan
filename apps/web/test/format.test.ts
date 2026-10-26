import { describe, expect, it } from 'vitest';
import {
  formatAnchor,
  formatBytes,
  formatDimensions,
  formatLimit,
  formatOutput,
} from '../src/features/format.ts';

describe('format helpers', () => {
  it('formats dimensions', () => {
    expect(formatDimensions(1320, 2868)).toBe('1320 × 2868');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(15728640)).toBe('15 MB');
    expect(formatBytes(5 * 1024 ** 4)).toBe('5120 GB');
  });

  it('formats output format and alpha', () => {
    expect(formatOutput({ format: 'png', alpha: false })).toBe('PNG · no alpha');
    expect(formatOutput({ format: 'png', alpha: true })).toBe('PNG · alpha allowed');
  });

  it('formats anchors', () => {
    expect(formatAnchor('top')).toBe('Top-anchored crop');
    expect(formatAnchor('center')).toBe('Centered crop');
    expect(formatAnchor({ x: 'left', y: 'bottom' })).toBe('Crop anchored bottom-left');
  });

  it('formats limits', () => {
    expect(formatLimit({ max: 30, unit: 'chars' })).toBe('30 characters');
    expect(formatLimit({ max: 30, min: 2, unit: 'chars' })).toBe('2–30 characters');
    expect(formatLimit({ max: 100, unit: 'bytes' })).toBe('100 bytes');
  });
});
