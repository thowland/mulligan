export { LIBRARY_VERSION } from './version.ts';

export type {
  Anchor,
  FieldDef,
  GroupDef,
  LimitUnit,
  PresetDef,
  Standards,
  StandardsDocument,
  StoreDef,
} from './standards/schema.ts';
export {
  getStandards,
  getStandardsInfo,
  parseStandards,
  type StandardsInfo,
} from './standards/standards.ts';
export { canonicalJson, sha256Hex, standardsHash } from './standards/hash.ts';

export type { Finding, Severity, Subject, Summary } from './findings/types.ts';
export { RULES, isChangeRule, type RuleInfo, type RuleKind } from './findings/catalog.ts';
export { summarize, worstSeverity } from './findings/summarize.ts';

export type { Result } from './result.ts';

export type {
  CropRect,
  ImagePlan,
  PixelEngine,
  RenderRequest,
  RenderedImage,
} from './image/engine.ts';

// Image inspection, planning and output checks (Sprint 1, spec §7).
export {
  inspectImage,
  isImageInspectError,
  type ImageInfo,
  type ImageInspectError,
  type ImageType,
  type InspectOptions,
} from './image/inspect.ts';
export {
  computeCrop,
  planImage,
  resolveAnchor,
  type AxisAnchorX,
  type AxisAnchorY,
  type PlanSource,
} from './image/plan.ts';
export { checkRendered, decodeFailedFinding, inspectionFindings } from './image/checks.ts';
export { fileSubject, type FileRef } from './image/findings.ts';
export { outputPath, sequenceLabel, sourceSlug } from './package/naming.ts';

// Packaging, limits and manifest (Sprint 2, spec §8, §10.4).
export {
  checkGroupCounts,
  checkSourceLimits,
  type GroupCountInput,
  type SourceLimits,
} from './image/limits.ts';
export {
  ALLOWED_EXTENSIONS,
  checkEntryContent,
  checkEntryPath,
  planPackage,
  type PackageEntry,
  type PackageInput,
  type PackagePlan,
  type PackageSourceRef,
} from './package/plan.ts';
export {
  buildManifest,
  serializeManifest,
  type Manifest,
  type ManifestInput,
  type ManifestOutputInput,
  type ManifestSource,
} from './package/manifest.ts';
