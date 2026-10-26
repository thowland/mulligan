import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportListing } from '../src/core-bridge/listing.ts';
import { buildPackage, packageFileName } from '../src/features/package/build.ts';
import { createZipWriter } from '../src/features/package/zip.ts';
import { fakeCache, sourceEntry } from './helpers/images.ts';

const unzip = async (blob: Blob) => unzipSync(new Uint8Array(await blob.arrayBuffer()));

describe('buildPackage', () => {
  it('writes every output and a manifest, reporting progress', async () => {
    const sources = {
      screenshot: [sourceEntry('Home.png'), sourceEntry('Settings.png')],
      icon: [sourceEntry('Logo.png', 1024, 1024, 'icon')],
    };
    const progress: string[] = [];
    const built = await buildPackage({
      sources,
      presetIds: ['iphone-6.9', 'apple-icon'],
      cache: fakeCache(),
      now: new Date(2026, 9, 25, 14, 30),
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    });
    expect(built.fileName).toBe('mulligan-2026-10-25-1430.zip');
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    const files = await unzip(built.blob);
    expect(Object.keys(files).sort()).toEqual([
      'icons/01_logo_apple-1024.png',
      'iphone-6.9/01_home.png',
      'iphone-6.9/02_settings.png',
      'manifest.json',
    ]);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest).toEqual(JSON.parse(built.manifest));
    expect(
      manifest.sources.map((s: { seq: number; fileName: string; group: string }) => [
        s.group,
        s.seq,
        s.fileName,
      ]),
    ).toEqual([
      ['screenshot', 1, 'Home.png'],
      ['screenshot', 2, 'Settings.png'],
      ['icon', 1, 'Logo.png'],
    ]);
    expect(manifest.outputs[1]).toMatchObject({
      path: 'iphone-6.9/02_settings.png',
      width: 1320,
      height: 2868,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      crop: { x: 0, y: 0, width: 1320, height: 2868 },
      status: 'pass',
    });
    expect(manifest.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual([
      'group.count',
      'group.count',
    ]);
  });

  it('records render failures once per source and leaves their outputs out', async () => {
    const broken = sourceEntry('broken.png');
    const good = sourceEntry('good.png');
    const healthy = fakeCache();
    const cache = fakeCache({
      full: (source, presetId) =>
        source === broken
          ? Promise.reject(Object.assign(new Error('Cannot decode.'), { name: 'DecodeError' }))
          : healthy.full(source, presetId),
    });
    const built = await buildPackage({
      sources: { screenshot: [broken, good] },
      presetIds: ['iphone-6.9', 'ipad-13'],
      cache,
    });
    const files = await unzip(built.blob);
    expect(Object.keys(files).sort()).toEqual([
      'ipad-13/02_good.png',
      'iphone-6.9/02_good.png',
      'manifest.json',
    ]);
    const manifest = JSON.parse(built.manifest);
    const decode = manifest.findings.filter(
      (f: { ruleId: string }) => f.ruleId === 'image.decode-failed',
    );
    expect(decode).toHaveLength(1);
    expect(decode[0].message).toBe('Cannot decode.');
  });

  it('refuses an output whose bytes do not match its type', async () => {
    const source = sourceEntry('a.png');
    const cache = fakeCache({
      full: async () => ({
        blob: new Blob(['<html>']),
        mimeType: 'image/png',
        width: 1320,
        height: 2868,
        size: 6,
        findings: [],
      }),
    });
    const built = await buildPackage({
      sources: { screenshot: [source] },
      presetIds: ['iphone-6.9'],
      cache,
    });
    expect(Object.keys(await unzip(built.blob))).toEqual(['manifest.json']);
    expect(JSON.parse(built.manifest).findings.map((f: { ruleId: string }) => f.ruleId)).toContain(
      'package.entry-type',
    );
  });

  it('adds the listing exports and records them in the manifest', async () => {
    const listing = exportListing(
      { inputs: { 'apple.name': { text: 'Example' } }, straightQuotes: {} },
      new Date('2026-10-25T14:30:00Z'),
    );
    const built = await buildPackage({
      sources: {},
      presetIds: [],
      cache: fakeCache(),
      listing,
      now: new Date(2026, 9, 25, 14, 30),
    });
    const files = await unzip(built.blob);
    expect(Object.keys(files).sort()).toEqual([
      'listing/listing.json',
      'listing/listing.txt',
      'manifest.json',
    ]);
    expect(new TextDecoder().decode(files['listing/listing.json'])).toBe(listing.json);
    expect(new TextDecoder().decode(files['listing/listing.txt'])).toBe(listing.txt);
    const manifest = JSON.parse(built.manifest);
    expect(manifest.listing).toEqual({ path: 'listing/listing.json', status: 'failure' });
    expect(manifest.summary.failure).toBeGreaterThan(0);
  });

  it('refuses listing exports that are not valid JSON', async () => {
    const listing = exportListing(
      { inputs: { 'apple.name': { text: 'Example' } }, straightQuotes: {} },
      new Date(),
    );
    const built = await buildPackage({
      sources: {},
      presetIds: [],
      cache: fakeCache(),
      listing: { ...listing, json: '{ broken' },
    });
    const files = await unzip(built.blob);
    expect(Object.keys(files).sort()).toEqual(['listing/listing.txt', 'manifest.json']);
    const manifest = JSON.parse(built.manifest);
    expect(manifest).not.toHaveProperty('listing');
    expect(manifest.findings.map((f: { ruleId: string }) => f.ruleId)).toContain(
      'package.entry-type',
    );
  });

  it('names packages by local date and time', () => {
    expect(packageFileName(new Date(2026, 0, 2, 3, 4))).toBe('mulligan-2026-01-02-0304.zip');
  });
});

describe('createZipWriter', () => {
  it('stores and deflates entries', async () => {
    const zip = createZipWriter();
    zip.addStored('a/01_x.png', Uint8Array.of(1, 2, 3));
    zip.addDeflated('manifest.json', new TextEncoder().encode('{"a":1}'));
    const files = await unzip(await zip.finish());
    expect(Array.from(files['a/01_x.png']!)).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(files['manifest.json'])).toBe('{"a":1}');
  });
});
