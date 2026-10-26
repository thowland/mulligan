import type { PixelEngine, RenderRequest, RenderedImage } from '@mulligan/core';
import { transfer } from 'comlink';

export interface RenderApi {
  render(request: RenderRequest): Promise<RenderedImage>;
}

/** The API exposed by the render worker: renders and transfers the output bytes back. */
export function createRenderApi(engine: PixelEngine): RenderApi {
  return {
    async render(request) {
      const output = await engine.render(request);
      return transfer(output, [output.bytes.buffer]);
    },
  };
}
