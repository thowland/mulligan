# Contributing

Mulligan is a personal project, but issues, store-rule updates and suggestions are welcome, and the notes below say what makes each kind most useful.

## Issues

- **Bugs:** give the versions from the About page, the browser and operating system, what you did and what happened. Please do not attach client artwork or unreleased copy; a stand-in image of the same size and type reproduces almost every image problem.
- **Store changes:** when Apple or Google add a screen size or change a field, a limit or a rule, the "Store requirement change" form asks for the exact values and a link to the store's documentation. These are the most valuable reports, because the rules go stale without them.
- **Pull requests:** open an issue first so we can talk it over; a change that fits the design is much easier to take than one that has to be reworked after the fact. I review every pull request before it is merged, and nothing reaches `master` without that review.

## Working on the code

Start with `CLAUDE.md` for the commands and the architecture, then the [technical specification](docs/Mulligan%20Technical%20Specification.md) for the design. The README's section on updating the rules covers changes to `standards.json`, which need no code at all. A change is ready to send when it meets these conditions:

- `pnpm gate` passes. That covers lint and the typecheck, the dependency boundary rules, the unit, component and browser tests in Chromium, Firefox and WebKit with at least 80% coverage on every metric, the production build, and the Playwright suite against that build with the production headers. CI runs the same gate on every pull request.
- The boundaries still hold: the rules and all logic stay in `packages/core`, which knows nothing of the browser or Node, and the web app reaches it only through `apps/web/src/core-bridge/`.
- The security constraints still hold. The app makes no network requests and writes no HTML from strings, and the lint rules that enforce this stay on; a new runtime dependency needs a reason in the pull request.
- Changes to the rules bump `rulesetVersion`, and changes to the response headers update the CloudFront policy in `infra/mulligan.yaml` to match.

## License

By contributing, you agree that your work is licensed under GPL-3.0-or-later, the same as the rest of the project.
