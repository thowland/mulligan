import { beforeEach, describe, expect, it } from 'vitest';
import { useListingStore } from '../src/state/listing.ts';

const store = () => useListingStore.getState();

beforeEach(() => store().reset());

describe('listing store', () => {
  it('toggles reverts per field', () => {
    store().toggleRevert('apple.description', 'lines.rejoin@5:6');
    store().toggleRevert('apple.description', 'chars.emoji@9:11');
    expect(store().reverted['apple.description']).toEqual(['lines.rejoin@5:6', 'chars.emoji@9:11']);
    store().toggleRevert('apple.description', 'lines.rejoin@5:6');
    expect(store().reverted['apple.description']).toEqual(['chars.emoji@9:11']);
  });

  it('clears reverts when the source is edited and counts them', () => {
    store().toggleRevert('apple.description', 'a');
    store().toggleRevert('apple.description', 'b');
    store().setInput('apple.description', { text: 'new' });
    expect(store().reverted['apple.description']).toBeUndefined();
    expect(store().clearedReverts['apple.description']).toBe(2);
    store().dismissClearedReverts('apple.description');
    expect(store().clearedReverts).toEqual({});
  });

  it('does not report cleared reverts when there were none', () => {
    store().setInput('apple.name', { text: 'x' });
    expect(store().clearedReverts).toEqual({});
  });

  it('forgets the cleared notice when a new revert is made', () => {
    store().toggleRevert('apple.name', 'a');
    store().setInput('apple.name', { text: 'y' });
    store().toggleRevert('apple.name', 'b');
    expect(store().clearedReverts).toEqual({});
  });

  it('imports fields, replacing their sources and dropping their reverts', () => {
    store().setInput('apple.name', { text: 'Typed' });
    store().setInput('apple.subtitle', { text: 'Kept' });
    store().toggleRevert('apple.name', 'a');
    store().toggleRevert('apple.subtitle', 'b');
    store().setInput('apple.name', { text: 'Typed again' });
    store().importFields({ 'apple.name': { text: 'Imported' } });
    expect(store().inputs).toEqual({
      'apple.name': { text: 'Imported' },
      'apple.subtitle': { text: 'Kept' },
    });
    expect(store().reverted).toEqual({ 'apple.subtitle': ['b'] });
    expect(store().clearedReverts).toEqual({});
  });
});
