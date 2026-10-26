import type { RenderRequest, RenderedImage } from '@mulligan/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPoolSize } from '../src/config.ts';
import {
  createRenderService,
  failureMessage,
  isAbortError,
  isDecodeError,
} from '../src/render/service.ts';
import { channelEndpoint, fakeEngine, fakeRender, sourceEntry } from './helpers/images.ts';
import { planFor } from '../src/core-bridge/images.ts';

const request = (presetId = 'iphone-6.9'): RenderRequest => {
  const source = sourceEntry('a.png');
  return { source: source.bytes, plan: planFor(source, presetId) };
};

class DecodeError extends Error {
  override name = 'DecodeError';
}

/** An engine whose renders resolve only when the test says so, recording the order started. */
function gatedEngine() {
  const started: string[] = [];
  const gates: (() => void)[] = [];
  const engine = fakeEngine(
    (req) =>
      new Promise<RenderedImage>((resolve) => {
        started.push(`${req.plan.presetId}${req.preview ? ':preview' : ''}`);
        gates.push(() => void fakeRender(req).then(resolve));
      }),
  );
  return { engine, started, release: () => gates.shift()?.() };
}

afterEach(() => vi.unstubAllGlobals());

describe('renderPoolSize', () => {
  it('uses one fewer worker than cores, between one and four', () => {
    expect(renderPoolSize(8)).toBe(4);
    expect(renderPoolSize(3)).toBe(2);
    expect(renderPoolSize(1)).toBe(1);
    expect(renderPoolSize(0)).toBe(1);
  });
});

describe('createRenderService (worker pool)', () => {
  it('creates workers lazily, up to the pool size', async () => {
    const factory = vi.fn(() => channelEndpoint());
    const service = createRenderService(factory, 2);
    expect(factory).not.toHaveBeenCalled();
    const outputs = await Promise.all(
      [request(), request(), request()].map((r) => service.render(r)),
    );
    expect(outputs.map((o) => o.width)).toEqual([1320, 1320, 1320]);
    expect(factory).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it('runs one job per worker, high priority before low, oldest first', async () => {
    const { engine, started, release } = gatedEngine();
    const service = createRenderService(() => channelEndpoint(engine), 1);
    const first = service.render(request('iphone-6.9'), { priority: 'low' });
    const low = service.render(request('ipad-13'), { priority: 'low' });
    const high = service.render(
      { ...request('android-phone'), preview: { maxEdge: 100 } },
      { priority: 'high' },
    );
    await vi.waitFor(() => expect(started).toEqual(['iphone-6.9']));
    release();
    await first;
    await vi.waitFor(() => expect(started).toEqual(['iphone-6.9', 'android-phone:preview']));
    release();
    await high;
    await vi.waitFor(() => expect(started).toHaveLength(3));
    release();
    await low;
    expect(started).toEqual(['iphone-6.9', 'android-phone:preview', 'ipad-13']);
    service.dispose();
  });

  it('removes aborted jobs from the queue and discards results of aborted running jobs', async () => {
    const { engine, started, release } = gatedEngine();
    const service = createRenderService(() => channelEndpoint(engine), 1);
    const running = new AbortController();
    const queued = new AbortController();
    const a = service.render(request('iphone-6.9'), { signal: running.signal });
    const b = service.render(request('ipad-13'), { signal: queued.signal });
    const c = service.render(request('android-phone'));
    await vi.waitFor(() => expect(started).toHaveLength(1));
    queued.abort();
    await expect(b).rejects.toSatisfy(isAbortError);
    running.abort();
    release();
    await expect(a).rejects.toSatisfy(isAbortError);
    await vi.waitFor(() => expect(started).toEqual(['iphone-6.9', 'android-phone']));
    release();
    await expect(c).resolves.toMatchObject({ width: 1080 });
    service.dispose();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const service = createRenderService(() => channelEndpoint(), 1);
    const controller = new AbortController();
    controller.abort();
    await expect(service.render(request(), { signal: controller.signal })).rejects.toSatisfy(
      isAbortError,
    );
    service.dispose();
  });

  it('reports an aborted job that then fails as cancelled', async () => {
    let fail: ((error: Error) => void) | undefined;
    const engine = fakeEngine(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const service = createRenderService(() => channelEndpoint(engine), 1);
    const controller = new AbortController();
    const job = service.render(request(), { signal: controller.signal });
    await vi.waitFor(() => expect(fail).toBeDefined());
    controller.abort();
    fail!(new Error('late'));
    await expect(job).rejects.toSatisfy(isAbortError);
    service.dispose();
  });

  it('preserves the DecodeError name across the worker boundary', async () => {
    const service = createRenderService(
      () => channelEndpoint(fakeEngine(() => Promise.reject(new DecodeError('Bad pixels.')))),
      1,
    );
    const error = await service.render(request()).catch((e: unknown) => e);
    expect(isDecodeError(error)).toBe(true);
    expect(failureMessage(error)).toBe('Bad pixels.');
    service.dispose();
  });

  it('rejects queued jobs and terminates workers on dispose', async () => {
    const { engine } = gatedEngine();
    const endpoints: ReturnType<typeof channelEndpoint>[] = [];
    const service = createRenderService(() => {
      const endpoint = channelEndpoint(engine);
      endpoints.push(endpoint);
      return endpoint;
    }, 1);
    void service.render(request()).catch(() => undefined);
    const queued = service.render(request());
    service.dispose();
    await expect(queued).rejects.toSatisfy(isAbortError);
    expect(endpoints[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('defaults to module workers for the render script', async () => {
    const created: { url: string; options: WorkerOptions }[] = [];
    vi.stubGlobal('Worker', function FakeWorker(url: URL, options: WorkerOptions) {
      created.push({ url: String(url), options });
      return channelEndpoint();
    });
    const service = createRenderService();
    await service.render(request());
    expect(created).toHaveLength(1);
    expect(created[0]!.url).toMatch(/render\.worker\.ts/);
    expect(created[0]!.options).toEqual({ type: 'module', name: 'render' });
    service.dispose();
  });
});

describe('error helpers', () => {
  it('classify and describe failures', () => {
    expect(isDecodeError(new Error('x'))).toBe(false);
    expect(isDecodeError('DecodeError')).toBe(false);
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(failureMessage(new Error('out of memory'))).toBe('Rendering failed: out of memory');
    expect(failureMessage('worker crashed')).toBe('Rendering failed: worker crashed');
  });
});
