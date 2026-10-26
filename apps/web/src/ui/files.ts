import { useEffect, useMemo } from 'react';

/** Offers bytes to the user as a file download. */
export function saveBytes(bytes: Uint8Array, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoke once the click has been handled (spec §10.7).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Mounted users of each blob: URL created by useObjectUrl. */
const users = new Map<string, number>();

/**
 * A blob: URL for the bytes, revoked once no mounted component uses it. Revocation is deferred
 * by a tick so that StrictMode's immediate effect re-run can reclaim the URL instead of losing it.
 */
export function useObjectUrl(bytes: Uint8Array | null, type: string): string | null {
  const url = useMemo(
    () => (bytes ? URL.createObjectURL(new Blob([bytes.slice()], { type })) : null),
    [bytes, type],
  );
  useEffect(() => {
    if (!url) return undefined;
    users.set(url, (users.get(url) ?? 0) + 1);
    return () => {
      const remaining = (users.get(url) ?? 1) - 1;
      if (remaining > 0) {
        users.set(url, remaining);
        return;
      }
      users.delete(url);
      setTimeout(() => {
        if (!users.has(url)) URL.revokeObjectURL(url);
      }, 0);
    };
  }, [url]);
  return url;
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
