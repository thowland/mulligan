# Changelog

This file records every notable change to the project, one section per release. The ruleset has its own version, recorded in every package; changes to it are noted with the release that shipped them.

## Unreleased

### Added

- A WAF rate-based rule in front of CloudFront, blocking any client IP that makes more than 500 requests in five minutes, and a monthly AWS Budgets alarm for the stack's tagged resources.

### Changed

- The iPhone screenshot presets are now 6.3" (1206 × 2622, selected by default) and 6.1" (1179 × 2556), the sizes App Store Connect accepts for iPhone. The 6.9" and 6.5" presets are gone (ruleset 2.0.0).
- The requirements document opens with a note on how the published app differs from the internal tool it first described.

## 0.1.0 — First public release (2026-10-26)

The first release deployed to https://mulligan.beta-site.us, built over sprints 0 to 5 of the [implementation plan](docs/Mulligan%20Implementation%20Plan.md) and the fixes that followed. It ships ruleset 1.1.0.

### Images

- Separate drop zones for screenshots, the Google Play feature graphic and the app icon, with each file receiving only the presets of its group. Screenshots can be reordered, and the order sets the numbering in every folder.
- Presets for the iPhone 6.9" and 6.5", iPad 13", Android phone and 7" and 10" tablets, the Play feature graphic, and the App Store and Play icons. The first file dropped into a group with nothing ticked ticks that group's usual presets, so a dropped feature graphic is never left out of the package.
- Top-anchored crops for screenshots and centered crops for artwork, then an exact resize, with warnings for enlargement, heavy cropping and flattened transparency, and checks on every rendered file's dimensions, format, transparency and size. Rendering runs in background workers.

### Listing copy

- An editor per field for both stores, generated from the rules file, that reads rich pastes from Word, Google Docs and web pages and cleans characters and spacing without changing the wording, with a wording-integrity check after every clean.
- A side-by-side review of every change, with per-change revert for the rules that can get it wrong.
- Limit, required-field, promotional-language, emoji, unusual-character and keyword checks.
- Copy from iOS on the Google Play fields that have an App Store counterpart (ruleset 1.1.0).
- Import of CSV and JSON templates, with blank templates to send to agencies.

### Package

- One ZIP file with a folder per preset, the cleaned listing as text and JSON, and a manifest recording the rules version, the build, a fingerprint of every source and output, each crop and every finding. A package with failures can still be downloaded after a confirmation.

### Sessions

- Work is saved in the browser's own storage and restored after a reload or restart, kept for 30 days, and capped at 500 MB of images. Private windows and browsers that refuse storage fall back to working in memory with a notice.
- Clear session removes everything and never reports success unless the browser confirmed the deletion.

### Help, About and documentation

- Help and About pages; Help's tables are generated from the rules file, with a plain-language note for every rule.
- A README with screenshots and a guide to updating the rules when the stores change, released under GPL-3.0-or-later.

### Security and hosting

- A strict Content-Security-Policy with no network access, Trusted Types, cross-origin isolation and the other production headers, defined once and applied identically by the preview server and the CloudFront response headers policy, including on 304 responses.
- Hosting on a private S3 bucket behind CloudFront, provisioned by `infra/mulligan.yaml`, with a deploy script that runs the full gate, records the commit as the build id and checks the live headers after publishing.

### Fixed before release

- The preview server rendered a blank page in Safari, which applied `upgrade-insecure-requests` to localhost, and its 304 responses lacked the headers WebKit needs to start the render worker.
- Clear session could report success when the stored data had not been removed.
