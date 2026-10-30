import { describe, expect, it } from 'vitest';
import {
  ALLOWED_EXTENSIONS,
  buildManifest,
  checkEntryContent,
  checkEntryPath,
  getStandards,
  getStandardsInfo,
  LIBRARY_VERSION,
  parseStandards,
  planPackage,
  serializeManifest,
  type Finding,
  type Standards,
} from '../src/index.ts';
import { jpegBytes, pngBytes, sofSegment } from './helpers/image-bytes.ts';

const standards = getStandards();
const shots = (...names: string[]) => names.map((fileName, i) => ({ sourceId: `s${i}`, fileName }));

describe('planPackage', () => {
  it('produces one entry per source × selected preset, numbered per group in user order', () => {
    const plan = planPackage(
      {
        groups: [
          { groupId: 'screenshot', sources: shots('Home.png', 'Dashboard.png', 'Settings.png') },
          { groupId: 'icon', sources: [{ sourceId: 'i0', fileName: 'Logo.png' }] },
        ],
        presetIds: [
          'android-phone',
          'iphone-6.3',
          'apple-icon',
          'play-icon',
          'play-feature-graphic',
        ],
      },
      standards,
    );
    expect(plan.findings).toEqual([]);
    expect(plan.entries.map((e) => e.path)).toEqual([
      'manifest.json',
      'iphone-6.3/01_home.png',
      'iphone-6.3/02_dashboard.png',
      'iphone-6.3/03_settings.png',
      'android-phone/01_home.png',
      'android-phone/02_dashboard.png',
      'android-phone/03_settings.png',
      'icons/01_logo_play-512.png',
      'icons/01_logo_apple-1024.png',
    ]);
    expect(plan.entries[2]).toEqual({
      kind: 'image',
      path: 'iphone-6.3/02_dashboard.png',
      groupId: 'screenshot',
      sourceId: 's1',
      presetId: 'iphone-6.3',
      sequence: 2,
    });
  });

  it('keeps the same sequence number for a source in every preset', () => {
    const plan = planPackage(
      {
        groups: [{ groupId: 'screenshot', sources: shots('a.png', 'b.png') }],
        presetIds: ['iphone-6.3', 'ipad-13'],
      },
      standards,
    );
    const b = plan.entries.filter((e) => e.kind === 'image' && e.sourceId === 's1');
    expect(b.map((e) => e.path)).toEqual(['iphone-6.3/02_b.png', 'ipad-13/02_b.png']);
  });

  it('pads to three digits beyond 99 sources', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      sourceId: `s${i}`,
      fileName: `p${i}.png`,
    }));
    const plan = planPackage(
      { groups: [{ groupId: 'screenshot', sources: many }], presetIds: ['iphone-6.3'] },
      standards,
    );
    expect(plan.entries[1]?.path).toBe('iphone-6.3/001_p0.png');
  });

  it('produces only the manifest when nothing is selected or provided', () => {
    expect(planPackage({ groups: [], presetIds: ['iphone-6.3'] }, standards).entries).toEqual([
      { kind: 'manifest', path: 'manifest.json' },
    ]);
    expect(
      planPackage(
        { groups: [{ groupId: 'screenshot', sources: shots('a.png') }], presetIds: [] },
        standards,
      ).entries,
    ).toHaveLength(1);
  });

  it('reports colliding paths as failures and keeps the first', () => {
    // Two presets sharing a folder without suffixes: a configuration error the schema also catches.
    const document = structuredClone(standards) as unknown as Standards;
    const doc = { ...document, presets: document.presets.map((p) => ({ ...p })) };
    const result = parseStandards(doc);
    expect(result.ok).toBe(true);
    const s = (result as { ok: true; value: Standards }).value;
    const looseStandards = {
      ...s,
      presets: s.presets.map((p) =>
        p.id === 'apple-icon' || p.id === 'play-icon' ? { ...p, fileSuffix: undefined } : p,
      ),
    } as unknown as Standards;
    const plan = planPackage(
      {
        groups: [{ groupId: 'icon', sources: [{ sourceId: 'i', fileName: 'Logo.png' }] }],
        presetIds: ['play-icon', 'apple-icon'],
      },
      looseStandards,
    );
    expect(plan.entries.map((e) => e.path)).toEqual(['manifest.json', 'icons/01_logo.png']);
    expect(plan.findings).toEqual([
      {
        ruleId: 'package.path-collision',
        severity: 'failure',
        subject: { kind: 'package' },
        message: 'Two outputs would both be named "icons/01_logo.png".',
        data: { path: 'icons/01_logo.png' },
      },
    ]);
  });

  it('refuses unsafe folders even if a standards object bypasses validation', () => {
    const bad = {
      ...standards,
      presets: standards.presets.map((p) =>
        p.id === 'iphone-6.3' ? { ...p, folder: '../evil' } : p,
      ),
    } as unknown as Standards;
    const plan = planPackage(
      { groups: [{ groupId: 'screenshot', sources: shots('a.png') }], presetIds: ['iphone-6.3'] },
      bad,
    );
    expect(plan.entries).toHaveLength(1);
    expect(plan.findings[0]?.ruleId).toBe('package.extension');
  });
});

describe('checkEntryPath', () => {
  it.each([
    'manifest.json',
    'iphone-6.3/01_a.png',
    'icons/01_a_apple-1024.png',
    'listing/listing.txt',
    'f/03_x.jpg',
  ])('accepts %s', (path) => {
    expect(checkEntryPath(path)).toBeNull();
  });

  it.each([
    '../evil.png',
    '/abs.png',
    'a/../b.png',
    'a//b.png',
    'a\\b.png',
    'payload.exe',
    'page.html',
    'noextension',
    'UPPER.png',
    'a/./b.png',
    'x.svg',
  ])('rejects %s', (path) => {
    expect(checkEntryPath(path)).toMatchObject({
      ruleId: 'package.extension',
      severity: 'failure',
    });
  });

  it('exposes the allow-list', () => {
    expect(ALLOWED_EXTENSIONS).toEqual(['.png', '.jpg', '.json', '.txt']);
  });
});

describe('checkEntryContent', () => {
  const text = (s: string) => new TextEncoder().encode(s);

  it('accepts content matching its extension', () => {
    expect(checkEntryContent('a/01_x.png', pngBytes())).toBeNull();
    expect(checkEntryContent('a/01_x.jpg', jpegBytes(sofSegment(1, 1)))).toBeNull();
    expect(checkEntryContent('manifest.json', text('{"a":1}'))).toBeNull();
    expect(checkEntryContent('listing/listing.txt', text('Hello – ™'))).toBeNull();
  });

  it.each([
    ['a/01_x.png', jpegBytes(sofSegment(1, 1))],
    ['a/01_x.jpg', pngBytes()],
    ['a/01_x.png', text('<html>')],
    ['manifest.json', text('{not json')],
    ['listing/listing.txt', Uint8Array.of(0xff, 0xfe, 0x00)],
    ['listing/listing.txt', Uint8Array.of(0x41, 0x00, 0x42)],
  ])('rejects mismatched content for %s', (path, bytes) => {
    expect(checkEntryContent(path, bytes)).toMatchObject({
      ruleId: 'package.entry-type',
      severity: 'failure',
      data: { path },
    });
  });

  it('rejects disallowed paths before reading content', () => {
    expect(checkEntryContent('run.exe', text('x'))?.ruleId).toBe('package.extension');
  });
});

describe('buildManifest', () => {
  const finding = (severity: Finding['severity']): Finding => ({
    ruleId: 'image.upscaled',
    severity,
    subject: { kind: 'package' },
    message: 'm',
  });

  it('records versions, sources, outputs with status, findings and a summary', () => {
    const manifest = buildManifest({
      app: { name: 'mulligan-web', build: 'abc123' },
      createdAt: '2026-10-25T14:30:00.000Z',
      sources: [
        {
          id: 's0',
          group: 'screenshot',
          seq: 1,
          fileName: 'Home.png',
          sha256: 'f'.repeat(64),
          width: 1290,
          height: 12000,
          type: 'image/png',
          iccProfile: false,
        },
      ],
      outputs: [
        {
          path: 'iphone-6.3/01_home.png',
          presetId: 'iphone-6.3',
          sourceId: 's0',
          width: 1206,
          height: 2622,
          bytes: 1000,
          sha256: 'a'.repeat(64),
          crop: { x: 0, y: 0, width: 1290, height: 2805 },
          findings: [finding('pass'), finding('warning')],
        },
      ],
      findings: [finding('failure')],
    });
    expect(manifest).toMatchObject({
      mulliganManifest: 1,
      libraryVersion: LIBRARY_VERSION,
      rulesetVersion: getStandardsInfo().rulesetVersion,
      standardsHash: getStandardsInfo().standardsHash,
      app: { name: 'mulligan-web', build: 'abc123' },
      createdAt: '2026-10-25T14:30:00.000Z',
      summary: { pass: 1, warning: 1, failure: 1, worst: 'failure' },
    });
    expect(manifest.outputs[0]?.status).toBe('warning');
    expect(JSON.parse(serializeManifest(manifest))).toEqual(manifest);
    expect(serializeManifest(manifest).endsWith('}\n')).toBe(true);
  });
});
