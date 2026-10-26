// IndexedDB storage for the session (spec §9.5): one `session` record and one `blobs` entry per
// source image. This module only reads and writes records; session.ts decides what to store.
import type { ChangeId, RawFieldInput } from '@mulligan/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'mulligan';
export const DB_VERSION = 1;
/** Version of the session record's shape; bump it and add a migration when the shape changes. */
export const SCHEMA_VERSION = 1;
const SESSION_KEY = 'current';

export interface SavedSource {
  id: string;
  fileName: string;
}

export interface SavedField {
  raw: RawFieldInput;
  reverted: ChangeId[];
}

export interface SessionRecord {
  schemaVersion: number;
  rulesetVersion: string;
  /** Epoch milliseconds of the last save; drives retention. */
  updatedAt: number;
  /** Sources per group, in the user's order. */
  groups: Record<string, SavedSource[]>;
  selectedPresetIds: string[];
  fields: Record<string, SavedField>;
  straightQuotes: Record<string, boolean>;
  /** Whether the "work is kept in this browser" notice has been dismissed. */
  saveNoticeDismissed: boolean;
}

export interface BlobRecord {
  id: string;
  groupId: string;
  fileName: string;
  sha256: string;
  size: number;
  blob: Blob;
}

interface MulliganDb extends DBSchema {
  session: { key: string; value: SessionRecord };
  blobs: { key: string; value: BlobRecord };
}

/** Upgrades a record of schema version n to n + 1. */
export type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

/** Migrations by the version they upgrade from. Empty until the record shape first changes. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Brings a stored record up to the current schema, or returns null when it cannot be used: an
 * unknown shape, a missing migration, or a record written by a newer version of the app.
 */
export function migrateSession(
  stored: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): SessionRecord | null {
  if (!isObject(stored) || !Number.isInteger(stored['schemaVersion'])) return null;
  let record = stored;
  let version = record['schemaVersion'] as number;
  if (version > target) return null;
  while (version < target) {
    const migrate = Object.hasOwn(migrations, version) ? migrations[version] : undefined;
    if (!migrate) return null;
    record = { ...migrate(record), schemaVersion: version + 1 };
    version += 1;
  }
  const valid =
    typeof record['rulesetVersion'] === 'string' &&
    typeof record['updatedAt'] === 'number' &&
    isObject(record['groups']) &&
    Array.isArray(record['selectedPresetIds']) &&
    isObject(record['fields']) &&
    isObject(record['straightQuotes']);
  if (!valid) return null;
  const session = record as unknown as SessionRecord;
  return { ...session, saveNoticeDismissed: session.saveNoticeDismissed === true };
}

export interface SessionDb {
  /** The stored session record (unmigrated) and every stored blob. */
  load(): Promise<{ record: unknown; blobs: BlobRecord[] }>;
  writeSession(record: SessionRecord): Promise<void>;
  putBlob(record: BlobRecord): Promise<void>;
  deleteBlobs(ids: readonly string[]): Promise<void>;
  /** Removes the session and every blob. */
  clear(): Promise<void>;
  close(): void;
}

/** Opens (creating or upgrading) the Mulligan database. Rejects where IndexedDB is unavailable. */
export async function openSessionDb(): Promise<SessionDb> {
  const db: IDBPDatabase<MulliganDb> = await openDB<MulliganDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('session')) database.createObjectStore('session');
      if (!database.objectStoreNames.contains('blobs')) {
        database.createObjectStore('blobs', { keyPath: 'id' });
      }
    },
  });

  return {
    async load() {
      const tx = db.transaction(['session', 'blobs'], 'readonly');
      const [record, blobs] = await Promise.all([
        tx.objectStore('session').get(SESSION_KEY),
        tx.objectStore('blobs').getAll(),
        tx.done,
      ]);
      return { record, blobs };
    },
    async writeSession(record) {
      const tx = db.transaction('session', 'readwrite');
      await Promise.all([tx.store.put(record, SESSION_KEY), tx.done]);
    },
    async putBlob(record) {
      const tx = db.transaction('blobs', 'readwrite');
      await Promise.all([tx.store.put(record), tx.done]);
    },
    async deleteBlobs(ids) {
      if (ids.length === 0) return;
      const tx = db.transaction('blobs', 'readwrite');
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
    },
    async clear() {
      const tx = db.transaction(['session', 'blobs'], 'readwrite');
      await Promise.all([
        tx.objectStore('session').clear(),
        tx.objectStore('blobs').clear(),
        tx.done,
      ]);
    },
    close() {
      db.close();
    },
  };
}
