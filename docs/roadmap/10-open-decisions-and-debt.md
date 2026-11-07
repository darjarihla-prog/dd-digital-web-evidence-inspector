# 10 · Open decisions and technical debt

Status: 2026-11-07. Decisions are for the maintainer. Each has a recommended option, but none is taken in this documentation work.

## Open decisions

### D1 | Publish an npm package or GitHub release?

- **Facts:** no npm package exists (E404). No tag or GitHub release exists. `package.json` is `"private": true`. Merged code on `main` is unreleased.
- **Options:** (a) keep unpublished and document as a checkout-only tool; (b) publish 0.1.0 after making the package public; (c) defer until 028 is designed.
- **Recommendation:** (a) for now. Publication changes the public contract, and Mission 027 added behaviour that has not yet been reviewed outside this repository.
- **Blocks:** any statement that the tool is "released" or "published".

### D2 | Commit the Dutch source roadmap to the repository?

- **Facts:** `docs/roadmap/Web-Evidence-Inspector-Projectnotities-Roadmap-2026-11-07.md` is untracked on the local checkout. The English documentation links to it.
- **Options:** (a) commit it as-is for transparency; (b) keep it local and remove the link from the index; (c) translate the source and keep only the English set in the repository.
- **Recommendation:** (a) or (c). The source is project notes and contains no secrets (checked), but the maintainer should confirm that its content is intended for a public repository.
- **Blocks:** the commit of this branch. The link in `docs/roadmap/README.md` breaks without the source file.

### D3 | Which sentence in `docs/SCHEMA-MIGRATION.md` is the "outdated manifest-check wording"?

- **Facts:** the project notes say a sentence about manifest checks is outdated. A line-by-line review found no sentence that is demonstrably false against `src/verify.js` and `src/compare.js`. The only stale wording verified in that file is "This branch emits", which now says `main`. The "Mission 027B" references are historical labels and were left as written.
- **Options:** (a) the maintainer names the sentence; (b) accept the current text after the wording fixes in this branch.
- **Recommendation:** (a). It is a small question but cannot be closed by guessing.

### D4 | Language of the roadmap set

- **Facts:** the project notes are in Dutch. README, SECURITY, CONTRIBUTING and the CLI output are in English. The handoff asks for "accurate project documentation".
- **Decision taken in this work:** the structured roadmap set is written in English, matching the existing repository documentation. The Dutch source is kept unchanged.
- **Maintainer may override** if Dutch documentation is wanted for DD Digital clients.

### D5 | Enable GitHub private vulnerability reporting?

- **Facts:** disabled (GitHub API, 2026-11-07). SECURITY.md states this and describes a fallback that asks for a public non-sensitive request.
- **Options:** enable it, or publish a maintainer contact channel.
- **Recommendation:** enable it, because the current fallback has no private route for a sensitive report.

### D6 | Is Mission 026 a separate record?

- **Facts:** the project notes list Mission 026 as complete. The repository has no Mission 026 commit, PR or document. Gitleaks results appear only in the notes and in `MISSION025-VERIFICATION.md`.
- **Options:** (a) keep as reported; (b) add a short dated record under `docs/`; (c) fold it into the 025 record.
- **Recommendation:** (b), so a future reader can see what was checked and when, without reading the notes.

### D7 | When does Mission 028 start?

- **Facts:** the project notes recommend starting with 028A, a design-only step, with no live-site work.
- **Decision needed:** approval to start 028A as a separate branch and PR.

## Technical debt

Full list with sources is in [08-technical-backlog.md](08-technical-backlog.md). The debt that matters most before 028:

| ID | Debt | Why it matters |
| --- | --- | --- |
| DEBT-01 | `TOOL_VERSION` duplicates `package.json` version | Evidence files can report a version that differs from the package. |
| DEBT-02 | No `engines` field | Node 24 is a requirement only in docs and CI. |
| DEBT-03 | Non-atomic multi-file comparison output | A failure mid-way leaves a partial directory that the exclusive-write rule then blocks. |
| DEBT-06 | `actionlint` required by CONTRIBUTING but not in CI | A documented check is not enforced. |
| INT-01 | No end-to-end test from real CLI output to `verify` | Current tests use hand-built fixtures; a CLI-level regression could slip through. |

## Documentation drift found in this review

| Location | Problem | Status in this branch |
| --- | --- | --- |
| README lines 9–11 (before edit) | "published baseline", "feature branch", "this branch" | Corrected |
| SECURITY line 66 (before edit) | "Package 0.1.0 is the published baseline" | Corrected |
| SECURITY line 7 | Verification date 2026-11-06 | Date updated to 2026-11-07 (still disabled) |
| SCHEMA-MIGRATION line 4 | "This branch emits" | Corrected to `main` |
| CONTRIBUTING line 22 | "baseline 46 tests" without current total | Not changed (accurate as stated); see DOC-06 |
| CHANGELOG | Headings "Unreleased — Mission 025" and "Unreleased — Mission 027B" | Kept unchanged (historical); a status note was added at the top |

## Questions for the maintainer

1. D2: Should the Dutch source roadmap be committed, kept local, or replaced by the English set?
2. D3: Which sentence is the outdated manifest-check wording in `SCHEMA-MIGRATION.md`?
3. D1: Is an npm release wanted now, or after Mission 028?
4. D5: Will private vulnerability reporting be enabled?
5. D7: Should 028A start after this documentation branch is merged?
