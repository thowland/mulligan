// The production response headers (spec §10.3), defined once in headers.json so that the preview
// server, the E2E suite and the CloudFront response headers policy (Sprint 6) all use the same set.
import production from './headers.json' with { type: 'json' };

export type HeaderSet = Readonly<Record<string, string>>;

/** Served by `vite preview` and in production, unchanged. */
export const productionHeaders: HeaderSet = production;

/**
 * The dev server's relaxed set, derived from the production one. Vite's dev client needs an inline
 * React Refresh preamble, a WebSocket for HMR and innerHTML for its error overlay, so the dev CSP
 * adds those and drops Trusted Types. It is applied only by `vite` (dev), never by `vite preview`.
 */
export function devHeaders(): HeaderSet {
  const csp = productionHeaders['Content-Security-Policy']!.split(';')
    .map((directive) => directive.trim())
    .filter(
      (directive) =>
        !/^(require-trusted-types-for|trusted-types|upgrade-insecure-requests)\b/.test(directive),
    )
    .map((directive) => {
      if (directive.startsWith('script-src ')) return `${directive} 'unsafe-inline'`;
      if (directive.startsWith('style-src ')) return `${directive} 'unsafe-inline'`;
      if (directive.startsWith('connect-src ')) return "connect-src 'self' ws: wss:";
      return directive;
    })
    .join('; ');
  // HSTS is meaningless over the dev server's plain HTTP.
  const rest = Object.entries(productionHeaders).filter(
    ([name]) => name !== 'Strict-Transport-Security',
  );
  return { ...Object.fromEntries(rest), 'Content-Security-Policy': csp };
}
