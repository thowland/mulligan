import type { RenderRequest, RenderedImage } from '@mulligan/core';
import { wrap, type Endpoint, type Remote } from 'comlink';
import { createContext, useContext } from 'react';
import type { RenderApi } from './api.ts';

export interface RenderService {
  render(request: RenderRequest): Promise<RenderedImage>;
  dispose(): void;
}

/** Error names thrown by the pixel engine; comlink preserves them across the worker boundary. */
export function isDecodeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'DecodeError';
}

type WorkerLike = Endpoint & { terminate?: () => void };

const createWorker = (): WorkerLike =>
  new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'render' });

/**
 * A render service backed by a single worker, created on first use so that nothing starts until
 * an image is added. Sprint 2 replaces this with a pool.
 */
export function createRenderService(endpoint: () => WorkerLike = createWorker): RenderService {
  let worker: WorkerLike | undefined;
  let remote: Remote<RenderApi> | undefined;
  return {
    render(request) {
      worker ??= endpoint();
      remote ??= wrap<RenderApi>(worker);
      return remote.render(request);
    },
    dispose() {
      worker?.terminate?.();
      worker = undefined;
      remote = undefined;
    },
  };
}

let shared: RenderService | undefined;

const lazyShared: RenderService = {
  render: (request) => (shared ??= createRenderService()).render(request),
  dispose: () => shared?.dispose(),
};

export const RenderServiceContext = createContext<RenderService>(lazyShared);

export function useRenderService(): RenderService {
  return useContext(RenderServiceContext);
}
