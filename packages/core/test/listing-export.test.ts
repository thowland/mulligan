import { describe, expect, it } from 'vitest';
import {
  LISTING_PATHS,
  buildManifest,
  getStandards,
  getStandardsInfo,
  LIBRARY_VERSION,
  listingStatus,
  parseListingJson,
  planPackage,
  processListing,
  serializeListingJson,
  serializeListingText,
  type ListingExport,
} from '../src/index.ts';

const s = getStandards();
const meta = { exportedAt: '2026-10-25T14:30:00.000Z' };

const listing = processListing(
  {
    fields: {
      'apple.name': { text: 'Example Health' },
      'apple.description': { text: 'Track symptoms and share\nreports with your doctor.' },
      'google.title': { text: 'Example' },
    },
  },
  s,
);

describe('serializeListingJson', () => {
  const exported = JSON.parse(serializeListingJson(listing, s, meta)) as ListingExport;

  it('records versions, the timestamp and every field', () => {
    expect(exported).toMatchObject({
      mulliganListing: 1,
      libraryVersion: LIBRARY_VERSION,
      ...getStandardsInfo(),
      exportedAt: meta.exportedAt,
      locale: 'default',
    });
    expect(Object.keys(exported.fields)).toEqual(s.fields.map((f) => f.id));
  });

  it('records value, count, status, findings, changes and options per field', () => {
    const description = exported.fields['apple.description']!;
    expect(description).toMatchObject({
      value: 'Track symptoms and share reports with your doctor.',
      count: 50,
      limit: 4000,
      unit: 'chars',
      status: 'pass',
      options: { straightQuotes: false },
    });
    expect(description.changes.map((c) => c.ruleId)).toEqual(['lines.rejoin']);
    expect(exported.fields['apple.keywords']!.status).toBe('failure');
  });

  it('records the options in force', () => {
    const withOptions = JSON.parse(
      serializeListingJson(listing, s, {
        ...meta,
        options: { 'apple.name': { straightQuotes: true } },
      }),
    ) as ListingExport;
    expect(withOptions.fields['apple.name']!.options).toEqual({ straightQuotes: true });
  });

  it('records the worst listing status', () => {
    expect(exported.status).toBe('failure');
    expect(listingStatus(listing)).toBe('failure');
  });

  it('round-trips through parseListingJson to the same values', () => {
    const reimported = parseListingJson(serializeListingJson(listing, s, meta), s);
    expect(reimported.ok).toBe(true);
    expect(reimported.format).toBe('json-export');
    const again = processListing({ fields: reimported.fields }, s);
    expect(again.fields.map((f) => f.output)).toEqual(listing.fields.map((f) => f.output));
  });

  it('records reverted changes', () => {
    const rejoin = listing.fields.find((f) => f.fieldId === 'apple.description')!.changes[0]!;
    const reverted = processListing(
      { fields: { 'apple.description': { text: 'Track symptoms and share\nreports.' } } },
      s,
      { fields: { 'apple.description': { suppress: new Set([rejoin.id]) } } },
    );
    const json = JSON.parse(serializeListingJson(reverted, s, meta)) as ListingExport;
    expect(json.fields['apple.description']!.changes).toMatchObject([
      { ruleId: 'lines.rejoin', reverted: true },
    ]);
    expect(json.fields['apple.description']!.value).toBe('Track symptoms and share\nreports.');
  });
});

describe('serializeListingText', () => {
  it('writes one block per non-empty field with store, label and count', () => {
    const text = serializeListingText(listing, s, meta);
    expect(text).toBe(
      `Mulligan listing · exported ${meta.exportedAt} · ruleset ${getStandardsInfo().rulesetVersion} · library ${LIBRARY_VERSION}\n` +
        '\n== Apple App Store · App name (14/30 chars) ==\nExample Health\n' +
        '\n== Apple App Store · Description (50/4000 chars) ==\nTrack symptoms and share reports with your doctor.\n' +
        '\n== Google Play · App title (7/30 chars) ==\nExample\n',
    );
  });

  it('labels byte-counted fields in bytes', () => {
    const keywords = processListing({ fields: { 'apple.keywords': { text: 'a, b' } } }, s);
    expect(serializeListingText(keywords, s, meta)).toContain(
      '== Apple App Store · Keywords (3/100 bytes) ==\na,b\n',
    );
  });
});

describe('listing in the package', () => {
  it('adds listing.json and listing.txt after the images when requested', () => {
    const plan = planPackage(
      {
        groups: [{ groupId: 'icon', sources: [{ sourceId: 'i', fileName: 'logo.png' }] }],
        presetIds: ['apple-icon'],
        listing: true,
      },
      s,
    );
    expect(plan.entries.map((e) => e.path)).toEqual([
      'manifest.json',
      'icons/01_logo_apple-1024.png',
      LISTING_PATHS.json,
      LISTING_PATHS.txt,
    ]);
    expect(plan.entries.at(-1)).toEqual({
      kind: 'listing',
      path: 'listing/listing.txt',
      format: 'txt',
    });
  });

  it('can hold a listing without images', () => {
    const plan = planPackage({ groups: [], presetIds: [], listing: true }, s);
    expect(plan.entries.map((e) => e.kind)).toEqual(['manifest', 'listing', 'listing']);
  });

  it('records the listing path and status in the manifest and counts its findings', () => {
    const findings = listing.fields.flatMap((f) => f.findings);
    const manifest = buildManifest({
      app: { name: 'test', build: 'x' },
      createdAt: meta.exportedAt,
      sources: [],
      outputs: [],
      findings: [],
      listing: { path: LISTING_PATHS.json, status: listingStatus(listing), findings },
    });
    expect(manifest.listing).toEqual({ path: 'listing/listing.json', status: 'failure' });
    expect(manifest.summary.worst).toBe('failure');
    expect(manifest.summary.pass + manifest.summary.warning + manifest.summary.failure).toBe(
      findings.length,
    );
  });

  it('omits the listing section when there is none', () => {
    const manifest = buildManifest({
      app: { name: 'test', build: 'x' },
      createdAt: meta.exportedAt,
      sources: [],
      outputs: [],
      findings: [],
    });
    expect(manifest).not.toHaveProperty('listing');
  });
});
