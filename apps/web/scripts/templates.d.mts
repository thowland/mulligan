import type { Standards } from '@mulligan/core';

/** The CSV and JSON template contents for a standards document, keyed by file name. */
export function templateFiles(standards: Standards): Record<string, string>;
