// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tim Howland

// Checks a deployed Mulligan against apps/web/security/headers.json:
//   node scripts/check-live-headers.mjs https://mulligan.beta-site.us
// Every header must match exactly on the page, the main script and the render worker, and on a
// 304 revalidation too, since WebKit checks COEP against the 304 when it loads the worker. Plain
// HTTP must redirect to HTTPS. Exits non-zero on any mismatch.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const expected = JSON.parse(
  readFileSync(new URL('../apps/web/security/headers.json', import.meta.url), 'utf8'),
);
const site = new URL(process.argv[2] ?? 'https://mulligan.beta-site.us');
const problems = [];

function get(url, headers = {}) {
  const client = url.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const request = client.get(url, { headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode, headers: response.headers, body }),
      );
    });
    request.on('error', reject);
    request.setTimeout(15_000, () => request.destroy(new Error(`timed out: ${url}`)));
  });
}

function checkHeaders(label, response) {
  for (const [name, value] of Object.entries(expected)) {
    const actual = response.headers[name.toLowerCase()];
    if (actual !== value) problems.push(`${label}: ${name} is ${JSON.stringify(actual)}`);
  }
}

const page = await get(new URL('/', site));
if (page.status !== 200) problems.push(`/: status ${page.status}`);
checkHeaders('/', page);

const script = page.body.match(/<script[^>]+src="([^"]+)"/)?.[1];
if (!script) problems.push('/: no module script found');
const assets = [];
if (script) {
  const main = await get(new URL(script, site));
  if (main.status !== 200) problems.push(`${script}: status ${main.status}`);
  if (!/javascript/.test(main.headers['content-type'] ?? '')) {
    problems.push(`${script}: content-type ${main.headers['content-type']}`);
  }
  if (!/immutable/.test(main.headers['cache-control'] ?? '')) {
    problems.push(`${script}: cache-control ${main.headers['cache-control']}`);
  }
  checkHeaders(script, main);
  assets.push(script);
  const worker = main.body.match(/["'`(]([^"'`()]*render\.worker-[\w-]+\.js)/)?.[1];
  if (worker) assets.push(new URL(worker, new URL(script, site)).pathname);
  else problems.push(`${script}: render worker reference not found`);
}
for (const path of assets.slice(1)) {
  const response = await get(new URL(path, site));
  if (response.status !== 200) problems.push(`${path}: status ${response.status}`);
  checkHeaders(path, response);
}

for (const path of ['/', ...assets]) {
  const first = await get(new URL(path, site));
  const etag = first.headers.etag;
  if (!etag) {
    problems.push(`${path}: no ETag to revalidate with`);
    continue;
  }
  const revalidated = await get(new URL(path, site), { 'If-None-Match': etag });
  if (revalidated.status !== 304)
    problems.push(`${path}: revalidation status ${revalidated.status}`);
  else checkHeaders(`${path} (304)`, revalidated);
}

const plain = new URL('/', site);
plain.protocol = 'http:';
const redirect = await get(plain);
if (![301, 308].includes(redirect.status) || !redirect.headers.location?.startsWith('https://')) {
  problems.push(`http: status ${redirect.status}, location ${redirect.headers.location}`);
}

if (problems.length > 0) {
  console.error(`Live header check failed for ${site.origin}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `Live headers match headers.json on ${['/', ...assets].join(', ')}, including 304s; HTTP redirects to HTTPS.`,
);
