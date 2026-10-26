# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Mulligan is a client-side web app that crops and resizes app store artwork to Apple App Store and Google Play presets, cleans listing copy without changing its wording, and packages the result as a ZIP with a manifest. The design is in `docs/Mulligan Technical Specification.md` (spec §-references in code comments point there), and the sprint plan with exit criteria is in `docs/Mulligan Implementation Plan.md`.

## Commands

pnpm workspace, Node 22+. First run needs `pnpm exec playwright install chromium firefox webkit`.

```bash
pnpm dev                       # Vite dev server (relaxed dev CSP for HMR)
pnpm build && pnpm preview     # production build served with the production headers (port 4173)
pnpm lint                      # eslint + prettier --check + dependency-cruiser + typecheck
pnpm gate                      # lint → test:coverage → test:browsers → build → test:e2e
```

Tests are Vitest projects: `core:node`, `core:chromium`, `core:firefox`, `core:webkit`, `render:chromium|firefox|webkit`, `web:jsdom`, `tooling:node`.

```bash
pnpm exec vitest run --project web:jsdom apps/web/test/listing.test.tsx   # one file
pnpm exec vitest run --project core:node -t "rejects duplicate ids"        # one test by name
pnpm exec playwright test smoke --project webkit                           # one E2E spec/browser (needs a prior pnpm build)
```

E2E runs against the production build via `vite preview` on port 4174. Chromium runs every spec; Firefox and WebKit run only `e2e/smoke.spec.ts`. Every E2E test fails automatically on any CSP or Trusted Types violation or page error (fixture in `e2e/helpers.ts`). The expected-fail self-test in `e2e/security.spec.ts` shows as ✘ but counts as passing.

## Workflow rules

- Work happens on a feature branch (`sprint/NN-…`, `fix/…`, `feature/…`), and `pnpm gate` must pass on it. Merge to `master` with `git merge --no-ff`, putting the coverage figures in the merge message, then run the gate again on `master`. Sprints are tagged `sprint-NN`. Never patch `master` directly; fixes go on a branch and are merged again.
- Coverage is global and all four metrics (lines, statements, functions, branches) must be ≥ 80%. Only `apps/web/src/main.tsx` and `render.worker.ts` are excluded.
- Any edit to `packages/core/src/standards/standards.json` needs a `rulesetVersion` bump, then `pnpm --filter @mulligan/core standards:lock`. A lock test fails otherwise.
- User-facing documentation (Help/About pages, README, docs) is written in Tim Howland's voice. Use the `howland-voice` skill.

## Architecture

Three tiers, with boundaries enforced by `.dependency-cruiser.cjs`, lint rules and tsconfig. `tooling/test/boundaries.test.ts` proves the enforcement works.

- **`packages/core` (`@mulligan/core`)**: all rules and logic, with no DOM or Node dependencies (`lib: ES2022`, `types: []`; only TextEncoder/TextDecoder are declared). It is meant to be reused by a future CLI and CI tool. Its source runs directly under Node type-stripping, so imports use `.ts` extensions and only erasable TypeScript syntax is allowed.
  - `standards/standards.json` is the single rules file: stores, asset groups, image presets, listing fields (limits, `copyFrom`, `related`), and text rules. It is validated by a zod schema (`schema.ts`, `jitless: true` because the CSP forbids eval) with cross-reference checks, and hashed into `standardsHash`.
  - `findings/catalog.ts` is the rule catalog. Every change and check has a stable id (`chars.emoji`, `text.limit.max`, `image.crop-loss`, …). Changes can be revertible per `rules.revertible`.
  - Text pipeline: HTML/clipboard extraction (stage 0), then ordered stages (spec §6.4) that emit traced edits, checks on the output, and a wording-integrity check that fails if letters or numbers changed.
  - Image pipeline: inspect (magic bytes, dimensions, truncation) → plan (crop by group anchor, then resize) → verify the rendered output. Rendering itself goes through a `PixelEngine` interface implemented outside core.
  - `package/`: ZIP layout, file naming, manifest, and listing exports and imports.
- **`packages/render-canvas`**: the browser `PixelEngine` (canvas, pica, fast-png, jpeg-js).
- **`apps/web` (`@mulligan/web`)**: React 19 + Vite + zustand.
  - Components may only reach core _runtime_ code through `src/core-bridge/` (or `src/render/`). Type imports from `@mulligan/core` are fine anywhere.
  - State lives in zustand stores in `src/state/` (`images.ts`, `listing.ts`), outside components, so it survives tab switches.
  - `state/session.ts` autosaves the stores to IndexedDB (`persistence.ts`) with migrations, retention, and fail-closed clearing: a clear is never reported unless the browser confirmed the deletion.
  - Rendering runs in a worker pool (`src/render/`, comlink).
  - App limits that are not store rules (file sizes, retention, storage cap) live in `src/config.ts`.
  - Help and About are in-app views (`features/pages/`). Help's tables come from the standards. `ruleNotes.ts` must have a note for every catalog rule (enforced by a test).

## Security constraints

The site is public with no backend. Files never leave the device, and this is enforced by policy, not convention:

- The production headers are defined once, in `apps/web/security/headers.json`: CSP `connect-src 'none'`, Trusted Types with a `default` policy that only allows the render worker URL, plus COOP/COEP/CORP.
  - `vite preview` serves them minus HSTS and `upgrade-insecure-requests` (Safari applies that directive to localhost and the page goes blank).
  - A preview middleware puts the headers on every response, including 304s; WebKit checks COEP against the 304 when it loads a worker.
  - The CloudFront policy is to be generated from the same file.
- ESLint bans network and navigation APIs: `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `URLSearchParams`, `location.search`/`location.hash`, `message` listeners, `window.open`/`opener`, service workers.
- It also bans HTML sinks: `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write`, `dangerouslySetInnerHTML`.
- Input arrives only through user gestures (drop, file picker, paste). There is no URL-driven state.
