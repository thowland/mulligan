import { getStandards } from '@mulligan/core';
import { describe, expect, it } from 'vitest';
import { fieldsByStore, presetGroups, versionInfo } from '../src/core-bridge/standards.ts';

describe('core bridge', () => {
  it('groups every preset by group, then store', () => {
    const views = presetGroups();
    expect(views.map((v) => v.group.id)).toEqual(['screenshot', 'feature-graphic', 'icon']);
    const ids = views.flatMap((v) => v.stores.flatMap((s) => s.presets.map((p) => p.id)));
    expect(ids.sort()).toEqual(
      getStandards()
        .presets.map((p) => p.id)
        .sort(),
    );
    const icon = views.find((v) => v.group.id === 'icon')!;
    expect(icon.stores.map((s) => s.store.id)).toEqual(['apple', 'google']);
  });

  it('omits stores with no presets in a group', () => {
    const feature = presetGroups().find((v) => v.group.id === 'feature-graphic')!;
    expect(feature.stores.map((s) => s.store.id)).toEqual(['google']);
  });

  it('groups every field by store', () => {
    const stores = fieldsByStore();
    expect(stores.map((s) => s.store.id)).toEqual(['apple', 'google']);
    expect(stores.flatMap((s) => s.fields)).toHaveLength(getStandards().fields.length);
  });

  it('reports versions from core', () => {
    expect(versionInfo()).toEqual({
      libraryVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
      rulesetVersion: getStandards().rulesetVersion,
      standardsHash: expect.stringMatching(/^sha256:/),
    });
  });
});
