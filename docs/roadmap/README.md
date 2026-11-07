# Project documentation and roadmap

Status date: 2026-11-07. Branch of record: `main` at `54cb531` (Mission 027 squash merge, PR #13).

This folder is the maintainer-facing record of what the Web Evidence Inspector is,
what has been verified, how it is built, what it can and cannot prove, and what is
planned next. Every statement is classed as one of:

- **Verified**: confirmed in the repository, git history, GitHub metadata, CI results or a local test run on the stated date.
- **Reported**: stated in the project notes but not reproducible from this repository (for example Mission 026 review results).
- **Proposed**: a future mission or feature. Nothing in a proposal is implemented.

## Documents

| # | Document | Contents |
| --- | --- | --- |
| 01 | [Vision and purpose](01-vision-and-purpose.md) | What the tool is for, and what it deliberately is not. |
| 02 | [Development history](02-development-history.md) | Verified milestones, commits, PRs, CI runs and test counts. |
| 03 | [Technical architecture](03-technical-architecture.md) | Modules, data flow, output packages and contracts. |
| 04 | [Capabilities and limitations](04-capabilities-and-limitations.md) | What is implemented today and what it does not establish. |
| 05 | [Security and integrity principles](05-security-and-integrity-principles.md) | Evidence, redaction and package-verification rules. |
| 06 | [Expected value](06-expected-value.md) | Value for the maintainer, DD Digital and open-source users. |
| 07 | [Future roadmap](07-future-roadmap.md) | Proposed Missions 028 to 031, with scope and non-goals. |
| 08 | [Technical backlog](08-technical-backlog.md) | Prioritized, sized work items, each traced to a source. |
| 09 | [Acceptance criteria](09-acceptance-criteria.md) | Definition of done for each proposed milestone. |
| 10 | [Open decisions and technical debt](10-open-decisions-and-debt.md) | Maintainer decisions still pending and known debt. |

## Source material

- [Project notes and roadmap (Dutch, 2026-11-07)](Web-Evidence-Inspector-Projectnotities-Roadmap-2026-11-07.md) is the original source for this set. It is kept unchanged. The documents above restate it in English and check each claim against the repository.

## Related repository documents

- [README](../../README.md): install, CLI, outputs, limitations.
- [SECURITY](../../SECURITY.md): reporting status and security limits.
- [CHANGELOG](../../CHANGELOG.md): historical entries, kept as written.
- [Schema migration notes](../SCHEMA-MIGRATION.md): evidence, assessment and manifest contracts.
- [Mission 025 verification record](../MISSION025-VERIFICATION.md): dated evidence for the Mission 025 checks.
- [Contributing](../../CONTRIBUTING.md): setup, checks and evidence standards.

## Conventions

- Merged code is not a software release. As of 2026-11-07 no npm package and no GitHub release exist (see [02](02-development-history.md)).
- Nothing here claims that a SHA256 manifest proves authenticity or authorship.
- Nothing here claims that the tool validates a live WordPress recovery. It does not contain WordPress-specific logic.
