import type { Finding, Subject } from '@mulligan/core';
import { describe, expect, it } from 'vitest';
import { subjectLabel } from '../src/core-bridge/package.ts';

const about = (subject: Subject): Finding => ({
  ruleId: 'group.count',
  severity: 'warning',
  subject,
  message: 'm',
});

describe('subjectLabel', () => {
  it('names fields, files, groups and the rest from the standards', () => {
    expect(
      subjectLabel(
        about({ kind: 'field', fieldId: 'apple.keywords', store: 'apple', locale: 'x' }),
      ),
    ).toBe('Apple App Store · Keywords');
    expect(
      subjectLabel(about({ kind: 'field', fieldId: 'odd.field', store: 'odd', locale: 'x' })),
    ).toBe('odd · odd.field');
    expect(
      subjectLabel(
        about({
          kind: 'file',
          groupId: 'icon',
          sourceId: 's',
          fileName: 'logo.png',
          presetId: 'apple-icon',
        }),
      ),
    ).toBe('logo.png · Apple App Store icon');
    expect(
      subjectLabel(about({ kind: 'file', groupId: 'icon', sourceId: 's', fileName: 'a.png' })),
    ).toBe('a.png');
    expect(
      subjectLabel(
        about({
          kind: 'file',
          groupId: 'icon',
          sourceId: 's',
          fileName: 'a.png',
          presetId: 'gone',
        }),
      ),
    ).toBe('a.png · gone');
    expect(
      subjectLabel(
        about({ kind: 'group', groupId: 'feature-graphic', presetId: 'play-feature-graphic' }),
      ),
    ).toBe('Google Play feature graphic');
    expect(subjectLabel(about({ kind: 'group', groupId: 'screenshot' }))).toBe('Screenshots');
    expect(subjectLabel(about({ kind: 'group', groupId: 'banner' }))).toBe('banner');
    expect(subjectLabel(about({ kind: 'listing' }))).toBe('Listing');
    expect(subjectLabel(about({ kind: 'package' }))).toBe('Package');
    expect(subjectLabel(about({ kind: 'standards', path: 'presets.0' }))).toBe(
      'Standards (presets.0)',
    );
    expect(subjectLabel(about({ kind: 'standards', path: '' }))).toBe('Standards');
  });
});
