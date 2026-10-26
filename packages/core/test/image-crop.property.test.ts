// Property tests for crop geometry (spec §13.3).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeCrop, type Anchor } from '../src/index.ts';

const dimension = fc.integer({ min: 1, max: 20000 });
const target = fc.integer({ min: 1, max: 4000 });
const anchor: fc.Arbitrary<Anchor> = fc.oneof(
  fc.constantFrom<Anchor>('top', 'center'),
  fc.record({
    x: fc.constantFrom('left' as const, 'center' as const, 'right' as const),
    y: fc.constantFrom('top' as const, 'center' as const, 'bottom' as const),
  }),
);

describe('computeCrop properties', () => {
  it('lies within the source, in whole pixels, at least 1 × 1', () => {
    fc.assert(
      fc.property(dimension, dimension, target, target, anchor, (sw, sh, tw, th, a) => {
        const c = computeCrop(sw, sh, tw, th, a);
        expect([c.x, c.y, c.width, c.height].every(Number.isInteger)).toBe(true);
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.width).toBeGreaterThanOrEqual(1);
        expect(c.height).toBeGreaterThanOrEqual(1);
        expect(c.x + c.width).toBeLessThanOrEqual(sw);
        expect(c.y + c.height).toBeLessThanOrEqual(sh);
      }),
    );
  });

  it('spans the full source on one axis and matches the target aspect within one pixel', () => {
    fc.assert(
      fc.property(dimension, dimension, target, target, anchor, (sw, sh, tw, th, a) => {
        const c = computeCrop(sw, sh, tw, th, a);
        expect(c.width === sw || c.height === sh).toBe(true);
        // The other axis is the aspect-correct length, never below one pixel. When the crop
        // spans both axes (tiny sources), either axis may be the reference.
        const heightError =
          c.width === sw ? Math.abs(c.height - Math.max(1, (c.width * th) / tw)) : Infinity;
        const widthError =
          c.height === sh ? Math.abs(c.width - Math.max(1, (c.height * tw) / th)) : Infinity;
        expect(Math.min(heightError, widthError)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('respects the anchored edge', () => {
    fc.assert(
      fc.property(dimension, dimension, target, target, (sw, sh, tw, th) => {
        expect(computeCrop(sw, sh, tw, th, 'top').y).toBe(0);
        expect(computeCrop(sw, sh, tw, th, { x: 'left', y: 'top' }).x).toBe(0);
        const br = computeCrop(sw, sh, tw, th, { x: 'right', y: 'bottom' });
        expect(br.x + br.width).toBe(sw);
        expect(br.y + br.height).toBe(sh);
        const centred = computeCrop(sw, sh, tw, th, 'center');
        expect(Math.abs(centred.x - (sw - centred.x - centred.width))).toBeLessThanOrEqual(1);
        expect(Math.abs(centred.y - (sh - centred.y - centred.height))).toBeLessThanOrEqual(1);
      }),
    );
  });
});
