# 06 · Expected value

Status: proposal-level assessment. Value claims are limited to what the current, tested tool supports. Anything beyond that is labelled as a future benefit that depends on a proposed mission.

## Guardrail

The project notes require that service delivery never suggest stronger guarantees than the executed tests justify. Every value statement below is therefore paired with its limit.

## 1. Open-source research instrument

**Current value**
- A small, readable, Apache-2.0 codebase for one-page, consent-bounded observation with explicit limits.
- Machine-readable outputs (JSON) and human outputs (Markdown, HTML, PDF) that cite the same evidence IDs.
- Deterministic comparison of two saved scans, with conservative handling of incomplete data.

**Limit**
- Single page, single visit, narrow rule set. Not a substitute for a security assessment or a legal review.

## 2. DD Digital service delivery

**Current value**
- A repeatable first-pass technical observation that can be re-run and archived with a manifest.
- Client summary and consultant report that separate observation, finding and recommendation.
- Offline package verification for showing that archived evidence still matches what was produced.

**Limit (must appear in every client-facing statement)**
- A PASS does not mean secure. A successful `recovery-verify` does not mean a restored site is clean or working. A manifest match does not prove authenticity.

**Future value (depends on proposals)**
- A documented recovery-validation gate for WordPress (Mission 028), once designed and tested in an isolated lab. Until then, no restore-validation service can be claimed.

## 3. Darja Rihla applicable knowledge and portfolio

**Current value**
- For each security principle, the repository shows an attack or failure mode reproduced with synthetic fixtures, a regression test, a fix and the remaining limit. Examples in the history: symlink in package (E1), duplicate JSON keys (E2), symlink in a legacy scan (called L1 in the project notes, E5 in the test suite), dangling-symlink output escape (O1), output inside source package (O2). The test labels E4 and E5 also exist and are not in the notes list.
- This is teaching material in its own right if published with synthetic data only.

**Limit**
- Publish only synthetic or authorized evidence. Do not publish captures of real third-party sites.

## 4. Reusable evidence-integrity layer

**Current value**
- The verification and manifest principles in `verify.js` and `integrity.js` are self-contained and do not depend on browser code. They could be reused in another project.

**Limit**
- Reuse is an ambition, not an integration. It requires explicit design, tests and a compatibility decision. No other project consumes this code today.

## Audience-specific risks

| Audience | Risk | Mitigation in the project |
| --- | --- | --- |
| Clients | Over-reading a PASS or a hash match | Limits stated in every output; provenance block with `authenticityEstablished: false`. |
| Students | Reading the tool as a complete security scanner | Explicit non-goals in README and [01](01-vision-and-purpose.md). |
| Open-source users | Assuming an npm package exists | Package is private and unpublished; docs state this ([02](02-development-history.md)). |
| Maintainer | Confusing merged code with a release | Release is a separate decision (D1 in [10](10-open-decisions-and-debt.md)). |

## What is not a value claim today

- Automated WordPress recovery validation.
- Production monitoring or scheduled change detection.
- Signed releases or independent trust anchors.
- Multi-page or consent-comparison inspection in the CLI.
