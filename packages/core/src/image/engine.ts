// The pixel-engine contract (spec §7.3). Core defines the types only; renderers implement them.
import type { Finding } from '../findings/types.ts';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything a renderer needs to produce one output, decided by core (spec §7.2). */
export interface ImagePlan {
  presetId: string;
  groupId: string;
  sourceId: string;
  fileName: string;
  /** Oriented source dimensions. */
  source: { width: number; height: number };
  /** Integer rectangle in oriented source pixels. */
  crop: CropRect;
  target: { width: number; height: number };
  /** target.width / crop.width; above 1 means upscaling. */
  scale: number;
  format: 'png' | 'jpeg';
  jpegQuality?: number;
  alpha: boolean;
  /** #RRGGBB background used when alpha is false. */
  flatten?: string;
  maxBytes?: number;
  /** Planning-time findings (upscale, crop loss). */
  findings: Finding[];
}

export interface RenderRequest {
  source: ArrayBuffer | Uint8Array;
  plan: ImagePlan;
  /** Render a reduced preview instead of the full output. */
  preview?: { maxEdge: number };
}

export interface RenderedImage {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  measured: { hadTransparentPixels: boolean };
}

export interface PixelEngine {
  readonly id: string;
  render(request: RenderRequest): Promise<RenderedImage>;
}
