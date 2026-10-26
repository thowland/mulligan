// Session persistence (spec §9.5, §10.7): restores the image and listing stores from IndexedDB
// on load, then keeps IndexedDB in step with them. Source blobs are written once, when a file is
// added; the session record is written 500 ms after the last change, and at once when the page
// is hidden. Where IndexedDB is unavailable the app keeps working in memory and says so.
import { create } from 'zustand';
import { allGroups, inConfigOrder, inspectSource } from '../core-bridge/images.ts';
import {
  hasListingInput,
  knownFieldIds,
  pruneReverts,
  straightQuoteDefaults,
} from '../core-bridge/listing.ts';
import { versionInfo } from '../core-bridge/standards.ts';
import { SESSION } from '../config.ts';
import { useImageStore, type SourceEntry } from './images.ts';
import { useListingStore } from './listing.ts';
import { useOutcomeStore } from './outcomes.ts';
import {
  SCHEMA_VERSION,
  migrateSession,
  openSessionDb,
  type BlobRecord,
  type SavedField,
  type SessionDb,
  type SessionRecord,
} from './persistence.ts';

/** 'saved': work is kept on this device; 'memory': it is lost when the tab closes. */
export type SessionMode = 'loading' | 'saved' | 'memory';

export interface UnsavedFile {
  id: string;
  fileName: string;
}

export interface SessionUiState {
  mode: SessionMode;
  /** Messages about the restore: stale reverts, expired or unreadable sessions. */
  notices: string[];
  /** Files processed in this tab but not kept on the device (storage quota). */
  unsaved: UnsavedFile[];
  /** The one-time "work is kept in this browser" notice. */
  showSaveNotice: boolean;
  saveNoticeDismissed: boolean;
  dismissNotice: (index: number) => void;
  dismissSaveNotice: () => void;
}

const initialUi = () => ({
  mode: 'loading' as SessionMode,
  notices: [] as string[],
  unsaved: [] as UnsavedFile[],
  showSaveNotice: false,
  saveNoticeDismissed: false,
});

export const useSessionStore = create<SessionUiState>()((set) => ({
  ...initialUi(),
  dismissNotice: (index) => set((s) => ({ notices: s.notices.filter((_, i) => i !== index) })),
  dismissSaveNotice: () => set({ showSaveNotice: false, saveNoticeDismissed: true }),
}));

export interface StorageLike {
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export interface SessionOptions {
  open?: () => Promise<SessionDb>;
  storage?: StorageLike | undefined;
  now?: () => number;
  debounceMs?: number;
  retentionDays?: number;
  maxPersistedBytes?: number;
  openTimeoutMs?: number;
  /** Where to listen for `pagehide` and `visibilitychange` (flush before the page goes away). */
  page?:
    | (Pick<Window, 'addEventListener' | 'removeEventListener'> & {
        document?: Pick<Document, 'visibilityState'>;
      })
    | null;
  /** Extra work when the session is cleared, such as dropping cached renders. */
  onClear?: () => void;
}

export interface SessionController {
  /** Settles once the saved session has been restored (or the app has fallen back to memory). */
  ready: Promise<void>;
  /** Writes any pending change now. */
  flush: () => Promise<void>;
  /** Deletes the saved session and empties every store. */
  clear: () => Promise<void>;
  stop: () => void;
}

const DAY_MS = 86_400_000;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function isQuotaError(error: unknown): boolean {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : '';
  return name === 'QuotaExceededError';
}

function withTimeout<T>(promise: Promise<T>, ms: number, onLate: (value: T) => void): Promise<T> {
  let timedOut = false;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('IndexedDB did not open in time'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        if (timedOut) onLate(value);
        else resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

let active: SessionController | undefined;

/** Starts restoring and saving the session; the app calls this once at start-up. */
export function startSession(options: SessionOptions = {}): SessionController {
  const {
    open = openSessionDb,
    storage = globalThis.navigator?.storage,
    now = Date.now,
    debounceMs = SESSION.saveDebounceMs,
    retentionDays = SESSION.retentionDays,
    maxPersistedBytes = SESSION.maxPersistedBytes,
    openTimeoutMs = SESSION.openTimeoutMs,
    page = globalThis.window,
    onClear,
  } = options;
  const { rulesetVersion } = versionInfo();
  const ui = useSessionStore;

  let db: SessionDb | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suspended = true;
  let stopped = false;
  let persistRequested = false;
  let writes: Promise<void> = Promise.resolve();
  const written = new Map<string, number>();
  const unsaved = new Set<string>();
  const unsubscribers: (() => void)[] = [];

  const fallBackToMemory = (notice?: string) => {
    db?.close();
    db = null;
    clearTimeout(timer);
    ui.setState((s) => ({
      mode: 'memory',
      notices: notice ? [...s.notices, notice] : s.notices,
      showSaveNotice: false,
    }));
  };

  /** Runs storage work in order, so a session record never lands before the blobs it names. */
  const enqueue = (task: (database: SessionDb) => Promise<void>): Promise<void> => {
    writes = writes
      .then(() => (db ? task(db) : undefined))
      .catch((error: unknown) => {
        fallBackToMemory(
          `Saving stopped (${error instanceof Error ? error.message : String(error)}). ` +
            'Your work is still here, but it will be lost when this tab closes.',
        );
      });
    return writes;
  };

  const snapshot = (): SessionRecord => {
    const images = useImageStore.getState();
    const listing = useListingStore.getState();
    const groups: SessionRecord['groups'] = {};
    for (const [groupId, list] of Object.entries(images.sources)) {
      groups[groupId] = list
        .filter((s) => !unsaved.has(s.id))
        .map((s) => ({ id: s.id, fileName: s.fileName }));
    }
    const fields: Record<string, SavedField> = {};
    for (const id of new Set([...Object.keys(listing.inputs), ...Object.keys(listing.reverted)])) {
      fields[id] = {
        raw: listing.inputs[id] ?? { text: '' },
        reverted: listing.reverted[id] ?? [],
      };
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      rulesetVersion,
      updatedAt: now(),
      groups,
      selectedPresetIds: [...images.selectedPresetIds],
      fields,
      straightQuotes: { ...listing.straightQuotes },
      saveNoticeDismissed: ui.getState().saveNoticeDismissed,
    };
  };

  const hasContent = () =>
    Object.values(useImageStore.getState().sources).some((list) => list.length > 0) ||
    hasListingInput(useListingStore.getState().inputs);

  const flushSession = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (!db || suspended) return writes;
    const record = snapshot();
    return enqueue((database) => database.writeSession(record)).then(() => {
      const state = ui.getState();
      if (db && !state.saveNoticeDismissed && !state.showSaveNotice && hasContent()) {
        ui.setState({ showSaveNotice: true });
      }
    });
  };

  const scheduleSave = () => {
    if (!db || suspended) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flushSession(), debounceMs);
  };

  const markUnsaved = (entry: SourceEntry) => {
    unsaved.add(entry.id);
    ui.setState((s) => ({ unsaved: [...s.unsaved, { id: entry.id, fileName: entry.fileName }] }));
  };

  const saveBlob = async (database: SessionDb, entry: SourceEntry) => {
    if (!persistRequested) {
      persistRequested = true;
      // Ask the browser not to evict the session under storage pressure (spec §9.5).
      void storage?.persist?.().catch(() => false);
    }
    const size = entry.bytes.byteLength;
    const used = [...written.values()].reduce((a, b) => a + b, 0);
    let fits = used + size <= maxPersistedBytes;
    if (fits && storage?.estimate) {
      const estimate = await storage.estimate().catch(() => ({}) as { usage?: number });
      const { usage = 0, quota = Number.POSITIVE_INFINITY } = estimate as {
        usage?: number;
        quota?: number;
      };
      fits = usage + size <= quota;
    }
    if (!fits) {
      markUnsaved(entry);
      return;
    }
    const record: BlobRecord = {
      id: entry.id,
      groupId: entry.groupId,
      fileName: entry.fileName,
      sha256: entry.sha256,
      size,
      blob: new Blob([entry.bytes.slice()], { type: entry.info.type }),
    };
    try {
      await database.putBlob(record);
      written.set(entry.id, size);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      markUnsaved(entry);
    }
  };

  const syncBlobs = (sources: Record<string, readonly SourceEntry[]>) => {
    const entries = Object.values(sources).flat();
    const ids = new Set(entries.map((e) => e.id));
    for (const entry of entries) {
      if (written.has(entry.id) || unsaved.has(entry.id)) continue;
      // Reserve the id at once so a second store change does not write the blob twice.
      written.set(entry.id, 0);
      void enqueue((database) => {
        written.delete(entry.id);
        return saveBlob(database, entry);
      });
    }
    const removed = [...written.keys()].filter((id) => !ids.has(id));
    for (const id of removed) written.delete(id);
    if (removed.length > 0) void enqueue((database) => database.deleteBlobs(removed));
    const gone = [...unsaved].filter((id) => !ids.has(id));
    if (gone.length > 0) {
      for (const id of gone) unsaved.delete(id);
      ui.setState((s) => ({ unsaved: s.unsaved.filter((f) => ids.has(f.id)) }));
    }
  };

  const hydrate = async (record: SessionRecord, blobs: BlobRecord[]) => {
    const notices: string[] = [];
    const blobById = new Map(blobs.map((b) => [b.id, b]));
    const groupIds = new Set(allGroups().map((g) => g.id));
    const sources: Record<string, SourceEntry[]> = {};
    const referenced = new Set<string>();
    let missing = 0;

    for (const [groupId, saved] of Object.entries(record.groups)) {
      if (!groupIds.has(groupId)) continue;
      const list: SourceEntry[] = [];
      for (const { id, fileName } of saved) {
        const blob = blobById.get(id);
        if (!blob) {
          missing += 1;
          continue;
        }
        referenced.add(id);
        const bytes = new Uint8Array(await blob.blob.arrayBuffer());
        // Re-inspected through core, so a rules update applies to restored files as well.
        const outcome = inspectSource(id, fileName, groupId, bytes);
        if (!outcome.ok) {
          missing += 1;
          continue;
        }
        list.push({ ...outcome.source, sha256: blob.sha256 });
        written.set(id, blob.size);
      }
      if (list.length > 0) sources[groupId] = list;
    }
    const orphans = blobs.filter((b) => !referenced.has(b.id) || !written.has(b.id));
    if (orphans.length > 0)
      void enqueue((database) => database.deleteBlobs(orphans.map((b) => b.id)));
    if (missing > 0) {
      notices.push(`${plural(missing, 'saved image', 'saved images')} could not be restored.`);
    }

    const known = knownFieldIds();
    const inputs: Record<string, SavedField['raw']> = {};
    const reverted: Record<string, SavedField['reverted']> = {};
    for (const [id, field] of Object.entries(record.fields)) {
      if (!known.has(id)) continue;
      inputs[id] = field.raw;
      if (field.reverted.length > 0) reverted[id] = field.reverted;
    }
    const straightQuotes = straightQuoteDefaults();
    for (const [id, value] of Object.entries(record.straightQuotes)) {
      if (known.has(id) && typeof value === 'boolean') straightQuotes[id] = value;
    }
    const pruned = pruneReverts({ inputs, straightQuotes, reverted });
    if (pruned.dropped > 0) {
      const after = record.rulesetVersion === rulesetVersion ? '' : ' after the rules update';
      notices.push(
        `${plural(pruned.dropped, 'reverted change no longer applies', 'reverted changes no longer apply')}${after}; review that copy again.`,
      );
    }

    useImageStore.setState({
      sources,
      selectedPresetIds: inConfigOrder(record.selectedPresetIds),
    });
    useListingStore.setState({ inputs, straightQuotes, reverted: pruned.reverted });
    ui.setState((s) => ({
      notices: [...s.notices, ...notices],
      saveNoticeDismissed: record.saveNoticeDismissed,
    }));
    return pruned.dropped > 0 || missing > 0;
  };

  const subscribe = () => {
    unsubscribers.push(
      useImageStore.subscribe((state, prev) => {
        if (suspended) return;
        if (state.sources !== prev.sources) syncBlobs(state.sources);
        if (state.sources !== prev.sources || state.selectedPresetIds !== prev.selectedPresetIds) {
          scheduleSave();
        }
      }),
      useListingStore.subscribe((state, prev) => {
        if (suspended) return;
        if (
          state.inputs !== prev.inputs ||
          state.straightQuotes !== prev.straightQuotes ||
          state.reverted !== prev.reverted
        ) {
          scheduleSave();
        }
      }),
      ui.subscribe((state, prev) => {
        if (!suspended && state.saveNoticeDismissed !== prev.saveNoticeDismissed) scheduleSave();
      }),
    );
    const onHide = () => void flushSession();
    const onVisibility = () => {
      if (page?.document?.visibilityState === 'hidden') void flushSession();
    };
    if (page) {
      page.addEventListener('pagehide', onHide);
      page.addEventListener('visibilitychange', onVisibility);
      unsubscribers.push(() => {
        page.removeEventListener('pagehide', onHide);
        page.removeEventListener('visibilitychange', onVisibility);
      });
    }
  };

  const load = async () => {
    const pristine = {
      sources: useImageStore.getState().sources,
      inputs: useListingStore.getState().inputs,
    };
    try {
      db = await withTimeout(open(), openTimeoutMs, (late) => late.close());
    } catch {
      fallBackToMemory();
      return;
    }
    if (stopped) {
      db.close();
      return;
    }
    let changed = false;
    try {
      const { record, blobs } = await db.load();
      const touched =
        useImageStore.getState().sources !== pristine.sources ||
        useListingStore.getState().inputs !== pristine.inputs;
      if (record === undefined) {
        if (blobs.length > 0) await db.deleteBlobs(blobs.map((b) => b.id));
      } else if (touched) {
        // The user started working before the restore finished: keep their work, not the old one.
        await db.clear();
      } else {
        const session = migrateSession(record);
        if (!session) {
          await db.clear();
          ui.setState((s) => ({
            notices: [
              ...s.notices,
              'A saved session from a different version of Mulligan could not be restored and was removed.',
            ],
          }));
        } else if (now() - session.updatedAt > retentionDays * DAY_MS) {
          await db.clear();
          ui.setState((s) => ({
            notices: [
              ...s.notices,
              `A saved session untouched for more than ${retentionDays} days was removed.`,
            ],
          }));
        } else {
          changed = await hydrate(session, blobs);
        }
      }
    } catch {
      fallBackToMemory();
      return;
    }
    ui.setState({ mode: 'saved' });
    suspended = false;
    subscribe();
    syncBlobs(useImageStore.getState().sources);
    if (changed || hasContent()) scheduleSave();
  };

  const controller: SessionController = {
    ready: load(),
    flush: () => flushSession(),
    async clear() {
      suspended = true;
      clearTimeout(timer);
      await writes;
      if (db) {
        try {
          await db.clear();
        } catch {
          fallBackToMemory();
        }
      }
      written.clear();
      unsaved.clear();
      useImageStore.getState().reset();
      useListingStore.getState().reset();
      useOutcomeStore.getState().reset();
      onClear?.();
      ui.setState({ notices: [], unsaved: [], showSaveNotice: false, saveNoticeDismissed: false });
      suspended = db === null;
    },
    stop() {
      stopped = true;
      suspended = true;
      clearTimeout(timer);
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
      db?.close();
      db = null;
      if (active === controller) active = undefined;
    },
  };
  active = controller;
  return controller;
}

/** Clears the running session, or just empties the stores when none is running. */
export async function clearSession(): Promise<void> {
  if (active) return active.clear();
  useImageStore.getState().reset();
  useListingStore.getState().reset();
  useOutcomeStore.getState().reset();
}

/** Resets the UI state (tests). */
export function resetSessionUi(): void {
  useSessionStore.setState(initialUi());
}
