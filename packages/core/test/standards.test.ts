import { describe, expect, it } from 'vitest';
import { getStandards, getStandardsInfo, parseStandards, type Finding } from '../src/index.ts';
import bundled from '../src/standards/standards.json' with { type: 'json' };

type Doc = Record<string, unknown> & typeof bundled;
const clone = (): Doc => structuredClone(bundled) as Doc;

function messages(document: unknown): string[] {
  const result = parseStandards(document);
  if (result.ok) throw new Error('expected the document to be rejected');
  return result.findings.map((f: Finding) => f.message);
}

describe('bundled standards', () => {
  it('are valid and expose the presets and fields from the requirements', () => {
    const s = getStandards();
    expect(s.presets.map((p) => p.id)).toEqual([
      'iphone-6.9',
      'iphone-6.5',
      'ipad-13',
      'android-phone',
      'android-tablet-7',
      'android-tablet-10',
      'play-feature-graphic',
      'play-icon',
      'apple-icon',
    ]);
    expect(s.fields).toHaveLength(10);
    expect(s.presets.find((p) => p.id === 'iphone-6.9')).toMatchObject({
      width: 1320,
      height: 2868,
    });
    expect(s.fields.find((f) => f.id === 'apple.keywords')?.limit).toEqual({
      max: 100,
      unit: 'bytes',
    });
  });

  it('apply schema defaults', () => {
    const s = getStandards();
    expect(s.presets[0]?.flatten).toBe('#FFFFFF');
    expect(s.fields.find((f) => f.id === 'apple.description')?.checks).toEqual([]);
    expect(s.fields[0]?.options).toEqual({ straightQuotes: false });
  });

  it('are deeply frozen and cached', () => {
    const s = getStandards();
    expect(getStandards()).toBe(s);
    expect(Object.isFrozen(s.presets[0])).toBe(true);
    expect(() => {
      (s.presets[0] as { width: number }).width = 1;
    }).toThrow(TypeError);
  });

  it('report their ruleset version and fingerprint', () => {
    expect(getStandardsInfo()).toEqual({
      rulesetVersion: bundled.rulesetVersion,
      standardsHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });
});

describe('parseStandards', () => {
  it('accepts a valid document', () => {
    expect(parseStandards(clone()).ok).toBe(true);
  });

  it('rejects a non-object with a root-level finding', () => {
    expect(parseStandards('nope')).toMatchObject({
      ok: false,
      findings: [
        {
          ruleId: 'standards.invalid',
          severity: 'failure',
          subject: { kind: 'standards', path: '' },
        },
      ],
    });
  });

  it('rejects unknown keys (typos)', () => {
    const doc = clone();
    (doc.presets[0] as Record<string, unknown>)['widht'] = 1;
    expect(messages(doc).join()).toMatch(/presets\.0/);
  });

  it('rejects duplicate ids', () => {
    const doc = clone();
    doc.fields[1]!.id = doc.fields[0]!.id;
    expect(messages(doc)).toContain('fields.1.id: duplicate id "apple.name"');
  });

  it('rejects references to unknown stores, groups and fields', () => {
    const doc = clone();
    doc.presets[0]!.store = 'amazon';
    doc.presets[1]!.group = 'banner';
    doc.fields[0]!.store = 'amazon';
    doc.fields[4]!.related = ['apple.nope'];
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        'presets.0.store: unknown store "amazon"',
        'presets.1.group: unknown group "banner"',
        'fields.0.store: unknown store "amazon"',
        'fields.4.related.0: unknown field "apple.nope"',
      ]),
    );
  });

  it('accepts copyFrom only from a known field in another store', () => {
    const doc = clone();
    doc.fields[0]!.copyFrom = 'google.nope';
    doc.fields[1]!.copyFrom = 'apple.name';
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        'fields.0.copyFrom: unknown field "google.nope"',
        'fields.1.copyFrom: must name a field in another store',
      ]),
    );
  });

  it('rejects presets whose output names collide', () => {
    const doc = clone();
    // Looked up by id, so adding a preset to the standards does not break this test.
    const index = (id: string) => doc.presets.findIndex((p) => p.id === id);
    delete (doc.presets[index('apple-icon')] as { fileSuffix?: string }).fileSuffix;
    delete (doc.presets[index('play-icon')] as { fileSuffix?: string }).fileSuffix;
    expect(messages(doc)).toContain(
      `presets.${index('apple-icon')}.folder: output names collide with preset "play-icon"`,
    );
  });

  it('rejects inconsistent ranges and formats', () => {
    const doc = clone();
    doc.presets[0]!.count = { min: 5, max: 2 };
    Object.assign(doc.presets[1]!, { jpegQuality: 0.9 });
    Object.assign(doc.presets[2]!, { format: 'jpeg', alpha: true });
    Object.assign(doc.fields[0]!.limit, { min: 50 });
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        'presets.0.count: count.min must not exceed count.max',
        'presets.1.jpegQuality: jpegQuality applies only to jpeg presets',
        'presets.2.alpha: jpeg cannot carry alpha',
        'fields.0.limit: limit.min must not exceed limit.max',
      ]),
    );
  });

  it('rejects invalid patterns, colours, locales and revertible rules', () => {
    const doc = clone();
    doc.rules.rejoin.listItemPattern = '(';
    Object.assign(doc.presets[0]!, { flatten: 'white' });
    doc.locales.default = 'fr';
    (doc.rules.revertible as Record<string, boolean>)['text.limit.max'] = true;
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        'rules.rejoin.listItemPattern: must be a valid regular expression',
        'presets.0.flatten: must be a #RRGGBB colour',
        'locales.default: default locale must be listed in supported',
        'rules.revertible.text.limit.max: "text.limit.max" is not a change rule',
      ]),
    );
  });

  it('rejects unsafe folder names', () => {
    const doc = clone();
    doc.presets[0]!.folder = '../etc';
    expect(messages(doc).join()).toMatch(/presets\.0\.folder: must be a safe folder name/);
  });
});
