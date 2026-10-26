# Mulligan – Technical Specification

Status: Draft 1 · 2026-10-25
Companion to: `docs/Mulligan Requirements.md` (referred to below as "the requirements")

This document describes how Mulligan is built: the repository layout, the boundary between the rules library and the web application, the library's public API and data formats, the text and image pipelines, the web application's internal structure, packaging, persistence, testing and release. Where the requirements leave a choice open, this document makes one and records it in §15 so it can be confirmed or reversed.

---

## 1. Decisions taken

| Topic | Decision |
| --- | --- |
| UI framework | React 19 + TypeScript, built with Vite |
| Toolchain | TypeScript 6.0.x (pinned below 6.1 until typescript-eslint supports the TypeScript 7 native compiler), ESLint 9, Vite 8, Vitest 5, pnpm 12, Node 22+ |
| Repository | pnpm workspace monorepo |
| File → preset mapping | Separate drop zone per asset group (screenshots, feature graphic, icon). A file only receives the presets of the group it was dropped into. |
| Review overrides | The reviewer can revert individual recorded changes. Free-text editing of cleaned output is not offered. Editing the *source* text is allowed and resets reverts. |
| Persistence | Session autosaves to IndexedDB (source images, field input, order, selections, reverts) with an explicit "Clear session". |
| Standards distribution | Standards JSON is bundled into the library and versioned with it. The web app does not fetch configuration at runtime. |
| Pixel engine (browser) | `createImageBitmap` for decode and crop, `pica` (Lanczos3) for resampling, `fast-png` for PNG encoding (so RGB PNGs without alpha are possible), canvas `convertToBlob` for JPEG, all inside a Web Worker pool. |
| Zip | `fflate`, streaming. |
| Hosting | Public site, no access control. Security rests on serving only reviewed code and accepting input only from user gestures (§10). |
| Exfiltration control | A strict Content-Security-Policy set at CloudFront (`connect-src 'none'`, no third-party origins, Trusted Types) makes "no file leaves the browser" a property the browser enforces, not only a design intention. CORS is not used and not relied on (§10.1). |

---

## 2. Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/web  (React)                                                │
│  UI components ─ feature modules ─ store (zustand) ─ persistence │
│        │                    │                                    │
│        │ calls only public API          │ RPC (comlink)          │
│        ▼                                ▼                        │
│  ┌────────────────────┐        ┌─────────────────────────────┐   │
│  │ @mulligan/core     │◄───────│ render worker pool          │   │
│  │ (pure, no DOM)     │ types  │  @mulligan/render-canvas    │   │
│  └────────────────────┘ + plan │  (implements PixelEngine)   │   │
└──────────────────────────────────────────────────────────────────┘

Later:
  packages/cli ──► @mulligan/core
              └──► @mulligan/render-node (sharp, implements PixelEngine)
```

Three rules govern the layering:

1. **`@mulligan/core` makes every decision.** Limits, crop rectangles, target dimensions, formats, alpha handling, normalization, checks, file naming, ZIP layout, manifest content. It has no runtime dependency on the DOM, Canvas, Node built-ins, or React.
2. **Renderers move pixels and nothing else.** A renderer receives an `ImagePlan` computed by core and returns encoded bytes plus a few measured facts (for example "the source had transparent pixels"). Core then turns those facts into findings.
3. **The web app holds no rules.** It renders forms and preset lists from the standards that core exposes, sends user input to core, and displays core's results. If the app needs a number such as a limit or a dimension, it reads it from core.

### 2.1 How the boundaries are enforced

| Mechanism | Effect |
| --- | --- |
| `packages/core/tsconfig.json` sets `"lib": ["ES2022"]` and `"types": []` (no `DOM`, no `@types/node`) | Any reference to `document`, `Blob`, `Buffer`, `fs` and so on fails to compile. |
| `package.json` `exports` map on core exposes only `.` and `./standards.json` (read-only) | No deep imports into internals. |
| `dependency-cruiser` rules in CI | `apps/web` may import `@mulligan/core` and `@mulligan/render-canvas` only through their entry points. `apps/web` may not import `standards.json`. `core` may not import any other workspace package. |
| Core's test suite runs in Node **and** in browsers (Vitest browser mode) | Environment divergence is caught on every change (§13). |

---

## 3. Repository layout

```
mulligan/
├─ package.json                 # workspace root: scripts, devDeps (vitest, eslint, prettier, dep-cruiser, changesets)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .dependency-cruiser.cjs
├─ docs/
├─ fixtures/                    # shared test fixtures (§13.2), consumed by every package
│  ├─ text/<case>/
│  └─ images/<case>/
├─ packages/
│  ├─ core/                     # @mulligan/core — the rules library
│  │  ├─ src/
│  │  │  ├─ index.ts            # public API (§5)
│  │  │  ├─ version.ts          # LIBRARY_VERSION (generated at build)
│  │  │  ├─ standards/          # standards.json, schema (zod), loader, overrides, hash
│  │  │  ├─ findings/           # Finding, Severity, rule catalog, message templates
│  │  │  ├─ text/
│  │  │  │  ├─ extract/         # HTML → baseline text (Word, Google Docs, web)
│  │  │  │  ├─ trace/           # offset mapping and change records
│  │  │  │  ├─ stages/          # one module per normalization rule
│  │  │  │  ├─ checks/          # one module per check
│  │  │  │  ├─ count.ts         # character and byte counting, overflow position
│  │  │  │  ├─ unicode.ts       # emoji, invisible and space character classes
│  │  │  │  └─ pipeline.ts      # normalizeField, processListing
│  │  │  ├─ import/             # text decoding, JSON and CSV template parsers
│  │  │  ├─ image/
│  │  │  │  ├─ inspect.ts       # PNG/JPEG header parsing (dims, colour type, EXIF orientation)
│  │  │  │  ├─ plan.ts          # crop rectangle, scale, format, flatten
│  │  │  │  ├─ checks.ts        # planning, rendered-output and group-count checks
│  │  │  │  └─ engine.ts        # PixelEngine interface (types only)
│  │  │  └─ package/            # naming, ZIP layout plan, manifest, listing serializers
│  │  └─ test/
│  ├─ render-canvas/            # @mulligan/render-canvas — PixelEngine for browsers/workers
│  └─ (later) render-node/, cli/
└─ apps/
   └─ web/                      # the Mulligan SPA (§9)
```

Tooling: TypeScript 5.x in strict mode, ESM only, Node 20+ for tooling and for the future CLI. `tsup` builds the packages, Vite builds the app. Changesets handles package versioning.

---

## 4. Standards configuration

All presets, asset groups, listing fields and rule settings live in **one** JSON file, `packages/core/src/standards/standards.json`. It is validated at load time against a zod schema, which also produces the TypeScript types. A JSON Schema is generated from the zod schema for editor support.

### 4.1 Versioning

- `rulesetVersion` (semver) lives inside the file and is independent of the package version.
  - **major**: a change that can turn a previously passing input into a failure, such as a tighter limit, a new required field or a stricter check.
  - **minor**: additive changes such as a new preset, a new optional field or a new warning-only check.
  - **patch**: labels, messages, documentation.
- `standardsHash` is the SHA-256 of the canonicalised standards *document* (sorted keys, no whitespace, before schema defaults are applied). Core computes it once, when the bundled standards are first loaded, and exposes it through `getStandardsInfo()`. A test fails if the file changes while `rulesetVersion` and a checked-in `standards.lock` hash stay the same, which makes accidental unversioned edits impossible.
- Every export records `libraryVersion`, `rulesetVersion` and `standardsHash` (§8.4).

### 4.2 Shape

```jsonc
{
  "rulesetVersion": "1.0.0",
  "locales": { "default": "default", "supported": ["default"] },
  "stores": [
    { "id": "apple", "label": "Apple App Store" },
    { "id": "google", "label": "Google Play" }
  ],

  "groups": [
    { "id": "screenshot",      "label": "Screenshots",      "anchor": "top",    "maxFiles": 10 },
    { "id": "feature-graphic", "label": "Feature graphic",  "anchor": "center", "maxFiles": 1 },
    { "id": "icon",            "label": "App icon",         "anchor": "center", "maxFiles": 1 }
  ],

  "input": {
    "acceptedTypes": ["image/png", "image/jpeg"],     // detected by magic bytes, not extension
    "upscaleWarnAbove": 1.0,                          // scale factor above which image.upscaled fires
    "cropLossWarnAbove": 0.25                         // share of the *non-anchored* axis discarded (§7.2)
  },

  "presets": [
    {
      "id": "iphone-6.9",
      "name": "iPhone 6.9\" screenshot",
      "store": "apple",
      "group": "screenshot",
      "width": 1320, "height": 2868,
      "format": "png",                 // "png" | "jpeg"
      "jpegQuality": null,             // 0–1 when format is jpeg
      "alpha": false,                  // false → flatten onto `flatten` colour and encode without an alpha channel
      "flatten": "#FFFFFF",
      "anchor": "top",                 // optional; defaults to the group's anchor
      "folder": "iphone-6.9",
      "fileSuffix": null,              // appended to file name; needed when presets share a folder
      "maxBytes": null,
      "count": { "min": 1, "max": 10 },  // per-store limits on how many images of this preset
      "defaultSelected": true,
      "note": "Primary required iPhone size"
    }
    // … the remaining presets from the requirements table (§4.3)
  ],

  "fields": [
    {
      "id": "apple.name",
      "store": "apple",
      "label": "App name",
      "limit": { "max": 30, "min": 2, "unit": "chars" },   // unit: "chars" | "bytes"
      "multiline": false,
      "required": true,
      "kind": "text",                    // "text" | "keywords"
      "checks": ["discouraged"],         // optional checks enabled for this field (§6.6)
      "options": { "straightQuotes": false }   // per-field option defaults
    },
    {
      "id": "apple.keywords",
      "store": "apple",
      "label": "Keywords",
      "limit": { "max": 100, "unit": "bytes" },
      "multiline": false,
      "required": true,
      "kind": "keywords",
      "related": ["apple.name", "apple.subtitle"]   // used by keywords.overlaps-name
    }
    // …
  ],

  "rules": {
    "counting": { "chars": "utf16" },            // "utf16" | "codepoints" | "graphemes"
    "emoji": { "preserve": ["®", "™", "©"] },
    "lists": { "bullet": "– ", "orderedStyle": "number" },  // "number" | "dash"
    "rejoin": {
      "terminal": ".!?:;…)]\"'”’",
      "listItemPattern": "^(– |\\d+[.)] )",
      "joinHyphenated": true
    },
    "discouraged": {
      "terms": ["free", "best", "#1", "no. 1", "top", "new", "sale", "discount", "cheap"],
      "allCaps": { "minLetters": 4, "allow": [] },     // allow-list for acronyms, e.g. "COPD"
      "repeatedPunctuation": "[!?]{2,}|\\.{2,}"   // linear-time; no backreferences (§10.4)
    },
    "revertible": {
      "chars.emoji": true, "chars.invisible": true, "chars.spaces": true,
      "chars.bullets": true, "chars.quotes": true,
      "lines.rejoin": true, "lines.rejoin-hyphen": true, "lines.collapse-blank": true
    }
  }
}
```

### 4.3 Initial presets

| id | group | w × h | format | alpha | anchor | folder | suffix | maxBytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `iphone-6.9` | screenshot | 1320 × 2868 | png | no | top | `iphone-6.9` | | |
| `iphone-6.5` | screenshot | 1284 × 2778 | png | no | top | `iphone-6.5` | | |
| `ipad-13` | screenshot | 2064 × 2752 | png | no | top | `ipad-13` | | |
| `android-phone` | screenshot | 1080 × 1920 | png | no | top | `android-phone` | | 8 MB |
| `android-tablet-7` | screenshot | 1200 × 1920 | png | no | top | `android-tablet-7` | | 8 MB |
| `android-tablet-10` | screenshot | 1600 × 2560 | png | no | top | `android-tablet-10` | | 8 MB |
| `play-feature-graphic` | feature-graphic | 1024 × 500 | png (24-bit) | no | center | `play-feature-graphic` | | 15 MB |
| `play-icon` | icon | 512 × 512 | png (32-bit) | yes | center | `icons` | `play-512` | 1 MB |
| `apple-icon` | icon | 1024 × 1024 | png | no | center | `icons` | `apple-1024` | |

All values, including the size caps and screenshot counts, must be checked against current Apple and Google documentation before release, as the requirements say.

### 4.4 Overrides (for the future CLI)

`applyOverrides(standards, overrides)` deep-merges a partial standards object by id (presets and fields are matched on `id`, never by array index). It returns the merged standards and an `OverrideRecord[]` (`{ path, from, to }`). Overridden standards get a new `standardsHash`, and the records are written into every report. The web app does not use overrides in v1.

---

## 5. Library public API (`@mulligan/core`)

Every function is synchronous and pure unless marked otherwise. Hashing is the caller's job (core accepts hashes as input) so that core needs no async crypto.

```ts
// ── Standards ──────────────────────────────────────────────
export const LIBRARY_VERSION: string;
export function getStandards(): Standards;                       // bundled, frozen
export function parseStandards(json: unknown): Result<Standards>; // validate external JSON
export function applyOverrides(s: Standards, o: StandardsOverride): { standards: Standards; applied: OverrideRecord[] };
export function standardsHash(s: Standards): string;             // sync SHA-256 (small pure implementation)

// ── Text ───────────────────────────────────────────────────
export function extractBaseline(input: RawFieldInput, s: Standards): Extraction;
export function normalizeField(
  input: RawFieldInput, field: FieldDef, s: Standards, opts?: NormalizeOptions
): FieldResult;
export function processListing(listing: ListingInput, s: Standards, opts?: ListingOptions): ListingResult;
export function countText(text: string, unit: LimitUnit, s: Standards): number;
export function overflowOffset(text: string, limit: Limit, s: Standards): number | null;

// ── Import ─────────────────────────────────────────────────
export function decodeTextBytes(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' };
export function parseListingJson(text: string, s: Standards): ImportResult;
export function parseListingCsv(text: string, s: Standards): ImportResult;

// ── Image ──────────────────────────────────────────────────
export function inspectImage(header: Uint8Array): ImageInfo | ImageInspectError;   // first ~64 KB suffice
export function planImage(src: ImageInfo, preset: PresetDef, s: Standards): ImagePlan;
export function checkRendered(plan: ImagePlan, out: RenderedImage, s: Standards): Finding[];
export function checkGroupCounts(groups: GroupSelection[], s: Standards): Finding[];
export type { PixelEngine, RenderRequest, RenderedImage };

// ── Packaging ──────────────────────────────────────────────
export function sourceSlug(fileName: string): string;
export function planPackage(input: PackageInput, s: Standards): PackagePlan;
export function buildManifest(input: ManifestInput): Manifest;
export function serializeListingJson(r: ListingResult, meta: ExportMeta): string;
export function serializeListingText(r: ListingResult, meta: ExportMeta): string;

// ── Findings ───────────────────────────────────────────────
export const RULES: Readonly<Record<RuleId, RuleInfo>>;   // catalog: id, title, description, default severity
export function summarize(findings: Finding[]): Summary;  // counts by severity, worst severity
```

`Result<T>` is `{ ok: true; value: T } | { ok: false; findings: Finding[] }`. Core never throws for bad *input*. It throws only on programmer error, such as an unknown preset id.

### 5.1 Findings and changes

```ts
type Severity = 'pass' | 'warning' | 'failure';

type Subject =
  | { kind: 'field'; fieldId: string; store: Store; locale: string }
  | { kind: 'file'; groupId: string; sourceId: string; fileName: string; presetId?: string }
  | { kind: 'group'; groupId: string; presetId?: string }
  | { kind: 'listing' } | { kind: 'package' }
  | { kind: 'standards'; path: string };

interface Finding {
  ruleId: RuleId;              // stable, e.g. "text.limit.max"; never reused for a different meaning
  severity: Severity;
  subject: Subject;
  message: string;             // English, rendered from the rule's template + data
  data?: Record<string, string | number | boolean | null>;   // structured details, e.g. { count, limit, unit }
  span?: { start: number; end: number };                     // offsets in the cleaned text, where relevant
}

interface Change {
  id: ChangeId;                // `${ruleId}@${baselineStart}:${baselineEnd}` — stable for a given baseline
  ruleId: RuleId;
  baselineSpan: { start: number; end: number };   // in the baseline text
  outputSpan:   { start: number; end: number };   // in the cleaned text
  before: string;
  after: string;
  revertible: boolean;
  reverted: boolean;
  detail?: string;             // e.g. "U+200B ZERO WIDTH SPACE"
}
```

Checks emit one finding per (rule, subject), including `pass` results, so a report can show what was checked and not only what failed. `summarize()` gives the worst severity, which the app uses for badges and the CLI will use for exit codes.

### 5.2 Rule identifier catalog (v1)

| ruleId | Kind | Severity | Description |
| --- | --- | --- | --- |
| `html.extract` | change (summary) | – | Tags stripped, entities decoded, blocks to lines |
| `html.list-item` | change | – | `<li>` / Word list paragraph → bullet line |
| `lines.endings` | change | – | CR, CRLF, VT, FF, U+2028 → `\n`; U+2029 → `\n\n` |
| `chars.nfc` | change | – | Unicode NFC composition |
| `chars.invisible` | change | – | ZWSP, ZWNJ (outside emoji), soft hyphen, BOM, bidi marks, other Cf characters |
| `chars.spaces` | change | – | NBSP, narrow NBSP, en/em/thin/ideographic spaces, tab → space |
| `chars.emoji` | change | – | Emoji graphemes removed (§6.4) |
| `chars.emoji-presentation` | change | – | VS16 dropped after ®, ™, © (symbol kept) |
| `chars.bullets` | change | – | Leading `•`, `·`, `*`, `-`, `▪`, `◦`, `‣`, `○` + whitespace → `– ` |
| `chars.quotes` | change | – | Curly → straight quotes (opt-in per field) |
| `ws.trim-lines` | change | – | Leading and trailing whitespace on each line |
| `ws.collapse-spaces` | change | – | Runs of spaces → one |
| `lines.rejoin` | change | – | Mid-sentence hard wrap joined with a space |
| `lines.rejoin-hyphen` | change | – | `word-⏎word` joined without a space |
| `lines.collapse-blank` | change | – | 2+ blank lines → 1 |
| `lines.single-line` | change | – | Line breaks removed in single-line fields |
| `ws.trim-field` | change | – | Field-level trim |
| `keywords.separators` | change | – | Spaces around commas removed, empty entries dropped; newlines and `;` / `，` treated as separators |
| `standards.invalid` | check | failure | A standards document failed schema or cross-reference validation (`subject.kind: 'standards'`) |
| `text.limit.max` | check | failure | Over limit (`data: { count, limit, unit }`, `span` = overflow) |
| `text.limit.min` | check | failure | Under minimum length |
| `text.required` | check | failure | Required field empty |
| `text.discouraged.all-caps` | check | warning | Word in capitals not on the allow-list |
| `text.discouraged.punctuation` | check | warning | Repeated punctuation |
| `text.discouraged.terms` | check | warning | Promotional term (whole-word, case-insensitive) |
| `text.emoji-present` | check | warning | Emoji remain (only possible after a revert) |
| `text.unclassified-chars` | check | warning | Characters outside the allowed classes (§6.6) |
| `text.newline-in-single-line` | check | failure | Only reachable through import or the CLI check mode |
| `text.not-normalized` | check | warning | CLI check mode: normalizing would change the text |
| `keywords.duplicate` | check | warning | Duplicate keyword (case- and accent-insensitive) |
| `keywords.overlaps-name` | check | warning | Keyword repeats a word in a related field |
| `integrity.wording` | check | failure | The word sequence changed (§6.7); indicates a library bug |
| `import.unknown-field` | check | warning | Template row for an unknown field |
| `import.malformed` | check | failure | Template could not be parsed |
| `image.unsupported-type` | check | failure | Not PNG or JPEG by magic bytes |
| `image.decode-failed` | check | failure | Renderer could not decode the file |
| `image.too-large` | check | failure | Exceeds the app's memory limits (§10.8) |
| `image.upscaled` | check | warning | Scale factor > threshold (`data: { factor }`) |
| `image.crop-loss` | check | warning | Large share of the non-anchored axis discarded (orientation mismatch) |
| `image.transparency-flattened` | check | warning | Source had transparent pixels and the preset disallows alpha |
| `image.output.dimensions` | check | failure | Encoded output dimensions ≠ preset (verification) |
| `image.output.alpha` | check | failure | Encoded output has an alpha channel where none is permitted |
| `image.output.format` | check | failure | Encoded format ≠ preset |
| `image.output.size` | check | failure | Encoded bytes > `maxBytes` |
| `group.count` | check | warning | Number of images outside the preset's `count` range |

---

## 6. Text pipeline

### 6.1 Input model

```ts
interface RawFieldInput {
  text: string;           // text/plain flavour, or typed or imported text
  html?: string;          // text/html flavour when pasted from a rich source
}
interface NormalizeOptions {
  straightQuotes?: boolean;          // overrides field default
  suppress?: ReadonlySet<ChangeId>;  // reverted changes
  mode?: 'fix' | 'check';            // 'check' adds text.not-normalized when changes would occur
}
interface FieldResult {
  fieldId: string;
  baseline: string;       // the "Original" shown in the side-by-side view
  output: string;         // cleaned text
  changes: Change[];
  findings: Finding[];
  count: { value: number; limit: number; unit: LimitUnit; overflowAt: number | null };
}
```

### 6.2 Stage 0: baseline extraction

The reviewer's "original" has to be readable, so raw HTML is not used as the baseline. When `html` is present, `extractBaseline` turns it into structured plain text, and that text becomes the baseline against which all later changes are recorded and shown. Extraction is recorded as a single `html.extract` summary change (counts of tags removed, entities decoded) plus one `html.list-item` change per list item. The app also offers a "view raw HTML" toggle.

Extraction uses `htmlparser2`, a tolerant streaming parser that runs in both environments and needs no DOM.

- Take only the content between `<!--StartFragment-->` and `<!--EndFragment-->` when present.
- Drop `head`, `style`, `script`, `template`, comments, Office conditional comments (`<![if !supportLists]>…<![endif]>`), `<o:p>`, and `img` (including emoji images with `alt` text).
- Block elements (`p`, `div`, `h1`–`h6`, `li`, `tr`, `blockquote`, `pre`) end with a line break. `p` and headings are separated by a blank line. `br` → `\n`. `td`/`th` → separated by a space.
- Lists: `ul > li` → `– ` prefix. `ol > li` → `1. `, `2. ` … when `rules.lists.orderedStyle` is `number` (the default, see §15), otherwise `– `. Nested lists are flattened, since the stores render plain text.
- Word list paragraphs (`class="MsoListParagraph…"` or a `mso-list:` style) are treated as `li`. The literal bullet glyph Word emits inside the `supportLists` block is discarded.
- Google Docs' wrapper `<b id="docs-internal-guid-…" style="font-weight:normal">` is unwrapped.
- Entities are decoded by the parser. `&nbsp;` becomes U+00A0 here and is converted later by `chars.spaces`, so that conversion shows up in the change report.

When there is no `html`, the baseline is `text` unchanged.

### 6.3 Change tracing

All stages after extraction run over a `Trace`. A trace holds the current text and a segment map back to baseline offsets: an ordered list of `{ outStart, outEnd, baseStart, baseEnd, edited }`.

- A stage scans the current text and proposes edits `{ start, end, replacement, ruleId, detail }` in current-text coordinates.
- For each proposed edit, the trace maps `[start, end)` to a baseline span (the union of the baseline ranges of the segments it covers; an insertion maps to a zero-width point), derives the `ChangeId`, and checks it against `suppress`. A suppressed edit is skipped and recorded with `reverted: true`.
- Applied edits are spliced into the text, and the segment map is updated.
- At the end, each change's `outputSpan` is resolved against the final map.

Because IDs are expressed in baseline coordinates, they do not move when other changes are reverted. Reverting a rejoin at baseline offset 412 leaves the ID of an emoji removal at offset 980 unchanged. IDs become invalid only when the baseline itself changes (new paste, source edit, or a ruleset upgrade that alters extraction). In that case the app drops the stale reverts and tells the user (§9.5).

The side-by-side view is built from `Change` records, not from a generic diff algorithm. The highlighting therefore shows exactly what each rule did and links each highlight to a rule ID and a revert toggle.

### 6.4 Stages in order

The requirements group the rules by topic. The execution order below differs where the topics depend on each other: line endings must be normalized before any line-based rule, and invisible characters must be gone before the rejoin rule inspects line ends.

| # | Stage | Applies to | Notes |
| --- | --- | --- | --- |
| 1 | `lines.endings` | all | |
| 2 | `chars.nfc` | all | Keeps byte counts honest for decomposed accents |
| 3 | `chars.invisible` | all | ZWJ inside an emoji sequence is left to stage 5 |
| 4 | `chars.spaces` | all | |
| 5 | `chars.emoji` / `chars.emoji-presentation` | all | See below |
| 6 | `chars.bullets` | multiline | Only at line start followed by whitespace, so `terms*` and `5 * 3` are untouched |
| 7 | `chars.quotes` | when enabled | `‘’‚‛` → `'`, `“”„‟` → `"`; primes untouched |
| 8 | `ws.trim-lines` | all | |
| 9 | `ws.collapse-spaces` | all | Cleans up double spaces left by emoji removal |
| 10 | `lines.rejoin` / `lines.rejoin-hyphen` | multiline | See below |
| 11 | `lines.collapse-blank` | multiline | |
| 12 | `lines.single-line` | single-line | Break → space (keywords field: break → comma, via `keywords.separators`) |
| 13 | `ws.trim-field` | all | |
| 14 | `keywords.separators` | `kind: keywords` | |

**Emoji detection** works on grapheme clusters (`Intl.Segmenter`, available in Node 20 and all target browsers). A grapheme is removed when it contains a code point with `Emoji_Presentation`, contains `Extended_Pictographic` followed by VS16 (U+FE0F), is a keycap sequence (`[0-9#*] U+FE0F? U+20E3`), is a regional-indicator pair (a flag), or is a tag sequence. Skin-tone modifiers and ZWJ within the cluster go with it. Code points in `rules.emoji.preserve` (®, ™, ©) are never removed: a VS16 after them is dropped under `chars.emoji-presentation` and the symbol stays. A bare `#` or digit (as in "#1") is not a keycap and is untouched. Plain `Extended_Pictographic` symbols without emoji presentation (for example ✓ U+2713 or ★ U+2605) are kept and reported by `text.unclassified-chars`, so a person decides.

**Rejoin** examines each `\n` that separates two non-empty lines. The break is kept when any of these hold:

- the preceding line (trimmed) ends with a character in `rules.rejoin.terminal`;
- the next line matches `rules.rejoin.listItemPattern`;
- the preceding line is itself a list item and the next line is a list item (covered by the rule above);
- the break is part of a blank-line paragraph separator.

Otherwise the break is replaced with a single space (`lines.rejoin`). When `joinHyphenated` is on and the preceding line ends in `letter-` with a letter starting the next line, the break is removed without a space (`lines.rejoin-hyphen`) so that `multi-⏎platform` becomes `multi-platform` rather than `multi- platform`. The hyphen is kept, since removing it could change a word.

A short heading line without punctuation followed by a paragraph ("KEY FEATURES⏎Track your…") will be joined. This is expected: the reviewer reverts it, and the revert persists.

### 6.5 Counting

- `bytes`: UTF-8 length (`TextEncoder` is available in both environments).
- `chars`: as set by `rules.counting.chars`. The default `utf16` matches JavaScript `length` and is the most conservative of the three methods (an emoji counts as 2+). The method store consoles actually use must be verified (§15).
- `overflowOffset` returns the output offset of the first unit past the limit, adjusted to a grapheme boundary, so the UI highlights whole characters.

### 6.6 Checks

Checks run on the **output** text and do not depend on what normalization did. The same checks therefore work on text that is already clean (CLI check mode), and reverted changes are caught naturally: reverting an emoji removal surfaces `text.emoji-present`.

- **Limits and required**: per field definition.
- **Discouraged patterns** (fields whose `checks` include `"discouraged"`; v1: Apple name and subtitle, Play title and short description):
  - all-caps: a word of ≥ `minLetters` letters, all uppercase, not on `allow`. Pharma acronyms belong on the allow-list.
  - repeated punctuation: `rules.discouraged.repeatedPunctuation`. A single `…` is allowed.
  - terms: whole-word, case-insensitive, accent-insensitive matching. `#1` is matched literally.
- **Unclassified characters**: every code point in the output must fall into an allowed class: letters (L), marks (M), numbers (N), space, `\n`, punctuation (P), currency (Sc), math (Sm), modifier symbols (Sk), the `preserve` symbols, and an explicit list of common So symbols (°, №, ℃ and similar). Anything else (private use, unassigned, surrogates, control characters, remaining So pictographs) produces one warning per distinct code point, with its name and position.
- **Keywords**: split on `,`; compare entries after NFKC + case fold + accent strip; overlap check tokenizes the `related` fields on non-letters.

`processListing` runs every field and then the cross-field checks (keyword overlap), and returns a `ListingResult` with per-field results and listing-level findings.

### 6.7 Wording integrity check

Because the core promise is that wording never changes, the pipeline verifies it. After normalization, the baseline and the output are each reduced to a sequence of letter-and-number tokens (splitting on everything else, after NFC). Emoji graphemes removed by `chars.emoji` are excluded from the baseline sequence. If the two sequences differ, `integrity.wording` fails. In practice this can only fire through a library bug, and property-based tests (§13.3) aim to prove it never does, but it also guards against future rules that overstep.

### 6.8 Idempotence

`normalizeField(normalizeField(x).output)` must produce no changes. This is tested property-wise. It is what makes CLI check mode meaningful: text the web app exported passes `text.not-normalized`.

### 6.9 Import formats

**JSON template** (`listing.template.json`; the export format §8.3 is a superset and is accepted too):

```json
{
  "mulliganTemplate": 1,
  "locale": "default",
  "fields": {
    "apple.name": "Example Health",
    "apple.subtitle": "Track your symptoms",
    "google.short-description": "…"
  }
}
```

**CSV template**: header `field,value` (optional `locale` column), one row per field. Multi-line values use standard RFC 4180 quoting. Parsed with a small built-in RFC 4180 parser (no dependency).

**Encoding detection** (`decodeTextBytes`): agencies on Windows will often save CSV from Excel. In order: a BOM selects UTF-8/UTF-16LE/UTF-16BE; otherwise strict UTF-8 decoding is tried (`TextDecoder('utf-8', { fatal: true })`); on failure the file is decoded as `windows-1252`. The detected encoding is shown to the user.

Imported values go through `normalizeField` like pasted text. A value that looks like HTML (it contains tags such as `<p>`, `<br>` or `<li>`) is passed as `html`.

**.docx** (later enhancement): `mammoth` converts the document to HTML in the browser; the template would be a two-column table (field id | copy) or headings named after field labels. Each cell's HTML then follows the normal path. This needs no change to core, apart from an optional `parseListingDocxHtml` mapper.

---

## 7. Image pipeline

### 7.1 Inspection

`inspectImage(header)` parses the first bytes of a file without decoding pixels:

- PNG: signature, IHDR width/height, bit depth, colour type (so it knows whether an alpha channel exists), presence of `tRNS`, `iCCP`, `acTL` (animated).
- JPEG: SOF0–SOF15 dimensions, component count (CMYK detection), APP1 EXIF orientation, APP2 ICC presence.
- Returns `{ type, width, height, orientedWidth, orientedHeight, orientation, hasAlphaChannel, animated, iccProfile }`.

The same function verifies renderer **output** (§7.4), and is what the CLI will use to check existing images.

### 7.2 Planning

`planImage(src, preset, s)` returns:

```ts
interface ImagePlan {
  presetId: string;
  source: { width: number; height: number };            // oriented dimensions
  crop: { x: number; y: number; width: number; height: number };   // integers, in oriented source pixels
  target: { width: number; height: number };
  scale: number;                                         // target.width / crop.width
  format: 'png' | 'jpeg';
  jpegQuality?: number;
  alpha: boolean;
  flatten?: string;                                      // hex colour when alpha is false
  findings: Finding[];                                   // planning-time findings (upscale, crop loss)
}
```

Crop algorithm, with `rT = tw/th` and `rS = sw/sh`:

- If `rS > rT` (the source is too wide): `cropH = sh`, `cropW = round(sh × rT)`, and `x` is set by the horizontal anchor (left → 0, center → `floor((sw − cropW)/2)`, right → `sw − cropW`), `y = 0`.
- Otherwise (too tall, or exact): `cropW = sw`, `cropH = round(sw / rT)`, and `y` is set by the vertical anchor (top → 0, center, bottom), `x = 0`.
- The `anchor` shorthands are `top` = {x: center, y: top} and `center` = {x: center, y: center}. The schema also accepts an object `{ x, y }` for future presets.
- Rounding can leave a sub-pixel aspect error. This is absorbed by the final resize to exact target dimensions.

Findings:

- `image.upscaled` when `scale > input.upscaleWarnAbove`, with `data.factor`.
- `image.crop-loss` when the crop discards more than `cropLossWarnAbove` of the axis the anchor does not protect. For screenshots that is the width: a landscape capture cropped to a portrait strip triggers it. Discarding the bottom of a long top-anchored capture is expected and does not trigger it.

### 7.3 PixelEngine interface

```ts
interface RenderRequest {
  source: ArrayBuffer | Uint8Array;    // encoded source bytes
  plan: ImagePlan;
  preview?: { maxEdge: number };       // render a reduced preview instead of the full output
}
interface RenderedImage {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  measured: { hadTransparentPixels: boolean };
}
interface PixelEngine {
  render(req: RenderRequest): Promise<RenderedImage>;
}
```

The interface is defined in core (types only). Renderers implement it and are tested against the shared fixtures for exact dimensions and close visual similarity (§13.4).

### 7.4 Browser renderer (`@mulligan/render-canvas`)

Runs inside a dedicated worker:

1. `createImageBitmap(blob, crop.x, crop.y, crop.w, crop.h, { imageOrientation: 'from-image', colorSpaceConversion: 'default', premultiplyAlpha: 'none' })`. Cropping at decode time means a 1440 × 20000 capture never needs a full-size canvas, which keeps memory down and avoids per-browser canvas size limits.
2. Draw the bitmap to an `OffscreenCanvas` at crop size and run `pica.resize` (Lanczos3, `unsharpAmount: 0`) to target size. The Lanczos3 filter is chosen because it is what `sharp` uses by default, which keeps the browser and Node outputs visually close.
3. When `alpha` is false: scan for alpha < 255 (sets `hadTransparentPixels`), composite over `flatten`, and treat the result as opaque.
4. Encode:
   - PNG without alpha: `fast-png` with `channels: 3`, so the file has colour type 2 (RGB) and no alpha channel. Apple rejects icons that carry an alpha channel even when it is fully opaque, and canvas PNG encoders do not reliably drop it.
   - PNG with alpha: `fast-png` with `channels: 4`.
   - JPEG: `OffscreenCanvas.convertToBlob({ type: 'image/jpeg', quality })`.
5. Return bytes, transferred rather than copied.

Re-encoding strips all metadata, including EXIF and GPS. Output is sRGB. Wide-gamut (P3) sources are converted on decode, and `iccProfile` from inspection is noted in the manifest.

The core then runs `checkRendered(plan, out)`. It re-inspects the encoded bytes and verifies dimensions, format, absence of an alpha channel when required, and `maxBytes`, and converts `hadTransparentPixels` into `image.transparency-flattened`. A preset that exceeds `maxBytes` (realistically only the 1 MB Play icon from a noisy source) fails, and v1 makes no automatic attempt to recompress it (§15).

### 7.5 Node renderer (later, `@mulligan/render-node`)

`sharp`: `.rotate()` (EXIF) → `.extract(crop)` → `.resize(target, { kernel: 'lanczos3' })` → `.flatten({ background })` when alpha is false → `.png({ palette: false })` / `.jpeg({ quality })` → `.removeAlpha()` where required. It implements the same interface and passes the same fixture suite.

---

## 8. Packaging

### 8.1 File naming

- `sourceSlug(name)`: strip the extension, NFKD-decompose and drop combining marks, lowercase, replace runs of anything outside `[a-z0-9]` with `-`, trim `-`, cap at 60 characters, fall back to `image` if empty, and suffix Windows reserved device names with `-file` (§10.4). `Home Screen (Final).PNG` → `home-screen-final`. User-supplied names are never used in a path in any other form.
- Sequence: position within its group in the user's order, starting at 1, padded to two digits (three if the group exceeds 99). Numbering is per group and identical across that group's presets, so `03` means the same source in every screenshot folder.
- Path: `{preset.folder}/{seq}_{slug}{fileSuffix ? '_' + fileSuffix : ''}.{ext}`, for example `iphone-6.9/01_home-screen.png` and `icons/01_logo_apple-1024.png`.
- `planPackage` detects path collisions (only possible if two presets share a folder without suffixes, which is a configuration error) and returns them as failures.

### 8.2 ZIP layout

```
mulligan-2026-10-25-1430.zip
├─ manifest.json
├─ iphone-6.9/01_home-screen.png …
├─ ipad-13/…
├─ android-phone/…
├─ play-feature-graphic/01_feature.png
├─ icons/01_logo_apple-1024.png
├─ icons/01_logo_play-512.png
└─ listing/
   ├─ listing.json
   └─ listing.txt
```

A folder appears only when it has content. `listing/` appears only when at least one field has input. The CLI fix mode will write the same tree to a directory.

`planPackage` returns `PackageEntry[]` of `{ path, source: { kind: 'render', sourceId, presetId } | { kind: 'text', content } }`. The app resolves render entries from its cache (§9.4) and streams them into `fflate`.

### 8.3 Listing exports

`listing.json`:

```jsonc
{
  "mulliganListing": 1,
  "libraryVersion": "1.0.0",
  "rulesetVersion": "1.0.0",
  "standardsHash": "sha256:…",
  "exportedAt": "2026-10-25T14:30:00Z",
  "locale": "default",
  "fields": {
    "apple.name": {
      "value": "Example Health",
      "count": 14, "limit": 30, "unit": "chars",
      "status": "pass",
      "findings": [ /* Finding[] */ ],
      "changes": [ /* Change[] incl. reverted ones */ ],
      "options": { "straightQuotes": false }
    }
  },
  "listingFindings": [ /* cross-field */ ]
}
```

It is accepted back as an import, through `fields.*.value`.

`listing.txt`: for each store and field, a header line `== Apple · App name (14/30 chars) ==`, then the cleaned value and a blank line. It is meant for people to read and copy from.

### 8.4 Manifest

```jsonc
{
  "mulliganManifest": 1,
  "libraryVersion": "1.0.0", "rulesetVersion": "1.0.0", "standardsHash": "sha256:…",
  "app": { "name": "mulligan-web", "build": "<git sha>" },
  "createdAt": "…",
  "sources": [ { "id": "…", "group": "screenshot", "seq": 1, "fileName": "Home Screen.png",
                 "sha256": "…", "width": 1290, "height": 9120, "type": "image/png", "iccProfile": false } ],
  "outputs": [ { "path": "iphone-6.9/01_home-screen.png", "presetId": "iphone-6.9", "sourceId": "…",
                 "width": 1320, "height": 2868, "bytes": 2483113, "sha256": "…",
                 "crop": { "x": 0, "y": 0, "width": 1290, "height": 2803 }, "status": "warning",
                 "findings": [ … ] } ],
  "listing": { "path": "listing/listing.json", "status": "pass" },
  "findings": [ /* group- and package-level */ ],
  "summary": { "pass": 41, "warning": 3, "failure": 0 }
}
```

The app computes hashes with `crypto.subtle` in the worker. Core takes them as input (`ManifestInput`) and builds the object.

---

## 9. Web application (`apps/web`)

### 9.1 Stack

| Concern | Choice |
| --- | --- |
| Framework | React 19, function components, TypeScript strict |
| Build | Vite; hashed assets; workers via `new Worker(new URL(…), { type: 'module' })` |
| State | `zustand` with slices; derived results held in a separate non-persisted store |
| Worker RPC | `comlink` |
| Drag and drop / reorder | `@dnd-kit/core` + `@dnd-kit/sortable` (keyboard and screen-reader support) |
| Persistence | `idb` (thin IndexedDB wrapper) |
| ZIP | `fflate` (streaming `Zip` + `ZipPassThrough` for already-compressed PNG/JPEG) |
| Styling | CSS Modules with a small set of design tokens; no runtime CSS-in-JS |
| Tests | Vitest + React Testing Library; Playwright for end-to-end tests |

### 9.2 Source layout

```
apps/web/src/
├─ main.tsx, App.tsx
├─ core-bridge/            # the only place that imports @mulligan/core; thin, typed wrappers + memoization
│  ├─ standards.ts         # getStandards(), grouped views for the UI
│  ├─ text.ts              # processListing with memoization by input hash
│  └─ images.ts            # inspect/plan wrappers, checkRendered
├─ render/
│  ├─ render.worker.ts     # hosts @mulligan/render-canvas + hashing
│  ├─ pool.ts              # worker pool, job queue, cancellation, priority
│  └─ cache.ts             # render cache (§9.4)
├─ state/
│  ├─ session.ts           # persisted slice: images, order, selections, fields, reverts
│  ├─ results.ts           # derived slice: plans, renders, field results (never persisted)
│  └─ persistence.ts       # IndexedDB sync, migrations, quota handling
├─ features/
│  ├─ images/              # DropZone, SourceList (sortable), PresetPicker, PreviewGrid, CropOverlay
│  ├─ listing/             # ListingForm, FieldEditor, PasteHandler, SideBySide, ChangeList, CountMeter
│  ├─ import/              # TemplateImport, template download links
│  └─ package/             # PackageSummary, FindingsTable, DownloadButton
├─ ui/                     # generic components: Badge, Tabs, Button, Toast, Dialog
└─ styles/
```

`core-bridge/` contains only adapters. A review rule (and a lint rule banning numeric dimension and limit literals outside tests) keeps rules from leaking into the app.

### 9.3 Screens and flows

A single page with three tabs and a persistent status bar, which shows the worst severity per tab and overall.

**Images**

- Three drop zones from `standards.groups`: Screenshots (multi-file), Feature graphic (one file), App icon (one file). `maxFiles` comes from config, and dropping onto a full single-file zone replaces its file after confirmation. Each zone also has a file picker button.
- On drop: read the first 64 KB → `inspectImage` → reject unsupported or oversized files with findings shown on the zone. Accepted files are added in the order received, then stored to IndexedDB.
- The screenshot list is sortable by drag and by keyboard, and shows the sequence numbers that will appear in file names.
- Preset picker: checkboxes grouped by group, then store, with `defaultSelected` from config. Each preset shows its dimensions and notes.
- Preview grid: one card per (source × selected preset in that group). Each card shows the source thumbnail with the crop rectangle drawn from `plan.crop`, the rendered preview, and findings. Clicking opens a larger view.

**Listing**

- A form generated from `standards.fields`, grouped by store. Each field has a source input, an options row (straight quotes), a count meter (live, against the limit, red past the limit with the overflow highlighted), a status badge and a copy button for the cleaned value.
- Paste handler: on `paste`, read `text/html` and `text/plain` from `clipboardData` and call `preventDefault`. The source box stores both flavours. Typing edits `text` only and clears `html` after confirmation ("Discard rich formatting?").
- Side-by-side view (expandable per field): baseline on the left and output on the right, with change spans highlighted on both sides and linked on hover or focus. Below it, a change list grouped by rule with a revert toggle per revertible change, and findings with messages.
- Import: CSV or JSON template (file picker or drop). It fills the source inputs (confirming before overwriting non-empty fields) and shows import findings. Template files are downloadable from the page.

**Package**

- A summary of what will be produced: file count per folder, the listing, and all findings in one sortable table (severity, subject, rule, message).
- Download button. If any failures exist, a dialog lists them and asks for confirmation; the manifest records them either way. Downloading never silently truncates or drops anything.

### 9.4 Rendering, caching and scheduling

- **Cache key**: `sha256(source) + presetId + rulesetVersion + rendererVersion`. Cached outputs are Blobs in memory and are not persisted, since they can be regenerated.
- **Previews vs. full renders**: previews (max edge 480 px) are rendered at high priority as soon as a source and preset are present. Full renders run in the background at low priority, so that `checkRendered` findings (encoded size, alpha) appear before download. Download waits for any outstanding full renders and shows progress.
- **Pool**: `min(navigator.hardwareConcurrency − 1, 4)` workers, at least 1. Jobs for a deselected preset or removed source are cancelled. A reorder does not trigger a re-render, because sequence numbers affect paths only.
- **Main-thread text processing**: `processListing` runs synchronously, debounced to 150 ms after input. It is fast for 4,000-character fields; a 10 ms per-field budget is asserted in tests, and the work can move to a worker without API change if it ever exceeds that.

### 9.5 Session persistence

IndexedDB database `mulligan`, version 1:

| Store | Key | Value |
| --- | --- | --- |
| `session` | `"current"` | `{ schemaVersion, rulesetVersion, groups: { [groupId]: SourceRef[] }, selectedPresetIds, fields: { [fieldId]: { raw, options, reverted: ChangeId[] } }, updatedAt }` |
| `blobs` | source id (UUID) | `{ blob: Blob, name, type, sha256, size }` |

- Writes are debounced (500 ms) and transactional. Source blobs are written once, on drop.
- On load, the app checks `schemaVersion` (migrations are run in order) and `rulesetVersion`. If the ruleset differs, results are recomputed and any revert IDs that no longer exist are dropped, with a notice ("2 reverted changes no longer apply after the rules update").
- "Clear session" deletes both stores after confirmation.
- `navigator.storage.persist()` is requested on first image drop. `navigator.storage.estimate()` is checked before storing a blob: if the session would exceed its quota (§10.8), the image is still processed but is not persisted, and the user is told.

### 9.6 Accessibility and browser support

- Targets: current and previous major versions of Chrome and Edge (the primary Windows work machine), Firefox, and Safari 17+.
- Requirements: module workers, `OffscreenCanvas`, `createImageBitmap` with crop, `Intl.Segmenter`, `CompressionStream` (not required, since `fflate` covers ZIP).
- An unsupported browser gets a single blocking message rather than partial behaviour, detected by feature checks at start-up.
- WCAG 2.2 AA: drop zones are keyboard-operable buttons, reordering uses dnd-kit's keyboard sensor with live-region announcements, and severity is never conveyed by colour alone.

---

## 10. Security, privacy and resource limits

Mulligan is a **public site with no access control**. That is reasonable because there is no server-side data to protect: files and text never leave the user's machine, and the bucket serves only the application code. Security therefore comes down to two things: (a) only the code we built and reviewed runs on the Mulligan origin, and (b) nothing outside the user's own actions can get content into a session, and through it into a download.

### 10.1 Threat model

| # | Threat | Example | Primary controls |
| --- | --- | --- | --- |
| T1 | **Session injection by link** | A crafted URL or redirect (`mulligan.example/?import=https://evil/x.png`, `#session=…`) preloads a file or listing that the user then downloads as their own package | No URL-driven input (§10.2); `connect-src 'none'` |
| T2 | **Cross-window injection** | An attacker page opens or frames Mulligan and uses `postMessage`, `window.opener` or an overlay (clickjacking) to feed it content or trick the user into dropping it | No message listeners; `frame-ancestors 'none'`; COOP `same-origin` (§10.3) |
| T3 | **Malicious input file** | A polyglot or exploit image, an SVG with script, a decompression bomb, a hostile file name, a crafted JSON template | Magic-byte allow-list, header-first pixel limit, full re-encode, generated file names, schema-validated import (§10.4) |
| T4 | **Script injection (XSS)** | Pasted HTML or imported text reaches a DOM sink | Text-only rendering, Trusted Types, strict CSP (§10.3) |
| T5 | **Tampered application code** | The bucket, the deploy pipeline or a dependency is compromised, so every visitor runs hostile code | Deploy and supply-chain controls (§10.5). This is the only threat that defeats every in-page control, so it gets the most attention. |
| T6 | **Lookalike copy of the site** | Someone hosts a modified Mulligan on another domain | Cannot be prevented technically; mitigated by a single canonical domain and HSTS (§10.6) |
| T7 | **Data left on a shared machine** | An autosaved session (IndexedDB) remains for the next user of a shared computer | Clear-session control, retention notice, dedicated origin (§10.7) |
| T8 | **Cost abuse** | Traffic floods against a public CloudFront distribution | Shield Standard, optional WAF rate rule, budget alarm (§10.6) |

**Why CORS is not a control here.** CORS is a mechanism by which a *server* relaxes the same-origin policy so that pages on *other* origins may read its responses. It does not prevent other sites from linking to, opening or framing Mulligan, and it places no restriction on what Mulligan's own page loads or does. The protection against T1/T2 comes from the browser's default same-origin policy (no other origin can read Mulligan's DOM, storage or memory), from Mulligan having no input channel other than user gestures, and from CSP, `frame-ancestors` and COOP. The S3/CloudFront configuration must **not** set any `Access-Control-Allow-Origin` header: Mulligan needs none, and adding `*` would only widen exposure.

### 10.2 Input channels: user gestures only

The application accepts content through exactly four channels, all of which require a user gesture on the Mulligan page itself:

1. Files dropped onto a drop zone.
2. Files chosen with a file picker.
3. Clipboard paste into a field.
4. Typing.

Session restore from IndexedDB is a fifth, internal channel. Only the Mulligan origin can write to it.

Constraints that follow, each enforced by lint rules (`no-restricted-globals` / `no-restricted-properties` / `no-restricted-syntax`) and by code review:

- **No URL-driven state.** The app does not read `location.search`, `location.hash` or path segments to load, import, select or prefill anything, and there is no client-side router. Unknown query strings are ignored. A link to Mulligan can only ever open an empty app or the user's own saved session.
- **No remote fetch.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon` in application code. Template files offered for download are static assets reached by `<a href download>`, not fetched. At runtime, `connect-src 'none'` (§10.3) makes this hold even for dependency code.
- **No cross-window messaging.** No `message` event listeners on `window` (worker messaging through comlink uses dedicated `Worker` objects, which other origins cannot reach). The app never calls `window.open` or reads `window.opener`.
- **No drop outside the zones.** `dragover`/`drop` on the document are cancelled so a stray drop cannot navigate the tab to a file or load it. Only the zones accept files, and only from `DataTransfer.files` (`text/uri-list` and `text/html` drag payloads are ignored, so dragging a link from another page cannot import a remote resource).
- **No service worker.** Mulligan registers none. CSP `worker-src` excludes service worker scripts from other origins, and the deploy includes a check that no `sw.js` or `navigator.serviceWorker.register` exists in the build.
- **Imports are confirmed.** Importing a template or restoring a session never silently overwrites existing input (§9.3, §9.5).

### 10.3 Browser-enforced policy (response headers)

All headers are set by a CloudFront **response headers policy**, not by `<meta>` tags in `index.html`. If the bucket were tampered with, the attacker still could not relax the policy without separate access to the CloudFront configuration.

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self';
  style-src 'self';
  img-src 'self' blob: data:;
  font-src 'self';
  connect-src 'none';
  manifest-src 'self';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  frame-src 'none';
  frame-ancestors 'none';
  require-trusted-types-for 'script';
  trusted-types 'none';
  upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), payment=(), clipboard-read=()
```

Notes:

- `connect-src 'none'` blocks every script-initiated network request, including requests back to Mulligan's own origin, so data cannot be sent even to our own access logs. If a later feature needs a same-origin request, it is changed to `'self'` deliberately and reviewed.
- `wasm-unsafe-eval` permits WebAssembly compilation (pica's resampler) without permitting JavaScript `eval`. Module workers are built as same-origin files, so `blob:` is not needed in `worker-src`. Any library that builds a worker from a Blob URL is configured not to, or replaced.
- `trusted-types 'none'` with `require-trusted-types-for 'script'` makes every DOM XSS sink (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, string `src` on scripts) throw. React renders through safe DOM APIs and is compatible. A dependency that needs a sink fails in testing rather than in production. Firefox has no Trusted Types support yet; there, CSP and the text-only rendering rule are the controls.
- COOP `same-origin` severs `window.opener` in both directions, so a page that opened Mulligan cannot navigate or script it (T2, reverse tabnabbing). COOP + COEP also make the page cross-origin isolated, which costs nothing here because nothing cross-origin is loaded.
- Clipboard access is by paste event only; `clipboard-read=()` disables the asynchronous clipboard read API, so the page can never read the clipboard without a paste gesture.
- A CSP `report-to` endpoint is **not** configured, because sending reports would be a network call. Violations surface in development and end-to-end tests, which run against the production header set (§13.5).
- Development uses a relaxed CSP (Vite HMR needs `connect-src ws:`). That CSP is applied only by the dev server and is never deployed.

### 10.4 Handling hostile input files

The design assumes every input file may be hostile. Several earlier sections already provide the controls; together they mean nothing from an input file reaches an output file except decoded pixels and normalized text.

- **Type by content, not name.** `inspectImage` accepts only PNG and JPEG by magic bytes (§7.1). SVG, which can carry script, is never accepted. Neither are HTML, PDF, WebP, GIF or anything else, whatever the extension or the MIME type the browser reports.
- **Bounds before decode.** Dimensions are read from the header, and the pixel limit (§10.8) is applied *before* the image is decoded, which defeats decompression bombs (a 50 KB PNG that claims 100,000 × 100,000). Decoding happens in a worker, so a hung or crashed decode cannot freeze the page (§11).
- **Decoding is the browser's job.** Mulligan includes no image *decoder* of its own. Malformed files are handled by the browser's sandboxed, fuzzed decoders. `fast-png` is used only to *encode*.
- **Full re-encode.** Every output is encoded from raw pixels (§7.4). Polyglot files, trailing data, metadata (EXIF, XMP, ICC text, PNG text chunks) and any embedded payload do not carry over. Core's `checkRendered` re-inspects each output, and `planPackage` also asserts that every image entry's first bytes match its declared type.
- **Generated file names only.** No user-supplied name is used as a path. Every ZIP path is built by core from `preset.folder` (from config) and `sourceSlug(name)`, which is restricted to `[a-z0-9-]`, so `../`, absolute paths, drive letters, backslashes, NUL and control characters, trailing dots and spaces, and over-long names cannot occur (no zip-slip). Slugs that equal a Windows reserved device name (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`) get a `-file` suffix. The original file name is kept only as a JSON string value in the manifest.
- **Output extension allow-list.** `planPackage` emits only `.png`, `.jpg`, `.json` and `.txt` entries and fails on anything else, so a configuration error or future feature cannot put an executable or HTML file into the download.
- **Imported templates are data.**
  - JSON is parsed with `JSON.parse` and validated with a zod schema that only accepts the documented shape: field ids must exist in the standards (unknown ids raise `import.unknown-field` and are dropped), all values must be strings, and the size is capped (1 MB file, 20,000 characters per value).
  - Lookups use `Map` or `Object.hasOwn` against standards-defined ids, never plain-object indexing with user keys, so `__proto__` and `constructor` keys cannot cause prototype pollution.
  - CSV values that begin with `=`, `+`, `-`, `@`, tab or CR are imported as text (they are listing copy). Mulligan exports no CSV in v1. If CSV export is added, values starting with those characters must be prefixed with `'` to prevent formula injection when opened in Excel.
- **No regular-expression denial of service.** All patterns that run on user text, including the configurable ones in `rules.*`, must be linear-time: no nested quantifiers and no backreferences inside repetition. A unit test runs every configured pattern against 100 KB adversarial strings within a time budget. `parseStandards` (used by future CLI overrides) applies the same validation.
- **Pasted HTML stays text.** Pasted HTML is parsed by `htmlparser2` into text and is never inserted into the DOM. The side-by-side view and every other display of user text render React text nodes only. `dangerouslySetInnerHTML` is banned by lint and blocked at runtime by Trusted Types.

### 10.5 Integrity of the code we serve

On a public site, the realistic way to harm users is to change what the origin serves (T5). The controls:

**Hosting**
- Private S3 bucket (Block Public Access on, no website endpoint, no S3 redirect rules) behind CloudFront with Origin Access Control. CloudFront has no redirect or rewrite behaviour that takes a URL parameter, so there is no open redirect on the Mulligan domain. A CloudFront Function maps only `/` to `/index.html` and returns 404 for everything not in the build.
- Bucket writes are allowed **only** for the CI deploy role. That role is assumed through GitHub Actions OIDC, restricted to the protected `main` branch and the `production` environment (which requires approval). There are no long-lived AWS keys.
- S3 versioning is on, for one-step rollback. CloudTrail S3 data events, with an EventBridge rule, raise an alert on any `PutObject`/`DeleteObject` not made by the deploy role.

**Build and supply chain**
- `pnpm install --frozen-lockfile`. pnpm's `minimumReleaseAge` (for example 7 days) keeps freshly published, possibly hijacked dependency versions out. Dependency updates arrive through Renovate PRs and need review. Install scripts are disabled except for an explicit allow-list (`onlyBuiltDependencies`).
- `pnpm audit` and an SCA scan run in CI, and high-severity issues block the build.
- Runtime dependencies are kept to the short list in §9.1 and §7.4. Each addition is justified in its PR.
- Builds are reproducible from a tagged commit. CI publishes a SHA-256 list of the deployed files as a release artifact, and a scheduled job compares the live site with it, raising an alert on drift.
- Subresource Integrity attributes are added to the scripts and stylesheets in `index.html` (`vite-plugin-sri` or equivalent). This adds protection against a tampered asset served under an unchanged `index.html`.
- `@mulligan/core` packages are published with npm provenance from CI only.

### 10.6 Public hosting

- **Canonical domain.** Mulligan is served from a **dedicated origin** (for example `mulligan.<company-domain>`), never from a path on a site that serves other content. The origin is the browser's security boundary for IndexedDB, CSP and Trusted Types, so sharing it with other apps would let their scripts read Mulligan sessions. HSTS with `preload`, CAA records for the certificate authority, and certificate transparency monitoring for the name.
- **Lookalike copies (T6).** A modified copy on another domain cannot be prevented, because the code is public by nature. The "About" panel shows the canonical URL, the library and ruleset versions, and the build hash, so a user or reviewer can check what produced a package against the published release. The manifest records the same values, but since a modified copy could fake them, they establish provenance for honest builds rather than proving authenticity.
- **Cost and availability (T8).** CloudFront with Shield Standard (automatic). An optional AWS WAF rate-based rule per IP; it is a cheap backstop because the site is only a few static files. An AWS Budgets alarm on the account.
- **Caching.** `index.html` is served `no-cache`; hashed assets get `max-age=31536000, immutable`. Error responses (403/404) are not cached for long, so a bad deploy can be rolled back quickly.
- **No third-party content.** No analytics, tag managers, chat widgets, ads or social embeds. A privacy note in the app states that files and text never leave the device, and the CSP is what guarantees it.

### 10.7 Data on the user's machine

- The autosaved session is readable only by scripts on the Mulligan origin. That is why §10.5 and §10.6 matter.
- Because the site is public and may be used on shared computers:
  - The first time a session is saved, a dismissible notice explains that work is kept in this browser until cleared.
  - "Clear session" is always visible in the header and removes IndexedDB data and in-memory renders.
  - Sessions untouched for 30 days are deleted on the next load (configurable in `config.ts`).
  - In private-browsing windows, storage is ephemeral or unavailable, and the app degrades to in-memory mode (§11).
- Blob URLs created for previews and downloads are revoked once they are no longer displayed or after the download starts.

### 10.8 Resource limits (app configuration, not standards)

These protect browser memory. They belong to the app, not the ruleset, because the CLI will have different constraints. They live in `apps/web/src/config.ts`.

| Limit | Default |
| --- | --- |
| Max file size | 50 MB |
| Max decoded pixels per source | 150 MP (for example 1440 × 100,000) |
| Max screenshots per session | from `groups.screenshot.maxFiles` (10) |
| Max persisted image bytes per session | 500 MB |
| Concurrent full renders | pool size (≤ 4) |

Files over a limit are rejected with `image.too-large`. The core rule takes the limit values as a parameter.

---

## 11. Error handling

- Core returns findings for all input problems. Renderers reject with typed errors (`DecodeError`, `EncodeError`, `OutOfMemoryError` when the browser raises one), which the app converts into `image.decode-failed` or `image.too-large` findings on the source.
- A worker crash is caught by the pool: the worker is replaced and the job retried once, then reported as a failure.
- IndexedDB failures (private browsing, quota) degrade to in-memory operation with a persistent banner and never block work.
- Unexpected exceptions are caught by a React error boundary per tab, which offers "Reload (your session is saved)".

---

## 12. Future CLI (design constraints only)

Not built in v1. The core API above is shaped so the CLI is a thin wrapper:

- `mulligan check <dir|listing>`: `inspectImage` + `checkRendered`-style verification on existing files mapped to presets by folder name, and `normalizeField(..., { mode: 'check' })` on listing files.
- `mulligan fix <input> --out <dir>`: `planPackage` + `@mulligan/render-node`, writing the same tree as the ZIP.
- Reporters: JSON (the `Finding` shape as it is) and JUnit XML (one `testsuite` per subject, one `testcase` per ruleId; failures → `<failure>`, warnings → `<skipped>` or properties, configurable).
- Exit code from `summarize()`: 1 on any failure, or on warnings with `--strict`.
- `mulligan.config.json` in the project: pinned library version (checked against the running version) and `StandardsOverride`. Overrides are listed in every report.

---

## 13. Testing

### 13.1 Layers

| Layer | Tooling | Runs in |
| --- | --- | --- |
| Core unit + fixture tests | Vitest | Node 20 **and** Chromium, Firefox, WebKit (Vitest browser mode with the Playwright provider) |
| Core property tests | `fast-check` | Node + Chromium |
| Renderer fixture tests | Vitest browser mode (canvas renderer); Node (future sharp renderer) | per renderer |
| Web component tests | Vitest + RTL + jsdom | Node |
| End-to-end | Playwright | Chromium, Firefox, WebKit, against the production build |

### 13.2 Fixtures

```
fixtures/text/<case>/
  input.txt | input.html         # raw clipboard flavours (captured from real Word, Google Docs, web pages)
  field.json                     # { "fieldId": "apple.description", "options": {…}, "suppress": [] }
  expected.json                  # { output, changes: [{ ruleId, before, after }], findings: [{ ruleId, severity }] }
fixtures/images/<case>/
  source.png | source.jpg
  expected.json                  # per preset: plan (exact), findings (exact), output dims/format/alpha (exact)
  golden/<presetId>.png          # reference render for visual comparison
```

Required cases, as listed in the requirements and extended:

- Text: Word paste with headings, bullets and numbered lists; Word manual line breaks (VT); Google Docs paste; web page paste with `&nbsp;` and entities; PDF hard-wrapped text; hyphenated wraps; emoji incl. ZWJ families, skin tones, flags, keycaps; ®/™/© with and without VS16; "#1" next to "1️⃣"; invisible-character soup; NBSP and narrow NBSP; curly quotes on and off; over-limit with multibyte characters in keywords; duplicate and overlapping keywords; all-caps acronyms on and off the allow-list; Windows-1252 CSV with curly quotes; UTF-16 CSV from Excel.
- Images: long website capture (1290 × 12000); exact-size source; undersized icon (256 × 256); landscape screenshot into portrait preset; transparent PNG into no-alpha preset; JPEG with EXIF orientation 6; CMYK JPEG; 16-bit PNG; animated PNG; corrupt file; a non-image renamed `.png`; a noisy icon that exceeds 1 MB at 512 × 512.

### 13.3 Properties

- Idempotence: `normalize(normalize(x).output)` has no changes.
- Wording invariance: `integrity.wording` never fails, for arbitrary strings built from words, punctuation, whitespace, emoji and invisible characters.
- Trace soundness: applying every change's `before → after` to the baseline at `baselineSpan` reproduces `output`; with all revertible changes suppressed, the output differs from the baseline only by non-revertible changes.
- Crop: for random source and target dimensions, the crop lies within the source, its aspect is within 1 px of the target, and the anchored edge is respected.

### 13.4 Renderer comparison

Exact: output dimensions, format, colour type/alpha, `hadTransparentPixels`. Approximate: SSIM ≥ 0.98 against `golden/` (golden files are produced by the canvas renderer in v1, and must also be matched by the sharp renderer when it arrives).

### 13.5 End-to-end scenarios

Drop six screenshots out of order → reorder → select three presets → download → unzip in the test and assert the 18 paths, dimensions and manifest. Paste Word HTML → revert a rejoin → reload → the revert persists → export. Over-limit field → download confirmation dialog.

Security scenarios (run against a local server applying the production CloudFront header set): the page loads with zero CSP violations; opening the app with `?import=…`, `#…` and arbitrary paths yields an empty session; a `postMessage` from another window and a `text/uri-list` drag are ignored; a framing page cannot display the app; an SVG, an HTML file renamed `.png`, a header-declared 100,000 × 100,000 PNG and a polyglot PNG/ZIP are rejected or re-encoded clean; a template with `__proto__` keys and file names such as `../../evil.exe` or `CON.png` produce only safe paths and data; the downloaded ZIP contains only allow-listed extensions.

---

## 14. Build, release and milestones

### 14.1 CI (any provider; GitHub Actions assumed)

`pnpm install --frozen-lockfile` → typecheck → lint + dependency-cruiser → core tests (Node + browsers) → renderer tests → web tests → build → Playwright end-to-end → standards lock check. Releases of `@mulligan/core` go through Changesets. The web app build embeds the core version and the git SHA.

Deployment (protected `production` environment, OIDC role, §10.5): `vite build` → header-policy and build checks (no service worker, no `connect-src` widening, output file allow-list) → `aws s3 sync dist/ s3://… --delete` with cache headers set per path → CloudFront invalidation of `/index.html` → publish the SHA-256 file list. Bucket and CloudFront configuration (including the response headers policy) live in infrastructure-as-code in this repository, so header changes are reviewed like code.

### 14.2 Milestones

| # | Scope | Exit criteria |
| --- | --- | --- |
| M0 | Monorepo, tooling, boundary enforcement, CI skeleton, standards schema + v1 file | `core` builds with no DOM lib; dep-cruiser rules active |
| M1 | Core text: extraction, trace, stages, checks, import parsers, fixtures | All text fixtures and properties pass in Node and three browsers |
| M2 | Core image: inspect, plan, checks; `render-canvas`; image fixtures | Image fixtures pass; golden files recorded |
| M3 | Web: images tab (zones, ordering, presets, previews, worker pool) | Can produce correct renders for every preset |
| M4 | Web: listing tab (paste, form, side-by-side, reverts, import) | Text end-to-end scenarios pass |
| M5 | Packaging, manifest, listing exports, persistence, Package tab | Full end-to-end scenarios pass |
| M6 | Hardening: limits, error paths, accessibility audit, CSP, deployment | Release candidate; store limits verified |
| Later | .docx import; `render-node`; CLI; JUnit reporter; locales | |

---

## 15. Assumptions and open items

Defaults chosen in this document that you should confirm or change:

1. **Character counting** for `chars` limits defaults to UTF-16 code units (the strictest). It must be checked against how App Store Connect and the Play Console actually count. The setting is in config, so this is a one-line change.
2. **Ordered lists** keep their numbers (`1. `) rather than becoming en-dash bullets, since step numbers can carry meaning. Set `rules.lists.orderedStyle` to `"dash"` to follow the requirements literally.
3. **Hyphenated wraps** are joined without a space (`lines.rejoin-hyphen`), as a separate rule that can be reverted.
4. **Keyword separators**: line breaks, `;` and full-width `，` in the keywords field are treated as commas.
5. **Flatten colour** for no-alpha presets is white, configurable per preset.
6. **All screenshot presets are PNG without alpha.** Neither store requires PNG for screenshots, but it is lossless. The Play size caps (8 MB screenshots, 15 MB feature graphic) are included and need verification.
7. **The Play icon over 1 MB** fails, with no automatic recompression (for example palette quantization). Adding recompression later would be a renderer feature, controlled by preset config.
8. **Downloading with failures** is allowed after confirmation, and the failures are recorded in the manifest. The alternative is to block the download.
9. **Discouraged terms list and all-caps threshold** are starting values. Your MLR or brand teams may want a project allow-list (product names, approved acronyms).
10. **Required fields**: Apple name, description, keywords; Play title, short and full description. "What's New" and release notes are optional (they apply only to updates).
11. **Access control**: none. The site is public (decided 2026-10-25); §10 sets out the constraints that make this safe.
12. **Batch and file limits**: §10.8 defaults answer the requirements' open question about memory limits.
13. **Package registry**: core publishes to a private registry (GitHub Packages or CodeArtifact) until a decision is made about going public. Nothing in the design depends on the choice.
14. **Locales**: data and export formats carry a `locale` key (`"default"` in v1). Multi-locale UI is out of scope, but no format change will be needed to add it.
