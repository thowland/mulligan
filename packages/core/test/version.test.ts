import { expect, it } from 'vitest';
import { LIBRARY_VERSION } from '../src/index.ts';
import pkg from '../package.json' with { type: 'json' };

it('LIBRARY_VERSION matches package.json (run `pnpm --filter @mulligan/core version:sync`)', () => {
  expect(LIBRARY_VERSION).toBe(pkg.version);
});
