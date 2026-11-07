# Changelog

> Status note (2026-11-07): Mission 025 (PR #12, squash `74e67ba`) and Mission 027
> (PR #13, squash `54cb531`) are merged to `main`. No release or npm package has been
> published. Entries below are kept as written. See `docs/roadmap/` for project status.

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

## Unreleased — Mission 027B

- Add offline, read-only `verify <dir> [--expected-manifest-sha256 <hex>]`:
  SHA256 and optional size checks, missing/extra/modified files, strict
  filenames, bounded manifest parsing, duplicate and symlink rejection.
- Add `recovery-verify <original-dir> <restored-dir> [--expected-manifest-sha256 <hex>]`,
  a read-only comparison of two packages with stable JSON and exit codes 0/1/2/4.
- Manifest 1.0.0 gains an optional per-file `size` in newly written manifests.
  Historical manifests without sizes remain valid; the schema version is unchanged
  so `compare` keeps accepting both.
- Explicit profiles: `evidence-only` and `assessment` (optional PDF). Other
  packages, such as comparison outputs, are rejected by `verify`.
- Independent trust is limited to a caller-supplied SHA256 of manifest.json; no
  output claims provenance or authenticity.
- Behaviour change: `verify` and `recovery-verify` are now reserved first
  arguments, so a target host literally named `verify` must be written with a
  scheme (`https://verify`).
- Security review 027C: reject repeated object keys at any depth, non-ASCII
  keys and nesting beyond 16 (`MANIFEST_AMBIGUOUS`, `MANIFEST_TOO_DEEP`); require
  strict UTF-8; reject hard links, trailing-dot and Windows-reserved names;
  refuse FIFOs without blocking (`O_NONBLOCK`); bound total package bytes
  (512 MiB); detect files that change during hashing; replace unexpected
  error text with fixed messages (`INTERNAL_ERROR`, `UNREADABLE_PACKAGE`).
- Compare security alignment (maintainer-approved behaviour change, 027C.1):
  `compare` reads manifests and scan documents through the strict verifier. It
  rejects symlinked and hard-linked inputs, duplicate JSON keys, unsafe names and
  malformed manifests, and reads only bytes whose SHA256 matches the manifest.
  Symlinked scan directories, and extra files in a scan directory, are now
  rejected, matching `verify`.
- Legacy scans without a manifest are still accepted and reported as
  `not-provided`. Their symlinks, hard links and devices are now refused, because
  the concrete risk is reading outside the scan.
- Compare output is hardened: the output path may not be a symbolic link and may
  not sit inside an input scan; every output file is created exclusively, so a
  dangling symlink cannot redirect a write. Pre-existing `manifest.json` in the
  output is refused.
- Unexpected loader failures use the fixed code `UNREADABLE_PACKAGE`, so Node error
  text with an absolute path is not printed.
- Removed the unused legacy `verifyManifest` reader. Valid comparison semantics,
  `diff.json` content and manifest 1.0.0 compatibility are unchanged.
- Compare output hardening (027C.1 completion): containment is decided on real
  paths, so an output equal to, inside, or reached through a symlinked parent or
  alias of either input is refused. A dangling link in the output path returns a
  fixed message. Writes are exclusive and never overwrite or delete; unrelated files
  in the output directory are kept.
- 158 tests: 71 existing, 58 package-verification and 29 compare-security tests.

## 0.1.0 — baseline 9c9c67a

Initial Apache-2.0 open-source baseline: single-page observation, tracker rules,
English/Dutch assessment and reports, HTML/PDF summaries, and 46 tests.
