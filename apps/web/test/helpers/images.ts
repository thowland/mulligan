import type { PixelEngine, RenderRequest, RenderedImage } from '@mulligan/core';
import { previewSize } from '@mulligan/render-canvas';
import { expose } from 'comlink';
import { vi } from 'vitest';
import { inspectSource, planFor, verifyOutput } from '../../src/core-bridge/images.ts';
import { PREVIEW_MAX_EDGE } from '../../src/config.ts';
import { createRenderApi } from '../../src/render/api.ts';
import type { FullOutput, RenderCache } from '../../src/render/cache.ts';
import type { SourceEntry } from '../../src/state/images.ts';

/** A structurally complete PNG (signature, IHDR, IDAT, IEND) with no real pixel data. */
export function pngFile(width: number, height: number, colorType = 2): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const length = [24, 16, 8, 0].map((s) => (data.length >>> s) & 0xff);
    return [...length, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const u32 = (v: number) => [24, 16, 8, 0].map((s) => (v >>> s) & 0xff);
  return Uint8Array.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk('IHDR', [...u32(width), ...u32(height), 8, colorType, 0, 0, 0]),
    ...chunk('IDAT', [0, 0, 0, 0]),
    ...chunk('IEND', []),
  ]);
}

export function imageFile(name: string, bytes: Uint8Array, type = 'image/png'): File {
  return new File([bytes.slice()], name, { type });
}

let counter = 0;

/** A session source built from a header-only PNG, with a unique fake hash. */
export function sourceEntry(
  fileName: string,
  width = 1320,
  height = 2868,
  groupId = 'screenshot',
): SourceEntry {
  counter += 1;
  const outcome = inspectSource(`id-${counter}`, fileName, groupId, pngFile(width, height));
  if (!outcome.ok) throw new Error('bad test source');
  return { ...outcome.source, sha256: counter.toString(16).padStart(64, '0') };
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

export const fakeEngine = (render: PixelEngine['render'] = fakeRender): PixelEngine => ({
  id: 'fake',
  render,
});

/** A worker stand-in: the far end of a MessageChannel hosting the real render API. */
export function channelEndpoint(engine: PixelEngine = fakeEngine()) {
  const { port1, port2 } = new MessageChannel();
  expose(createRenderApi(engine), port1);
  return Object.assign(port2, { terminate: vi.fn(() => port2.close()) });
}

export interface FakeCache extends RenderCache {
  calls: string[];
}

/** A render cache that renders header-only PNGs immediately, or as the overrides say. */
export function fakeCache(
  overrides: { preview?: RenderCache['preview']; full?: RenderCache['full'] } = {},
): FakeCache {
  const calls: string[] = [];
  return {
    calls,
    preview(source, presetId) {
      calls.push(`preview:${source.fileName}:${presetId}`);
      if (overrides.preview) return overrides.preview(source, presetId);
      return fakeRender({
        source: source.bytes,
        plan: planFor(source, presetId),
        preview: { maxEdge: PREVIEW_MAX_EDGE },
      });
    },
    async full(source, presetId) {
      calls.push(`full:${source.fileName}:${presetId}`);
      if (overrides.full) return overrides.full(source, presetId);
      const plan = planFor(source, presetId);
      const output = await fakeRender({ source: source.bytes, plan });
      return {
        blob: new Blob([output.bytes.slice()], { type: output.mimeType }),
        mimeType: output.mimeType,
        width: output.width,
        height: output.height,
        size: output.bytes.length,
        findings: verifyOutput(plan, output),
      } satisfies FullOutput;
    },
    prune: vi.fn(),
  };
}
