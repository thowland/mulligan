import type { Finding, RenderedImage } from '@mulligan/core';
import { createContext, useContext } from 'react';
import { planFor, verifyOutput } from '../core-bridge/images.ts';
import { versionInfo } from '../core-bridge/standards.ts';
import { PREVIEW_MAX_EDGE } from '../config.ts';
import type { SourceEntry } from '../state/images.ts';
import { createRenderService, isAbortError, type RenderService } from './service.ts';

/** A verified full-size output, held as a Blob so the browser may keep it off the JS heap. */
export interface FullOutput {
  blob: Blob;
  mimeType: RenderedImage['mimeType'];
  width: number;
  height: number;
  size: number;
  /** checkRendered findings for the encoded bytes. */
  findings: Finding[];
}

export interface RenderCache {
  preview(source: SourceEntry, presetId: string): Promise<RenderedImage>;
  full(source: SourceEntry, presetId: string): Promise<FullOutput>;
  /** Cancels and forgets everything not in `active` (keys from `renderKey`). */
  prune(active: ReadonlySet<string>): void;
}

const RENDERER = 'canvas';

/** Identifies a render independent of order: same bytes and preset render the same output. */
export const renderKey = (source: Pick<SourceEntry, 'sha256'>, presetId: string) =>
  `${source.sha256}|${presetId}`;

interface Entry {
  base: string;
  promise: Promise<unknown>;
  controller: AbortController;
}

/** Caches renders by source hash, preset, ruleset and renderer (spec §9.4). */
export function createRenderCache(service: RenderService): RenderCache {
  const entries = new Map<string, Entry>();
  const { rulesetVersion } = versionInfo();

  function cached<T>(
    source: SourceEntry,
    presetId: string,
    kind: 'preview' | 'full',
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const base = renderKey(source, presetId);
    const key = `${rulesetVersion}|${RENDERER}|${base}|${kind}`;
    const existing = entries.get(key);
    if (existing) return existing.promise as Promise<T>;
    const controller = new AbortController();
    const promise = run(controller.signal);
    // Cancelled work must not stay cached; real failures do (rendering is deterministic).
    promise.catch((error: unknown) => {
      if (isAbortError(error) && entries.get(key)?.promise === promise) entries.delete(key);
    });
    entries.set(key, { base, promise, controller });
    return promise;
  }

  return {
    preview(source, presetId) {
      return cached(source, presetId, 'preview', (signal) =>
        service.render(
          {
            source: source.bytes,
            plan: planFor(source, presetId),
            preview: { maxEdge: PREVIEW_MAX_EDGE },
          },
          { priority: 'high', signal },
        ),
      );
    },
    full(source, presetId) {
      return cached(source, presetId, 'full', async (signal) => {
        const plan = planFor(source, presetId);
        const output = await service.render(
          { source: source.bytes, plan },
          { priority: 'low', signal },
        );
        return {
          blob: new Blob([output.bytes.slice()], { type: output.mimeType }),
          mimeType: output.mimeType,
          width: output.width,
          height: output.height,
          size: output.bytes.length,
          findings: verifyOutput(plan, output),
        };
      });
    },
    prune(active) {
      for (const [key, entry] of entries) {
        if (active.has(entry.base)) continue;
        entry.controller.abort();
        entries.delete(key);
      }
    },
  };
}

let shared: RenderCache | undefined;

/** The app-wide cache over a lazily started worker pool. */
export function sharedRenderCache(): RenderCache {
  return (shared ??= createRenderCache(createRenderService()));
}

export const RenderCacheContext = createContext<() => RenderCache>(sharedRenderCache);

export function useRenderCache(): RenderCache {
  return useContext(RenderCacheContext)();
}
