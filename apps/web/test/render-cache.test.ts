import type { RenderRequest } from '@mulligan/core';
import { describe, expect, it, vi } from 'vitest';
import { createRenderCache, renderKey, sharedRenderCache } from '../src/render/cache.ts';
import type { RenderOptions, RenderService } from '../src/render/service.ts';
import { fakeRender, sourceEntry } from './helpers/images.ts';

function recordingService(
  render: (
    request: RenderRequest,
    options?: RenderOptions,
  ) => Promise<Awaited<ReturnType<typeof fakeRender>>> = (r) => fakeRender(r),
) {
  const calls: { request: RenderRequest; options: RenderOptions | undefined }[] = [];
  const service: RenderService = {
    render(request, options) {
      calls.push({ request, options });
      return render(request, options);
    },
    dispose: vi.fn(),
  };
  return { service, calls };
}

describe('createRenderCache', () => {
  it('renders each source × preset once per kind, previews high and full renders low', async () => {
    const { service, calls } = recordingService();
    const cache = createRenderCache(service);
    const source = sourceEntry('a.png');
    const [p1, p2] = await Promise.all([
      cache.preview(source, 'iphone-6.3'),
      cache.preview(source, 'iphone-6.3'),
    ]);
    expect(p1).toBe(p2);
    expect(p1.width).toBe(221);
    const full = await cache.full(source, 'iphone-6.3');
    expect(await cache.full(source, 'iphone-6.3')).toBe(full);
    expect(calls.map((c) => [c.request.preview?.maxEdge ?? 'full', c.options?.priority])).toEqual([
      [480, 'high'],
      ['full', 'low'],
    ]);
    expect(full).toMatchObject({ mimeType: 'image/png', width: 1206, height: 2622 });
    expect(full.size).toBe(full.blob.size);
    expect(full.findings.every((f) => f.severity === 'pass')).toBe(true);
  });

  it('shares renders between sources with the same bytes and keys by hash and preset', async () => {
    const { service, calls } = recordingService();
    const cache = createRenderCache(service);
    const a = sourceEntry('a.png');
    const copy = { ...sourceEntry('copy.png'), sha256: a.sha256 };
    await cache.preview(a, 'iphone-6.3');
    await cache.preview(copy, 'iphone-6.3');
    expect(calls).toHaveLength(1);
    expect(renderKey(a, 'ipad-13')).toBe(`${a.sha256}|ipad-13`);
  });

  it('cancels and forgets renders that are no longer active', async () => {
    const signals: AbortSignal[] = [];
    const { service, calls } = recordingService(
      (request, options) =>
        new Promise((resolve, reject) => {
          signals.push(options!.signal!);
          options!.signal!.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError')),
          );
          if (request.preview) void fakeRender(request).then(resolve);
        }),
    );
    const cache = createRenderCache(service);
    const keep = sourceEntry('keep.png');
    const drop = sourceEntry('drop.png');
    const dropped = cache.full(drop, 'iphone-6.3');
    void cache.full(keep, 'iphone-6.3');
    cache.prune(new Set([renderKey(keep, 'iphone-6.3')]));
    await expect(dropped).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
    // A pruned render starts afresh when requested again.
    void cache.full(drop, 'iphone-6.3').catch(() => undefined);
    expect(calls).toHaveLength(3);
  });

  it('keeps real failures cached, but not cancellations', async () => {
    let attempt = 0;
    const { service } = recordingService(() => {
      attempt += 1;
      return Promise.reject(
        attempt === 1 ? new DOMException('cancelled', 'AbortError') : new Error('decode failed'),
      );
    });
    const cache = createRenderCache(service);
    const source = sourceEntry('x.png');
    await expect(cache.preview(source, 'iphone-6.3')).rejects.toMatchObject({ name: 'AbortError' });
    await expect(cache.preview(source, 'iphone-6.3')).rejects.toThrow('decode failed');
    await expect(cache.preview(source, 'iphone-6.3')).rejects.toThrow('decode failed');
    expect(attempt).toBe(2);
  });

  it('provides one shared app-wide cache', () => {
    expect(sharedRenderCache()).toBe(sharedRenderCache());
  });
});
