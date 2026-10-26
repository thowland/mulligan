// manifest.json (spec §8.4): traces every output to its source and to the standards in force.
import { summarize, worstSeverity } from '../findings/summarize.ts';
import type { Finding, Severity, Summary } from '../findings/types.ts';
import type { CropRect } from '../image/engine.ts';
import { getStandardsInfo } from '../standards/standards.ts';
import { LIBRARY_VERSION } from '../version.ts';

export interface ManifestSource {
  id: string;
  group: string;
  seq: number;
  fileName: string;
  sha256: string;
  width: number;
  height: number;
  type: string;
  iccProfile: boolean;
}

export interface ManifestOutputInput {
  path: string;
  presetId: string;
  sourceId: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  crop: CropRect;
  findings: Finding[];
}

export interface ManifestInput {
  app: { name: string; build: string };
  createdAt: string;
  sources: ManifestSource[];
  outputs: ManifestOutputInput[];
  /** Group- and package-level findings. */
  findings: Finding[];
  /** The listing exports, when the package includes them. */
  listing?: ManifestListingInput;
}

export interface ManifestListingInput {
  path: string;
  status: Severity;
  /** Every listing finding; counted in the summary. */
  findings: Finding[];
}

export interface Manifest {
  mulliganManifest: 1;
  libraryVersion: string;
  rulesetVersion: string;
  standardsHash: string;
  app: { name: string; build: string };
  createdAt: string;
  sources: ManifestSource[];
  outputs: (ManifestOutputInput & { status: Severity })[];
  findings: Finding[];
  listing?: { path: string; status: Severity };
  summary: Summary['counts'] & { worst: Severity };
}

export function buildManifest(input: ManifestInput): Manifest {
  const { rulesetVersion, standardsHash } = getStandardsInfo();
  const outputs = input.outputs.map((output) => ({
    ...output,
    status: worstSeverity(output.findings.map((f) => f.severity)),
  }));
  const all = [
    ...outputs.flatMap((o) => o.findings),
    ...input.findings,
    ...(input.listing?.findings ?? []),
  ];
  const { counts, worst } = summarize(all);
  return {
    mulliganManifest: 1,
    libraryVersion: LIBRARY_VERSION,
    rulesetVersion,
    standardsHash,
    app: input.app,
    createdAt: input.createdAt,
    sources: input.sources,
    outputs,
    findings: input.findings,
    ...(input.listing
      ? { listing: { path: input.listing.path, status: input.listing.status } }
      : {}),
    summary: { ...counts, worst },
  };
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
