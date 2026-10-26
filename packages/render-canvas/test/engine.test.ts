import { describe, expect, it } from 'vitest';
import type { ImagePlan } from '@mulligan/core';
import { RENDERER_ID, createCanvasEngine } from '../src/index.ts';

const plan: ImagePlan = {
  presetId: 'iphone-6.9',
  source: { width: 1320, height: 2868 },
  crop: { x: 0, y: 0, width: 1320, height: 2868 },
  target: { width: 1320, height: 2868 },
  scale: 1,
  format: 'png',
  alpha: false,
  flatten: '#FFFFFF',
};

describe('createCanvasEngine', () => {
  it('identifies itself', () => {
    expect(createCanvasEngine().id).toBe(RENDERER_ID);
  });

  it('runs in a browser with OffscreenCanvas available', () => {
    expect(typeof OffscreenCanvas).toBe('function');
  });

  it('rejects render requests until Sprint 1', async () => {
    await expect(createCanvasEngine().render({ source: new Uint8Array(), plan })).rejects.toThrow(
      /not implemented yet \(preset iphone-6\.9\)/,
    );
  });
});
