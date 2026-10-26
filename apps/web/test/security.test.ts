import { describe, expect, it, vi } from 'vitest';
import production from '../security/headers.json' with { type: 'json' };
import { devHeaders, previewHeaders, productionHeaders } from '../security/headers.ts';
import { installDropGuard } from '../src/security/dropGuard.ts';
import { allowedWorkerUrl, installTrustedTypesPolicy } from '../src/security/trustedTypes.ts';
import viteConfig from '../vite.config.ts';

const ORIGIN = 'https://mulligan.example';

describe('security headers', () => {
  it('serves the production set from vite preview, minus only the HTTPS upgrades', () => {
    expect(productionHeaders).toEqual(production);
    const config = viteConfig as { preview: { headers: unknown }; server: { headers: unknown } };
    expect(config.preview.headers).toBe(previewHeaders);
    expect(config.server.headers).toEqual(devHeaders());

    // Safari upgrades localhost requests too, which leaves a plain-HTTP preview blank.
    const { 'Strict-Transport-Security': hsts, ...rest } = productionHeaders;
    expect(hsts).toBeDefined();
    expect(previewHeaders['Strict-Transport-Security']).toBeUndefined();
    expect(previewHeaders).toEqual({
      ...rest,
      'Content-Security-Policy': productionHeaders['Content-Security-Policy']!.replace(
        '; upgrade-insecure-requests',
        '',
      ),
    });
    expect(productionHeaders['Content-Security-Policy']).toContain('upgrade-insecure-requests');
  });

  it('keeps the strict CSP directives in production', () => {
    const csp = productionHeaders['Content-Security-Policy']!;
    for (const directive of [
      "default-src 'none'",
      "connect-src 'none'",
      "frame-ancestors 'none'",
      "require-trusted-types-for 'script'",
      'trusted-types default',
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toMatch(/'unsafe-eval'/);
  });

  it('relaxes only what the dev server needs', () => {
    const dev = devHeaders();
    const csp = dev['Content-Security-Policy']!;
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain('trusted-types');
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(dev['Strict-Transport-Security']).toBeUndefined();
    expect(dev['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });
});

describe('Trusted Types default policy', () => {
  it('allows only the same-origin render worker script', () => {
    expect(allowedWorkerUrl('/assets/render.worker-DeTZNz1O.js', ORIGIN)).toBe(
      `${ORIGIN}/assets/render.worker-DeTZNz1O.js`,
    );
    expect(
      allowedWorkerUrl(`${ORIGIN}/src/render/render.worker.ts?worker_file&type=module`, ORIGIN),
    ).toBe(`${ORIGIN}/src/render/render.worker.ts?worker_file&type=module`);
    for (const bad of [
      'https://evil.example/assets/render.worker-x.js',
      '/assets/index-abc.js',
      'data:text/javascript,1',
      'blob:https://mulligan.example/123',
      '/assets/render.worker-x.js/../../evil.js',
      'http://[bad',
    ]) {
      expect(allowedWorkerUrl(bad, ORIGIN), bad).toBeNull();
    }
  });

  it('installs a default policy with only a script-URL rule', () => {
    const createPolicy = vi.fn();
    expect(installTrustedTypesPolicy({ createPolicy }, ORIGIN)).toBe(true);
    expect(createPolicy).toHaveBeenCalledWith('default', { createScriptURL: expect.any(Function) });
    const rules = createPolicy.mock.calls[0]![1] as {
      createScriptURL: (s: string) => string | null;
    };
    expect(Object.keys(rules)).toEqual(['createScriptURL']);
    expect(rules.createScriptURL('/assets/index.js')).toBeNull();
    expect(installTrustedTypesPolicy(undefined, ORIGIN)).toBe(false);
  });
});

describe('drop guard', () => {
  const drag = (type: string, prevented = false) => {
    const event = new Event(type, { cancelable: true, bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { dropEffect: 'copy' } });
    if (prevented) event.preventDefault();
    return event;
  };

  it('blocks unclaimed drags and every drop, and leaves claimed drags alone', () => {
    const target = new EventTarget() as unknown as Window;
    const remove = installDropGuard(target);
    const unclaimed = drag('dragover');
    target.dispatchEvent(unclaimed);
    expect(unclaimed.defaultPrevented).toBe(true);
    expect(unclaimed.dataTransfer!.dropEffect).toBe('none');

    const claimed = drag('dragover', true);
    target.dispatchEvent(claimed);
    expect(claimed.dataTransfer!.dropEffect).toBe('copy');

    const drop = drag('drop');
    target.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);

    const bare = new Event('dragover', { cancelable: true });
    target.dispatchEvent(bare);
    expect(bare.defaultPrevented).toBe(true);

    remove();
    const after = drag('drop');
    target.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
