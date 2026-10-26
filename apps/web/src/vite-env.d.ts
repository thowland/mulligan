/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build identifier recorded in manifest.json (for example a git SHA); set by CI. */
  readonly VITE_MULLIGAN_BUILD?: string;
}
