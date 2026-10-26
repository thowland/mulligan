import { describe, expect, it, vi } from 'vitest';
import { intakeFiles, sha256Hex } from '../src/features/images/intake.ts';
import { imageFile, pngFile } from './helpers/images.ts';

// Small limits so the tests need no large files.
vi.mock('../src/config.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SOURCE_LIMITS: { maxFileBytes: 200, maxPixels: 1_000_000 },
}));

describe('intakeFiles', () => {
  it('accepts valid files in order with their hashes', async () => {
    const result = await intakeFiles('screenshot', [
      imageFile('b.png', pngFile(100, 200)),
      imageFile('a.png', pngFile(300, 400)),
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted.map((s) => [s.fileName, s.groupId, s.info.orientedWidth])).toEqual([
      ['b.png', 'screenshot', 100],
      ['a.png', 'screenshot', 300],
    ]);
    expect(result.accepted[0]!.sha256).toBe(await sha256Hex(pngFile(100, 200)));
    expect(result.accepted[0]!.id).not.toBe(result.accepted[1]!.id);
  });

  it('rejects oversized files before reading them', async () => {
    const big = imageFile('big.png', new Uint8Array(500));
    const read = vi.spyOn(big, 'arrayBuffer');
    const result = await intakeFiles('screenshot', [big]);
    expect(read).not.toHaveBeenCalled();
    expect(result.rejected).toEqual([
      expect.objectContaining({
        fileName: 'big.png',
        groupId: 'screenshot',
        messages: ['File is 0 MB; the limit is 0 MB.'],
      }),
    ]);
  });

  it('rejects unsupported files and pixel bombs', async () => {
    const result = await intakeFiles('icon', [
      imageFile('page.png', new TextEncoder().encode('<html>')),
      imageFile('bomb.png', pngFile(100_000, 100_000)),
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((n) => [n.fileName, n.messages])).toEqual([
      ['page.png', ['Not a PNG or JPEG file.']],
      ['bomb.png', ['Image is 10000 MP; the limit is 1 MP.']],
    ]);
  });

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
