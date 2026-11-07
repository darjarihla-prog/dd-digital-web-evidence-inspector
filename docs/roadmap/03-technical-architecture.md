# 03 · Technical architecture

Status: verified by reading `src/`, `rules/`, `scripts/`, `.github/workflows/ci.yml` and `package.json` on `main` (`54cb531`).

## Runtime and dependencies

- Node.js ESM (`"type": "module"`), Node 24 in CI. No `engines` field is declared (see [10](10-open-decisions-and-debt.md)).
- Runtime dependencies: `playwright-core` ^1.49.0 (locked 1.65.0) and `tldts` ^6.1.0 (locked 6.1.86). No browser is downloaded at install time.
- A Chromium-based browser must be installed separately. Sandboxing is always on; there is no unsafe fallback.
- `poppler-utils` (`pdftotext`) is required by the PDF regression test.
- Tests use `node:test` via `npm test` (`--test-timeout=120000`).

## Module map

```
src/
  cli.js                 entry point; argument parsing, pipeline, verify/compare dispatch
  capture/
    browser.js           launchBrowser: browser discovery, sandboxed launch, proxy, timeouts
    session.js           captureSession: fresh context, one navigation, bounded observation
  evidence.js            buildEvidence: raw capture -> evidence 0.2.0 document
  redact.js              redactUrl, redactHeaders, redactPath, scrubText, truncation
  classify/
    domains.js           registrable-domain and first/third-party classification (tldts)
    trackers.js          matches requests against rules/trackers.json
    headers.js           observes security headers on the main response
    console-origin.js    classifies console noise (browser/runtime vs site)
  assess.js              assess: evidence -> assessment 0.2.0 (findings, counts)
  rules/
    index.js             12 deterministic rules (DR-*), status/severity/confidence logic
    messages.js          EN/NL wording, keyed by message ID, separate from rule logic
  output/
    report-md.js         consultant report (Markdown)
    client-summary.js    self-contained HTML summary and PDF rendering
  integrity.js           validateScan (structural, reference checks); writeManifest (SHA256)
  verify.js              strict package reader; verifyPackage, verifyRecovery, loaders
  compare.js             historical comparison of two saved scans (uses verify.js loaders)
  plans.js               design-only contracts: planPages, planConsent (tests only; not wired to CLI)
rules/trackers.json      versioned tracker rule set (bundled)
scripts/source-manifest.js  SHA256 manifest of tracked source files
```

## Pipeline: one scan

1. **Argument parsing and validation** (`cli.js`): timeout 1 to 120000 ms, settle 0 to 30000 ms, wait event, language `nl` (default) or `en`.
2. **Capture** (`capture/session.js`): launches the sandboxed browser, opens a fresh context, navigates once, waits, and records requests, responses, cookies, storage metadata, console messages and page errors. Capture caps: 5000 requests, 1000 console messages, 1000 page errors. Metadata drain is bounded to five seconds.
3. **Evidence build** (`evidence.js`): redacts the input and final URLs, classifies parties and trackers, observes headers, and assigns stable evidence IDs. It classifies but does not grade.
4. **Schema check** (`integrity.js: validateScan`): unique IDs, resolvable evidence references, declared truncation. A focused structural validator, not a JSON Schema engine.
5. **Assessment** (`assess.js` + `rules/`): each rule returns a status from evidence. Known capture gaps convert would-be PASS checks to INCONCLUSIVE.
6. **Validation again** with the assessment attached.
7. **Output** into `out/<scan id>/`: `evidence.json`, `findings.json`, `report.md`, `client-summary.html`, optional `client-summary.pdf`, and `manifest.json`. `--evidence-only` stops after step 3 and writes evidence plus manifest.
8. **Manifest** (`integrity.js: writeManifest`): SHA256 and size for each file actually written, plus provenance (scan ID, schema, tool). Manifests detect change; they are not signatures.

## Rule set

Twelve rule IDs are implemented in `src/rules/index.js` (verified):

| Area | Rule IDs |
| --- | --- |
| Cookies | DR-COOKIES-001 |
| Headers | DR-HEADERS-001 |
| Privacy (trackers, tracking cookies) | DR-PRIVACY-001, DR-PRIVACY-002 |
| Site quality | DR-QUALITY-001, DR-QUALITY-002 |
| Redirects | DR-REDIRECT-001 |
| Storage | DR-STORAGE-001 |
| Third parties | DR-THIRDPARTY-001, DR-THIRDPARTY-002 |
| Transport (HTTPS) | DR-TRANSPORT-001, DR-TRANSPORT-002 |

Statuses: `PASS`, `REVIEW`, `FAIL`, `INCONCLUSIVE`; `NOT_TESTED` is reserved for comparison inputs. Severities: `info`, `low`, `medium`, `high`. Confidence: `low`, `medium`, `high`.

## Output contracts

| Document | Schema | Version | Notes |
| --- | --- | --- | --- |
| evidence.json | `darja-rihla-web-evidence` | 0.2.0 | Adds `scan.observation`. See [SCHEMA-MIGRATION](../SCHEMA-MIGRATION.md). |
| findings.json | `darja-rihla-assessment` | 0.2.0 | Adds `counts.inconclusive`. |
| manifest.json | `darja-rihla-manifest` | 1.0.0 | Optional per-file `size` (written by 027 onward). Algorithm `SHA256`. |
| diff.json | `darja-rihla-scan-diff` | 1.0.0 | Comparison result. |
| verify result | `darja-rihla-package-verification` | 1.0.0 | Stdout JSON. Always `authenticityEstablished: false`. |
| recovery result | `darja-rihla-recovery-verification` | 1.0.0 | Stdout JSON. Same provenance block. |

Package `0.1.0` is the baseline version string. Its evidence and assessment contracts are
still readable, but cross-version comparison is refused.

## Verification subsystem (Mission 027)

`verify.js` is the single strict reader for packages:

- `verifyPackage` checks the manifest (bounded to 1 MiB, 64 entries, nesting 16), enforces the entry-key allowlist (`file`, `sha256`, `size`), validates filenames, selects a profile (`evidence-only` or `assessment`), rejects unlisted profile files, hashes each listed file, and reports unlisted top-level entries as `EXTRA_FILE`.
- Symbolic links and hard links are rejected. Non-regular files are refused without being opened (`O_NONBLOCK`). A file changing during hashing is rejected.
- `verifyRecovery` runs `verifyPackage` on both packages and then compares manifest bytes, profile, file set, sizes and SHA256.
- `loadVerifiedPackage` and `loadUnverifiedPackage` are used by `compare.js`. Verified bytes are re-hashed before parsing.
- Exit codes: `0` verified/match, `1` failed/mismatch, `2` usage error, `4` rejected.

`compare.js` builds on the same loaders. Output is written only with exclusive-create flags, is refused if it is a symlink or lies inside an input, and never overwrites.

## Test architecture

| Layer | Files | Notes |
| --- | --- | --- |
| Unit / contract | assessment, evidence-core, evidence-integrity, console-origin, tracker-transmission | Synthetic records. |
| Browser integration | hardening, response-completeness (fake events), test-app and hardening-app fixtures | Localhost only; `DR_TEST_LOCALHOST_ONLY=1` in CI. |
| Package verification | package-verification (58 tests) | Filesystem fixtures in temp directories. |
| Compare security | compare-security (29 tests) | Symlink, hard-link, duplicate-key and output-path cases. |
| Local-only guard | `tests/local-only.js` | Imported via `--import` in `npm test`. |

## CI

`.github/workflows/ci.yml` (verified):

- `test` job on `ubuntu-24.04`: Node 24, `npm ci`, installs `poppler-utils`, checks the Chrome binary at `/usr/bin/google-chrome` and `pdftotext`, runs `npm test`, then `npm audit --audit-level=high`.
- `secrets` job: checksum-verified Gitleaks 8.30.1 scans committed history (`fetch-depth: 0`).
- Read-only permissions; Actions pinned to commit SHAs; `persist-credentials: false`.

## Known architectural gaps

- No WordPress-specific logic and no restore or live-site validation.
- No signing, key management or provenance beyond a caller-supplied manifest digest.
- Single-page inspection only. Multi-page and consent designs are contract tests, not CLI features (see README).
- `TOOL_VERSION` (`src/evidence.js`) is hard-coded to `0.1.0` rather than read from `package.json`.
