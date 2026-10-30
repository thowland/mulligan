import { beforeEach, describe, expect, it } from 'vitest';
import { useImageStore } from '../src/state/images.ts';
import { sourceEntry } from './helpers/images.ts';

const store = () => useImageStore.getState();
const names = (groupId: string) => (store().sources[groupId] ?? []).map((s) => s.fileName);

beforeEach(() => store().reset());

describe('image store', () => {
  it('starts with the default presets selected and no sources', () => {
    expect(store().sources).toEqual({});
    expect(store().selectedPresetIds).toEqual([
      'iphone-6.3',
      'android-phone',
      'play-icon',
      'apple-icon',
    ]);
  });

  it('appends sources in order and ignores empty additions', () => {
    store().addSources('screenshot', [sourceEntry('a.png'), sourceEntry('b.png')]);
    store().addSources('screenshot', [sourceEntry('c.png')]);
    store().addSources('screenshot', []);
    expect(names('screenshot')).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it("selects a group's presets when its first file arrives and none are selected", () => {
    const fg = (name: string) => sourceEntry(name, 1024, 500, 'feature-graphic');
    expect(store().selectedPresetIds).not.toContain('play-feature-graphic');
    store().addSources('feature-graphic', [fg('banner.png')]);
    expect(store().selectedPresetIds).toEqual([
      'iphone-6.3',
      'android-phone',
      'play-feature-graphic',
      'play-icon',
      'apple-icon',
    ]);

    // A deselection after that sticks, including through a replacement.
    store().setSelectedPresets(['iphone-6.3']);
    store().addSources('feature-graphic', [fg('other.png')]);
    store().confirmReplacement();
    expect(store().selectedPresetIds).toEqual(['iphone-6.3']);

    // A group with defaults gets its defaults back, not every preset.
    store().addSources('screenshot', [sourceEntry('a.png')]);
    expect(store().selectedPresetIds).toEqual(['iphone-6.3']);
    store().setSelectedPresets([]);
    store().removeSource('screenshot', store().sources['screenshot']![0]!.id);
    store().addSources('screenshot', [sourceEntry('b.png')]);
    expect(store().selectedPresetIds).toEqual(['iphone-6.3', 'android-phone']);

    // An existing selection in the group is left alone.
    store().setSelectedPresets(['ipad-13']);
    store().removeSource('screenshot', store().sources['screenshot']![0]!.id);
    store().addSources('screenshot', [sourceEntry('c.png')]);
    expect(store().selectedPresetIds).toEqual(['ipad-13']);
  });

  it('stops at maxFiles and reports each file left out', () => {
    const files = Array.from({ length: 12 }, (_, i) => sourceEntry(`s${i}.png`));
    store().addSources('screenshot', files);
    expect(names('screenshot')).toHaveLength(10);
    expect(store().notices.map((n) => [n.fileName, n.messages[0]])).toEqual([
      ['s10.png', 'Only 10 files are allowed here; this one was not added.'],
      ['s11.png', 'Only 10 files are allowed here; this one was not added.'],
    ]);
  });

  it('asks before replacing the file in a single-file group', () => {
    store().addSources('icon', [sourceEntry('old.png', 512, 512, 'icon')]);
    store().addSources('icon', [sourceEntry('new.png', 512, 512, 'icon')]);
    expect(store().pending?.incoming.fileName).toBe('new.png');
    expect(names('icon')).toEqual(['old.png']);
    store().cancelReplacement();
    expect(store().pending).toBeNull();
    store().addSources('icon', [sourceEntry('new.png', 512, 512, 'icon')]);
    store().confirmReplacement();
    expect(names('icon')).toEqual(['new.png']);
    expect(store().pending).toBeNull();
    store().confirmReplacement();
    expect(names('icon')).toEqual(['new.png']);
  });

  it('reports surplus files dropped on an empty single-file group', () => {
    store().addSources('icon', [
      sourceEntry('a.png', 1, 1, 'icon'),
      sourceEntry('b.png', 1, 1, 'icon'),
    ]);
    expect(names('icon')).toEqual(['a.png']);
    expect(store().notices[0]?.messages[0]).toBe(
      'Only 1 file is allowed here; this one was not added.',
    );
  });

  it('moves and removes sources, ignoring out-of-range moves', () => {
    store().addSources(
      'screenshot',
      ['a', 'b', 'c'].map((n) => sourceEntry(`${n}.png`)),
    );
    store().moveSource('screenshot', 2, 0);
    expect(names('screenshot')).toEqual(['c.png', 'a.png', 'b.png']);
    for (const [from, to] of [
      [0, 0],
      [-1, 1],
      [0, 3],
      [5, 0],
    ] as const) {
      store().moveSource('screenshot', from, to);
    }
    store().moveSource('icon', 0, 1);
    expect(names('screenshot')).toEqual(['c.png', 'a.png', 'b.png']);
    store().removeSource('screenshot', store().sources['screenshot']![1]!.id);
    store().removeSource('icon', 'nope');
    expect(names('screenshot')).toEqual(['c.png', 'b.png']);
  });

  it('sets the preset selection and manages notices', () => {
    store().setSelectedPresets(['ipad-13']);
    expect(store().selectedPresetIds).toEqual(['ipad-13']);
    store().addNotices([]);
    store().addNotices([{ id: 'n1', groupId: 'icon', fileName: 'x', messages: ['m'] }]);
    expect(store().notices).toHaveLength(1);
    store().dismissNotice('n1');
    expect(store().notices).toEqual([]);
  });
});
