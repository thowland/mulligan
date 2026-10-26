# Mulligan – Implementation Plan

Status: Draft 1 · 2026-10-25
Implements: `docs/Mulligan Technical Specification.md` (referred to below as "the spec")

The plan divides v1 into eight sprints. Each sprint delivers a **vertical slice** that can be run and looked at, rather than a horizontal layer. The first visual review comes at the end of Sprint 1, and the first complete, downloadable screenshot package (the MVP) at the end of Sprint 2. From Sprint 2 onwards, every sprint ends with something you can review in the browser, and Playwright end-to-end tests protect everything built so far.

---

## 1. Working agreement

### 1.1 Branching and merging

- `master` is the trunk. It receives **only** `--no-ff` merge commits from sprint branches; nothing is committed to it directly after the initial commit.
- One branch per sprint: `sprint/NN-short-name` (for example `sprint/02-screenshot-package`), branched from the latest `master`.
- Work inside a sprint may use short-lived sub-branches (`sprint/02-…/zip-writer`), merged into the sprint branch. Only the sprint branch merges into `master`.
- There is no remote yet, so merges are local. Adding a remote later changes nothing in the procedure, except that the gate can also run in CI (Sprint 6 adds the workflow).

### 1.2 Exit gate (every sprint)

A sprint closes only when **all** of the following hold. The sprint-specific criteria listed under each sprint come on top of these.

| # | Criterion | How it is checked |
| --- | --- | --- |
| G1 | All files are linted and lint passes | `pnpm lint`: ESLint (typescript-eslint, react, react-hooks, jsx-a11y, banned-API rules from spec §10.2), Prettier check, dependency-cruiser boundary rules, `tsc --noEmit` for every package |
| G2 | ≥ 80 % coverage for **all** code in the repo | `pnpm test:coverage`: Vitest v8 coverage, merged across all projects; global thresholds `lines`, `statements`, `functions`, `branches` each at 80; the run fails below threshold |
| G3 | **All** tests pass, old and new | Unit, component, browser-mode and (from Sprint 2) Playwright suites run in full; no `.skip`/`.only` (lint-enforced); obsolete tests may be deleted, but G2 must still hold afterwards |
| G4 | Playwright end-to-end tests from MVP onwards | From Sprint 2: `pnpm test:e2e` against the production build, served with the production header set (spec §10.3); each sprint adds scenarios for what it delivered |
| G5 | Development work for the sprint is complete | The sprint's scope and sprint-specific exit criteria below are met |
| G6 | Production build succeeds | `pnpm build` for all packages and the app |

One command runs G1, G2/G3, G4 (once enabled) and G6 in order:

```
pnpm gate
```

### 1.3 Coverage rules

- **Scope:** `packages/*/src/**` and `apps/web/src/**`. Tests, fixtures, config files and generated files (`version.ts`, the generated JSON Schema) are excluded by pattern.
- **Documented exclusions:** a short, explicit list in `vitest.config.ts` for entry-point glue that only runs in a real browser: `apps/web/src/main.tsx` and the worker bootstrap line(s) in `render.worker.ts`. Each entry carries a comment explaining why. Adding to the list requires saying so in the sprint's merge commit message. `/* v8 ignore */` comments are not used.
- **Sources:**
  - Node-project unit tests (core, web logic).
  - jsdom component tests (React).
  - Chromium browser-mode tests (render-canvas, plus core again).
  - Firefox and WebKit browser-mode runs check for divergence between engines but do not feed coverage, because v8 coverage is Chromium-only.
  - Playwright end-to-end tests do **not** count towards coverage.
- **Margin:** aim for ≥ 85 % so that deleting an obsolete test or adding glue does not fail the gate on the day the sprint closes.

### 1.4 Sprint close procedure

```bash
# on the sprint branch
pnpm gate                                   # must pass
git checkout master
git merge --no-ff sprint/NN-name -m "Merge sprint NN: <name>

<summary of delivered scope>
Coverage: L xx% / S xx% / F xx% / B xx%
<any coverage-exclusion changes, with reason>"
pnpm gate                                   # re-run on the merge result; must pass
git tag sprint-NN
```

If the second gate run fails, the fix is made on the sprint branch and merged again. `master` is never patched directly.

### 1.5 Review at the end of each sprint

Each sprint lists a **Review** script: the steps you follow in the browser (`pnpm preview` serves the production build at `http://localhost:4173` with production headers) and what you should see. The sprint closes after the gate passes. Your review feedback becomes the first backlog items of the next sprint, unless it shows a defect in what was delivered, in which case it is fixed on the open branch first.

---

## 2. Sprint overview

| Sprint | Branch | Theme | Reviewable outcome | Size |
| --- | --- | --- | --- | --- |
| 0 | `sprint/00-foundations` | Monorepo, tooling, gate, standards, app shell | App shell lists presets and fields from config | M |
| 1 | `sprint/01-image-slice` | Image decisions + canvas renderer + first preview UI | Drop a screenshot, see its crop and resized previews | L |
| 2 | `sprint/02-screenshot-package` | **MVP**: batch, ordering, all zones, ZIP, Playwright | Download a correct ZIP of a full screenshot set | L |
| 3 | `sprint/03-listing-cleaning` | Text pipeline + listing form | Paste Word copy, see cleaned text, counts and findings | L |
| 4 | `sprint/04-listing-review` | Side-by-side, reverts, import, listing in ZIP | Full submission package: images + listing | L |
| 5 | `sprint/05-session-robustness` | Persistence, limits, error handling, Package tab | Reload without losing work; clear failure handling | M |
| 6 | `sprint/06-security-deploy` | Security controls, IaC, CI, deployment | Public deployment on the canonical domain | M |
| 7 | `sprint/07-release` | Cross-browser, accessibility, performance, store verification | v1.0.0 | M |

Relative size: M ≈ one unit, L ≈ one and a half. Sprint 1 and Sprint 3 carry the most algorithmic risk (resampling, text tracing) and are deliberately kept free of unrelated work.

### 2.1 Dependency map

```
S0 ──► S1 ──► S2 (MVP) ──► S5 ──► S6 ──► S7
 │                          ▲
 └──► S3 ──► S4 ────────────┘
```

S3 depends only on S0, so text work could run in parallel with S1/S2 if more people join. For a single developer, the order above puts the earliest visual result first.

---

## 3. Sprints

### Sprint 0 – Foundations and walking skeleton

**Goal:** a repository in which the exit gate already works, the architectural boundaries are enforced from the first line of code, and a running app shell reads its content from `@mulligan/core`.

**Before branching:** make the initial commit on `master` with `docs/` and a `.gitignore`, so the sprint branch has a base for its `--no-ff` merge.

**Scope**
- pnpm workspace: `packages/core`, `packages/render-canvas` (empty package with its interface stub), `apps/web` (spec §3).
- TypeScript strict base config; core's `lib: ["ES2022"]` with no DOM or Node types (spec §2.1).
- ESLint flat config + Prettier + dependency-cruiser rules (web → core entry only; core → nothing; no `standards.json` import in web).
- Banned-API lint rules from spec §10.2: `location.search`/`hash`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `window.addEventListener('message')`, `window.open`, `dangerouslySetInnerHTML`, `innerHTML`, `.only`/`.skip` in tests. Adding them now is cheap; adding them later means rework.
- Vitest projects: `core:node`, `web:jsdom`, plus `core:browser` in Chromium, Firefox and WebKit (Vitest browser mode with the Playwright provider); merged v8 coverage with thresholds at 80.
- `pnpm gate`, `lint`, `test`, `test:coverage`, `build`, `dev`, `preview` scripts.
- **Core:**
  - `standards.json` v1 with all presets, groups and fields from spec §4.
  - zod schema and inferred types; `getStandards`, `parseStandards`.
  - `standardsHash` + `standards.lock` check; `LIBRARY_VERSION` generation.
  - `Finding`/`Severity`/`Subject` types, the `RULES` catalog skeleton, `summarize`.
- **Web:**
  - Vite + React shell with three tabs (Images, Listing, Package) and a status bar.
  - The `core-bridge/standards.ts` adapter.
  - The Images tab lists presets grouped by group and store; the Listing tab lists fields grouped by store with their limits, both read from core.
  - The About panel shows library version, ruleset version and standards hash.

**Tests**
- Schema accepts the bundled file and rejects malformed variants.
- Lock check catches an unversioned edit.
- `summarize` severity ordering.
- Shell component tests for tabs, preset list and field list.
- A deliberately failing "boundary" fixture that proves dependency-cruiser and the core tsconfig reject DOM usage (run as a negative test).

**Sprint-specific exit criteria**
- `pnpm gate` passes from a clean clone (`pnpm install --frozen-lockfile`).
- Core runs its tests in Node and in all three browsers.

**Review**
- `pnpm preview` → the Mulligan shell opens.
- The Images tab lists the nine presets with dimensions; the Listing tab lists the ten fields with limits; About shows the versions.
- Changing a limit in `standards.json` without bumping `rulesetVersion` makes `pnpm gate` fail.

---

### Sprint 1 – Image slice: one screenshot, real output

**Goal:** prove the hardest image work (exact crop decisions in core, high-quality resampling and alpha-free PNG encoding in the browser), and let you look at real output as early as possible.

**Scope**
- **Core (spec §7.1–7.3):**
  - `inspectImage`: PNG IHDR/tRNS/iCCP/acTL; JPEG SOF, EXIF orientation, CMYK, ICC.
  - `planImage`: crop algorithm, anchors, scale; `image.upscaled` and `image.crop-loss` findings.
  - `checkRendered`: output dimensions, format, alpha and `maxBytes`, plus `image.transparency-flattened`.
  - `PixelEngine` types.
- **render-canvas (spec §7.4):**
  - Pipeline: `createImageBitmap` with crop, orientation and colour conversion → `pica` Lanczos3 → flatten → `fast-png` RGB/RGBA encode, or `convertToBlob` for JPEG.
  - Preview mode (max edge 480).
- **Web:**
  - A single render worker (no pool yet) through comlink.
  - The Screenshots drop zone, single file for now.
  - Preset checkboxes for the screenshot group.
  - Preview cards showing the source thumbnail with the crop rectangle overlaid, the rendered preview and the findings.
  - "Download" on each card saves that single full-size output.
- **Fixtures:** the image fixture set from spec §13.2, with golden renders recorded by the canvas renderer.

**Tests**
- Property tests for crop geometry (spec §13.3).
- Header parsing for each fixture, including corrupt and renamed files.
- Renderer tests in Chromium browser mode (coverage) and in Firefox and WebKit (divergence): exact dimensions, colour type and alpha; SSIM ≥ 0.98 against golden.
- Component tests for the drop zone, preset picker and preview card. The worker is mocked behind the comlink interface; worker-side logic is covered by the browser-mode renderer tests.

**Sprint-specific exit criteria**
- Every screenshot preset produces output whose dimensions, format and colour type are verified by core's `checkRendered`.
- `apple-icon` produces a PNG with colour type 2 (no alpha channel). This is checked now, even though the icon zone arrives in Sprint 2, because it is the main encoder risk.

**Review**
- Drop a long website capture → crop rectangles anchored at the top for each selected preset → previews look sharp.
- Drop an undersized image → upscale warning.
- Drop a landscape image → crop-loss warning.
- Download an output and check its dimensions in any image viewer.

---

### Sprint 2 – MVP: complete screenshot package

**Goal:** the first version that does the job end to end. A full set of screenshots, feature graphic and icon goes in; a correctly structured, named ZIP comes out. Playwright starts here and is mandatory from now on.

**Scope**
- **Core (spec §8):**
  - `sourceSlug` with the reserved-name handling from spec §10.4.
  - `planPackage`: paths, per-group sequence numbers, suffixes, collision detection, output-extension allow-list.
  - `buildManifest`; `checkGroupCounts`; `image.too-large` with app-supplied limits.
- **Web:**
  - All three drop zones (spec §9.3) with `maxFiles` from config; replacing the file in a single-file zone after confirmation.
  - The sortable screenshot list (dnd-kit, mouse and keyboard) showing sequence numbers.
  - The worker pool with priorities and cancellation (spec §9.4).
  - The render cache keyed by source hash; SHA-256 computed in the worker.
  - Resource limits from `config.ts` (spec §10.8).
  - Document-level drop guard.
  - A basic Package tab with a file count per folder, and "Download package" producing a streaming `fflate` ZIP with `manifest.json`.
- **Infrastructure:**
  - Playwright set up against `pnpm preview`.
  - The preview server applies the **production header set** (spec §10.3: CSP with `connect-src 'none'`, Trusted Types, COOP/COEP). This means any CSP or Trusted Types problem surfaces now, not at deployment.

**Tests**
- Unit: naming, sequencing, collisions, manifest shape, group counts.
- Component: reorder, zone limits and replacement, package summary.
- **End-to-end (first suite):**
  1. Drop six screenshots out of order, reorder, select three presets, download, unzip inside the test, then assert the 18 paths, the dimensions of every file and the manifest contents.
  2. Icon zone → `icons/01_…_apple-1024.png` without an alpha channel and `icons/01_…_play-512.png` under 1 MB.
  3. Unreadable and unsupported files show findings and are left out of the ZIP.
  4. The page loads and completes scenario 1 with zero CSP or Trusted Types violations (console checked).

**Sprint-specific exit criteria**
- G4 is enabled in `pnpm gate`, running the end-to-end suite in Chromium.
- Ten screenshots at 1290 × 12000 across all six screenshot presets complete without the tab crashing on the reference Windows machine (Chrome/Edge). This is a manual check recorded in the merge commit.

**Review**
- Run the real job: drop the latest agency screenshots, feature graphic and icon, order them, choose presets, download, and upload a few outputs to App Store Connect or the Play Console as a test of acceptance.

---

### Sprint 3 – Listing text cleaning

**Goal:** the text pipeline, done properly once: extraction, tracing, every normalization stage and every check, behind a usable listing form.

**Scope**
- **Core (spec §6.1–6.8):**
  - `extractBaseline` with `htmlparser2`, covering Word, Google Docs and web pages, fragments, lists and numbered lists.
  - `Trace` with offset mapping and stable `ChangeId`s; stages 1–14 in order.
  - `countText` and `overflowOffset`; all text checks, including discouraged patterns, unclassified characters and keywords.
  - `integrity.wording`; `processListing` with cross-field checks.
- **Web:**
  - A listing form generated from `standards.fields`.
  - A paste handler that reads `text/html` and `text/plain`, with the "Discard rich formatting?" prompt when the user types into a rich field.
  - The cleaned output shown read-only, with a live count meter including overflow highlighting.
  - A status badge, the findings list and a copy button per field.
  - The straight-quotes option.
  - Debounced processing with the 10 ms per-field budget.
- **Fixtures:** the full text fixture set from spec §13.2, captured from real Word, Google Docs and browser clipboards on Windows and macOS.

**Tests**
- A fixture runner over every text case in Node and in all three browsers.
- Properties: idempotence, wording invariance, trace soundness (spec §13.3).
- A regular-expression budget test (spec §10.4).
- Component tests for the paste handler (simulated `ClipboardEvent` with both flavours), the count meter and the copy button.
- End-to-end: paste a captured Word HTML fixture into Apple Description → the expected cleaned output, a rejoin finding and the count; an over-limit Play short description shows the highlighted overflow.

**Sprint-specific exit criteria**
- Every rule ID in spec §5.2 for text exists in `RULES` and is exercised by at least one fixture.
- `integrity.wording` fires in no fixture and in no property run.

**Review**
- Paste real agency copy from Word into each field.
- Confirm that bullets become en-dash lines, emoji disappear but ® and ™ stay, hard wraps are rejoined, keywords are compacted, and over-limit fields are marked rather than truncated.

---

### Sprint 4 – Listing review, import, and the full package

**Goal:** a reviewer can see and control every change, copy can come from templates, and one download holds the complete submission.

**Scope**
- **Core:**
  - `suppress` support across all stages, with per-rule revertibility from config.
  - `decodeTextBytes` (BOM, strict UTF-8, Windows-1252 fallback).
  - `parseListingJson` and `parseListingCsv`, schema-validated and safe against prototype pollution (spec §6.9, §10.4).
  - `serializeListingJson` and `serializeListingText`; the listing section of the manifest.
- **Web:**
  - The side-by-side view (spec §9.3): baseline and output with linked highlights and a "view raw HTML" toggle.
  - The change list grouped by rule, with revert toggles.
  - Template import (picker or drop) with an overwrite confirmation, showing the detected encoding; downloadable template files.
  - `listing/listing.json` and `listing/listing.txt` in the ZIP.
  - The Package tab gains listing status.

**Tests**
- Unit: suppress behaviour (reverting one change leaves every other ID untouched); import parsers, covering Windows-1252, UTF-16 and RFC 4180 edge cases and `__proto__` keys; serializer round-trip (exported JSON re-imports to the same values).
- Component: side-by-side highlight linking, revert toggles and import confirmation.
- End-to-end: paste → revert a rejoin → output keeps the break → download → `listing.json` records the reverted change; import a Windows-1252 CSV → fields filled with correct curly quotes; a full package containing images and the listing.

**Sprint-specific exit criteria**
- The six-screenshot, three-preset scenario plus a complete listing produces one ZIP that matches spec §8.2, with a manifest that lists every output and the listing status.

**Review**
- Review a real listing with the side-by-side view, revert a rejoin you disagree with, then download the complete package and paste from `listing.txt` into a store console.

---

### Sprint 5 – Session persistence and robustness

**Goal:** work survives reloads and crashes, failures are explained rather than silent, and the Package tab is the single place to sign off.

**Scope**
- **Web:**
  - IndexedDB persistence (spec §9.5): session and blob stores, debounced transactional writes, schema migrations, and ruleset-change handling that drops stale revert IDs with a notice.
  - `storage.persist()`, quota checks with a "processed but not saved" path, and the private-browsing fallback.
  - "Clear session" in the header, the first-save notice and 30-day retention (spec §10.7).
  - Error handling (spec §11): typed renderer errors mapped to findings, worker crash with replace-and-retry, a per-tab error boundary, and degraded in-memory mode with a banner.
  - Package tab completion: the sortable findings table and the download confirmation dialog when failures exist (spec §15 #8).
  - Blob URL revocation.

**Tests**
- Unit tests over `fake-indexeddb`: persistence, migrations, retention, stale-revert handling.
- Component tests: error boundary, banner, findings table, confirmation dialog.
- Fault injection in the worker pool (simulated crash, simulated decode error).
- End-to-end: build a session → reload → everything restored, including order, selections and reverts → "Clear session" → empty; a corrupt image amid valid ones → the rest still package; an over-limit field → confirmation dialog → the manifest records the failure.

**Sprint-specific exit criteria**
- A browser crash or tab kill during work loses at most the last 500 ms of input. This is checked by an end-to-end test that closes the context mid-session and reopens it.

**Review**
- Work through a package, close the browser, reopen it, and carry on.
- Try a deliberately broken file and an over-limit field, and judge whether the messages are clear.

---

### Sprint 6 – Security controls and public deployment

**Goal:** the spec §10 controls are complete and verified, and the site is live on its canonical domain through a pipeline that only reviewed code can pass through.

**Scope**
- **Infrastructure as code** (CDK or Terraform; choose at sprint start):
  - Private S3 bucket with Origin Access Control, versioning and no website endpoint.
  - CloudFront with a response headers policy that matches the preview server's header set exactly, from a single shared definition file.
  - A CloudFront Function for `/` and 404s.
  - Shield Standard and an optional WAF rate rule; a Budgets alarm.
  - CloudTrail data events with an EventBridge alert on writes not made by the deploy role.
  - DNS, ACM, CAA, HSTS preload submission.
- **CI** (needs a remote; this sprint assumes one is added at its start):
  - A GitHub Actions workflow running `pnpm gate` on every push.
  - A deploy job on `master` in a protected `production` environment, using an OIDC role.
  - Build checks: no service worker, CSP not widened, output allow-list.
  - The published SHA-256 file list and a scheduled job that checks the live site for drift.
- **Supply chain:** pnpm `minimumReleaseAge`, `onlyBuiltDependencies`, Renovate config, `pnpm audit` and SCA in the gate, SRI attributes in `index.html`.
- **Web:** the canonical URL, privacy note and build hash in the About panel.

**Tests**
- The security end-to-end scenarios from spec §13.5:
  - `?import=` and `#…` URLs ignored.
  - `postMessage` and `text/uri-list` drags ignored.
  - Framing blocked.
  - SVG and renamed HTML rejected.
  - A header-bomb PNG rejected before decode.
  - A polyglot PNG re-encoded clean.
  - Hostile file names producing safe paths.
  - Allow-listed ZIP contents only.
- An IaC unit or snapshot test asserting the header policy.
- A post-deploy smoke test against the live URL (headers present, app loads, no CSP violations).

**Sprint-specific exit criteria**
- The live site's response headers match spec §10.3 exactly. This is checked by the smoke test and by an external header scanner, with the result recorded in the merge commit.
- A deploy cannot be triggered from any branch other than `master`, and only through the approved environment. This is shown by an attempted deploy from the sprint branch failing.

**Review**
- Open the public URL from a machine outside the corporate network, run a full package, and inspect the response headers in the browser developer tools.

---

### Sprint 7 – Release hardening and v1.0.0

**Goal:** confidence on every target browser, accessible to keyboard and screen-reader users, fast enough on real batches, and standards confirmed against the stores.

**Scope**
- **Cross-browser:** the Playwright suite in Firefox and WebKit as well as Chromium (G4 extended to all three); fixes for any divergence found.
- **Accessibility (WCAG 2.2 AA):**
  - axe checks in end-to-end tests.
  - A manual NVDA pass on Windows and a VoiceOver pass on macOS.
  - Keyboard-only runs of every flow.
- **Performance:**
  - Budgets for first load (≤ 300 KB JS gzip before workers), preview latency and package time for the Sprint 2 reference batch.
  - Bundle analysis; lazy-loading of pica and fflate.
- **Store verification (spec §15):**
  - Confirm every preset dimension, size cap and count, and every field limit and counting method, against current App Store Connect and Play Console documentation, with test submissions.
  - Bump `rulesetVersion` as needed.
  - Settle the open defaults (counting method, ordered-list style and the rest).
- **Documentation:** a user guide (in-app help panel), a README for contributors, and the `@mulligan/core` API reference (TypeDoc).
- **Release:** a Changeset for `@mulligan/core@1.0.0`, the `v1.0.0` tag and a release note.

**Tests**
- The end-to-end suite green in three browsers; axe tests; performance budget tests in CI (Chromium).

**Sprint-specific exit criteria**
- Zero serious or critical axe violations.
- Performance budgets met.
- Store verification recorded in `docs/Store Verification.md` with dates and sources.

**Review**
- A final acceptance run with real agency material on the Windows work machine, followed by a real store submission.

---

## 4. Backlog after v1

Ordered by expected value. Each item becomes its own sprint with the same gate.

1. `.docx` import through mammoth (spec §6.9).
2. `@mulligan/render-node` (sharp), passing the shared image fixtures and the SSIM comparison (spec §7.5, §13.4).
3. CLI `check` / `fix`, JSON and JUnit reporters, exit codes, project config and overrides (spec §12).
4. Publishing `@mulligan/core` to the chosen registry with provenance.
5. Manual crop adjustment, if fixed anchors prove insufficient (requirements: out of scope for v1).
6. Multi-locale listing UI (formats already carry `locale`).
7. Play icon recompression when it exceeds 1 MB (spec §15 #7).

---

## 5. Risks and how the plan addresses them

| Risk | Where it bites | Mitigation in the plan |
| --- | --- | --- |
| Canvas, pica or encoders behave differently across browsers | S1 | Renderer tests run in all three engines from Sprint 1; golden comparison; the alpha check moved forward to Sprint 1 |
| Memory with long captures on the Windows machine | S2 | Crop at decode; the manual reference-batch check is an exit criterion in Sprint 2 |
| Trusted Types or CSP breaking a dependency | S2 | The production header set is applied to the preview server from the first end-to-end suite, not at deployment |
| Text tracing complexity (stable IDs, reverts) | S3, S4 | Trace soundness and idempotence property tests in Sprint 3, before reverts are added in Sprint 4 |
| Coverage gate pressure on UI code | every sprint | Logic kept in core and testable hooks; components stay thin; a target margin of 85 %; the exclusion list is short and documented |
| Store requirements differ from the requirements table | S7 | Everything is in config; verification is an explicit Sprint 7 deliverable, and can be pulled earlier if a test upload fails in Sprint 2 |
| Real clipboard HTML differs from what is expected | S3 | Fixtures are captured from real Word and Google Docs on Windows and macOS, not hand-written |
