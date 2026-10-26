// The CloudFront response headers policy in infra/mulligan.yaml must send exactly the headers in
// apps/web/security/headers.json, which the preview server and the E2E suite use (spec §10.3).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const expected = JSON.parse(read('apps/web/security/headers.json')) as Record<string, string>;
const template = read('infra/mulligan.yaml');

/** The text of one YAML block, from its key to the next line at the same or lower indent. */
function block(key: string, source = template): string {
  const start = source.search(new RegExp(`^( *)${key}:`, 'm'));
  expect(start, `${key} in the template`).toBeGreaterThanOrEqual(0);
  const indent = /^( *)/.exec(source.slice(start))![1]!.length;
  const lines = source.slice(start).split('\n');
  const end = lines.findIndex(
    (line, i) => i > 0 && line.trim() !== '' && line.length - line.trimStart().length <= indent,
  );
  return lines.slice(0, end === -1 ? undefined : end).join('\n');
}

/** A scalar under a block, skipping the block's own key line; quotes are removed. */
function value(source: string, key: string): string | undefined {
  const body = source.split('\n').slice(1).join('\n');
  return unquote(new RegExp(`^ *${key}: *(.*)$`, 'm').exec(body)?.[1]);
}

function unquote(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  if (text?.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  if (text?.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  return text;
}

/** Rebuilds the response headers the policy produces. */
function policyHeaders(): Record<string, string> {
  const security = block('SecurityHeadersConfig');
  const headers: Record<string, string> = {};
  const csp = block('ContentSecurityPolicy', security);
  headers['Content-Security-Policy'] = value(csp, 'ContentSecurityPolicy')!;
  const hsts = block('StrictTransportSecurity', security);
  headers['Strict-Transport-Security'] = [
    `max-age=${value(hsts, 'AccessControlMaxAgeSec')}`,
    value(hsts, 'IncludeSubdomains') === 'true' ? 'includeSubDomains' : null,
    value(hsts, 'Preload') === 'true' ? 'preload' : null,
  ]
    .filter(Boolean)
    .join('; ');
  if (/^ *ContentTypeOptions:/m.test(security)) headers['X-Content-Type-Options'] = 'nosniff';
  headers['X-Frame-Options'] = value(block('FrameOptions', security), 'FrameOption')!;
  headers['Referrer-Policy'] = value(block('ReferrerPolicy', security), 'ReferrerPolicy')!;
  const custom = block('CustomHeadersConfig');
  for (const match of custom.matchAll(/- Header: *(\S+)\n *Value: *(.*)\n/g)) {
    headers[match[1]!] = unquote(match[2])!;
  }
  return headers;
}

describe('infra/mulligan.yaml', () => {
  it('sends exactly the production headers', () => {
    expect(policyHeaders()).toEqual(expected);
  });

  it('overrides any origin header and applies the policy to the site', () => {
    const policy = block('SiteHeadersPolicy');
    expect(policy.match(/Override: true/g)?.length).toBe(Object.keys(expected).length);
    expect(block('DefaultCacheBehavior')).toMatch(
      /ResponseHeadersPolicyId: !Ref SiteHeadersPolicy/,
    );
    expect(block('DefaultCacheBehavior')).toMatch(/ViewerProtocolPolicy: redirect-to-https/);
  });

  it('keeps the bucket private and readable only by this distribution', () => {
    const bucket = block('SiteBucket');
    for (const flag of [
      'BlockPublicAcls',
      'BlockPublicPolicy',
      'IgnorePublicAcls',
      'RestrictPublicBuckets',
    ]) {
      expect(value(bucket, flag), flag).toBe('true');
    }
    expect(block('SiteBucketPolicy')).toMatch(/distribution\/\$\{SiteDistribution\}/);
  });
});
