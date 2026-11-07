# 07 · Future roadmap

Status: **all missions below are proposals.** None is implemented. Scope follows the project notes (Dutch source, section 4). Ordering reflects dependency, not commitment.

## Sequencing logic

```
027 (done) ──► 028A design gate ──► 028 lab validation ──► 029 provenance ──► 030 monitoring ──► 031 reporting/learning
                    │                                           ▲
                    └───── independent reference inputs ────────┘
```

- 028 must not start with live-site work. Its first deliverable is a design document with a test matrix and acceptance criteria.
- 029 depends on the reference-digest and manifest work in 027, but provenance design is a separate decision.
- 030 depends on 028 and 029 because a change-detection result is only useful if the evidence behind it is trustworthy.
- 031 depends on stable outputs from 028 to 030 and on a privacy and factual-claims review before publication.

## Mission 028 | Recovery Validation Gate (proposed)

**Purpose.** Extend package integrity into demonstrable recovery validation, in an isolated WordPress test environment.

**Planned checks (from the project notes):**
1. Backup integrity: provenance metadata, date, file set, database export, hashes.
2. Isolated restore: local or staging fixtures only; no automatic action on production.
3. Security diff: WordPress core checksums, plugins, themes, accounts/roles/capabilities, configuration files, MU-plugins, scheduled tasks, unexpected PHP files in uploads.
4. Functional checks: homepage, login, permalinks, media, database, HTTPS, and relevant forms where safe to test.
5. Evidence chain: results, limitations, logs and hashes, with independent references where available.

**Phase 028A (first step).** Design-only: threat model, lab architecture, synthetic WordPress fixture, test matrix, acceptance criteria, and a non-destructive recovery procedure. No code that touches a live site.

**Non-goals.** Production restore; automatic WordPress changes; any claim of malware-free status.

**Exit.** See [09](09-acceptance-criteria.md#mission-028--recovery-validation-gate).

## Mission 029 | Evidence Provenance and Trust Model (proposed)

**Purpose.** Make explicit which actor, source and time reference support each evidence claim.

**Research scope:** signed manifests, key management, verification of external reference digests, reproducible builds, and a hand-over log.

**Approach.** Threat model and interoperability design first. A signature does not make an observation truthful; the design must say so.

**Non-goals.** Automatic trust in any signer; a key-management service; a claim that a signature proves the observed site state.

## Mission 030 | Continuous Validation and Change Detection (proposed)

**Purpose.** Safe, consent-bounded comparison between measurement points, distinguishing new observations, resolved findings and insufficient evidence.

**Research scope:** explicit scope, limits, schedule, retention, reproducible diff, and protection against unintended scanning or sensitive-data collection.

**Non-goals.** Active scanning without documented authorization; unattended repeated scans of third-party sites.

## Mission 031 | Reporting and Learning Experience (proposed)

**Purpose.** Make results understandable for developers, clients and students.

**Research scope:** evidence-to-finding links, explanation of confidence and limits, export formats, accessibility, example labs and teaching material.

**Non-goals.** Publishing real captures; publishing before privacy and factual-claim review.

## Standing policy for every mission (from project notes, section 5)

- Scope and threat model before implementation.
- Synthetic regression test for each confirmed vulnerability.
- `npm test`, syntax checks, `git diff --check`, and dependency audit.
- No unexpected changes to source evidence.
- No secrets or sensitive artifacts in commits, tests or PR descriptions.
- Feature branch, pull request and CI; merge only on explicit maintainer decision.
- Release, package publication and deployment are separate decisions.
- Compatibility changes documented and approved in advance where needed.
