import type { RenderFailureKind, RenderRequest, RenderedImage } from '@mulligan/core';
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

/** Raised when a render worker dies (an uncaught error, or the browser killing it) twice. */
export class WorkerCrashError extends Error {
  override name = 'WorkerCrashError';
}

/** A finding message for a failed render: the engine's decode message, or a generic one. */
export function failureMessage(error: unknown): string {
  if (isDecodeError(error)) return (error as Error).message;
  return `Rendering failed: ${error instanceof Error ? error.message : String(error)}`;
}

export type RenderFailure = { kind: RenderFailureKind; message: string };

const MEMORY = /out of memory|allocation failed|memory limit/i;

/**
 * Classifies a render error by the engine's typed error names (spec §11) so core can turn it
 * into the right finding: memory exhaustion is a size problem, the rest a processing failure.
 */
export function classifyRenderError(error: unknown): RenderFailure {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'DecodeError') return { kind: 'decode', message };
  if (name === 'EncodeError') return { kind: 'encode', message };
  if (name === 'WorkerCrashError') return { kind: 'crash', message };
  if (name === 'RangeError' || name === 'OutOfMemoryError' || MEMORY.test(message)) {
    return { kind: 'memory', message };
  }
  return { kind: 'decode', message: failureMessage(error) };
}

/** DOMException is not an Error subclass in every environment, so match on the name. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

const abortError = () => new DOMException('Render cancelled', 'AbortError');

type WorkerLike = Endpoint & { terminate?: () => void };

const createWorker = (): WorkerLike =>
  new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'render' });

interface Job {
  request: RenderRequest;
  priority: RenderPriority;
  signal: AbortSignal | undefined;
  /** Times this job has been retried after its worker crashed. */
  retries: number;
  resolve: (output: RenderedImage) => void;
  reject: (error: unknown) => void;
}

interface Slot {
  endpoint: WorkerLike;
  remote: Remote<RenderApi>;
  /** The job running on this worker, or null when idle. */
  job: Job | null;
}

/** A job whose worker crashed is retried once on a fresh worker, then fails (spec §11). */
const MAX_RETRIES = 1;

/**
 * A pool of render workers (spec §9.4), created on demand up to `size`. Each worker runs one job
 * at a time so memory stays bounded; high-priority jobs are taken first, then oldest first.
 * A worker that crashes is terminated and replaced, and its job retried once.
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

  const crash = (slot: Slot, reason: string) => {
    const index = slots.indexOf(slot);
    if (index < 0) return;
    slots.splice(index, 1);
    slot.endpoint.terminate?.();
    const job = slot.job;
    slot.job = null;
    if (job) {
      if (job.signal?.aborted) job.reject(abortError());
      else if (job.retries < MAX_RETRIES) {
        job.retries += 1;
        queue.unshift(job);
      } else job.reject(new WorkerCrashError(reason));
    }
    pump();
  };

  const startWorker = (): Slot => {
    const worker = endpoint();
    const slot: Slot = { endpoint: worker, remote: wrap<RenderApi>(worker), job: null };
    const onError = (event: Event) => {
      event.preventDefault();
      const message = (event as ErrorEvent).message;
      crash(
        slot,
        message ? `the image renderer crashed (${message})` : 'the image renderer crashed',
      );
    };
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
    slots.push(slot);
    return slot;
  };

  const pump = () => {
    while (queue.length > 0) {
      let slot = slots.find((s) => s.job === null);
      if (!slot && slots.length < size) slot = startWorker();
      if (!slot) return;
      const job = take();
      const running = slot;
      running.job = job;
      // A crashed worker's late reply is ignored: its job was already retried or rejected.
      const current = () => running.job === job && slots.includes(running);
      running.remote
        .render(job.request)
        .then(
          (output) => {
            if (!current()) return;
            if (job.signal?.aborted) job.reject(abortError());
            else job.resolve(output);
          },
          (error: unknown) => {
            if (!current()) return;
            job.reject(job.signal?.aborted ? abortError() : error);
          },
        )
        .finally(() => {
          if (!current()) return;
          running.job = null;
          pump();
        });
    }
  };

  return {
    render(request, { priority = 'high', signal } = {}) {
      if (signal?.aborted) return Promise.reject(abortError());
      return new Promise<RenderedImage>((resolve, reject) => {
        const job: Job = { request, priority, signal, retries: 0, resolve, reject };
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
      // Terminated workers never reply, so their running jobs are settled here.
      for (const slot of slots.splice(0)) {
        slot.job?.reject(abortError());
        slot.job = null;
        slot.endpoint.terminate?.();
      }
    },
  };
}
