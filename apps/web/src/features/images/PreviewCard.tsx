import type { Finding, RenderedImage } from '@mulligan/core';
import { useEffect, useMemo, useState } from 'react';
import {
  decodeFailure,
  downloadName,
  planFor,
  presetById,
  worstOf,
} from '../../core-bridge/images.ts';
import { useRenderCache, type FullOutput } from '../../render/cache.ts';
import { failureMessage, isAbortError } from '../../render/service.ts';
import type { SourceEntry } from '../../state/session.ts';
import { FindingList } from '../../ui/FindingList.tsx';
import { saveBlob, useObjectUrl } from '../../ui/files.ts';
import { formatBytes, formatDimensions } from '../format.ts';
import styles from './PreviewCard.module.css';

interface PreviewCardProps {
  source: SourceEntry;
  sourceUrl: string;
  presetId: string;
  /** Position in the group (1-based) and group size, for the output name. */
  sequence: number;
  groupSize: number;
}

type RenderState =
  | { status: 'rendering' }
  | { status: 'ready'; preview: RenderedImage; output?: FullOutput }
  | { status: 'failed'; finding: Finding };

const STATUS_LABEL = { pass: 'Ready', warning: 'Ready with warnings', failure: 'Failed' } as const;

export function PreviewCard({ source, sourceUrl, presetId, sequence, groupSize }: PreviewCardProps) {
  const cache = useRenderCache();
  const preset = presetById(presetId);
  const plan = useMemo(() => planFor(source, presetId), [source, presetId]);
  // Callers key the card by source and preset, so a change mounts a fresh card in 'rendering'.
  const [state, setState] = useState<RenderState>({ status: 'rendering' });

  useEffect(() => {
    let current = true;
    const fail = (error: unknown) => {
      if (!current || isAbortError(error)) return;
      setState({ status: 'failed', finding: decodeFailure(source, failureMessage(error)) });
    };
    // Preview first so something appears quickly; the full render then verifies the output.
    cache
      .preview(source, presetId)
      .then((preview) => {
        if (!current) return undefined;
        setState({ status: 'ready', preview });
        return cache.full(source, presetId).then((output) => {
          if (current) setState({ status: 'ready', preview, output });
        });
      })
      .catch(fail);
    return () => {
      current = false;
    };
  }, [cache, source, presetId]);

  const preview = state.status === 'ready' ? state.preview : null;
  const previewUrl = useObjectUrl(preview?.bytes ?? null, preview?.mimeType ?? '');

  const output = state.status === 'ready' ? state.output : undefined;
  const findings =
    state.status === 'failed' ? [state.finding] : [...plan.findings, ...(output?.findings ?? [])];
  const worst = worstOf(findings);
  let statusText = 'Rendering…';
  if (state.status === 'failed') statusText = 'Failed';
  else if (output) statusText = STATUS_LABEL[worst];

  const { crop, source: dims } = plan;
  const overlay = {
    left: `${(crop.x / dims.width) * 100}%`,
    top: `${(crop.y / dims.height) * 100}%`,
    width: `${(crop.width / dims.width) * 100}%`,
    height: `${(crop.height / dims.height) * 100}%`,
  };
  const fileName = downloadName(source, presetId, sequence, groupSize);

  return (
    <article
      className={styles.card}
      aria-label={`${preset.name}, ${source.fileName}`}
      data-status={output ? worst : state.status}
    >
      <header className={styles.header}>
        <h3>{preset.name}</h3>
        <span className={styles.dimensions}>{formatDimensions(preset.width, preset.height)}</span>
        <span className={styles.status} role="status">
          {statusText}
        </span>
      </header>

      <div className={styles.figures}>
        <figure className={styles.figure}>
          <div className={styles.frame}>
            <img src={sourceUrl} alt={`Source ${source.fileName} with the crop area outlined`} />
            <div className={styles.overlay} style={overlay} aria-hidden="true" />
          </div>
          <figcaption>
            Crop {formatDimensions(crop.width, crop.height)} at {crop.x}, {crop.y}
          </figcaption>
        </figure>
        <figure className={styles.figure}>
          <div className={styles.frame}>
            {previewUrl ? (
              <img src={previewUrl} alt={`${preset.name} result for ${source.fileName}`} />
            ) : (
              <div
                className={styles.placeholder}
                style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
              />
            )}
          </div>
          <figcaption>
            {output
              ? `${output.mimeType === 'image/png' ? 'PNG' : 'JPEG'} · ${formatBytes(output.size)}`
              : 'Result'}
          </figcaption>
        </figure>
      </div>

      <FindingList findings={findings} />

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.download}
          disabled={!output}
          onClick={() => output && saveBlob(output.blob, fileName)}
        >
          Download
        </button>
        <code className={styles.fileName}>{fileName}</code>
      </footer>
    </article>
  );
}
