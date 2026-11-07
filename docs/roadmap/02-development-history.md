# 02 · Development history

Status: verified on 2026-11-07 unless marked **Reported**.

## Verified repository and GitHub facts

| Item | Verified value | Source |
| --- | --- | --- |
| Repository | `darjarihla-prog/dd-digital-web-evidence-inspector` | git remote |
| Default branch | `main` | `git fetch`, origin/main |
| Licence | Apache-2.0 | LICENSE, package.json |
| Package version in `package.json` | `0.1.0`, with `"private": true` | package.json on `9c9c67a` and `main` |
| npm package | **Not published**. `npm view` returns E404. | npm registry, 2026-11-07 |
| GitHub releases | None | `gh release list` (empty) |
| Git tags | None | `git tag -l` (empty) |
| Private vulnerability reporting | **Disabled** (`{"enabled":false}`) | GitHub API, 2026-11-07 |

## Commit and PR timeline (verified)

| Date (UTC) | Item | Identifier | Notes |
| --- | --- | --- | --- |
| 2026-11-06 | Initial Apache-2.0 open-source baseline | commit `9c9c67a` | 46 tests at baseline (CONTRIBUTING, CHANGELOG 0.1.0). |
| 2026-11-07 01:22 | Mission 025 merged, PR #12 | squash `74e67ba` | Branch `feature/mission025-integrated-hardening`. Adds evidence 0.2.0, manifests, comparison, Node 24 CI, secrets job. |
| 2026-11-07 03:20 | Mission 027 merged, PR #13 | squash `54cb531` | Branch `feature/mission027-evidence-recovery`; feature commit `9e25cfd`. Adds `verify`, `recovery-verify`, stricter `compare`. |

### CI on `main` (verified via GitHub Actions)

| Run | Commit | Result | Jobs |
| --- | --- | --- | --- |
| `42323738654` | `74e67ba` (Mission 025) | success | `test` success, `secrets` success |
| `42333596030` | `54cb531` (Mission 027) | success | `secrets` success; `test` success (install, PDF tool, browser check, `npm test`, `npm audit --audit-level=high`) |

### Mission 027 squash

PR #13 was squash-merged. The feature commit `9e25cfd` on the local branch
`feature/mission027-evidence-recovery` is therefore not an ancestor of `main`; the
squash commit `54cb531` carries the same change. Git therefore reports the local feature
branch and `origin/main` as diverged by one commit each. This is expected after a squash
merge and is not a problem to fix.

## Test evidence

| Date | Where | Result |
| --- | --- | --- |
| 2026-11-07 | Local run on `docs/project-roadmap-2026-11` (base `origin/main` `54cb531`), `npm test` | 158 tests, 158 pass, 0 fail, 0 skipped, 0 cancelled. Exit 0. |
| 2026-11-07 | Static count of `test(` calls in `tests/*.test.js` | 158, distributed as 71 + 58 + 29 (see below). |
| 2026-11-07 | GitHub Actions run `42333596030` | success |

Breakdown of the 158 tests by file (static count, verified):

| Group | Files | Count |
| --- | --- | --- |
| Pre-Mission-027 suite | console-origin 11, evidence-core 15, assessment 10, hardening 18, tracker-transmission 4, response-completeness 7, evidence-integrity 6 | 71 |
| Package verification (Mission 027) | package-verification | 58 |
| Compare security (Mission 027) | compare-security | 29 |

## Mission status register

| Mission | Status | Evidence level |
| --- | --- | --- |
| 025 Evidence-first baseline and hardening | Merged to `main` (PR #12) | Verified |
| 026 Privacy and secrets review | Completed according to project notes. No PR, commit or document for it exists in this repository. | **Reported.** The Gitleaks result is recorded only in the project notes and [MISSION025-VERIFICATION.md](../MISSION025-VERIFICATION.md) (dated 2026-11-06). The CI `secrets` job on every run is the only repository-level control. |
| 027 Evidence integrity and recovery verification | Merged to `main` (PR #13) | Verified |
| 028 Recovery Validation Gate | Proposed | Not started |
| 029 Evidence Provenance and Trust Model | Proposed | Not started |
| 030 Continuous Validation and Change Detection | Proposed | Not started |
| 031 Reporting and Learning Experience | Proposed | Not started |

### Mission 026 caveat

The project notes list Mission 026 as a completed privacy and publication review. The
repository contains no Mission 026 artifact of its own. The Gitleaks results attributed
to it are a point-in-time observation, and the notes say so. This documentation does
not restate them as a current guarantee.

## Changelog labels versus mission names

`CHANGELOG.md` uses internal labels such as *Mission 027B* and *027C* / *027C.1* for the
security-review sub-steps of Mission 027. The PR title is *Mission 027: harden evidence
verification and recovery comparison*. Both refer to the same merged work. The
historical CHANGELOG headings are kept unchanged.

## Release status (answer to "is it released?")

No. The code is merged to `main`. The package has never been published to npm, has no
GitHub release and no tag. `package.json` marks the package private. Any release is a
separate maintainer decision (see [10](10-open-decisions-and-debt.md), decision D1).
