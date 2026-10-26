import { getStandards } from '@mulligan/core';
import { describe, expect, it } from 'vitest';
import {
  exportListing,
  fieldLabel,
  hasListingInput,
  importListingFile,
  listingFindings,
  processDraft,
} from '../src/core-bridge/listing.ts';
import { templateFiles } from '../scripts/templates.mjs';
import committedCsv from '../public/templates/mulligan-listing-template.csv?raw';
import committedJson from '../public/templates/mulligan-listing-template.json?raw';

const draft = {
  inputs: { 'apple.description': { text: 'Track symptoms and share\nreports.' } },
  straightQuotes: {},
};

describe('listing bridge', () => {
  it('applies reverted changes from the draft', () => {
    const first = processDraft(draft);
    const rejoin = first.fields.find((f) => f.fieldId === 'apple.description')!.changes[0]!;
    const reverted = processDraft({
      ...draft,
      reverted: { 'apple.description': [rejoin.id], 'apple.name': [] },
    });
    expect(reverted.fields.find((f) => f.fieldId === 'apple.description')!.output).toBe(
      'Track symptoms and share\nreports.',
    );
  });

  it('detects whether the listing has any copy', () => {
    expect(hasListingInput({})).toBe(false);
    expect(hasListingInput({ 'apple.name': { text: '  ' } })).toBe(false);
    expect(hasListingInput({ 'apple.name': { text: '', html: '<p>x</p>' } })).toBe(true);
    expect(hasListingInput({ 'apple.name': { text: 'x' } })).toBe(true);
  });

  it('exports listing.json and listing.txt with status and findings', () => {
    const files = exportListing(
      { ...draft, straightQuotes: { 'apple.description': true } },
      new Date('2026-10-25T14:30:00Z'),
    );
    const json = JSON.parse(files.json);
    expect(json.exportedAt).toBe('2026-10-25T14:30:00.000Z');
    expect(json.fields['apple.description'].options).toEqual({ straightQuotes: true });
    expect(json.fields['apple.name'].options).toEqual({ straightQuotes: false });
    expect(files.txt).toContain('== Apple App Store · Description');
    expect(files.status).toBe('failure');
    expect(files.findings.length).toBe(listingFindings(draft).length);
  });

  it('imports files and labels fields', () => {
    const result = importListingFile(
      new TextEncoder().encode('field,value\napple.name,A\n'),
      'a.csv',
    );
    expect(result.fields).toEqual({ 'apple.name': { text: 'A' } });
    expect(fieldLabel('apple.name')).toBe('App name');
    expect(fieldLabel('nope')).toBe('nope');
  });
});

describe('listing templates (public/templates)', () => {
  const files = templateFiles(getStandards()) as Record<string, string>;

  it.each(Object.keys(files))(
    '%s is up to date (run `pnpm --filter @mulligan/web templates`)',
    (name) => {
      const committed = name.endsWith('.csv') ? committedCsv : committedJson;
      expect(committed).toBe(files[name]);
    },
  );

  it.each(Object.keys(files))('%s names every field and imports cleanly', (name) => {
    const result = importListingFile(new TextEncoder().encode(files[name]), name);
    expect(result).toMatchObject({ ok: true, fields: {}, findings: [] });
    for (const field of getStandards().fields) expect(files[name]).toContain(field.id);
  });
});
