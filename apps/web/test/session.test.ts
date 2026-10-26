// @vitest-environment node
// Node environment: fake-indexeddb clones Blobs with Node's structuredClone.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectSource } from '../src/core-bridge/images.ts';
import { cleanListing } from '../src/core-bridge/listing.ts';
import { versionInfo } from '../src/core-bridge/standards.ts';
import { useImageStore, type SourceEntry } from '../src/state/images.ts';
import { useListingStore } from '../src/state/listing.ts';
import { useOutcomeStore } from '../src/state/outcomes.ts';
import {
  SCHEMA_VERSION,
  StorageAbsentError,
  openSessionDb,
  type SessionDb,
  type SessionRecord,
} from '../src/state/persistence.ts';
import {
  CLEAR_FAILED_MESSAGE,
  ClearSessionError,
  clearSession,
  resetSessionUi,
  startSession,
  useSessionStore,
  type SessionController,
  type SessionOptions,
} from '../src/state/session.ts';
import { pngFile } from './helpers/png.ts';

let counter = 0;
function source(fileName: string, groupId = 'screenshot'): SourceEntry {
  counter += 1;
  const outcome = inspectSource(`src-${counter}`, fileName, groupId, pngFile(1320, 2868));
  if (!outcome.ok) throw new Error('bad test source');
  return { ...outcome.source, sha256: counter.toString(16).padStart(64, '0') };
}

const images = () => useImageStore.getState();
const listing = () => useListingStore.getState();
const ui = () => useSessionStore.getState();
const names = (groupId = 'screenshot') => (images().sources[groupId] ?? []).map((s) => s.fileName);

const controllers: SessionController[] = [];
function start(options: SessionOptions = {}): SessionController {
  const controller = startSession({
    debounceMs: 5,
    page: null,
    storage: undefined,
    ...options,
  });
  controllers.push(controller);
  return controller;
}

function resetStores() {
  images().reset();
  listing().reset();
  useOutcomeStore.getState().reset();
  resetSessionUi();
}

/** Simulates closing the tab and opening the app again. */
async function reopen(controller: SessionController, options: SessionOptions = {}) {
  await controller.flush();
  controller.stop();
  resetStores();
  const next = start(options);
  await next.ready;
  return next;
}

async function withDb<T>(task: (db: SessionDb) => Promise<T>): Promise<T> {
  const db = await openSessionDb();
  try {
    return await task(db);
  } finally {
    db.close();
  }
}

const savedRecord = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: versionInfo().rulesetVersion,
  updatedAt: Date.now(),
  groups: {},
  selectedPresetIds: ['iphone-6.9'],
  fields: {},
  straightQuotes: {},
  saveNoticeDismissed: false,
  ...overrides,
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetStores();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
});

describe('session persistence', () => {
  it('starts with an empty database and saves nothing until there is work', async () => {
    const session = start();
    expect(ui().mode).toBe('loading');
    await session.ready;
    expect(ui().mode).toBe('saved');
    await session.flush();
    expect(ui().showSaveNotice).toBe(false);
  });

  it('restores image order, selections, listing input, options and reverts', async () => {
    const session = start();
    await session.ready;
    images().addSources('screenshot', [source('a.png'), source('b.png'), source('c.png')]);
    images().addSources('icon', [source('icon.png', 'icon')]);
    images().moveSource('screenshot', 2, 0);
    images().setSelectedPresets(['ipad-13', 'apple-icon']);
    listing().setInput('apple.description', { text: 'Track symptoms\nand share reports' });
    listing().setStraightQuotes('apple.name', true);
    const rejoin = cleanListing({
      inputs: listing().inputs,
      straightQuotes: listing().straightQuotes,
    })['apple.description']!.changes.find((c) => c.ruleId === 'lines.rejoin')!;
    listing().toggleRevert('apple.description', rejoin.id);

    await reopen(session);

    expect(names()).toEqual(['c.png', 'a.png', 'b.png']);
    expect(names('icon')).toEqual(['icon.png']);
    expect(images().sources['screenshot']![0]!.info.width).toBe(1320);
    expect(images().selectedPresetIds).toEqual(['ipad-13', 'apple-icon']);
    expect(listing().inputs['apple.description']).toEqual({
      text: 'Track symptoms\nand share reports',
    });
    expect(listing().straightQuotes['apple.name']).toBe(true);
    expect(listing().reverted['apple.description']).toEqual([rejoin.id]);
    expect(ui().notices).toEqual([]);
  });

  it('writes the session record after the debounce, and at once when the page is hidden', async () => {
    const page = new EventTarget() as EventTarget & { document: { visibilityState: string } };
    page.document = { visibilityState: 'visible' };
    const session = start({ debounceMs: 60_000, page: page as never });
    await session.ready;
    listing().setInput('apple.name', { text: 'Example' });
    const stored = () =>
      withDb(async (db) => (await db.load()).record as SessionRecord | undefined);
    expect((await stored())?.fields['apple.name']).toBeUndefined();

    page.dispatchEvent(new Event('visibilitychange'));
    expect((await stored())?.fields['apple.name']).toBeUndefined();
    page.document.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(async () =>
      expect((await stored())?.fields['apple.name']?.raw.text).toBe('Example'),
    );

    listing().setInput('apple.name', { text: 'Example 2' });
    page.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () =>
      expect((await stored())?.fields['apple.name']?.raw.text).toBe('Example 2'),
    );
  });

  it('debounces session writes', async () => {
    const session = start({ debounceMs: 20 });
    await session.ready;
    const writes = vi.spyOn(IDBObjectStore.prototype, 'put');
    for (const text of ['E', 'Ex', 'Exa', 'Example']) listing().setInput('apple.name', { text });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const sessionWrites = writes.mock.calls.filter(([, key]) => key === 'current');
    expect(sessionWrites).toHaveLength(1);
    writes.mockRestore();
  });

  it('writes each blob once and deletes it when its source is removed', async () => {
    const session = start();
    await session.ready;
    const a = source('a.png');
    images().addSources('screenshot', [a, source('b.png')]);
    images().setSelectedPresets(['iphone-6.9']);
    images().moveSource('screenshot', 0, 1);
    await session.flush();
    let blobs = await withDb(async (db) => (await db.load()).blobs);
    expect(blobs.map((b) => b.fileName).sort()).toEqual(['a.png', 'b.png']);
    expect(blobs.find((b) => b.id === a.id)).toMatchObject({ size: a.bytes.byteLength });

    images().removeSource('screenshot', a.id);
    await session.flush();
    blobs = await withDb(async (db) => (await db.load()).blobs);
    expect(blobs.map((b) => b.fileName)).toEqual(['b.png']);
  });

  it('asks the browser to keep the data once, on the first drop', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const session = start({ storage: { persist } });
    await session.ready;
    images().addSources('screenshot', [source('a.png')]);
    images().addSources('screenshot', [source('b.png')]);
    await session.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('keeps files over the size budget in memory only and says so', async () => {
    const session = start({ maxPersistedBytes: pngFile(1, 1).byteLength * 1.5 });
    await session.ready;
    images().addSources('screenshot', [source('kept.png'), source('big.png')]);
    await session.flush();
    expect(ui().unsaved.map((f) => f.fileName)).toEqual(['big.png']);
    expect(names()).toEqual(['kept.png', 'big.png']);

    await reopen(session);
    expect(names()).toEqual(['kept.png']);
    expect(ui().unsaved).toEqual([]);
  });

  it('treats the browser quota and quota errors as "processed but not saved"', async () => {
    const estimate = vi.fn(() => Promise.resolve({ usage: 100, quota: 120 }));
    const session = start({ storage: { estimate } });
    await session.ready;
    images().addSources('screenshot', [source('a.png')]);
    await session.flush();
    expect(ui().unsaved.map((f) => f.fileName)).toEqual(['a.png']);

    // Removing an unsaved file clears its notice.
    images().removeSource('screenshot', images().sources['screenshot']![0]!.id);
    await session.flush();
    expect(ui().unsaved).toEqual([]);

    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    estimate.mockResolvedValue({ usage: 0, quota: 1e9 });
    images().addSources('screenshot', [source('b.png')]);
    await session.flush();
    expect(ui().unsaved.map((f) => f.fileName)).toEqual(['b.png']);
    expect(ui().mode).toBe('saved');
    put.mockRestore();
  });

  it('falls back to memory when a write fails for another reason', async () => {
    const session = start();
    await session.ready;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('broken', 'UnknownError');
    });
    images().addSources('screenshot', [source('a.png')]);
    await session.flush();
    expect(ui().mode).toBe('memory');
    expect(ui().notices[0]).toMatch(/^Saving stopped \(broken\)\./);
    put.mockRestore();
    // Work continues in memory.
    listing().setInput('apple.name', { text: 'Still here' });
    await session.flush();
    expect(listing().inputs['apple.name']?.text).toBe('Still here');
  });

  it('shows the save notice after the first save with content, and remembers its dismissal', async () => {
    const session = start();
    await session.ready;
    listing().setInput('apple.name', { text: 'Example' });
    await session.flush();
    expect(ui().showSaveNotice).toBe(true);
    ui().dismissSaveNotice();
    expect(ui().showSaveNotice).toBe(false);

    await reopen(session);
    expect(ui().saveNoticeDismissed).toBe(true);
    listing().setInput('apple.name', { text: 'Example 2' });
    await controllers.at(-1)!.flush();
    expect(ui().showSaveNotice).toBe(false);
  });

  it('drops reverts that no longer apply, with a notice naming the rules update', async () => {
    await withDb((db) =>
      db.writeSession(
        savedRecord({
          rulesetVersion: '0.9.0',
          fields: {
            'apple.description': {
              raw: { text: 'Track symptoms\nand share reports' },
              reverted: ['lines.rejoin@999:1000'],
            },
            'no.such-field': { raw: { text: 'gone' }, reverted: [] },
          },
          straightQuotes: { 'apple.name': true, 'no.such-field': true },
        }),
      ),
    );
    const session = start();
    await session.ready;
    expect(listing().inputs['apple.description']?.text).toBe('Track symptoms\nand share reports');
    expect(listing().inputs['no.such-field']).toBeUndefined();
    expect(listing().reverted).toEqual({});
    expect(listing().straightQuotes['apple.name']).toBe(true);
    expect(ui().notices).toEqual([
      '1 reverted change no longer applies after the rules update; review that copy again.',
    ]);
    ui().dismissNotice(0);
    expect(ui().notices).toEqual([]);
  });

  it('reports stale reverts without blaming a rules update when the ruleset is unchanged', async () => {
    await withDb((db) =>
      db.writeSession(
        savedRecord({
          fields: {
            'apple.description': { raw: { text: 'One' }, reverted: ['a@1:2', 'b@3:4'] },
          },
        }),
      ),
    );
    await start().ready;
    expect(ui().notices).toEqual(['2 reverted changes no longer apply; review that copy again.']);
  });

  it('removes sessions past the retention period', async () => {
    await withDb((db) => db.writeSession(savedRecord({ updatedAt: Date.now() - 31 * 86_400_000 })));
    await start({ retentionDays: 30 }).ready;
    expect(ui().notices).toEqual(['A saved session untouched for more than 30 days was removed.']);
    expect(await withDb(async (db) => (await db.load()).record)).toBeUndefined();
  });

  it('says so when an expired session cannot be removed, and does not restore it', async () => {
    await withDb((db) =>
      db.writeSession(
        savedRecord({
          updatedAt: Date.now() - 31 * 86_400_000,
          fields: { 'apple.name': { raw: { text: 'Old' }, reverted: [] } },
        }),
      ),
    );
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new DOMException('no', 'UnknownError');
    });
    await start({ deleteDatabase: () => Promise.reject(new Error('blocked')) }).ready;
    clear.mockRestore();
    expect(listing().inputs).toEqual({});
    expect(ui().notices).toEqual([]);
    expect(ui()).toMatchObject({ mode: 'memory', clearError: CLEAR_FAILED_MESSAGE });
    expect(await withDb(async (db) => (await db.load()).record)).toBeDefined();
  });

  it('fails closed on every load-time reset: unreadable records, early work and stray blobs', async () => {
    const failRemoval = { deleteDatabase: () => Promise.reject(new Error('blocked')) };
    const blockClear = () =>
      vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
        throw new DOMException('no', 'UnknownError');
      });

    await withDb((db) => db.writeSession({ ...savedRecord(), schemaVersion: 99 }));
    let clear = blockClear();
    let session = start(failRemoval);
    await session.ready;
    clear.mockRestore();
    expect(ui().notices).toEqual([]);
    expect(ui().clearError).toBe(CLEAR_FAILED_MESSAGE);
    session.stop();
    resetStores();

    clear = blockClear();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    session = start({
      ...failRemoval,
      open: async () => {
        await gate;
        return openSessionDb();
      },
    });
    listing().setInput('apple.name', { text: 'New' });
    release();
    await session.ready;
    clear.mockRestore();
    expect(listing().inputs['apple.name']?.text).toBe('New');
    expect(ui()).toMatchObject({ mode: 'memory', clearError: CLEAR_FAILED_MESSAGE });
    session.stop();
    resetStores();

    await withDb(async (db) => {
      await db.clear();
      await db.putBlob({
        id: 'stray',
        groupId: 'screenshot',
        fileName: 'stray.png',
        sha256: '0'.repeat(64),
        size: 1,
        blob: new Blob(['x']),
      });
    });
    clear = blockClear();
    await start(failRemoval).ready;
    clear.mockRestore();
    expect(ui()).toMatchObject({ mode: 'memory', clearError: CLEAR_FAILED_MESSAGE });
    expect(await withDb(async (db) => (await db.load()).blobs)).toHaveLength(1);
  });

  it('removes records it cannot read', async () => {
    await withDb((db) => db.writeSession({ ...savedRecord(), schemaVersion: 99 }));
    await start().ready;
    expect(ui().notices[0]).toMatch(/different version of Mulligan could not be restored/);
    expect(await withDb(async (db) => (await db.load()).record)).toBeUndefined();
  });

  it('skips saved images whose blobs are missing or unreadable, and deletes orphan blobs', async () => {
    await withDb(async (db) => {
      await db.writeSession(
        savedRecord({
          groups: {
            screenshot: [
              { id: 'missing', fileName: 'missing.png' },
              { id: 'corrupt', fileName: 'corrupt.png' },
              { id: 'good', fileName: 'good.png' },
            ],
            banner: [{ id: 'x', fileName: 'unknown-group.png' }],
          },
        }),
      );
      const blob = (id: string, bytes: Uint8Array) => ({
        id,
        groupId: 'screenshot',
        fileName: `${id}.png`,
        sha256: 'f'.repeat(64),
        size: bytes.byteLength,
        blob: new Blob([bytes.slice()], { type: 'image/png' }),
      });
      await db.putBlob(blob('corrupt', Uint8Array.of(1, 2, 3)));
      await db.putBlob(blob('good', pngFile(1320, 2868)));
      await db.putBlob(blob('orphan', pngFile(10, 10)));
    });
    const session = start();
    await session.ready;
    expect(names()).toEqual(['good.png']);
    expect(ui().notices).toEqual(['2 saved images could not be restored.']);
    await session.flush();
    const blobs = await withDb(async (db) => (await db.load()).blobs);
    expect(blobs.map((b) => b.id)).toEqual(['good']);
  });

  it('deletes blobs left without a session record', async () => {
    await withDb((db) =>
      db.putBlob({
        id: 'stray',
        groupId: 'screenshot',
        fileName: 'stray.png',
        sha256: '0'.repeat(64),
        size: 1,
        blob: new Blob(['x']),
      }),
    );
    await start().ready;
    expect(await withDb(async (db) => (await db.load()).blobs)).toEqual([]);
  });

  it('keeps work started before the restore finished', async () => {
    await withDb((db) =>
      db.writeSession(
        savedRecord({ fields: { 'apple.name': { raw: { text: 'Old' }, reverted: [] } } }),
      ),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const session = start({
      open: async () => {
        await gate;
        return openSessionDb();
      },
    });
    listing().setInput('apple.name', { text: 'New' });
    release();
    await session.ready;
    expect(listing().inputs['apple.name']?.text).toBe('New');
    await session.flush();
    const stored = await withDb(async (db) => (await db.load()).record as SessionRecord);
    expect(stored.fields['apple.name']?.raw.text).toBe('New');
  });

  it('works in memory when IndexedDB cannot be opened', async () => {
    const session = start({ open: () => Promise.reject(new Error('private window')) });
    await session.ready;
    expect(ui().mode).toBe('memory');
    images().addSources('screenshot', [source('a.png')]);
    await session.flush();
    expect(names()).toEqual(['a.png']);
    expect(ui().showSaveNotice).toBe(false);
  });

  it('works in memory when IndexedDB does not open in time, and closes it if it opens late', async () => {
    let resolveOpen!: (db: SessionDb) => void;
    const late = { close: vi.fn() } as unknown as SessionDb;
    const session = start({
      openTimeoutMs: 10,
      open: () => new Promise<SessionDb>((resolve) => (resolveOpen = resolve)),
    });
    await session.ready;
    expect(ui().mode).toBe('memory');
    resolveOpen(late);
    await vi.waitFor(() => expect(late.close).toHaveBeenCalled());
  });

  it('falls back to memory when the saved session cannot be read', async () => {
    const broken = {
      load: () => Promise.reject(new Error('read failed')),
      close: vi.fn(),
    } as unknown as SessionDb;
    await start({ open: () => Promise.resolve(broken) }).ready;
    expect(ui().mode).toBe('memory');
    expect(broken.close).toHaveBeenCalled();
  });

  it('stops cleanly before the database has opened', async () => {
    let resolveOpen!: (db: SessionDb) => void;
    const db = { close: vi.fn() } as unknown as SessionDb;
    const session = startSession({
      page: null,
      open: () => new Promise<SessionDb>((resolve) => (resolveOpen = resolve)),
    });
    session.stop();
    resolveOpen(db);
    await session.ready;
    expect(db.close).toHaveBeenCalled();
  });

  it('clears the saved session, every store and cached renders', async () => {
    const onClear = vi.fn();
    const session = start({ onClear });
    await session.ready;
    images().addSources('screenshot', [source('a.png')]);
    images().setSelectedPresets(['ipad-13']);
    listing().setInput('apple.name', { text: 'Example' });
    useOutcomeStore.getState().report('k', []);
    await session.flush();
    expect(ui().showSaveNotice).toBe(true);

    await session.clear();
    expect(images().sources).toEqual({});
    expect(images().selectedPresetIds).toContain('iphone-6.9');
    expect(listing().inputs).toEqual({});
    expect(useOutcomeStore.getState().byKey).toEqual({});
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(ui()).toMatchObject({ showSaveNotice: false, saveNoticeDismissed: false, notices: [] });
    expect(await withDb((db) => db.load())).toEqual({ record: undefined, blobs: [] });

    // Saving resumes afterwards.
    listing().setInput('apple.name', { text: 'Fresh' });
    await session.flush();
    const stored = await withDb(async (db) => (await db.load()).record as SessionRecord);
    expect(stored.fields['apple.name']?.raw.text).toBe('Fresh');
  });

  it('falls back to deleting the database when clearing its stores fails', async () => {
    const session = start();
    await session.ready;
    images().addSources('screenshot', [source('a.png')]);
    listing().setInput('apple.name', { text: 'Example' });
    await session.flush();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new DOMException('no', 'UnknownError');
    });
    await session.clear();
    clear.mockRestore();

    expect(listing().inputs).toEqual({});
    expect(images().sources).toEqual({});
    expect(ui()).toMatchObject({ mode: 'saved', clearError: null });
    expect(await withDb((db) => db.load())).toEqual({ record: undefined, blobs: [] });
    // The reopened database keeps saving.
    listing().setInput('apple.name', { text: 'Fresh' });
    await session.flush();
    const stored = await withDb(async (db) => (await db.load()).record as SessionRecord);
    expect(stored.fields['apple.name']?.raw.text).toBe('Fresh');
  });

  it('never shows a cleared state when the saved data cannot be removed', async () => {
    const deleteDatabase = vi.fn(() => Promise.reject(new Error('blocked')));
    const session = start({ deleteDatabase });
    await session.ready;
    images().addSources('screenshot', [source('a.png')]);
    listing().setInput('apple.name', { text: 'Example' });
    await session.flush();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new DOMException('no', 'UnknownError');
    });
    const error = await session.clear().catch((e: unknown) => e);
    clear.mockRestore();

    expect(error).toBeInstanceOf(ClearSessionError);
    expect((error as Error).message).toBe(CLEAR_FAILED_MESSAGE);
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
    // The work stays on screen, the user is told, and saving has stopped.
    expect(listing().inputs['apple.name']?.text).toBe('Example');
    expect(names()).toEqual(['a.png']);
    expect(ui()).toMatchObject({ mode: 'memory', clearError: CLEAR_FAILED_MESSAGE });
    const stored = await withDb(async (db) => (await db.load()).record as SessionRecord);
    expect(stored.fields['apple.name']?.raw.text).toBe('Example');
  });

  it('reports a failed removal even when the browser reopens without the database', async () => {
    let opens = 0;
    const session = start({
      open: () => {
        opens += 1;
        return opens === 1 ? openSessionDb() : Promise.reject(new Error('gone'));
      },
    });
    await session.ready;
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new DOMException('no', 'UnknownError');
    });
    listing().setInput('apple.name', { text: 'Example' });
    await session.clear();
    clear.mockRestore();
    // Deleted, but it could not be reopened: cleared, and in memory from now on.
    expect(listing().inputs).toEqual({});
    expect(ui()).toMatchObject({ mode: 'memory', clearError: null });
  });

  it('still deletes the database when IndexedDB failed to open, since data may remain on disk', async () => {
    const deleteDatabase = vi.fn(() => Promise.resolve());
    const session = start({
      deleteDatabase,
      open: () => Promise.reject(new Error('version error')),
    });
    await session.ready;
    listing().setInput('apple.name', { text: 'Example' });
    await session.clear();
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
    expect(listing().inputs).toEqual({});
    expect(ui().clearError).toBeNull();
  });

  it('fails closed when IndexedDB failed to open and the deletion fails', async () => {
    const deleteDatabase = vi.fn(() => Promise.reject(new Error('blocked')));
    const session = start({
      deleteDatabase,
      open: () => Promise.reject(new Error('version error')),
    });
    await session.ready;
    listing().setInput('apple.name', { text: 'Example' });
    await expect(session.clear()).rejects.toBeInstanceOf(ClearSessionError);
    expect(listing().inputs['apple.name']?.text).toBe('Example');
    expect(ui().clearError).toBe(CLEAR_FAILED_MESSAGE);
  });

  it('clears without error when the browser has no storage for the site at all', async () => {
    const deleteDatabase = vi.fn(() => Promise.reject(new StorageAbsentError('no IndexedDB')));
    const session = start({ deleteDatabase, open: () => Promise.reject(new Error('private')) });
    await session.ready;
    listing().setInput('apple.name', { text: 'Example' });
    await session.clear();
    expect(listing().inputs).toEqual({});
    expect(ui().clearError).toBeNull();
  });

  it('deletes the database when clearing after saving stopped mid-session', async () => {
    const deleteDatabase = vi.fn(() => Promise.resolve());
    const session = start({ deleteDatabase });
    await session.ready;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('broken', 'UnknownError');
    });
    listing().setInput('apple.name', { text: 'Example' });
    await session.flush();
    put.mockRestore();
    expect(ui().mode).toBe('memory');
    await session.clear();
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
    expect(ui()).toMatchObject({ mode: 'saved', clearError: null });
    expect(listing().inputs).toEqual({});
  });

  it('clearSession empties the stores when no session is running', async () => {
    listing().setInput('apple.name', { text: 'Example' });
    images().addSources('screenshot', [source('a.png')]);
    await clearSession();
    expect(listing().inputs).toEqual({});
    expect(images().sources).toEqual({});
  });

  it('clearSession clears the running session', async () => {
    const session = start();
    await session.ready;
    const clear = vi.spyOn(session, 'clear');
    await clearSession();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(await withDb((db) => db.load())).toEqual({ record: undefined, blobs: [] });
  });
});
