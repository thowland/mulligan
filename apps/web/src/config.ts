// Web-app resource limits (spec §10.8). These protect browser memory and belong to the app, not
// the ruleset: the future CLI will have different constraints. Core turns them into findings.

export const SOURCE_LIMITS = {
  /** Largest file accepted, checked before the file is read. */
  maxFileBytes: 50 * 1024 * 1024,
  /** Largest decoded size, checked from the header before decoding (for example 1440 × 100,000). */
  maxPixels: 150_000_000,
} as const;

/** Session persistence in IndexedDB (spec §9.5, §10.7, §10.8). */
export const SESSION = {
  /** Session-record writes are debounced; source blobs are written once, on drop. */
  saveDebounceMs: 500,
  /** Sessions untouched for this long are deleted on the next load. */
  retentionDays: 30,
  /** Largest total of source-image bytes kept on the device for one session. */
  maxPersistedBytes: 500 * 1024 * 1024,
  /** How long to wait for IndexedDB to open before working in memory only. */
  openTimeoutMs: 3000,
} as const;

/** Longest edge of on-screen previews (spec §9.4). */
export const PREVIEW_MAX_EDGE = 480;

/** Render workers: one fewer than the cores, at most four, at least one (spec §9.4). */
export function renderPoolSize(
  cores: number | undefined = globalThis.navigator?.hardwareConcurrency,
): number {
  return Math.max(1, Math.min((cores ?? 2) - 1, 4));
}

export const APP_INFO = {
  name: 'mulligan-web',
  build: import.meta.env.VITE_MULLIGAN_BUILD ?? 'local',
} as const;
