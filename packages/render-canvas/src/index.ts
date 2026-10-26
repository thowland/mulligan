import type { PixelEngine, RenderRequest, RenderedImage } from '@mulligan/core';

export const RENDERER_ID = 'canvas';

/**
 * Creates the Canvas-based pixel engine (spec §7.4).
 * Sprint 0 provides the contract only; rendering arrives in Sprint 1.
 */
export function createCanvasEngine(): PixelEngine {
  return {
    id: RENDERER_ID,
    render(request: RenderRequest): Promise<RenderedImage> {
      return Promise.reject(
        new Error(`Canvas rendering is not implemented yet (preset ${request.plan.presetId})`),
      );
    },
  };
}
