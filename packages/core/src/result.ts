import type { Finding } from './findings/types.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; findings: Finding[] };
