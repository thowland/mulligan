import { describe, expect, it } from 'vitest';
import { isBlank, segmentText, visibleTokens } from '../src/features/listing/segments.ts';

describe('segmentText', () => {
  it('returns the whole text when nothing is highlighted', () => {
    expect(segmentText('abc', [])).toEqual([{ kind: 'text', text: 'abc', ids: [] }]);
  });

  it('splits at highlight boundaries and lists covering highlights', () => {
    expect(
      segmentText('abcdef', [
        { id: 'x', start: 1, end: 4 },
        { id: 'y', start: 2, end: 3 },
      ]),
    ).toEqual([
      { kind: 'text', text: 'a', ids: [] },
      { kind: 'text', text: 'b', ids: ['x'] },
      { kind: 'text', text: 'c', ids: ['x', 'y'] },
      { kind: 'text', text: 'd', ids: ['x'] },
      { kind: 'text', text: 'ef', ids: [] },
    ]);
  });

  it('places zero-width highlights as points, including at the ends', () => {
    expect(
      segmentText('ab', [
        { id: 'start', start: 0, end: 0 },
        { id: 'mid', start: 1, end: 1 },
        { id: 'mid2', start: 1, end: 1 },
        { id: 'end', start: 2, end: 2 },
      ]),
    ).toEqual([
      { kind: 'point', ids: ['start'] },
      { kind: 'text', text: 'a', ids: [] },
      { kind: 'point', ids: ['mid', 'mid2'] },
      { kind: 'text', text: 'b', ids: [] },
      { kind: 'point', ids: ['end'] },
    ]);
  });

  it('merges adjacent runs with the same highlights and ignores out-of-range points', () => {
    expect(
      segmentText('abcd', [
        { id: 'x', start: 0, end: 2 },
        { id: 'x', start: 2, end: 4 },
        { id: 'far', start: 9, end: 9 },
      ]),
    ).toEqual([{ kind: 'text', text: 'abcd', ids: ['x'] }]);
  });
});

describe('visibleTokens', () => {
  it('names whitespace and invisible characters', () => {
    expect(visibleTokens('a b\n')).toEqual([
      { text: 'a', symbol: false },
      { text: 'NBSP', symbol: true },
      { text: 'b', symbol: false },
      { text: '⏎', symbol: true },
    ]);
    expect(visibleTokens('⁦')).toEqual([{ text: 'U+2066', symbol: true }]);
  });

  it('shows an empty string as "nothing"', () => {
    expect(visibleTokens('')).toEqual([{ text: 'nothing', symbol: true }]);
  });

  it('keeps visible text together, including emoji', () => {
    expect(visibleTokens('Hi 😀')).toEqual([
      { text: 'Hi', symbol: false },
      { text: '␣', symbol: true },
      { text: '😀', symbol: false },
    ]);
  });
});

describe('isBlank', () => {
  it('detects runs with nothing visible', () => {
    expect(isBlank(' \n​')).toBe(true);
    expect(isBlank(' a ')).toBe(false);
  });
});
