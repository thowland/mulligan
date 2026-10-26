// @vitest-environment node
// Node environment: fake-indexeddb clones Blobs with Node's structuredClone.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  migrateSession,
  openSessionDb,
  type BlobRecord,
  type SessionRecord,
} from '../src/state/persistence.ts';

const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: '1.0.1',
  updatedAt: 1,
  groups: { screenshot: [{ id: 'a', fileName: 'a.png' }] },
  selectedPresetIds: ['iphone-6.9'],
  fields: { 'apple.name': { raw: { text: 'Example' }, reverted: [] } },
  straightQuotes: {},
  saveNoticeDismissed: false,
  ...overrides,
});

const blob = (id: string, text = 'png'): BlobRecord => ({
  id,
  groupId: 'screenshot',
  fileName: `${id}.png`,
  sha256: id.repeat(64).slice(0, 64),
  size: text.length,
  blob: new Blob([text], { type: 'image/png' }),
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('session database', () => {
  it('starts empty', async () => {
    const db = await openSessionDb();
    expect(await db.load()).toEqual({ record: undefined, blobs: [] });
    db.close();
  });

  it('stores the session record and blobs across reopening', async () => {
    const db = await openSessionDb();
    await db.writeSession(record());
    await db.putBlob(blob('a', 'hello'));
    await db.putBlob(blob('b'));
    db.close();

    const reopened = await openSessionDb();
    const { record: stored, blobs } = await reopened.load();
    expect(stored).toEqual(record());
    expect(blobs.map((b) => b.id).sort()).toEqual(['a', 'b']);
    expect(await blobs.find((b) => b.id === 'a')!.blob.text()).toBe('hello');
    reopened.close();
  });

  it('replaces the record, deletes blobs and clears everything', async () => {
    const db = await openSessionDb();
    await db.writeSession(record({ updatedAt: 1 }));
    await db.writeSession(record({ updatedAt: 2 }));
    await db.putBlob(blob('a'));
    await db.putBlob(blob('b'));
    await db.deleteBlobs([]);
    await db.deleteBlobs(['a']);
    let loaded = await db.load();
    expect((loaded.record as SessionRecord).updatedAt).toBe(2);
    expect(loaded.blobs.map((b) => b.id)).toEqual(['b']);
    await db.clear();
    loaded = await db.load();
    expect(loaded).toEqual({ record: undefined, blobs: [] });
    db.close();
  });
});

describe('migrateSession', () => {
  it('accepts a current record and defaults the save-notice flag', () => {
    expect(migrateSession(record())).toEqual(record());
    const withoutFlag: Partial<SessionRecord> = record();
    delete withoutFlag.saveNoticeDismissed;
    expect(migrateSession(withoutFlag)?.saveNoticeDismissed).toBe(false);
  });

  it('runs migrations in order up to the target version', () => {
    const v0 = { ...record(), schemaVersion: 0, selection: ['iphone-6.9'] } as Record<
      string,
      unknown
    >;
    delete v0['selectedPresetIds'];
    const migrated = migrateSession(
      v0,
      { 0: ({ selection, ...rest }) => ({ ...rest, selectedPresetIds: selection }) },
      1,
    );
    expect(migrated).toMatchObject({ schemaVersion: 1, selectedPresetIds: ['iphone-6.9'] });
  });

  it('rejects records it cannot use', () => {
    expect(migrateSession(undefined)).toBeNull();
    expect(migrateSession('x')).toBeNull();
    expect(migrateSession({ ...record(), schemaVersion: 1.5 })).toBeNull();
    // Written by a newer app.
    expect(migrateSession({ ...record(), schemaVersion: SCHEMA_VERSION + 1 })).toBeNull();
    // No migration from version 0.
    expect(migrateSession({ ...record(), schemaVersion: 0 })).toBeNull();
    // Wrong shape.
    expect(migrateSession({ ...record(), groups: [] })).toBeNull();
    expect(migrateSession({ ...record(), updatedAt: 'yesterday' })).toBeNull();
    // Prototype keys are not migrations.
    expect(
      migrateSession({ ...record(), schemaVersion: 0 }, Object.create({ 0: (r: object) => r }), 1),
    ).toBeNull();
  });
});
