import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, HTMLAttributes } from 'react';
import { sequenceLabelFor } from '../../core-bridge/images.ts';
import type { SourceEntry } from '../../state/session.ts';
import { useObjectUrl } from '../../ui/files.ts';
import { formatDimensions } from '../format.ts';
import styles from './SourceList.module.css';

interface SourceListProps {
  sources: readonly SourceEntry[];
  sortable: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}

/**
 * The group's files in package order. Sequence numbers follow this order (spec §8.1). Screenshots
 * reorder by drag (pointer or keyboard: Space, arrows, Space) or with the Move buttons.
 */
export function SourceList({ sources, sortable, onMove, onRemove }: SourceListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = sources.map((s) => s.id);
  const nameOf = (id: unknown) => sources.find((s) => s.id === id)?.fileName ?? 'file';
  const positionOf = (id: unknown) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} is over position ${positionOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)} moved to position ${positionOf(over.id)}.` : undefined,
    onDragCancel: ({ active }) => `Reordering cancelled; ${nameOf(active.id)} stays in place.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  if (sources.length === 0) return null;

  const items = sources.map((source, index) => (
    <SourceItem
      key={source.id}
      source={source}
      index={index}
      count={sources.length}
      sortable={sortable}
      onMove={onMove}
      onRemove={onRemove}
    />
  ));

  if (!sortable) return <ol className={styles.list}>{items}</ol>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To reorder, press Space to pick up, use the arrow keys to move, then Space to drop. Press Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={styles.list}>{items}</ol>
      </SortableContext>
    </DndContext>
  );
}

interface SourceItemProps {
  source: SourceEntry;
  index: number;
  count: number;
  sortable: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}

function SourceItem(props: SourceItemProps) {
  return props.sortable ? <SortableSourceItem {...props} /> : <SourceRow {...props} />;
}

function SortableSourceItem(props: SourceItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.source.id,
  });
  return (
    <SourceRow
      {...props}
      rowRef={setNodeRef}
      rowStyle={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

interface SourceRowProps extends SourceItemProps {
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: CSSProperties;
  dragging?: boolean;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
}

function SourceRow({
  source,
  index,
  count,
  sortable,
  onMove,
  onRemove,
  rowRef,
  rowStyle,
  dragging = false,
  handleProps,
}: SourceRowProps) {
  const url = useObjectUrl(source.bytes, source.info.type);
  const label = sequenceLabelFor(index + 1, count);
  return (
    <li ref={rowRef} style={rowStyle} className={styles.item} data-dragging={dragging}>
      {sortable && (
        <button
          type="button"
          className={styles.handle}
          aria-label={`Reorder ${source.fileName}`}
          {...handleProps}
        >
          ⠿
        </button>
      )}
      <span className={styles.sequence} aria-label={`Position ${label}`}>
        {label}
      </span>
      {url && <img className={styles.thumb} src={url} alt="" />}
      <span className={styles.name}>
        <strong>{source.fileName}</strong>
        <span className={styles.meta}>
          {formatDimensions(source.info.orientedWidth, source.info.orientedHeight)} ·{' '}
          {source.info.type === 'image/png' ? 'PNG' : 'JPEG'}
        </span>
      </span>
      <span className={styles.actions}>
        {sortable && (
          <>
            <button
              type="button"
              className={styles.action}
              disabled={index === 0}
              aria-label={`Move ${source.fileName} up`}
              onClick={() => onMove(index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.action}
              disabled={index === count - 1}
              aria-label={`Move ${source.fileName} down`}
              onClick={() => onMove(index, index + 1)}
            >
              ↓
            </button>
          </>
        )}
        <button
          type="button"
          className={styles.action}
          aria-label={`Remove ${source.fileName}`}
          onClick={() => onRemove(source.id)}
        >
          Remove
        </button>
      </span>
    </li>
  );
}
