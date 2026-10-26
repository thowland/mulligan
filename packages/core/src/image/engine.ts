// The pixel-engine contract (spec §7.3). Core defines the types only; renderers implement them.

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImagePlan {
  presetId: string;
  source: { width: number; height: number };
  crop: CropRect;
  target: { width: number; height: number };
  scale: number;
  format: 'png' | 'jpeg';
  jpegQuality?: number;
  alpha: boolean;
  flatten?: string;
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
  measured: { hadTransparentPixels: boolean };
}

export interface PixelEngine {
  readonly id: string;
  render(request: RenderRequest): Promise<RenderedImage>;
}
