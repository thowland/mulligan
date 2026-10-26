import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export interface ZipWriter {
  /** Adds already-compressed data (PNG, JPEG) without recompressing it. */
  addStored(path: string, bytes: Uint8Array): void;
  /** Adds text such as JSON, deflated. */
  addDeflated(path: string, bytes: Uint8Array): void;
  /** Finishes the archive and resolves with it as a Blob. */
  finish(): Promise<Blob>;
}

/**
 * A streaming ZIP writer (spec §8.2): each entry is written as it is added, so only the archive's
 * chunks (held by a Blob, which the browser may page out) accumulate, not every output at once.
 */
export function createZipWriter(): ZipWriter {
  const chunks: Uint8Array[] = [];
  let zip!: Zip;
  const finished = new Promise<Blob>((resolve, reject) => {
    zip = new Zip((error, data, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(data);
      if (final) resolve(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
    });
  });

  return {
    addStored(path, bytes) {
      const file = new ZipPassThrough(path);
      zip.add(file);
      file.push(bytes, true);
    },
    addDeflated(path, bytes) {
      const file = new ZipDeflate(path, { level: 6 });
      zip.add(file);
      file.push(bytes, true);
    },
    finish() {
      zip.end();
      return finished;
    },
  };
}
