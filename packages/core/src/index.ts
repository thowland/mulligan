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

export type {
  Change,
  ChangeId,
  FieldCount,
  FieldResult,
  ListingInput,
  ListingOptions,
  ListingResult,
  NormalizeOptions,
  RawFieldInput,
  Span,
} from './text/types.ts';
export { extractBaseline, type Extraction, type ExtractionChange } from './text/extract/extract.ts';
export { normalizeField, processListing, wordTokens } from './text/pipeline.ts';
export { countText, overflowOffset } from './text/count.ts';
