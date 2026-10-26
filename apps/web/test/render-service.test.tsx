import type { PixelEngine } from '@mulligan/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expose } from 'comlink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderApi } from '../src/render/api.ts';
import { createRenderService, isDecodeError, useRenderService } from '../src/render/service.ts';
import { fakeRender } from './helpers/images.ts';
import { planFor, inspectSource } from '../src/core-bridge/images.ts';
import { pngFile } from './helpers/images.ts';

const plan = () => {
  const outcome = inspectSource('s', 'a.png', 'screenshot', pngFile(1320, 2868));
  if (!outcome.ok) throw new Error('bad source');
  return planFor(outcome.source, 'iphone-6.9');
};

class DecodeError extends Error {
  override name = 'DecodeError';
}

/** A worker stand-in: the far end of a MessageChannel hosting the real render API. */
function channelEndpoint(engine: PixelEngine) {
  const { port1, port2 } = new MessageChannel();
  expose(createRenderApi(engine), port1);
  return Object.assign(port2, { terminate: vi.fn(() => port2.close()) });
}

const engine = (renderImpl: PixelEngine['render'] = fakeRender): PixelEngine => ({
  id: 'fake',
  render: renderImpl,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRenderService', () => {
  it('creates the worker lazily and renders through it', async () => {
    const factory = vi.fn(() => channelEndpoint(engine()));
    const service = createRenderService(factory);
    expect(factory).not.toHaveBeenCalled();
    const output = await service.render({ source: new Uint8Array(4), plan: plan() });
    expect(output).toMatchObject({ width: 1320, height: 2868, mimeType: 'image/png' });
    await service.render({ source: new Uint8Array(4), plan: plan() });
    expect(factory).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('terminates the worker on dispose and starts a new one afterwards', async () => {
    const endpoints: ReturnType<typeof channelEndpoint>[] = [];
    const service = createRenderService(() => {
      const endpoint = channelEndpoint(engine());
      endpoints.push(endpoint);
      return endpoint;
    });
    service.dispose();
    await service.render({ source: new Uint8Array(4), plan: plan() });
    service.dispose();
    expect(endpoints[0]!.terminate).toHaveBeenCalledTimes(1);
    await service.render({ source: new Uint8Array(4), plan: plan() });
    expect(endpoints).toHaveLength(2);
    service.dispose();
  });

  it('preserves the DecodeError name across the worker boundary', async () => {
    const service = createRenderService(() =>
      channelEndpoint(engine(() => Promise.reject(new DecodeError('Bad pixels.')))),
    );
    const error = await service.render({ source: new Uint8Array(4), plan: plan() }).catch((e) => e);
    expect(isDecodeError(error)).toBe(true);
    expect((error as Error).message).toBe('Bad pixels.');
    expect(isDecodeError(new Error('other'))).toBe(false);
    expect(isDecodeError('DecodeError')).toBe(false);
    service.dispose();
  });

  it('defaults to a module worker for the render script', async () => {
    const created: { url: string; options: WorkerOptions }[] = [];
    vi.stubGlobal('Worker', function FakeWorker(url: URL, options: WorkerOptions) {
      created.push({ url: String(url), options });
      return channelEndpoint(engine());
    });
    const service = createRenderService();
    await service.render({ source: new Uint8Array(4), plan: plan() });
    expect(created).toHaveLength(1);
    expect(created[0]!.url).toMatch(/render\.worker\.ts/);
    expect(created[0]!.options).toEqual({ type: 'module', name: 'render' });
    service.dispose();
  });
});

describe('useRenderService', () => {
  it('provides a shared lazy service by default', async () => {
    vi.stubGlobal('Worker', function FakeWorker() {
      return channelEndpoint(engine());
    });
    let width = 0;
    function Probe() {
      const service = useRenderService();
      return (
        <button
          type="button"
          onClick={async () => {
            width = (await service.render({ source: new Uint8Array(4), plan: plan() })).width;
            service.dispose();
          }}
        >
          go
        </button>
      );
    }
    render(<Probe />);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await vi.waitFor(() => expect(width).toBe(1320));
  });
});
