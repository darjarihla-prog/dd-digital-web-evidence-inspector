# 08 · Technical backlog

Status: 2026-11-07. Priority: **P0** blocks accurate documentation or a responsible release decision; **P1** needed before Mission 028 work; **P2** improves maintainability; **P3** optional. Size is a rough estimate (S < half a day, M one to two days, L several days). Nothing here is scheduled.

## Documentation and repository hygiene (this branch)

| ID | Pri | Size | Item | Source / evidence | Status |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | P0 | S | Add roadmap index link to README | README has no link to `docs/roadmap/` | Done on this branch |
| DOC-02 | P0 | S | Replace "published baseline" wording (README, SECURITY) with the verified state: unpublished, private package | README lines 9–11 and SECURITY line 66 (both before this branch edited them); npm E404; `"private": true` | Done on this branch |
| DOC-03 | P0 | S | Replace "this branch" wording in README and SCHEMA-MIGRATION with `main` / merged status | README lines 9–11 and SCHEMA-MIGRATION line 3 before edit (now line 4) | Done on this branch |
| DOC-04 | P1 | S | Update SECURITY.md verification date for private vulnerability reporting (still disabled 2026-11-07) | SECURITY line 12 before edit (now line 7); GitHub API | Done on this branch |
| DOC-05 | P1 | S | Clarify the "manifest checks" sentence the project notes flag as outdated in SCHEMA-MIGRATION | Project notes section 6; no specific sentence proven wrong in review | **Open**: see [10](10-open-decisions-and-debt.md) Q3 |
| DOC-06 | P2 | S | CONTRIBUTING says "baseline 46 tests remain" without the current 158 total | CONTRIBUTING line 22 | Not changed |
| DOC-07 | P2 | S | Decide whether `docs/roadmap/` source (Dutch) is committed to the repository | Untracked file | **Open**: see [10](10-open-decisions-and-debt.md) Q1 |

## Code debt (no behaviour change proposed here)

| ID | Pri | Size | Item | Source / evidence |
| --- | --- | --- | --- | --- |
| DEBT-01 | P1 | S | `TOOL_VERSION` hard-coded to `0.1.0`; derive from `package.json` or add a test that they match | `src/evidence.js:16`; `package.json` version |
| DEBT-02 | P1 | S | Add `engines` (Node 24) to `package.json` so the requirement is machine-enforced | README and CI say Node 24; no `engines` field |
| DEBT-03 | P2 | M | `compare` writes `diff.json` and `comparison.md` before the manifest; a failure mid-way leaves a partial output directory. Consider writing to a temp sibling and renaming, or documenting it | `src/compare.js:144–146`; output is exclusive, so reruns need a new directory |
| DEBT-04 | P2 | S | Duplicate `lstatOrNull` helper in `verify.js` and `compare.js` | Both modules define it |
| DEBT-05 | P2 | S | `scripts/source-manifest.js` hard-codes the baseline commit `9c9c67a…` | `scripts/source-manifest.js:10` |
| DEBT-06 | P2 | S | CONTRIBUTING lists `actionlint` as a check; CI does not run it | CONTRIBUTING line 17; `ci.yml` |
| DEBT-07 | P3 | S | `plans.js` (multi-page and consent contracts) is exercised only by tests; document as design contract or remove when Missions 028–030 need it | `src/plans.js`; tests only |
| DEBT-08 | P3 | M | `validateScan` is a focused structural check, not a schema. A JSON Schema export would make external consumers easier to validate | `src/integrity.js:6`; SCHEMA-MIGRATION |

## Verification and integrity (candidates, not commitments)

| ID | Pri | Size | Item | Source / evidence |
| --- | --- | --- | --- | --- |
| INT-01 | P1 | M | Add an end-to-end test that runs `verify` against a package produced by the real CLI (not only hand-built fixtures) | Current tests build packages in temp directories |
| INT-02 | P2 | S | Document the exit code and JSON result format in a single machine-readable reference (for downstream tooling) | README "Package verification"; `verify.js` `EXIT_CODES` |
| INT-03 | P2 | S | Decide whether the 1 MiB manifest and 64-entry caps must change for larger packages | `VERIFY_LIMITS` in `src/verify.js` |
| INT-04 | P2 | S | Consider adding an optional `--expected-manifest-sha256-file` to avoid pasting digests into shell history | Argument parser in `verify.js` |

## CI and supply chain

| ID | Pri | Size | Item | Source / evidence |
| --- | --- | --- | --- | --- |
| CI-01 | P1 | S | Add `actionlint` to CI if CONTRIBUTING continues to require it | DEBT-06 |
| CI-02 | P2 | S | Add a CI job that fails if `package.json` version and `TOOL_VERSION` differ | DEBT-01 |
| CI-03 | P2 | S | Pin `poppler-utils` expectation with a version check in CI, or document accepted variance | `ci.yml` installs from apt without version |
| CI-04 | P3 | M | Add CodeQL or equivalent static analysis, after maintainer decision | No such workflow exists |

## Mission-linked work

| ID | Pri | Size | Item | Mission |
| --- | --- | --- | --- | --- |
| M28-01 | P1 | M | Write the 028A design: threat model, lab architecture, WordPress fixture scope | 028 |
| M28-02 | P1 | M | Define the synthetic WordPress fixture (core files, plugin list, accounts, MU-plugins) without real data | 028 |
| M28-03 | P1 | M | Define the PASS / FAIL / INCONCLUSIVE rules for recovery checks and their negative cases | 028 |
| M29-01 | P2 | L | Threat model and interoperability design for signed manifests | 029 |
| M30-01 | P2 | L | Define scope, schedule, retention and consent rules for repeated observation | 030 |
| M31-01 | P3 | M | Define an accessibility and privacy review checklist for published example reports | 031 |
