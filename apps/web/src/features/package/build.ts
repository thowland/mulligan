// Builds the downloadable package (spec §8): every decision comes from core (layout, naming,
// verification, manifest); this module only gathers bytes and writes the archive.
import type { Finding, ManifestOutputInput, ManifestSource } from '@mulligan/core';
import { decodeFailure, planFor } from '../../core-bridge/images.ts';
import {
  groupCountFindings,
  manifestJson,
  packagePlan,
  verifyEntry,
} from '../../core-bridge/package.ts';
import { APP_INFO } from '../../config.ts';
import type { FullOutput, RenderCache } from '../../render/cache.ts';
import { failureMessage } from '../../render/service.ts';
import type { SourceEntry } from '../../state/session.ts';
import { sha256Hex } from '../images/intake.ts';
import { createZipWriter } from './zip.ts';

export interface BuildInput {
  sources: Readonly<Record<string, readonly SourceEntry[]>>;
  presetIds: readonly string[];
  cache: RenderCache;
  now?: Date;
  /** Called as each output is written: (done, total). */
  onProgress?: (done: number, total: number) => void;
}

export interface BuiltPackage {
  blob: Blob;
  fileName: string;
  manifest: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `mulligan-2026-10-25-1430.zip`, in local time. */
export function packageFileName(now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `mulligan-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

type Outcome = { ok: true; output: FullOutput } | { ok: false; error: unknown };

export async function buildPackage({
  sources,
  presetIds,
  cache,
  now = new Date(),
  onProgress,
}: BuildInput): Promise<BuiltPackage> {
  const plan = packagePlan(sources, presetIds);
  const findings: Finding[] = [...groupCountFindings(sources, presetIds), ...plan.findings];
  const byId = new Map(Object.values(sources).flatMap((list) => list.map((s) => [s.id, s])));
  const images = plan.entries.filter((e) => e.kind === 'image');

  // Queue every full render up front (the pool runs them in parallel), then write in order.
  const renders: Promise<Outcome>[] = images.map((entry) =>
    cache.full(byId.get(entry.sourceId)!, entry.presetId).then(
      (output) => ({ ok: true, output }),
      (error: unknown) => ({ ok: false, error }),
    ),
  );

  const zip = createZipWriter();
  const outputs: ManifestOutputInput[] = [];
  const failedSources = new Set<string>();

  for (const [index, entry] of images.entries()) {
    const source = byId.get(entry.sourceId)!;
    const outcome = await renders[index]!;
    onProgress?.(index + 1, images.length);
    if (!outcome.ok) {
      if (!failedSources.has(source.id)) {
        failedSources.add(source.id);
        findings.push(decodeFailure(source, failureMessage(outcome.error)));
      }
      continue;
    }
    const bytes = new Uint8Array(await outcome.output.blob.arrayBuffer());
    const invalid = verifyEntry(entry.path, bytes);
    if (invalid) {
      findings.push(invalid);
      continue;
    }
    zip.addStored(entry.path, bytes);
    const imagePlan = planFor(source, entry.presetId);
    outputs.push({
      path: entry.path,
      presetId: entry.presetId,
      sourceId: source.id,
      width: outcome.output.width,
      height: outcome.output.height,
      bytes: bytes.length,
      sha256: await sha256Hex(bytes),
      crop: imagePlan.crop,
      findings: [...imagePlan.findings, ...outcome.output.findings],
    });
  }

  const manifestSources: ManifestSource[] = Object.entries(sources).flatMap(([group, list]) =>
    list.map((source, index) => ({
      id: source.id,
      group,
      seq: index + 1,
      fileName: source.fileName,
      sha256: source.sha256,
      width: source.info.orientedWidth,
      height: source.info.orientedHeight,
      type: source.info.type,
      iccProfile: source.info.iccProfile,
    })),
  );

  const manifest = manifestJson({
    app: APP_INFO,
    createdAt: now.toISOString(),
    sources: manifestSources,
    outputs,
    findings,
  });
  zip.addDeflated('manifest.json', new TextEncoder().encode(manifest));

  return { blob: await zip.finish(), fileName: packageFileName(now), manifest };
}
