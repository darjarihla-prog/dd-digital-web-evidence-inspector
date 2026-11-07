# 05 · Security and evidence integrity principles

Status: principles restated from the project notes, README, SECURITY and CONTRIBUTING, and checked against `src/verify.js`, `src/compare.js` and `src/redact.js`.

## Principles

1. **Separate layers.** Observation, finding, recommendation and integrity are different artifacts. An evidence file never contains a verdict (README: "no assessment verdict"). Findings cite evidence IDs; recommendations cite findings.
2. **Observation is not proof of intent or legality.** The tool records what a browser saw on one visit. It does not establish the operator's purpose, legal basis or the site owner's actual data practices.
3. **Absence needs complete capture.** If capture was incomplete, a would-be PASS becomes INCONCLUSIVE. Observed REVIEW or FAIL signals are kept.
4. **Consent and authorization first.** Inspect only targets the operator is authorized to visit. Tests use synthetic localhost fixtures and never scan public sites.
5. **No upload, no telemetry.** Captures are written locally. Test runtime is guarded to localhost in CI.
6. **Minimise what is kept.** No request or response bodies, screenshots, form inputs or cookie or storage values. URLs keep sanitized query names only.
7. **Fail closed on unsafe input.** Package verification rejects symbolic links, hard links, non-regular files, duplicate JSON keys at any depth, non-ASCII keys in manifests, unsafe filenames, oversized packages and files that change during hashing.
8. **Fixed error messages.** Verification and comparison errors use stable codes and never echo local paths, arguments or stack traces.
9. **Deterministic output.** Comparison and verification output excludes clocks and is stable for identical inputs (covered by tests).
10. **Be explicit about trust.** Every verification result carries `authenticityEstablished: false`. A supplied digest binds a manifest to a reference; it does not prove authorship.
11. **Preserve source evidence.** Writes are exclusive (`wx`). Compare never overwrites or deletes. A changed file is treated as changed evidence, never silently re-hashed as the original.
12. **Document residual risk.** Known limits are written into README, SECURITY and each verification result's `limitations` array.

## Integrity vocabulary

| Term | Meaning in this project | What it does not mean |
| --- | --- | --- |
| Hash match (SHA256) | The file bytes equal the bytes hashed when the manifest was written. | The file is authentic or was created by the expected party. |
| Manifest consistency | Files match `manifest.json`. | `manifest.json` itself is trustworthy. |
| Trusted reference | A SHA256 of `manifest.json` that the operator obtained through a channel they trust. | Proof of who created the package. |
| Recovery match | Two packages have identical manifest bytes, profile, file set, sizes and hashes. | The restored site is clean, working or correctly configured. |
| `not-provided` | A legacy scan has no manifest, so no digest check was possible. | The scan is wrong. It means it could not be checked. |

## Threat model (current, as stated in the project)

In scope for the current verification code:

- Symlink, hard-link and device substitution inside a package.
- Duplicate-key and parser-differential manifests.
- Path traversal and unsafe filenames, including Windows reserved names and trailing dots.
- Output redirection through symlinks or aliases during comparison.
- Oversized or deeply nested inputs.
- Error-text leakage of local paths.

Out of scope or residual (documented, not solved):

- A local process that can rewrite files **and** `manifest.json`, or rename directories between check and write (no `openat` in Node).
- Access-time changes caused by reading.
- A package later changed after verification completed.
- Any claim about provenance, timing or truthfulness of observations.

## Browser sandbox

Chromium sandboxing is mandatory. No `--no-sandbox` fallback exists, by design (README, CONTRIBUTING). Hosts that cannot run the sandbox must be fixed or reported; the tool does not silently weaken the setting.

## Redaction limits

Structural redaction (URL query values, credentials, cookie and storage values) is deterministic. Pattern-based redaction (path segments, free text, metadata names) is not exhaustive. Reviewers must check artifacts before sharing them outside the operator's control.

## Requirements for any future mission

Taken from the project notes and CONTRIBUTING:

- Scope and threat model before implementation.
- A synthetic regression test for every confirmed vulnerability.
- Evidence contract changes come with a schema version and migration notes.
- No secrets, captures or sensitive artifacts in commits, tests or PR descriptions.
- Merge only after explicit maintainer approval; release, package publication and deployment are separate decisions.
