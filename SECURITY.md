# Security

Mulligan is a static web app with no server, no accounts and no network access: the Content-Security-Policy sets `connect-src 'none'`, so the page cannot send the files and copy it works on anywhere, and everything it saves stays in the browser's own storage on the user's device. That leaves four likely places for a security problem. The first is the code served from https://mulligan.beta-site.us and the hosting that serves it (S3 and CloudFront, in `infra/`). The second is the response headers (`apps/web/security/headers.json`), which the CloudFront policy must match. The third is the handling of hostile input files and pasted HTML, which the app parses in the browser. The fourth is the dependencies.

The threat model and the controls for each threat are in section 10 of the [technical specification](docs/Mulligan%20Technical%20Specification.md).

## Reporting a vulnerability

Please report it privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability**. If that is not possible, email th@wdogsystems.com. Please do not open a public issue for a security problem, because that discloses it before there is a fix.

Include what you found, how to reproduce it and what an attacker could do with it. I will acknowledge the report within a week and keep you informed until it is fixed.

## Supported versions

Fixes go only into the version deployed at https://mulligan.beta-site.us, which is always the latest release on `master`.
