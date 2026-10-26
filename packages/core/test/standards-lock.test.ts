import { describe, expect, it } from 'vitest';
import { getStandardsInfo } from '../src/index.ts';
import lock from '../src/standards/standards.lock.json' with { type: 'json' };

describe('standards.lock.json', () => {
  it('matches the bundled standards', () => {
    const info = getStandardsInfo();
    const hint =
      info.rulesetVersion === lock.rulesetVersion
        ? 'standards.json changed without a rulesetVersion bump: bump it, then run `pnpm --filter @mulligan/core standards:lock`'
        : 'rulesetVersion was bumped: run `pnpm --filter @mulligan/core standards:lock`';
    expect(info.standardsHash, hint).toBe(lock.standardsHash);
    expect(info.rulesetVersion, hint).toBe(lock.rulesetVersion);
  });
});
