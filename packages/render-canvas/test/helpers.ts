import { decode } from 'fast-png';
import { commands, server } from 'vitest/browser';

// Browser commands resolve paths against the Vitest root (the repository root).
const FIXTURES = 'fixtures/images';

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function readFixture(path: string): Promise<Uint8Array> {
  return fromBase64(await commands.readFile(`${FIXTURES}/${path}`, 'base64'));
}

export async function readFixtureIfExists(path: string): Promise<Uint8Array | null> {
  try {
    return await readFixture(path);
  } catch {
    return null;
  }
}

export async function writeFixture(path: string, bytes: Uint8Array): Promise<void> {
  await commands.writeFile(`${FIXTURES}/${path}`, toBase64(bytes), 'base64');
}

export const browserName = (): string => server.browser;

export interface Pixels {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

export function decodePng(bytes: Uint8Array): Pixels {
  const png = decode(bytes);
  return {
    width: png.width,
    height: png.height,
    channels: png.channels,
    data: png.data as Uint8Array,
  };
}

export function pixelAt(p: Pixels, x: number, y: number): number[] {
  const i = (y * p.width + x) * p.channels;
  return Array.from(p.data.subarray(i, i + Math.min(3, p.channels)));
}

function luminance(p: Pixels): Float64Array {
  const out = new Float64Array(p.width * p.height);
  for (let i = 0, j = 0; i < out.length; i++, j += p.channels) {
    out[i] = 0.299 * p.data[j]! + 0.587 * p.data[j + 1]! + 0.114 * p.data[j + 2]!;
  }
  return out;
}

/** Mean SSIM over non-overlapping 8 × 8 windows of luminance. */
export function ssim(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height) return 0;
  const la = luminance(a);
  const lb = luminance(b);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let total = 0;
  let windows = 0;
  for (let y = 0; y + 8 <= a.height; y += 8) {
    for (let x = 0; x + 8 <= a.width; x += 8) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const i = (y + dy) * a.width + x + dx;
          const va = la[i]!;
          const vb = lb[i]!;
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const n = 64;
      const ma = sa / n;
      const mb = sb / n;
      const va = saa / n - ma * ma;
      const vb = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      total += ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
      windows += 1;
    }
  }
  return total / windows;
}
