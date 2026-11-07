# 09 · Acceptance criteria

Status: proposed criteria for future milestones. They are not met by any current milestone except where marked **Met (027)**. Criteria for Mission 028 are stated first because they gate the next work.

## Common criteria (every milestone)

A milestone is accepted only when all of the following hold:

1. Scope, non-goals and threat model are written and reviewed before implementation.
2. `npm test` passes locally and in CI with no skipped browser tests and no silent fallback.
3. `git diff --check` is clean.
4. Each confirmed issue has a synthetic regression test that fails before the fix and passes after.
5. No changes to source evidence fixtures unless the change is explicitly documented.
6. No secrets, captures or real third-party data in commits, tests, fixtures or PR text. The CI secrets job passes.
7. Documentation reflects the implemented behaviour and its limits, with no claim beyond what tests show.
8. Changes merge through a feature branch and pull request. Merge requires explicit maintainer approval.
9. Release, npm publication and deployment are not part of the milestone unless the maintainer separately decides so.

## Met by Mission 027 (verified)

| Criterion | Status | Evidence |
| --- | --- | --- |
| Offline, read-only `verify` | **Met (027)** | README; `verify.js`; package-verification tests |
| Offline recovery comparison | **Met (027)** | `verifyRecovery`; tests |
| Strict manifest parsing (duplicate keys, depth, ASCII keys) | **Met (027)** | `parseStrictJson`; tests |
| Confirmed issues regression-tested: E1, E2, O1, O2, and the legacy-symlink case (project notes L1, test E5) | **Met (027)** | Project notes; compare-security and package-verification tests |
| Post-merge CI | **Met (027)** | Run `42333596030`, success |

Mission 027 does **not** meet any criterion for WordPress validation, provenance or monitoring, because those were not in its scope.

## Mission 028 | Recovery Validation Gate

### Phase 028A (design only)

- A written threat model covering: tampered backup, incomplete backup, wrong site, accidental production write, and leakage of site data into evidence.
- A lab architecture document that states where the isolated environment runs, how it is reset, and how production is excluded.
- A synthetic WordPress fixture specification with no real content, credentials or user data.
- A test matrix listing positive and negative cases for every planned check.
- A recovery procedure that is non-destructive by construction and states its own limits.
- Maintainer review and approval of 028A before any implementation.

### Phase 028B (implementation, after 028A approval)

- A machine-readable result with stable `PASS`, `FAIL` and `INCONCLUSIVE` statuses.
- Every check result carries its evidence references and an explicit limitation text.
- A negative case is included for each check category (for example a modified core file, an extra PHP file in uploads, a missing database table).
- The result keeps file integrity, security observation and functional health in **separate** fields. A file-integrity PASS must never be presented as functional health.
- The tool runs only against the isolated fixture; a test confirms that a production-looking URL is refused.
- No output or documentation claims malware-free status or full functional correctness.

## Mission 029 | Evidence Provenance (proposed)

- Threat model written, including what a signature does **not** prove.
- Verification of a signed manifest fails closed on unknown or missing keys.
- The `authenticityEstablished` field is not set to `true` by any code path without a verified, documented trust anchor, and the claim is limited in the output.
- Key handling is out of scope for the first step, or the design says how keys are stored and rotated.

## Mission 030 | Continuous Validation (proposed)

- Written consent and scope statement per target; the tool refuses targets without a recorded scope.
- Retention and deletion rules are implemented and tested.
- Diff output distinguishes new, resolved and inconclusive, using the existing comparison semantics.
- Scheduled runs require explicit configuration; no default schedule.

## Mission 031 | Reporting and Learning (proposed)

- Each published example is synthetic or authorized, and reviewed for privacy and factual claims.
- Every finding in an example links to the evidence it cites.
- Confidence and limitation text is shown next to each finding.
- Accessibility check performed on the HTML output (criteria to be chosen by the maintainer).

## Documentation acceptance (this branch)

- Every factual statement in `docs/roadmap/` is either verified in the repository or GitHub metadata, or labelled **Reported** or **Proposed**.
- No document claims that a SHA256 manifest proves authenticity.
- No document claims that the tool validates live WordPress recovery.
- Merged code is never described as a published release.
- README links to the roadmap index.
