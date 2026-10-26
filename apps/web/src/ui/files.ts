import { useEffect, useMemo } from 'react';

/** Offers a blob to the user as a file download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoke once the click has been handled (spec §10.7).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function saveBytes(bytes: Uint8Array, type: string, fileName: string): void {
  saveBlob(new Blob([bytes.slice()], { type }), fileName);
}

interface SharedUrl {
  url: string;
  users: number;
}

/** One blob: URL per byte array, shared by every component showing it. */
const shared = new WeakMap<Uint8Array, SharedUrl>();
const byUrl = new Map<string, { bytes: Uint8Array; entry: SharedUrl }>();

function urlFor(bytes: Uint8Array, type: string): string {
  let entry = shared.get(bytes);
  if (!entry) {
    entry = { url: URL.createObjectURL(new Blob([bytes.slice()], { type })), users: 0 };
    shared.set(bytes, entry);
    byUrl.set(entry.url, { bytes, entry });
  }
  return entry.url;
}

/**
 * A blob: URL for the bytes, revoked once no mounted component uses it. Revocation is deferred
 * by a tick so that StrictMode's immediate effect re-run can reclaim the URL instead of losing it.
 */
export function useObjectUrl(bytes: Uint8Array | null, type: string): string | null {
  const url = useMemo(() => (bytes ? urlFor(bytes, type) : null), [bytes, type]);
  useEffect(() => {
    const record = url ? byUrl.get(url) : undefined;
    if (!url || !record) return undefined;
    record.entry.users += 1;
    return () => {
      record.entry.users -= 1;
      if (record.entry.users > 0) return;
      setTimeout(() => {
        if (record.entry.users > 0) return;
        shared.delete(record.bytes);
        byUrl.delete(url);
        URL.revokeObjectURL(url);
      }, 0);
    };
  }, [url]);
  return url;
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
