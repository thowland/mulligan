// Vite's import.meta.glob, used by fixture tests so they load the same files in Node and browsers.
interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options: { eager: true; import?: string; query?: string },
  ): Record<string, T>;
}
