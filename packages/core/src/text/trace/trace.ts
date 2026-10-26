import type { Change, ChangeId, Span } from '../types.ts';

/** An edit proposed by a stage, in current-text coordinates. */
export interface Edit {
  start: number;
  end: number;
  replacement: string;
  ruleId: string;
  detail?: string;
}

interface Tracked {
  change: Change;
  /** Current output range; remapped after every batch of edits. */
  range: Span;
}

/**
 * Text plus a per-character map back to baseline offsets (spec §6.3).
 *
 * Each character of the current text carries the baseline span it came from: [i, i+1) for an
 * untouched character, the edit's whole baseline span for characters an edit produced. Spans
 * are non-decreasing along the text, so an edit over [start, end) maps to
 * [origin(start).start, origin(end-1).end), and an insertion maps to a zero-width point.
 * Change ids are expressed in baseline coordinates, so reverting one change never moves another.
 */
export class Trace {
  text: string;
  private originStart: number[];
  private originEnd: number[];
  private readonly tracked: Tracked[] = [];
  private readonly usedIds = new Set<ChangeId>();

  readonly baseline: string;
  private readonly suppress: ReadonlySet<ChangeId>;
  private readonly revertible: Readonly<Record<string, boolean>>;

  constructor(
    baseline: string,
    suppress: ReadonlySet<ChangeId>,
    revertible: Readonly<Record<string, boolean>>,
  ) {
    this.baseline = baseline;
    this.suppress = suppress;
    this.revertible = revertible;
    this.text = baseline;
    this.originStart = Array.from({ length: baseline.length }, (_, i) => i);
    this.originEnd = Array.from({ length: baseline.length }, (_, i) => i + 1);
  }

  /** Map a range of the current text to its baseline span. */
  baselineSpanOf(start: number, end: number): Span {
    if (start < end) return { start: this.originStart[start]!, end: this.originEnd[end - 1]! };
    const point =
      start < this.text.length
        ? this.originStart[start]!
        : start > 0
          ? this.originEnd[start - 1]!
          : this.baseline.length;
    return { start: point, end: point };
  }

  /**
   * Apply one stage's edits. Edits must be sorted, non-overlapping and in current-text
   * coordinates. Suppressed revertible edits are recorded as reverted and not applied.
   */
  apply(edits: readonly Edit[]): void {
    const applied: Edit[] = [];
    const fresh = new Map<Tracked, number>();
    let previousEnd = 0;
    for (const edit of edits) {
      if (edit.start < previousEnd || edit.end < edit.start || edit.end > this.text.length) {
        throw new Error(`Trace: invalid or overlapping edit for ${edit.ruleId}`);
      }
      previousEnd = edit.end;
      const before = this.text.slice(edit.start, edit.end);
      if (before === edit.replacement) continue;

      const baselineSpan = this.baselineSpanOf(edit.start, edit.end);
      const id = this.uniqueId(`${edit.ruleId}@${baselineSpan.start}:${baselineSpan.end}`);
      const revertible = this.revertible[edit.ruleId] === true;
      const reverted = revertible && this.suppress.has(id);
      const change: Change = {
        id,
        ruleId: edit.ruleId,
        baselineSpan,
        outputSpan: { start: edit.start, end: edit.end },
        before,
        after: edit.replacement,
        revertible,
        reverted,
        ...(edit.detail === undefined ? {} : { detail: edit.detail }),
      };
      const entry: Tracked = { change, range: { start: edit.start, end: edit.end } };
      this.tracked.push(entry);
      if (!reverted) {
        applied.push(edit);
        fresh.set(entry, edit.replacement.length);
      }
    }
    if (applied.length === 0) return;

    this.splice(applied);
    // Remap every tracked range into post-batch coordinates. Changes applied in this batch are
    // re-anchored at the start of their replacement and widened to cover it.
    const mapper = positionMapper(applied);
    for (const entry of this.tracked) {
      const width = fresh.get(entry);
      const start = mapper(entry.range.start, 'start');
      if (width === undefined) {
        entry.range = { start, end: Math.max(start, mapper(entry.range.end, 'end')) };
      } else {
        entry.range = { start, end: start + width };
      }
    }
  }

  /** All recorded changes, with output spans resolved against the current text. */
  changes(): Change[] {
    return this.tracked.map(({ change, range }) => ({ ...change, outputSpan: { ...range } }));
  }

  /** Map a baseline span to the current text (used for extraction changes). */
  outputSpanOfBaseline(span: Span): Span {
    let start = -1;
    let end = -1;
    for (let i = 0; i < this.text.length; i++) {
      const overlaps = this.originStart[i]! < span.end && this.originEnd[i]! > span.start;
      if (overlaps) {
        if (start < 0) start = i;
        end = i + 1;
      } else if (this.originStart[i]! >= span.end) {
        break;
      }
    }
    if (start >= 0) return { start, end };
    // Nothing survives: point at the first character that starts at or after the span.
    let point = this.text.length;
    for (let i = 0; i < this.text.length; i++) {
      if (this.originStart[i]! >= span.end) {
        point = i;
        break;
      }
    }
    return { start: point, end: point };
  }

  private uniqueId(base: ChangeId): ChangeId {
    let id = base;
    for (let n = 2; this.usedIds.has(id); n++) id = `${base}~${n}`;
    this.usedIds.add(id);
    return id;
  }

  private splice(edits: readonly Edit[]): void {
    let text = '';
    const starts: number[] = [];
    const ends: number[] = [];
    let cursor = 0;
    for (const edit of edits) {
      text += this.text.slice(cursor, edit.start);
      for (let i = cursor; i < edit.start; i++) {
        starts.push(this.originStart[i]!);
        ends.push(this.originEnd[i]!);
      }
      const span = this.baselineSpanOf(edit.start, edit.end);
      text += edit.replacement;
      for (let i = 0; i < edit.replacement.length; i++) {
        starts.push(span.start);
        ends.push(span.end);
      }
      cursor = edit.end;
    }
    text += this.text.slice(cursor);
    for (let i = cursor; i < this.text.length; i++) {
      starts.push(this.originStart[i]!);
      ends.push(this.originEnd[i]!);
    }
    this.text = text;
    this.originStart = starts;
    this.originEnd = ends;
  }
}

/**
 * Maps a position in the pre-edit text to the post-edit text. A position inside an edited range
 * moves to the start or end of the replacement, depending on `bias`.
 */
function positionMapper(
  edits: readonly Edit[],
): (position: number, bias: 'start' | 'end') => number {
  const newStarts: number[] = [];
  let delta = 0;
  for (const edit of edits) {
    newStarts.push(edit.start + delta);
    delta += edit.replacement.length - (edit.end - edit.start);
  }
  return (position, bias) => {
    // Last edit that starts before `position`; an edit starting exactly at a position lies
    // outside a range that starts or ends there.
    let lo = 0;
    let hi = edits.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (edits[mid]!.start < position) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found < 0) return position;
    const edit = edits[found]!;
    const newStart = newStarts[found]!;
    if (position >= edit.end) return newStart + edit.replacement.length + (position - edit.end);
    return bias === 'start' ? newStart : newStart + edit.replacement.length;
  };
}
