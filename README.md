# Mulligan

Mulligan prepares the artwork and listing copy an agency delivers for the Apple App Store and Google Play. It crops and resizes screenshots, feature graphics and icons to each store's presets, cleans the characters and spacing of pasted listing copy without changing its wording, checks both against the store rules, and packages the result as a ZIP file with a manifest that records every change. It runs entirely in the browser, and the site's security policy forbids the page from making network requests, so files and copy never leave the user's device.

The name comes from golf, where a mulligan is a second attempt at a shot that went wrong, taken without penalty.

## Using it

The app is at https://mulligan.beta-site.us. The Help page in the app explains each preset, field and rule, where work is saved, and how to clear it.

## Documents

- [Requirements](docs/Mulligan%20Requirements.md)
- [Technical specification](docs/Mulligan%20Technical%20Specification.md)
- [Implementation plan](docs/Mulligan%20Implementation%20Plan.md)

## Structure

The work is split so that the rules can be reused outside the browser. `packages/core` holds the rules file (`standards.json`) and the library that applies it, with no dependency on the DOM or Node; `packages/render-canvas` renders images in the browser; and `apps/web` is the React application. A command-line tool for CI pipelines is planned on top of the same library.

## Development

Development requires Node 22 or later and pnpm.

```bash
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm dev        # development server
pnpm gate       # lint, unit and browser tests with coverage, build, end-to-end tests
pnpm build && pnpm preview   # the production build, served with the production headers
```

Every change merges through `pnpm gate`, which requires lint to pass, every test to pass, and at least 80% coverage across the whole codebase.

## License

Copyright © 2026 Tim Howland. Mulligan is free software, released under the [GNU General Public License](LICENSE), version 3 or later. Questions and problems are welcome at th@wdogsystems.com or as GitHub issues.
