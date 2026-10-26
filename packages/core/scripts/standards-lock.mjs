// Records the fingerprint of standards.json in standards.lock.json.
// Refuses to run unless rulesetVersion has changed, so every change to the standards
// is versioned (spec §4.1). The lock test in test/standards-lock.test.ts enforces the rest.
import { readFileSync, writeFileSync } from 'node:fs';
import { standardsHash } from '../src/standards/hash.ts';

const standardsUrl = new URL('../src/standards/standards.json', import.meta.url);
const lockUrl = new URL('../src/standards/standards.lock.json', import.meta.url);

const document = JSON.parse(readFileSync(standardsUrl, 'utf8'));
const hash = standardsHash(document);
let lock = null;
try {
  lock = JSON.parse(readFileSync(lockUrl, 'utf8'));
} catch {
  // first lock
}

if (lock && lock.standardsHash === hash) {
  console.log(`standards.lock.json is up to date (${lock.rulesetVersion}).`);
  process.exit(0);
}
if (lock && lock.rulesetVersion === document.rulesetVersion) {
  console.error(
    `standards.json changed but rulesetVersion is still ${document.rulesetVersion}.\n` +
      'Bump rulesetVersion (major: can turn a pass into a failure; minor: additive; patch: wording) and run again.',
  );
  process.exit(1);
}

const next = { rulesetVersion: document.rulesetVersion, standardsHash: hash };
writeFileSync(lockUrl, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Locked ruleset ${next.rulesetVersion} → ${hash}`);
