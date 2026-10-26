import type { RenderRequest, RenderedImage } from '@mulligan/core';
import { wrap, type Endpoint, type Remote } from 'comlink';
import { renderPoolSize } from '../config.ts';
import type { RenderApi } from './api.ts';

export type RenderPriority = 'high' | 'low';

export interface RenderOptions {
  /** Previews run first ('high'); full renders fill idle workers ('low'). */
  priority?: RenderPriority;
  /** Aborting removes a queued job; a running job's result is discarded. */
  signal?: AbortSignal;
}

export interface RenderService {
  render(request: RenderRequest, options?: RenderOptions): Promise<RenderedImage>;
  dispose(): void;
}

/** Error names thrown by the pixel engine; comlink preserves them across the worker boundary. */
export function isDecodeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'DecodeError';
}

/** A finding message for a failed render: the engine's decode message, or a generic one. */
export function failureMessage(error: unknown): string {
  if (isDecodeError(error)) return (error as Error).message;
  return `Rendering failed: ${error instanceof Error ? error.message : String(error)}`;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const abortError = () => new DOMException('Render cancelled', 'AbortError');

type WorkerLike = Endpoint & { terminate?: () => void };

const createWorker = (): WorkerLike =>
  new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'render' });

interface Job {
  request: RenderRequest;
  priority: RenderPriority;
  signal: AbortSignal | undefined;
  resolve: (output: RenderedImage) => void;
  reject: (error: unknown) => void;
}

interface Slot {
  endpoint: WorkerLike;
  remote: Remote<RenderApi>;
  busy: boolean;
}

/**
 * A pool of render workers (spec §9.4), created on demand up to `size`. Each worker runs one job
 * at a time so memory stays bounded; high-priority jobs are taken first, then oldest first.
 */
export function createRenderService(
  endpoint: () => WorkerLike = createWorker,
  size: number = renderPoolSize(),
): RenderService {
  const queue: Job[] = [];
  const slots: Slot[] = [];

  const take = (): Job => {
    const high = queue.findIndex((job) => job.priority === 'high');
    return queue.splice(high >= 0 ? high : 0, 1)[0]!;
  };

  const pump = () => {
    while (queue.length > 0) {
      let slot = slots.find((s) => !s.busy);
      if (!slot && slots.length < size) {
        const worker = endpoint();
        slot = { endpoint: worker, remote: wrap<RenderApi>(worker), busy: false };
        slots.push(slot);
      }
      if (!slot) return;
      const job = take();
      const running = slot;
      running.busy = true;
      running.remote
        .render(job.request)
        .then(
          (output) => (job.signal?.aborted ? job.reject(abortError()) : job.resolve(output)),
          (error: unknown) => job.reject(job.signal?.aborted ? abortError() : error),
        )
        .finally(() => {
          running.busy = false;
          pump();
        });
    }
  };

  return {
    render(request, { priority = 'high', signal } = {}) {
      if (signal?.aborted) return Promise.reject(abortError());
      return new Promise<RenderedImage>((resolve, reject) => {
        const job: Job = { request, priority, signal, resolve, reject };
        signal?.addEventListener(
          'abort',
          () => {
            const index = queue.indexOf(job);
            if (index >= 0) {
              queue.splice(index, 1);
              reject(abortError());
            }
          },
          { once: true },
        );
        queue.push(job);
        pump();
      });
    },
    dispose() {
      for (const job of queue.splice(0)) job.reject(abortError());
      for (const slot of slots.splice(0)) slot.endpoint.terminate?.();
    },
  };
}
