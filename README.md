# Darja Rihla Web Evidence Inspector

Evidence-first website review tooling. A fresh browser context observes one
page load without forms, login or consent interaction. Local reports keep
observed evidence separate from deterministic findings and recommendations.
It does not attack, fuzz, authenticate or issue legal compliance verdicts.
Inspect only authorized targets. There is no telemetry or capture upload.

The published baseline is package 0.1.0, commit `9c9c67a`. Mission 025 changes
on a feature branch are unreleased. The evidence and assessment contracts on
this branch are version 0.2.0; see [migration notes](docs/SCHEMA-MIGRATION.md).

## Install and reproduce

Use Node.js 24, an installed Chromium-based browser, and Poppler's `pdftotext`
for the required PDF regression test. The package uses playwright-core and
does not download a browser during installation.

```bash
npm ci
npm test
# Only for a target you are authorized to inspect:
node src/cli.js http://127.0.0.1:8787 --lang en
```

For the controlled app, start `node tests/fixtures/test-app.js` in another
terminal; it prints its localhost URL. No public-site scan is needed for tests.
On Debian/Ubuntu `poppler-utils` supplies pdftotext. Use a normal Linux
filesystem supporting Node dependencies, including when on an external drive.

Browser discovery tries `--browser-path`, `DR_BROWSER_PATH`,
`PLAYWRIGHT_BROWSERS_PATH`, installed Chrome/Chromium/Edge paths and channels,
then Playwright's default browser. Set an explicit path when needed.
Chromium sandboxing is enabled on every attempt. Run as an unprivileged user
on a host supporting Chromium's sandbox; restricted containers, root execution,
AppArmor and unavailable user namespaces can prevent launch. There is no
unsafe fallback. Browser startup and navigation have separate timeout budgets.

## Outputs

Each scan creates `out/<scan id>/`:

| File | Purpose |
| --- | --- |
| evidence.json | Redacted observations plus derived domain/tracker classifications; no assessment verdict. |
| findings.json | Rule findings, status, confidence, recommendations and evidence references. |
| report.md | Consultant findings, evidence tables and limitations. |
| client-summary.html | Client summary, self-contained HTML. |
| client-summary.pdf | Printed HTML summary, when PDF generation succeeds. |
| manifest.json | SHA256 hashes of files actually written, with scan/tool provenance. |

PDF failures are reported and HTML remains available. `--no-pdf` skips PDF;
`--evidence-only` writes evidence and its manifest. Manifests detect changes;
they are not signatures or a guarantee of authenticity.

`--lang nl` (default) and `--lang en` apply to findings, Markdown, HTML and PDF.
Evidence is language neutral. Stable machine IDs and rule logic do not depend
on language.

## What is observed

Requests and response metadata include redacted URLs, methods, resource types,
status, selected headers, redirects, failures and service-worker attribution
where available. Registrable domains determine first/third party; an asset's
filename does not. Redirect chains retain request references and redacted
destinations. The final main-document response supplies security headers.

Cookie names/attributes/expiry and value lengths, local/session storage keys
and lengths, IndexedDB database names/versions, console messages and page
errors are collected with redaction. Storage values remain in the page;
cookie values returned by the browser API are discarded before evidence.
No request/response bodies, screenshots, form inputs or page-body content are
persisted. The page title is collected as scrubbed metadata.

Tracker matching uses the bundled, versioned local rule set. A recognized
script alone is reported as loaded. POST or xhr/fetch/ping/beacon requests to
a recognized tracker are transmission signals; a 2xx response means the
receiver answered successfully, not that its server processed the payload.
Bodies are not examined. A missing match cannot establish absence of tracking.

Security headers are presence observations on the main response, with limited
checks such as CSP frame-ancestors covering X-Frame-Options. This does not
validate a complete CSP or prove effective site security. Browser/runtime
console noise is retained with origin classification and excluded from
site-quality findings; unknown origins remain reviewable.

## Privacy and integrity

Query values, URL credentials and fragments are omitted before persistence,
including the original input URL and redirect header values. Sanitized query
names remain. Credential and unexpected header values are replaced;
allowlisted diagnostic/security headers are scrubbed, including CSP nonces.
Recognized sensitive path segments, emails, JWTs, bearer tokens and long
tokens are scrubbed in free text and metadata names.

This is pattern-based protection for paths/text/names, not universal secret
redaction. Novel short identifiers, nested encodings or sensitive arbitrary
text in an allowed header can survive. Redaction can also remove useful
context. Review artifacts locally before sharing. Evidence references and
omission markers preserve the distinction between originals and samples.
See [SECURITY.md](SECURITY.md) for reporting and current channel limitations.

| Status | Meaning |
| --- | --- |
| PASS | No relevant finding within performed checks; does not establish site security. |
| REVIEW | Observed signal needs contextual judgement. |
| FAIL | Observed signal is wrong in almost any context. |
| INCONCLUSIVE | Known capture gaps prevent an absence-based successful check. |

Navigation/collection failures, unfinished requests, missing response metadata,
response-drain timeouts and capture caps are explicit. Known incomplete scans
cannot produce unsupported PASS outcomes; observed adverse findings remain.
A completed bounded scan still covers only one time window, viewport and user
agent. It does not establish exhaustive observation.

## CLI

```text
node src/cli.js <url> [options]
--out <dir>          output parent (default ./out)
--timeout <ms>       navigation timeout, 1..120000 (default 30000)
--settle <ms>        wait after load, 0..30000 (default 3000)
--wait <event>       load | domcontentloaded | networkidle
--browser-path <p>   installed Chromium executable
--proxy <server>     route browser traffic through a configured proxy
--rules <file>       tracker rules (default rules/trackers.json)
--lang <nl|en>       findings and report language
--evidence-only      evidence and manifest without assessment/reports
--no-pdf             skip PDF
--headed             visible browser
--quiet              written paths only
--help              usage
```

Capture caps are 5000 requests and 1000 messages per console/page-error stream.
Metadata draining is bounded to five seconds; collection has independent
three-second bounds. Excess observations are declared incomplete.

## Saved scan comparison

```bash
node src/cli.js compare out/earlier out/later --out out/comparison
```

Produces diff.json, comparison.md and a manifest, comparing finding IDs and
referenced metadata with before/after provenance. Only matching supported
schema versions, redacted final targets and rule sets are accepted. New,
unchanged, changed, resolved and inconclusive are distinct. Both scans must
explicitly be complete to prove resolution. Matching redacted URLs do not
prove identical query values. Legacy 0.1.0 files remain readable but lack an
explicit completeness guarantee; cross-version comparisons require migration.

## Tests and contribution

`npm test` runs every unit and required browser integration test. Browser tests
must pass with sandboxing enabled; no silent skips. PDF tests extract text as
well as inspect the generated artifacts. Fixtures are synthetic and local.
The original test app includes two redirects, cookies, storage, a console
error, missing headers and same-origin scripts/pixels. Separate synthetic
records test actual third-party and tracker classification/transmissions.
Hardening fixtures cover privacy, delayed/failed/unfinished responses, multiple
explicit pages and isolated consent states. Fake events cover metadata races.

CI uses Node 24 and npm ci, read-only permissions, pinned official Actions,
sandboxed installed Chrome, audit and checksum-verified Gitleaks. Test runtime
uses a localhost route guard; dependency installation/audit need network access.
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and evidence standards.

## Planned modes and limitations

Production inspection remains single-page. No consent is accepted or rejected;
post-consent behaviour may be absent. The versioned
[multi-page design](docs/BOUNDED-INSPECTION-DESIGN-v1.md) and
[consent comparison design](docs/CONSENT-COMPARISON-DESIGN-v1.md) have working
localhost fixtures and contract tests, but their production executors,
aggregation and provenance remain incomplete. Do not treat the designs as
available CLI features. No automatic GDPR verdict is provided.

Licensed under [Apache-2.0](LICENSE). Runtime dependencies retain their
Apache-2.0/MIT notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
