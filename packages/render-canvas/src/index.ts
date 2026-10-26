import type { ImagePlan, PixelEngine, RenderRequest, RenderedImage } from '@mulligan/core';
import { encode as encodePng } from 'fast-png';
import pica, { type Pica } from 'pica';

export const RENDERER_ID = 'canvas';

/** The source could not be decoded by the browser, or decoded to unexpected dimensions. */
export class DecodeError extends Error {
  override name = 'DecodeError';
}

/** The output could not be encoded. */
export class EncodeError extends Error {
  override name = 'EncodeError';
}

export interface CanvasEngineOptions {
  /** pica features; 'ww' is never used because the engine already runs inside a worker. */
  features?: ('js' | 'wasm')[];
}

/**
 * Creates the Canvas-based pixel engine (spec §7.4): decode and orient with createImageBitmap,
 * crop with drawImage, flatten when alpha is not allowed, resample with pica (Lanczos3), and
 * encode PNG with fast-png (so no-alpha outputs are true RGB) or JPEG with convertToBlob.
 */
export function createCanvasEngine(options: CanvasEngineOptions = {}): PixelEngine {
  let resizer: Promise<Pica> | undefined;
  const getResizer = () =>
    (resizer ??= pica({ features: options.features ?? ['js', 'wasm'] }).init());

  return {
    id: RENDERER_ID,
    render: (request) => renderImage(request, getResizer),
  };
}

async function renderImage(
  { source, plan, preview }: RenderRequest,
  getResizer: () => Promise<Pica>,
): Promise<RenderedImage> {
  const crop = await decodeCrop(source, plan);
  const pixels = crop.data;
  const hadTransparentPixels = hasTransparency(pixels);
  if (!plan.alpha) flatten(pixels, plan.flatten ?? '#FFFFFF');

  const { width, height } = preview
    ? previewSize(plan.target, preview.maxEdge)
    : { width: plan.target.width, height: plan.target.height };

  let output: Uint8Array | Uint8ClampedArray = pixels;
  if (width !== crop.width || height !== crop.height) {
    const resizer = await getResizer();
    output = await resizer.resizeBuffer({
      src: pixels,
      width: crop.width,
      height: crop.height,
      toWidth: width,
      toHeight: height,
      filter: 'lanczos3',
      unsharpAmount: 0,
    });
  }

  const bytes = await encode(output, width, height, plan);
  return {
    bytes,
    mimeType: plan.format === 'png' ? 'image/png' : 'image/jpeg',
    width,
    height,
    measured: { hadTransparentPixels },
  };
}

/** Decodes the source with EXIF orientation applied and returns the crop rectangle's pixels. */
export async function decodeCrop(
  source: ArrayBuffer | Uint8Array,
  plan: Pick<ImagePlan, 'source' | 'crop'>,
): Promise<ImageData> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([toArrayBuffer(source)]), {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      premultiplyAlpha: 'none',
    });
  } catch (error) {
    throw new DecodeError(`The image could not be decoded (${describe(error)}).`);
  }
  try {
    if (bitmap.width !== plan.source.width || bitmap.height !== plan.source.height) {
      throw new DecodeError(
        `Decoded size ${bitmap.width} × ${bitmap.height} differs from the header (${plan.source.width} × ${plan.source.height}).`,
      );
    }
    const { x, y, width, height } = plan.crop;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

function toArrayBuffer(source: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (source instanceof ArrayBuffer) return source;
  return source.slice().buffer;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Preview dimensions: the target scaled so its longer edge is at most maxEdge. */
export function previewSize(
  target: { width: number; height: number },
  maxEdge: number,
): { width: number; height: number } {
  const factor = Math.min(1, maxEdge / Math.max(target.width, target.height));
  return {
    width: Math.max(1, Math.round(target.width * factor)),
    height: Math.max(1, Math.round(target.height * factor)),
  };
}

export function hasTransparency(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 255) return true;
  return false;
}

/** Composites RGBA pixels over an opaque #RRGGBB background, in place. */
export function flatten(rgba: Uint8ClampedArray | Uint8Array, background: string): void {
  const bg = [1, 3, 5].map((i) => Number.parseInt(background.slice(i, i + 2), 16));
  const [br, bgG, bb] = bg as [number, number, number];
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a === 255) continue;
    const t = a / 255;
    rgba[i] = Math.round(rgba[i]! * t + br * (1 - t));
    rgba[i + 1] = Math.round(rgba[i + 1]! * t + bgG * (1 - t));
    rgba[i + 2] = Math.round(rgba[i + 2]! * t + bb * (1 - t));
    rgba[i + 3] = 255;
  }
}

export function rgbaToRgb(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!;
    rgb[j + 1] = rgba[i + 1]!;
    rgb[j + 2] = rgba[i + 2]!;
  }
  return rgb;
}

async function encode(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  plan: Pick<ImagePlan, 'format' | 'alpha' | 'jpegQuality'>,
): Promise<Uint8Array> {
  if (plan.format === 'png') {
    return plan.alpha
      ? encodePng({ width, height, data: rgba, channels: 4, depth: 8 })
      : encodePng({ width, height, data: rgbaToRgb(rgba), channels: 3, depth: 8 });
  }
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  try {
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: plan.jpegQuality ?? 0.92,
    });
    return new Uint8Array(await blob.arrayBuffer());
  } catch (error) {
    throw new EncodeError(`JPEG encoding failed (${describe(error)}).`);
  }
}
