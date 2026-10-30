# Mulligan – Backlog

This is the list of work that remains after the 0.1.0 release, drawn from the [implementation plan](Mulligan%20Implementation%20Plan.md), the open items in section 15 of the [technical specification](Mulligan%20Technical%20Specification.md), and the review notes from sprints 0 to 6. Each item, or each group of related items, is taken up the same way as a sprint: on its own branch, closed only when `pnpm gate` passes, and merged to `master` without fast-forwarding. When an item is done, it moves to the [changelog](../CHANGELOG.md) and comes off this list.

Last updated 2026-10-26.

## Priorities

These two come first, ahead of the rest of Sprint 7, because each one affects the trust a user can place in what Mulligan reports.

### 1. Upscale warning threshold

`input.upscaleWarnAbove` in `standards.json` is set to 1.0, so any enlargement at all produces a warning. In practice that means almost every real capture warns: an iPhone 15 screenshot is 1179 × 2556, and fitting it to the 6.3-inch preset's 1206 × 2622 enlarges it by 1.02×, which no one could see in the result. The README screenshots show it on every card. A warning that fires on every image teaches people to ignore warnings, which costs us the ones that matter, such as a 640-pixel-wide capture stretched to fill an iPad preset.

Our suggestion is to raise the threshold to around 1.1, which keeps the warning for enlargements large enough to soften the image and drops it for the routine few-percent fits. The change is one value in the rules file; since it can only remove warnings, it is a minor ruleset version bump. The tests that assert the current warning, and the README screenshots, would be updated with it.

### 2. Store verification

Every preset dimension, file size cap and image count, and every field limit, comes from the requirements and from store documentation as we read it in October 2026, and none of it has been confirmed by an actual submission. The work is to check each value against the current App Store Connect and Play Console documentation, confirm the doubtful ones with test submissions, record the results with dates and sources in `docs/Store Verification.md`, and bump the ruleset version for anything that changes. The values most in need of confirmation are the character counting method (section 15, item 1) and the Google Play size caps of 8 MB for screenshots and 15 MB for the feature graphic (item 6). This is also the natural point to settle the open decisions listed below, since several of them depend on what the stores do.

## Sprint 7: release hardening and v1.0.0

The remaining scope of the plan's last sprint, which ends with the `v1.0.0` release.

- **Cross-browser:** run the full end-to-end suite in Firefox and WebKit, not only the smoke test, and fix any divergence it finds.
- **Accessibility, to WCAG 2.2 AA:** automated axe checks in the end-to-end tests with no serious or critical violations, a manual NVDA pass on Windows and a VoiceOver pass on macOS, and keyboard-only runs of every flow.
- **Performance:** a first-load budget of 300 KB of JavaScript (gzipped) before the workers. The build currently warns that one chunk is over 500 KB before compression, and loading pica and fflate only when they are first needed should bring it under. Budgets for preview latency and package time on the Sprint 2 reference batch, tested in CI.
- **Documentation:** the TypeDoc API reference for `@mulligan/core`. The in-app help and the README are done.
- **Release:** `@mulligan/core` at 1.0.0, the `v1.0.0` tag and a release note.
- **Acceptance:** a final run with real agency material on the Windows work machine, followed by a real store submission.

## Decisions pending

Defaults that are in place and working, but that were chosen without the information to be sure of them. Each is a configuration value, so changing one is a small task once the decision is made.

- **Character counting** (spec §15, item 1): `chars` limits count UTF-16 code units, the strictest method, so an emoji counts as two. This should match how the store consoles count, which store verification will establish.
- **Ordered lists** (item 2): numbered list items keep their numbers rather than becoming en-dash bullets, since step numbers can carry meaning.
- **Discouraged terms and capitals** (item 9): the list of promotional terms and the four-letter threshold for words in capitals are starting values, and the allow-list for approved acronyms and product names is empty. Brand or MLR reviewers may want to supply both.
- **Session retention and storage cap:** saved sessions are deleted after 30 days untouched, and saved images are capped at 500 MB per session (`apps/web/src/config.ts`).
- **Notice wording:** the badges, banners and notices across the app have not had a dedicated review.
- **Downloading with failures** (item 8): allowed after a confirmation, with the failures recorded in the manifest. The alternative is to block the download.

## Manual checks

Checks that need a person, a particular machine or real material, and cannot be automated in the gate.

- **Long captures on the Windows work machine:** a batch of ten 1290 × 12000 full-page captures, to confirm memory use and timing on the hardware Mulligan was written for.
- **Real clipboard samples:** the cleanup tests use clipboard HTML written by hand. They should be replaced with samples captured from Word on Windows and macOS, Google Docs, a PDF, Edge and Safari web pages, and Outlook, since each produces its own markup and the cleanup is only as good as its fixtures.

## After v1

From section 4 of the implementation plan, in order of expected value. Each becomes its own sprint.

1. **Word import:** `.docx` listing copy imported through mammoth (spec §6.9).
2. **Node renderer:** `@mulligan/render-node`, using sharp, passing the shared image fixtures and the SSIM comparison with the browser renderer (spec §7.5, §13.4).
3. **Command-line tool:** `check` and `fix` modes, JSON and JUnit reports, exit codes, project configuration and rule overrides, so a CI pipeline can check store assets the way the web app does (spec §12).
4. **Publishing the library:** `@mulligan/core` published to a registry with npm provenance; whether the registry is public or private is still open (spec §15, item 13).
5. **Manual crop adjustment:** only if the fixed anchors prove insufficient in real use.
6. **Multiple locales in the listing editor:** the file formats already carry a `locale` key, so this needs no format change (spec §15, item 14).
7. **Play icon recompression:** shrinking an icon that exceeds Google Play's 1 MB limit automatically, for example by palette quantization, instead of failing it (spec §15, item 7).

## Set aside

Sprint 6 controls that were set aside on 2026-10-26, when the site went live in a reduced form. They are listed here so the decision can be revisited, not because they are planned.

- Deploys from CI through a GitHub Actions OIDC role in a protected environment, in place of `pnpm deploy:site` on the maintainer's machine.
- CloudTrail data events with an EventBridge alert on bucket writes not made by the deploy role.
- A published SHA-256 list of the deployed files, and a scheduled job that checks the live site against it.
- Subresource Integrity attributes on the scripts and stylesheet in `index.html`.
- A CloudFront Function for `/` and 404s, CAA records for the domain, and HSTS preload submission.
- pnpm's `minimumReleaseAge` for newly published dependency versions. Dependabot's seven-day cooldown covers the update pull requests in the meantime.
