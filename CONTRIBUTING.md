# Contributing

Discuss substantial work in the relevant public issue before opening a PR.
Use a feature branch and focused commits. Preserve Apache-2.0 notices. Never
include private browser captures, real credentials, research data or profiles.
Use synthetic localhost fixtures and do not scan public targets for tests.

Use Node.js 24 and `npm ci`. Install Google Chrome/Chromium separately; this
package uses playwright-core and does not download a browser on install.
Set `DR_BROWSER_PATH` to the executable if discovery fails. Install Poppler's
`pdftotext` for the required PDF regression. On Debian/Ubuntu its package is
`poppler-utils`. Run as an unprivileged user with Chromium sandbox support.
Do not add --no-sandbox, disable host security controls or silently skip browser
tests when the environment is unsupported. Preserve the failure output.

Run `npm test` (all unit and browser tests), `npm audit --audit-level=high`,
`actionlint .github/workflows/ci.yml`, and `gitleaks git --redact --no-banner .`.
Use `gitleaks dir --redact --no-banner <directory>` for changed uncommitted
files too. CI pins Gitleaks and Actions. Review dependency licenses and the
lockfile; do not regenerate it without a reason.

The baseline 46 tests remain in place. `tests/fixtures/test-app.js` provides
two redirects, storage, cookies, console errors, an API failure and same-origin
assets named third-party/widget and tracker-pixel. The names do not make them
actual third-party or tracker requests. Tracker, domain and transmission tests
also use synthetic request records and the bundled local rules.
`hardening-app.js` adds query/redirect/nonce markers, IndexedDB names, delayed
responses, failed/unfinished requests, two explicit pages, a form that is never
submitted and consent controls. `response-completeness.test.js` uses fake
browser events to exercise late, hung and missing metadata deterministically.

Tests bind only localhost. In CI `DR_TEST_LOCALHOST_ONLY=1` blocks external
page requests. Installation and audit need registry access; test runtime must
not upload observations. Browser internal background networking is disabled
where supported; route filtering is not an OS-level egress firewall.

Evidence contract changes require a schema version and migration notes.
Every finding must resolve to observed evidence or a named field. Incomplete
capture cannot establish absence. Keep evidence, assessment and recommendations
separate. Test all persistent outputs, including extracted PDF text, when
changing privacy handling. Deterministic comparison output should omit clocks.

PRs should state the trigger/problem, resulting behaviour, compatibility,
exact checks and limitations. Link issues without auto-close keywords until
acceptance is verified. Do not merge, release or deploy as part of validation.
