import { describe, expect, it } from 'vitest';
import {
  IMPORT_LIMITS,
  decodeTextBytes,
  getStandards,
  parseListingCsv,
  parseListingFile,
  parseListingJson,
} from '../src/index.ts';
import { parseCsv } from '../src/import/csv.ts';

const s = getStandards();
const utf8 = (text: string) => new TextEncoder().encode(text);

function utf16(text: string, littleEndian: boolean, bom = true): Uint8Array {
  const units = Array.from(text, (c) => c.charCodeAt(0));
  const out = new Uint8Array((units.length + (bom ? 1 : 0)) * 2);
  const view = new DataView(out.buffer);
  let offset = 0;
  if (bom) {
    view.setUint16(0, 0xfeff, littleEndian);
    offset = 2;
  }
  units.forEach((u, i) => view.setUint16(offset + i * 2, u, littleEndian));
  return out;
}

const ruleIds = (findings: { ruleId: string }[]) => findings.map((f) => f.ruleId);

describe('decodeTextBytes', () => {
  it('honours a UTF-8 byte-order mark', () => {
    expect(decodeTextBytes(Uint8Array.of(0xef, 0xbb, 0xbf, ...utf8('café')))).toEqual({
      text: 'café',
      encoding: 'utf-8',
      bom: true,
    });
  });

  it('decodes UTF-16 in both byte orders when a BOM announces it', () => {
    expect(decodeTextBytes(utf16('field,value', true))).toMatchObject({
      text: 'field,value',
      encoding: 'utf-16le',
    });
    expect(decodeTextBytes(utf16('“Hi”', false))).toMatchObject({
      text: '“Hi”',
      encoding: 'utf-16be',
    });
  });

  it('accepts valid UTF-8 without a BOM', () => {
    expect(decodeTextBytes(utf8('健康日記'))).toEqual({
      text: '健康日記',
      encoding: 'utf-8',
      bom: false,
    });
  });

  it('falls back to Windows-1252 for invalid UTF-8 (Excel on Windows)', () => {
    // “Health” – café, as Excel saves it in Windows-1252.
    const bytes = Uint8Array.of(
      0x93,
      ...utf8('Health'),
      0x94,
      0x20,
      0x96,
      0x20,
      0x63,
      0x61,
      0x66,
      0xe9,
    );
    expect(decodeTextBytes(bytes)).toEqual({
      text: '“Health” – café',
      encoding: 'windows-1252',
      bom: false,
    });
  });
});

describe('parseCsv (RFC 4180)', () => {
  it('reads quoted delimiters, doubled quotes and line breaks inside quotes', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"line 1\nline 2",z\n').rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['line 1\nline 2', 'z'],
    ]);
  });

  it('keeps empty fields and a last record without a trailing newline', () => {
    expect(parseCsv('a,,c\n,,\nlast,"",x').rows).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
      ['last', '', 'x'],
    ]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n\nc,d\n').rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it("honours Excel's sep= line and semicolon headers", () => {
    expect(parseCsv('sep=;\nfield;value\na;"b;c"\n')).toEqual({
      delimiter: ';',
      rows: [
        ['field', 'value'],
        ['a', 'b;c'],
      ],
    });
    expect(parseCsv('field;value\na;b').delimiter).toBe(';');
    expect(parseCsv('field,value;x\na,b').delimiter).toBe(',');
  });

  it('treats a quote inside an unquoted field as text', () => {
    expect(parseCsv('a,5" screen\n').rows).toEqual([['a', '5" screen']]);
  });

  it('rejects an unclosed quote and text after a closing quote', () => {
    expect(() => parseCsv('a,"open\n')).toThrow(/not closed/);
    expect(() => parseCsv('a,"x"y\n')).toThrow(/after a closing quote on line 1/);
  });
});

describe('parseListingCsv', () => {
  it('imports known fields in configuration order and ignores extra columns', () => {
    const result = parseListingCsv(
      'label,field,value,limit\nName,apple.name,Example Health,30\nTitle,google.title,Example,30\nDesc,apple.description,"Line one\nLine two",4000\n',
      s,
    );
    expect(result.ok).toBe(true);
    expect(result.format).toBe('csv');
    expect(result.locale).toBe('default');
    expect(Object.keys(result.fields)).toEqual(['apple.name', 'apple.description', 'google.title']);
    expect(result.fields['apple.description']).toEqual({ text: 'Line one\nLine two' });
    expect(result.findings).toEqual([]);
  });

  it('accepts header names in any case and the default locale column', () => {
    const result = parseListingCsv('Locale, FIELD ,Value\ndefault,apple.subtitle,Track it\n', s);
    expect(result.fields).toEqual({ 'apple.subtitle': { text: 'Track it' } });
  });

  it('warns about unknown fields, including prototype keys, and never pollutes objects', () => {
    const result = parseListingCsv(
      'field,value\n__proto__,{"polluted":true}\nconstructor,x\napple.nope,y\napple.name,Example\n',
      s,
    );
    expect(ruleIds(result.findings)).toEqual([
      'import.unknown-field',
      'import.unknown-field',
      'import.unknown-field',
    ]);
    expect(result.findings[0]!.message).toBe(
      'Row 2: "__proto__" is not a listing field; it was ignored.',
    );
    expect(Object.keys(result.fields)).toEqual(['apple.name']);
    expect(Object.getPrototypeOf(result.fields)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('reports duplicate rows and keeps the last value', () => {
    const result = parseListingCsv('field,value\napple.name,First\napple.name,Second\n', s);
    expect(result.fields['apple.name']).toEqual({ text: 'Second' });
    expect(result.findings).toMatchObject([
      {
        ruleId: 'import.duplicate-field',
        severity: 'warning',
        subject: { kind: 'field', fieldId: 'apple.name' },
        message: 'Row 3: App name appears more than once; the last value was used.',
      },
    ]);
  });

  it('skips empty values and blank field ids', () => {
    const result = parseListingCsv('field,value\napple.name,   \n,orphan\napple.subtitle,Sub\n', s);
    expect(result.fields).toEqual({ 'apple.subtitle': { text: 'Sub' } });
    expect(result.findings).toEqual([]);
  });

  it('treats values with markup as HTML pastes', () => {
    const result = parseListingCsv(
      'field,value\napple.description,"<p>One</p><ul><li>Two</li></ul>"\napple.name,A < B\n',
      s,
    );
    expect(result.fields['apple.description']).toEqual({
      text: '<p>One</p><ul><li>Two</li></ul>',
      html: '<p>One</p><ul><li>Two</li></ul>',
    });
    expect(result.fields['apple.name']).toEqual({ text: 'A < B' });
  });

  it('rejects values over the import limit', () => {
    const long = 'x'.repeat(IMPORT_LIMITS.maxValueLength + 1);
    const result = parseListingCsv(`field,value\napple.description,${long}\n`, s);
    expect(result.fields).toEqual({});
    expect(result.findings).toMatchObject([{ ruleId: 'import.too-large', severity: 'failure' }]);
  });

  it('rejects files without field and value columns, bad CSV and oversized text', () => {
    expect(parseListingCsv('name,copy\na,b\n', s)).toMatchObject({
      ok: false,
      findings: [{ ruleId: 'import.malformed' }],
    });
    expect(parseListingCsv('', s).ok).toBe(false);
    expect(parseListingCsv('field,value\napple.name,"open\n', s).findings[0]!.message).toMatch(
      /^The file is not valid CSV: A quoted value is not closed/,
    );
    expect(parseListingCsv('x'.repeat(IMPORT_LIMITS.maxBytes + 1), s).findings[0]!.message).toMatch(
      /1 MB/,
    );
  });

  it('rejects unsupported or mixed locales', () => {
    expect(parseListingCsv('field,value,locale\napple.name,Nom,fr-FR\n', s)).toMatchObject({
      ok: false,
      findings: [{ ruleId: 'import.unsupported-locale', severity: 'failure' }],
    });
    expect(
      parseListingCsv('field,value,locale\napple.name,A,default\napple.subtitle,B,fr\n', s)
        .findings[0]!.message,
    ).toBe('All rows must use the same locale.');
  });
});

describe('parseListingJson', () => {
  it('imports the template format', () => {
    const result = parseListingJson(
      JSON.stringify({
        mulliganTemplate: 1,
        locale: 'default',
        fields: { 'google.title': 'Example', 'apple.name': 'Example Health' },
      }),
      s,
    );
    expect(result).toMatchObject({ ok: true, format: 'json-template', locale: 'default' });
    expect(Object.keys(result.fields)).toEqual(['apple.name', 'google.title']);
  });

  it('imports the values of a listing.json export and ignores its metadata', () => {
    const result = parseListingJson(
      JSON.stringify({
        mulliganListing: 1,
        rulesetVersion: '1.0.0',
        fields: { 'apple.name': { value: 'Example', count: 7, findings: [] } },
      }),
      s,
    );
    expect(result).toMatchObject({ ok: true, format: 'json-export' });
    expect(result.fields).toEqual({ 'apple.name': { text: 'Example' } });
  });

  it('is safe against __proto__ and constructor keys', () => {
    const text =
      '{"mulliganTemplate":1,"fields":{"__proto__":{"polluted":true},"constructor":"x","apple.name":"Example"}}';
    const result = parseListingJson(text, s);
    expect(Object.keys(result.fields)).toEqual(['apple.name']);
    expect(ruleIds(result.findings)).toEqual(['import.malformed', 'import.unknown-field']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('rejects a top-level __proto__ key and unknown properties in a template', () => {
    expect(parseListingJson('{"mulliganTemplate":1,"fields":{},"__proto__":{"x":1}}', s).ok).toBe(
      false,
    );
    expect(
      parseListingJson('{"mulliganTemplate":1,"fields":{},"extra":true}', s).findings[0]!.message,
    ).toMatch(/not a Mulligan listing template/);
  });

  it('reports non-text values and keeps the rest', () => {
    const result = parseListingJson(
      '{"mulliganTemplate":1,"fields":{"apple.name":42,"apple.subtitle":"Sub"}}',
      s,
    );
    expect(result.fields).toEqual({ 'apple.subtitle': { text: 'Sub' } });
    expect(result.findings[0]!.message).toBe(
      'fields.apple.name: the value must be text; it was ignored.',
    );
  });

  it('rejects invalid JSON, wrong shapes, unsupported locales and oversized text', () => {
    expect(parseListingJson('{', s).findings[0]!.message).toMatch(/^The file is not valid JSON/);
    expect(parseListingJson('[]', s).ok).toBe(false);
    expect(parseListingJson('{"mulliganTemplate":2,"fields":{}}', s).ok).toBe(false);
    expect(parseListingJson('{"mulliganTemplate":1,"fields":[]}', s).findings[0]!.message).toMatch(
      /fields: must be an object/,
    );
    expect(
      parseListingJson('{"mulliganTemplate":1,"locale":"de","fields":{}}', s).findings[0]!.ruleId,
    ).toBe('import.unsupported-locale');
    expect(parseListingJson(' '.repeat(IMPORT_LIMITS.maxBytes + 1), s).ok).toBe(false);
  });

  it('tolerates a leading BOM character', () => {
    expect(parseListingJson('﻿{"mulliganTemplate":1,"fields":{}}', s).ok).toBe(true);
  });
});

describe('parseListingFile', () => {
  it('decodes Windows-1252 CSV and reports the encoding', () => {
    const bytes = Uint8Array.of(
      ...utf8('field,value\napple.subtitle,'),
      0x93,
      ...utf8('Track it'),
      0x94,
    );
    expect(parseListingFile(bytes, 'listing.csv', s)).toMatchObject({
      ok: true,
      encoding: 'windows-1252',
      fields: { 'apple.subtitle': { text: '“Track it”' } },
    });
  });

  it('reads UTF-16 CSV from Excel', () => {
    const result = parseListingFile(
      utf16('field,value\r\napple.name,Example\r\n', true),
      'x.csv',
      s,
    );
    expect(result).toMatchObject({
      encoding: 'utf-16le',
      fields: { 'apple.name': { text: 'Example' } },
    });
  });

  it('chooses JSON by extension or content', () => {
    const json = utf8('{"mulliganTemplate":1,"fields":{"apple.name":"A"}}');
    expect(parseListingFile(json, 'listing.txt', s).format).toBe('json-template');
    expect(parseListingFile(utf8('nonsense'), 'listing.json', s).findings[0]!.ruleId).toBe(
      'import.malformed',
    );
  });

  it('rejects files over the size limit before decoding', () => {
    expect(
      parseListingFile(new Uint8Array(IMPORT_LIMITS.maxBytes + 1), 'big.csv', s),
    ).toMatchObject({ ok: false, encoding: null });
  });
});
