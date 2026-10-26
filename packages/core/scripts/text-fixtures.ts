// Text fixtures: print actual results, or (with --write) record them as expected.json.
// Recorded results must be reviewed by a person before they are committed.
//   node packages/core/scripts/text-fixtures.ts [case-name ...] [--write]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { runTextCase, type TextCase } from '../test/support/text-fixtures.ts';

const root = new URL('../../../fixtures/text/', import.meta.url);
const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter((a) => !a.startsWith('--'));

for (const name of readdirSync(root).sort()) {
  if (only.length > 0 && !only.includes(name)) continue;
  const dir = new URL(`${name}/`, root);
  const testCase = JSON.parse(readFileSync(new URL('case.json', dir), 'utf8')) as TextCase;
  const htmlUrl = new URL('input.html', dir);
  const html = existsSync(htmlUrl) ? readFileSync(htmlUrl, 'utf8') : undefined;
  const { expected } = runTextCase(testCase, html);
  const json = `${JSON.stringify(expected, null, 2)}\n`;
  if (write) {
    writeFileSync(new URL('expected.json', dir), json);
    console.log(`wrote ${name}/expected.json`);
  } else {
    console.log(`== ${name}\n${json}`);
  }
}
