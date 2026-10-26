import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));

export function fixture(path: string): Buffer {
  return readFileSync(`${root}fixtures/${path}`);
}

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export function imageFile(name: string, fixturePath: string): UploadFile {
  return {
    name,
    mimeType: fixturePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    buffer: fixture(fixturePath),
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A copy of a PNG with a distinct tEXt chunk after IHDR: different bytes and hash, identical
 * pixels, so a test can add many sources without the render cache folding them together.
 */
export function pngVariant(png: Buffer, label: string): Buffer {
  const data = Buffer.from(`Comment\0${label}`, 'latin1');
  const typeAndData = Buffer.concat([Buffer.from('tEXt', 'latin1'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  const ihdrEnd = 8 + 25;
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

export interface PngHeader {
  width: number;
  height: number;
  colorType: number;
  hasTrns: boolean;
}

export function pngHeader(bytes: Uint8Array): PngHeader {
  const buffer = Buffer.from(bytes);
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let offset = 8;
  let hasTrns = false;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'tRNS') hasTrns = true;
    if (type === 'IDAT') break;
    offset += 12 + buffer.readUInt32BE(offset);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25]!,
    hasTrns,
  };
}

export async function unzipDownload(download: Download): Promise<Record<string, Uint8Array>> {
  const path = await download.path();
  return unzipSync(new Uint8Array(readFileSync(path)));
}

export async function upload(page: Page, groupId: string, files: UploadFile[]): Promise<void> {
  await page.getByTestId(`file-input-${groupId}`).setInputFiles(files);
}

/** Waits until every preview card on the page has finished its full render. */
export async function waitForRenders(page: Page, expectedCards: number, timeout = 60_000) {
  await expect(page.getByRole('article').filter({ has: page.getByRole('status') })).toHaveCount(
    expectedCards,
    { timeout },
  );
  await expect(page.locator('article [role="status"]', { hasText: 'Rendering…' })).toHaveCount(0, {
    timeout,
  });
}

export async function downloadPackage(page: Page, timeout = 120_000) {
  await page.getByRole('tab', { name: 'Package' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    page.getByRole('button', { name: 'Download package' }).click(),
  ]);
  return download;
}

/**
 * Every test fails on a CSP or Trusted Types violation or an uncaught page error (spec §10.3).
 * Violations are collected both from `securitypolicyviolation` events and from console reports.
 */
export const test = base.extend<{ violations: string[] }>({
  violations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(
            `[securitypolicyviolation] ${event.violatedDirective} ${event.blockedURI} ${event.sample}`,
          );
        });
      });
      page.on('console', (message) => {
        const text = message.text();
        if (
          message.type() === 'error' &&
          /securitypolicyviolation|Content Security Policy|Trusted ?Type|TrustedScript|TrustedHTML/i.test(
            text,
          )
        ) {
          violations.push(text);
        }
      });
      page.on('pageerror', (error) => violations.push(`pageerror: ${error.message}`));
      page.on('crash', () => violations.push('page crashed'));
      await use(violations);
      expect(violations, 'CSP / Trusted Types violations or page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
