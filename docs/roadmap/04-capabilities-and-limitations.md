# 04 · Capabilities and limitations

Status: verified against README, SECURITY and code on `main` (2026-11-07). Limitations are stated as the tool currently behaves.

## Implemented capabilities

### Observation (single page)

- One navigation in a fresh headless browser context, with no form, login or consent interaction.
- Requests and response metadata: redacted URL, method, resource type, status, selected headers, redirect chain, failures, service-worker attribution where available.
- First-party vs third-party classification by registrable domain (tldts).
- Cookie names, attributes, expiry and value lengths. Cookie values are discarded.
- localStorage and sessionStorage key names and value lengths. Values are never stored.
- IndexedDB database names and versions.
- Console messages and page errors, with origin classification and redaction.
- Page title, as scrubbed metadata.
- Observation completeness metadata (`scan.observation.complete`, incomplete reasons, missing responses, unfinished requests).

### Classification and assessment

- Tracker matching against the bundled `rules/trackers.json`. Loaded scripts and transmissions are reported separately: a POST or xhr/fetch/ping/beacon to a recognized tracker is a transmission signal.
- Security-header presence on the main response (`DR-HEADERS-001` and related rules).
- Twelve deterministic rules producing PASS, REVIEW, FAIL or INCONCLUSIVE with severity and confidence.
- Bilingual output (`--lang nl` default, `--lang en`). Stable rule and finding IDs do not depend on language.

### Outputs

- `evidence.json`, `findings.json`, `report.md`, `client-summary.html`, `client-summary.pdf` (when PDF rendering succeeds), `manifest.json`.
- `--evidence-only`, `--no-pdf`, `--quiet`, `--headed`, `--proxy`, `--rules`, `--browser-path`.

### Integrity and comparison

- Manifest with SHA256 and size per written file (Mission 027 onward).
- `verify <dir> [--expected-manifest-sha256 <hex>]`: offline, read-only, JSON result.
- `recovery-verify <original> <restored> [--expected-manifest-sha256 <hex>]`: offline comparison of two packages.
- `compare <before> <after> --out <dir>`: deterministic comparison of two saved scans (new, unchanged, changed, resolved, inconclusive). Refuses cross-version and cross-target comparisons.

### Quality gates

- 158 automated tests (see [02](02-development-history.md)), including sandboxed browser tests with no silent skips.
- CI on Node 24 with a secrets scan and a dependency audit at high severity.

## Limitations (what the tool does not establish)

### Scope of observation

- **One page, one time window, one viewport and user agent.** A completed scan does not establish exhaustive observation.
- No consent is accepted or rejected. Post-consent behaviour may be absent.
- No authentication, so logged-in areas are not observed.
- No body inspection: request and response bodies are never persisted or examined.
- A missing tracker match does not prove absence of tracking.
- A 2xx response to a tracker POST means the endpoint answered; it does not show the payload was processed.

### Assessment

- PASS means no relevant finding within the performed checks. It does not mean the site is secure.
- Headers are checked for presence on the main response only. A CSP is not validated in full; X-Frame-Options is covered only through CSP frame-ancestors.
- Rules are fixed and small. Coverage is narrow by design.
- REVIEW and FAIL require a human judgement; the tool does not make legal findings.

### Redaction

- Query values, URL credentials and fragments are removed structurally.
- Path segments, free text and metadata names use pattern-based scrubbing, which is incomplete by nature. Novel short identifiers, nested encodings and sensitive text in allowed diagnostic headers can survive.
- Redaction can remove useful context.

### Integrity

- A manifest detects change relative to `manifest.json`. Anyone able to rewrite the package can rewrite its manifest.
- Without `--expected-manifest-sha256`, verification shows internal consistency only.
- With a digest obtained through a trusted channel, the manifest is bound to that reference. This does not establish who created the package or that the observations were accurate.
- Legacy scans without a manifest cannot be verified and are reported `not-provided`.
- A concurrent local writer after verification is not detected. Symbolic links in the parent path you pass are followed by design.
- Hard links are rejected even when they are harmless, so `cp -l` copies fail verification.
- Output always states `authenticityEstablished: false`.

### Recovery

- `recovery-verify` shows that two packages are byte-for-byte equivalent in the checked fields. It does **not** show that a restored WordPress site is malware-free, functional or correctly configured, and it does not show which copy is the true original.

### Operations

- Requires a locally installed Chromium-based browser and a host where Chromium's sandbox works. CI runs on Ubuntu 24.04 only; other platforms are documented as supported in README but are not exercised by CI. Containers, root execution, some AppArmor policies and missing user namespaces can prevent launch.
- No npm package, no GitHub release, no versioned binary distribution. Use from a checkout (`npm ci`, then `node src/cli.js`).
- Only Chromium-based browsers are supported by discovery; there is no Firefox or WebKit path.
- Timeouts: navigation up to 120 s, settle up to 30 s, browser start 30 s.

### Capability not present

- No WordPress recovery validation (Mission 028 proposal).
- No provenance, signatures or key handling (Mission 029 proposal).
- No scheduled or repeated monitoring (Mission 030 proposal).
- No automated lesson or service workflow (Mission 031 proposal).
- The `plans.js` multi-page and consent planners are contract code exercised only by tests.
