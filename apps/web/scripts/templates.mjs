// Generates the blank listing templates offered to agencies (spec §6.9) from the standards.
// Run `pnpm --filter @mulligan/web templates` after changing listing fields; a test fails if the
// committed files in public/templates/ are out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const csvValue = (value) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The CSV and JSON template contents for a standards document. */
export function templateFiles(standards) {
  const storeLabel = new Map(standards.stores.map((store) => [store.id, store.label]));
  const rows = [
    'field,store,label,limit,value',
    ...standards.fields.map((field) =>
      [
        field.id,
        storeLabel.get(field.store),
        field.label,
        `${field.limit.max} ${field.limit.unit === 'bytes' ? 'bytes' : 'characters'}`,
        '',
      ]
        .map(csvValue)
        .join(','),
    ),
  ];
  const fields = Object.fromEntries(standards.fields.map((field) => [field.id, '']));
  return {
    'mulligan-listing-template.csv': `${rows.join('\r\n')}\r\n`,
    'mulligan-listing-template.json': `${JSON.stringify(
      { mulliganTemplate: 1, locale: standards.locales.default, fields },
      null,
      2,
    )}\n`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const standards = JSON.parse(
    readFileSync(
      new URL('../../../packages/core/src/standards/standards.json', import.meta.url),
      'utf8',
    ),
  );
  for (const [name, content] of Object.entries(templateFiles(standards))) {
    writeFileSync(new URL(`../public/templates/${name}`, import.meta.url), content);
    console.log(`wrote public/templates/${name}`);
  }
}
