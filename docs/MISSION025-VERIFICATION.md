# Mission 025 verification record

Date: 2026-11-06. This is unreleased branch evidence, not a release claim.

## Baseline and scope

Repository: darjarihla-prog/dd-digital-web-evidence-inspector (public).
Clean starting branch: main. Baseline:
`9c9c67a86498469ccfbcb824f58c7d026b9d00f1`.
Feature branch: `feature/mission025-integrated-hardening`.
Package and lockfile version: 0.1.0; unchanged. License: Apache-2.0; unchanged.
No AGENTS.md was found in this project. All public issue bodies/checklists and
comment threads #1–#11 were read; initial comment threads were empty.

Node 24.22.1/npm 11.19.1, installed system Google Chrome and pdftotext were
available. Gitleaks was initially absent. Pinned Gitleaks 8.30.1 was downloaded
to a temporary tool directory and verified against its upstream checksum:
`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`.
Actionlint 1.7.7 was installed separately in a temporary directory.

The connector could read issues/repository metadata but rejected a roadmap
comment with HTTP 403. The gh CLI worked with external network access; no
credentials were printed or committed. Repository metadata confirmed push
permission and Actions enabled. Private vulnerability reporting was verified
disabled; SECURITY.md describes the limitation without inventing an address.

## Reproduction and data flow

The baseline evidence builder was loaded from a temporary `git archive` of
9c9c67a and given a synthetic localhost target with a query marker. Result:
`targetQuerySecretExposed: true`. No baseline browser was launched because its
configuration disabled the sandbox.

The original path was CLI normalisation → capture target.inputUrl (raw) →
scan.target and evidence.target → assessment.target → report renderers.
Redirect response headers also retained raw Location values. The fix sanitizes
at capture and builder boundaries; CLI diagnostics and redirect header values
are covered. Input query names are separately retained. Tests exercise raw
capture, evidence/findings JSON, Markdown, HTML and pdftotext-extracted PDF.
The synthetic marker is absent from all these artifacts. Cookie/storage values
are excluded; query/credential/fragment positions are structurally redacted.
Path, metadata and free-text scrubbing remains pattern-based and incomplete.

## Checks

- Baseline `npm test`: 46 tests, 46 passed, zero skips/failures.
- Expanded `npm test` (localhost-only test preload): 71 tests, 71 passed,
  zero skips/failures. Includes all original tests.
- `npm ci --cache <temporary-cache>`: successful clean locked installation,
  3 packages installed, 4 audited, zero reported vulnerabilities.
- Isolated fresh-directory `npm ci --cache <fresh-temporary-cache>`: passed with copied package.json/package-lock.json, no existing node_modules and a fresh cache (3 packages installed; zero vulnerabilities).
- `npm audit --audit-level=high`: zero reported vulnerabilities.
- `actionlint .github/workflows/ci.yml`: passed.
- `gitleaks git --redact --no-banner .`: baseline history passed; final commit history is scanned before push. A clean source-only mirror including untracked changes passed `gitleaks dir --redact --no-banner <temporary-source-mirror>`.
- `git diff --check`: passed.
- Artifact SHA256 checks and dangling/duplicate-reference rejection: passed.
- Sandbox launch-option regression covers every candidate; live browser tests
  pass with `chromiumSandbox: true` and no --no-sandbox argument.
- Multi-page contract/fixture tests and three fresh consent contexts pass;
  production executors/aggregation remain incomplete by design.
- Historical comparison is deterministic, evidence-linked, rejects incompatible
  schemas and tampered manifests, and handles incomplete scans conservatively.
- Evidence-only single-page CLI and comparison CLI are tested end to end.

Tests use only synthetic localhost pages or synthetic records. Test routing
blocks external page destinations. Browser profiles and output artifacts are
not committed; temporary captures are cleaned by test teardown. No captured
browser data is uploaded. Installation, GitHub operations and dependency audit
make external development-time requests, separate from test observations.

## Failures encountered and resolved

Sandboxed initial tests could not complete under process/network restrictions;
the baseline passed in the supported host environment. A sandboxed npm ci
failed with registry DNS ENOTFOUND and temporarily left node_modules incomplete;
a premature test attempt therefore failed imports. The network-enabled
npm ci restored locked dependencies and the later full suite passed.
A short navigation-timeout regression also constrained browser launch; startup
now has an independent timeout. The same fixture exposed title/storage waiting
on an unfinished document: navigation failure now skips unsupported collection
and records the gap; metadata reads have independent bounds. These failures
were not promoted as successful checks. Local raw logs are temporary and are
not public research evidence.

## Implementation commits

- `9b273ef`: capture privacy, sandbox enforcement, incomplete observations and response-drain regressions.
- `ab0a59f`: structural/reference validation, output manifests, historical comparison, CLI integration and controlled design fixtures.
- `9365248`: Node 24 CI and documentation. A follow-up shutdown regression records browser-context close failures explicitly. Hosted CI links and acceptance progress are recorded on the draft PR and public roadmap after push.

## Acceptance map

| Issue | Verified branch evidence | Remaining condition |
| --- | --- | --- |
| #1 | Synthetic baseline leak, raw-to-PDF regression, input query names retained | Maintainer review; unreleased |
| #2 | Explicit sandbox on every launch attempt; live Linux tests | Other host/kernel policies remain environment-dependent |
| #3 | Versioned INCONCLUSIVE outcomes, timeout regression, reports/migration | Legacy raw callers retain compatibility semantics |
| #4 | URL/header/name/console synthetic vectors; all artifact regression | No universal redaction guarantee |
| #5 | Late/hung/missing metadata and shutdown tests, delayed local response/failure/redirect fixture | Finite observation window remains |
| #6 | Node 24 push/PR workflow, npm ci, required browser tests, audit, least privilege, full SHA pins | Hosted passing run must be verified |
| #7 | README, contributor/security/changelog/setup/fixture/limitations guidance | Maintainer review |
| #8 | Versioned bounded design, plan validation, explicit two-page local fixture | Production executor, redirect guard, aggregation/resource budgets incomplete |
| #9 | Versioned consent design, verified local buttons, isolated states/traffic test | Production action provenance and executor incomplete |
| #10 | Versioned deterministic diff, metadata/ID references, conservative resolution, CLI/tamper tests | Maintainer review; equal schemas/rules only |

No issue is closed by this record. Checklists may be marked only with evidence,
and unmerged branch work must never be described as released. Main and the
baseline commit are preserved. No deployment, merge, visibility change, force
push or release publication is authorized by this milestone.

## Guardian Saga Informatica

IDRIS: preserve original artifacts, references, truncation and hash provenance.
AVELIN: structural privacy controls, sandbox enforcement and honest limits.
SIRAJ: verified checks, reviewable commits, open backlog and draft-only delivery.
