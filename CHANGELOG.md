# Changelog

## Unreleased — Mission 025

- Redact original input URLs before capture returns and before evidence building;
  preserve sanitized query names and scrub URLs embedded in diagnostics.
- Require Chromium sandboxing on all browser launch candidates.
- Redact unexpected header values, redirect destinations, CSP nonces and
  recognized sensitive path/name patterns; document pattern limitations.
- Drain response metadata at shutdown with bounded waiting, explicit incomplete
  reasons, unfinished request IDs and capture limits.
- Emit evidence/assessment schema 0.2.0, with INCONCLUSIVE outcomes for absence
  checks affected by known capture gaps. Published package remains 0.1.0.
- Validate references/structure and write SHA256 artifact manifests.
- Add deterministic historical comparison with conservative incomplete handling.
- Add Node 24, required sandboxed browser/PDF tests, audit and secret-scanning CI.
- Add contributor/security guidance and versioned multi-page/consent designs
  with controlled fixtures; production multi-page/consent modes remain incomplete.

## 0.1.0 — baseline 9c9c67a

Initial Apache-2.0 open-source baseline: single-page observation, tracker rules,
English/Dutch assessment and reports, HTML/PDF summaries, and 46 tests.
