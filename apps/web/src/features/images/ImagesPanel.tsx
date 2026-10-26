import type { Finding } from '@mulligan/core';
import { useState } from 'react';
import {
  defaultSelection,
  groupById,
  inspectSource,
  type SourceImage,
} from '../../core-bridge/images.ts';
import { FindingList } from '../../ui/FindingList.tsx';
import { readFileBytes, useObjectUrl } from '../../ui/files.ts';
import { formatAnchor, formatDimensions } from '../format.ts';
import { DropZone } from './DropZone.tsx';
import styles from './ImagesPanel.module.css';
import { PresetCatalog } from './PresetCatalog.tsx';
import { PresetPicker } from './PresetPicker.tsx';
import { PreviewCard } from './PreviewCard.tsx';

const SCREENSHOT = 'screenshot';

const newId = () => crypto.randomUUID();

/** The Images tab: one screenshot in, previews and downloads for each selected preset out. */
export function ImagesPanel() {
  const group = groupById(SCREENSHOT);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [rejected, setRejected] = useState<{ fileName: string; findings: Finding[] } | null>(null);
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(SCREENSHOT));
  const sourceUrl = useObjectUrl(source?.bytes ?? null, source?.info.type ?? '');

  const addFiles = async (files: File[]) => {
    const file = files[0]!;
    const outcome = inspectSource(newId(), file.name, SCREENSHOT, await readFileBytes(file));
    if (outcome.ok) {
      setSource(outcome.source);
      setRejected(null);
    } else {
      setRejected({ fileName: file.name, findings: outcome.findings });
    }
  };

  return (
    <div className={styles.panel}>
      <section aria-labelledby="screenshots-heading" className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 id="screenshots-heading">{group.label}</h2>
          <span className={styles.meta}>{formatAnchor(group.anchor)}</span>
        </header>

        <DropZone
          label={source ? 'Replace screenshot' : 'Choose a screenshot'}
          hint="or drop a PNG or JPEG here. Files stay on this device."
          onFiles={(files) => void addFiles(files)}
        />

        {rejected && (
          <div className={styles.rejected} role="alert">
            <p>
              <strong>{rejected.fileName}</strong> could not be used.
            </p>
            <FindingList findings={rejected.findings} />
          </div>
        )}

        {source && (
          <div className={styles.sourceRow}>
            <p className={styles.sourceInfo}>
              <strong>{source.fileName}</strong>{' '}
              <span>
                {formatDimensions(source.info.orientedWidth, source.info.orientedHeight)} ·{' '}
                {source.info.type === 'image/png' ? 'PNG' : 'JPEG'}
              </span>
            </p>
            <button type="button" className={styles.remove} onClick={() => setSource(null)}>
              Remove
            </button>
          </div>
        )}

        <PresetPicker groupId={SCREENSHOT} selected={selected} onChange={setSelected} />

        {source && sourceUrl && selected.length > 0 && (
          <div className={styles.previews}>
            {selected.map((presetId) => (
              <PreviewCard
                key={`${source.id}-${presetId}`}
                source={source}
                sourceUrl={sourceUrl}
                presetId={presetId}
              />
            ))}
          </div>
        )}
        {source && selected.length === 0 && (
          <p className={styles.meta}>Select at least one output size to see previews.</p>
        )}
      </section>

      <section aria-labelledby="other-outputs-heading" className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 id="other-outputs-heading">Other outputs</h2>
          <span className={styles.meta}>Uploads for these arrive in the next iteration.</span>
        </header>
        <PresetCatalog excludeGroups={[SCREENSHOT]} />
      </section>
    </div>
  );
}
