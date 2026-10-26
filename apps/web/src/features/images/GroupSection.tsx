import type { GroupDef } from '@mulligan/core';
import { inConfigOrder, presetsInGroup } from '../../core-bridge/images.ts';
import { useImageStore, type SourceEntry } from '../../state/images.ts';
import { useObjectUrl } from '../../ui/files.ts';
import { useShallow } from 'zustand/react/shallow';
import { formatAnchor } from '../format.ts';
import { DropZone } from './DropZone.tsx';
import styles from './ImagesPanel.module.css';
import { intakeFiles } from './intake.ts';
import { PresetPicker } from './PresetPicker.tsx';
import { PreviewCard } from './PreviewCard.tsx';
import { SourceList } from './SourceList.tsx';

const EMPTY: SourceEntry[] = [];

/** One asset group: its own drop zone, files, presets and previews (spec §9.3). */
export function GroupSection({ group }: { group: GroupDef }) {
  const sources = useImageStore((s) => s.sources[group.id] ?? EMPTY);
  const selectedAll = useImageStore((s) => s.selectedPresetIds);
  const notices = useImageStore(useShallow((s) => s.notices.filter((n) => n.groupId === group.id)));
  const pending = useImageStore((s) => (s.pending?.groupId === group.id ? s.pending : null));
  const session = useImageStore.getState;

  const groupPresetIds = presetsInGroup(group.id).map((p) => p.id);
  const selected = selectedAll.filter((id) => groupPresetIds.includes(id));
  const multiple = group.maxFiles > 1;
  const headingId = `group-${group.id}-heading`;

  const addFiles = async (files: File[]) => {
    const { accepted, rejected } = await intakeFiles(group.id, files);
    session().addNotices(rejected);
    session().addSources(group.id, accepted);
  };

  const setGroupSelection = (ids: string[]) => {
    const others = selectedAll.filter((id) => !groupPresetIds.includes(id));
    session().setSelectedPresets(inConfigOrder([...others, ...ids]));
  };

  const label = multiple
    ? `Add ${group.label.toLowerCase()}`
    : sources.length > 0
      ? `Replace ${group.label.toLowerCase()}`
      : `Choose ${group.label.toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 id={headingId}>{group.label}</h2>
        <span className={styles.meta}>
          {formatAnchor(group.anchor)} · up to {group.maxFiles}{' '}
          {group.maxFiles === 1 ? 'file' : 'files'}
        </span>
      </header>

      <DropZone
        label={label}
        hint="or drop PNG or JPEG files here. Files stay on this device."
        multiple={multiple}
        inputTestId={`file-input-${group.id}`}
        onFiles={(files) => void addFiles(files)}
      />

      {pending && (
        <div className={styles.confirm} role="alertdialog" aria-labelledby={`${headingId}-confirm`}>
          <p id={`${headingId}-confirm`}>
            Replace <strong>{sources[0]?.fileName}</strong> with{' '}
            <strong>{pending.incoming.fileName}</strong>?
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => session().confirmReplacement()}
            >
              Replace
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => session().cancelReplacement()}
            >
              Keep current
            </button>
          </div>
        </div>
      )}

      {notices.length > 0 && (
        <ul className={styles.notices} role="alert">
          {notices.map((notice) => (
            <li key={notice.id} className={styles.notice}>
              <span>
                <strong>{notice.fileName}</strong> was not added. {notice.messages.join(' ')}
              </span>
              <button
                type="button"
                className={styles.secondary}
                aria-label={`Dismiss message about ${notice.fileName}`}
                onClick={() => session().dismissNotice(notice.id)}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}

      <SourceList
        sources={sources}
        sortable={multiple}
        onMove={(from, to) => session().moveSource(group.id, from, to)}
        onRemove={(id) => session().removeSource(group.id, id)}
      />

      <PresetPicker groupId={group.id} selected={selected} onChange={setGroupSelection} />

      {sources.length > 0 && selected.length === 0 && (
        <p className={styles.meta}>Select at least one output size to see previews.</p>
      )}
      {sources.length > 0 && selected.length > 0 && (
        <div className={styles.previews}>
          {sources.map((source, index) => (
            <SourcePreviews
              key={source.id}
              source={source}
              sequence={index + 1}
              groupSize={sources.length}
              presetIds={selected}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SourcePreviews({
  source,
  sequence,
  groupSize,
  presetIds,
}: {
  source: SourceEntry;
  sequence: number;
  groupSize: number;
  presetIds: string[];
}) {
  const url = useObjectUrl(source.bytes, source.info.type);
  if (!url) return null;
  return (
    <>
      {presetIds.map((presetId) => (
        <PreviewCard
          key={presetId}
          source={source}
          sourceUrl={url}
          presetId={presetId}
          sequence={sequence}
          groupSize={groupSize}
        />
      ))}
    </>
  );
}
