import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex, standardsHash } from '../src/index.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('matches the FIPS 180-4 vector for %j', (input, expected) => {
    expect(sha256Hex(utf8(input))).toBe(expected);
  });

  it('matches Web Crypto across block boundaries', async () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const data = Uint8Array.from({ length }, (_, i) => (i * 31 + length) & 0xff);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      const expected = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
      expect(sha256Hex(data), `length ${length}`).toBe(expected);
    }
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { f: true, e: null }], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[2,{"e":null,"f":true}]},"b":1}',
    );
  });

  it('is independent of key insertion order', () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it('rejects values that are not JSON', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(TypeError);
  });
});

describe('standardsHash', () => {
  it('prefixes the algorithm and ignores key order', () => {
    const hash = standardsHash({ a: 1, b: 2 });
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(standardsHash({ b: 2, a: 1 })).toBe(hash);
    expect(standardsHash({ a: 1, b: 3 })).not.toBe(hash);
  });
});
