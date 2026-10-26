import type { RenderRequest, RenderedImage } from '@mulligan/core';
import { previewSize } from '@mulligan/render-canvas';
import type { RenderService } from '../../src/render/service.ts';

/** A structurally complete PNG (signature, IHDR, IDAT, IEND) with no real pixel data. */
export function pngFile(width: number, height: number, colorType = 2): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const length = [24, 16, 8, 0].map((s) => (data.length >>> s) & 0xff);
    return [...length, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const u32 = (v: number) => [24, 16, 8, 0].map((s) => (v >>> s) & 0xff);
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...u32(width), ...u32(height), 8, colorType, 0, 0, 0]),
    ...chunk('IDAT', [0, 0, 0, 0]),
    ...chunk('IEND', []),
  ]);
}

export function imageFile(name: string, bytes: Uint8Array, type = 'image/png'): File {
  return new File([bytes.slice()], name, { type });
}

/** Renders "successfully" by returning a header-only PNG of the requested output size. */
export function fakeRender(request: RenderRequest): Promise<RenderedImage> {
  const { width, height } = request.preview
    ? previewSize(request.plan.target, request.preview.maxEdge)
    : request.plan.target;
  return Promise.resolve({
    bytes: pngFile(width, height, request.plan.alpha ? 6 : 2),
    mimeType: 'image/png',
    width,
    height,
    measured: { hadTransparentPixels: false },
  });
}

export function fakeService(
  render: (request: RenderRequest) => Promise<RenderedImage> = fakeRender,
): RenderService & { calls: RenderRequest[] } {
  const calls: RenderRequest[] = [];
  return {
    calls,
    render(request) {
      calls.push(request);
      return render(request);
    },
    dispose() {},
  };
}
