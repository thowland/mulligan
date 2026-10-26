import type { Finding, RenderedImage } from '@mulligan/core';
import { useEffect, useMemo, useState } from 'react';
import {
  decodeFailure,
  downloadName,
  planFor,
  presetById,
  verifyOutput,
  worstOf,
  type SourceImage,
} from '../../core-bridge/images.ts';
import { isDecodeError, useRenderService } from '../../render/service.ts';
import { FindingList } from '../../ui/FindingList.tsx';
import { saveBytes, useObjectUrl } from '../../ui/files.ts';
import { formatBytes, formatDimensions } from '../format.ts';
import styles from './PreviewCard.module.css';

/** Longest edge of on-screen previews (spec §9.4). */
export const PREVIEW_MAX_EDGE = 480;

interface PreviewCardProps {
  source: SourceImage;
  sourceUrl: string;
  presetId: string;
}

type RenderState =
  | { status: 'rendering' }
  | { status: 'ready'; preview: RenderedImage; output?: RenderedImage; outputFindings: Finding[] }
  | { status: 'failed'; finding: Finding };

const STATUS_LABEL = { pass: 'Ready', warning: 'Ready with warnings', failure: 'Failed' } as const;

export function PreviewCard({ source, sourceUrl, presetId }: PreviewCardProps) {
  const render = useRenderService();
  const preset = presetById(presetId);
  const plan = useMemo(() => planFor(source, presetId), [source, presetId]);
  // Callers key the card by source and preset, so a change mounts a fresh card in 'rendering'.
  const [state, setState] = useState<RenderState>({ status: 'rendering' });

  useEffect(() => {
    let current = true;
    const fail = (error: unknown) => {
      if (!current) return;
      const message = isDecodeError(error)
        ? (error as Error).message
        : `Rendering failed: ${error instanceof Error ? error.message : String(error)}`;
      setState({ status: 'failed', finding: decodeFailure(source, message) });
    };
    // Preview first so something appears quickly; the full render then verifies the output.
    render
      .render({ source: source.bytes, plan, preview: { maxEdge: PREVIEW_MAX_EDGE } })
      .then((preview) => {
        if (!current) return undefined;
        setState({ status: 'ready', preview, outputFindings: [] });
        return render.render({ source: source.bytes, plan }).then((output) => {
          if (!current) return;
          setState({
            status: 'ready',
            preview,
            output,
            outputFindings: verifyOutput(plan, output),
          });
        });
      })
      .catch(fail);
    return () => {
      current = false;
    };
  }, [render, source, plan]);

  const previewBytes = state.status === 'ready' ? state.preview.bytes : null;
  const previewUrl = useObjectUrl(
    previewBytes,
    state.status === 'ready' ? state.preview.mimeType : '',
  );

  const findings =
    state.status === 'failed'
      ? [state.finding]
      : [...plan.findings, ...(state.status === 'ready' ? state.outputFindings : [])];
  const output = state.status === 'ready' ? state.output : undefined;
  const worst = worstOf(findings);
  const statusText =
    state.status === 'failed' ? 'Failed' : output ? STATUS_LABEL[worst] : 'Rendering…';

  const { crop, source: dims } = plan;
  const overlay = {
    left: `${(crop.x / dims.width) * 100}%`,
    top: `${(crop.y / dims.height) * 100}%`,
    width: `${(crop.width / dims.width) * 100}%`,
    height: `${(crop.height / dims.height) * 100}%`,
  };
  const titleId = `preview-${presetId}`;

  return (
    <article
      className={styles.card}
      aria-labelledby={titleId}
      data-status={output ? worst : state.status}
    >
      <header className={styles.header}>
        <h3 id={titleId}>{preset.name}</h3>
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
              <img src={previewUrl} alt={`${preset.name} result`} />
            ) : (
              <div
                className={styles.placeholder}
                style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
              />
            )}
          </div>
          <figcaption>
            {output
              ? `${output.mimeType === 'image/png' ? 'PNG' : 'JPEG'} · ${formatBytes(output.bytes.length)}`
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
          onClick={() =>
            output && saveBytes(output.bytes, output.mimeType, downloadName(source, presetId))
          }
        >
          Download
        </button>
        <code className={styles.fileName}>{downloadName(source, presetId)}</code>
      </footer>
    </article>
  );
}
