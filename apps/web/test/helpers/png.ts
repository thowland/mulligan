// Test-only image bytes, free of renderer imports so Node-environment tests can use them.

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
