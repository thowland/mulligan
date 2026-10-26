## What this changes

<!-- What the change does and why. Reference the spec section or issue where there is one. -->

## Checklist

- [ ] `pnpm gate` passes locally (lint, all tests, coverage of at least 80% on every metric, build, end-to-end tests).
- [ ] Changes to `standards.json` bump `rulesetVersion` and update `standards.lock.json`, and field changes regenerate the templates.
- [ ] Changes to `apps/web/security/headers.json` are matched in `infra/mulligan.yaml`.
- [ ] No new network access, HTML sinks or runtime dependencies, or the reason is explained here.
- [ ] The spec and the Help page still describe what the app does.
