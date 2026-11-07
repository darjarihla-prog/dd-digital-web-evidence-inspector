# Evidence contracts and migration

The npm package version stays 0.1.0 until a maintainer publishes a release.
The `main` branch emits evidence and assessment schema version 0.2.0. Existing field
names and evidence IDs remain; consumers must accept the new INCONCLUSIVE
status and additional metadata before upgrading. Saved 0.1.0 files are never
rewritten automatically.

Evidence 0.2.0 adds `scan.observation`: `complete`, `incompleteReasons`,
`missingResponses`, `unfinishedRequests` and `pendingResponseTasks`.
`complete` means the bounded observation finished without a known capture gap;
it does not mean all website behaviour was observed. Requests still active at
the observation cutoff, failed navigation, unavailable storage/cookie metadata,
response metadata fallback/drain timeout, and capture limits make it false.
Known network failures are observations, not missing responses.

Capture limits default to 5000 requests, 1000 console messages and 1000 page
errors; response metadata gets at most five seconds to drain after stopping
the page. Browser startup has a separate 30-second timeout. CLI navigation
is bounded to 120 seconds and settling to 30 seconds. Domain and tracker
reference samples now declare totals and truncation. Text contains explicit
omission markers when shortened.

`target.inputUrl` is redacted before leaving capture; `inputQueryKeys` retains
sanitized query names. Both evidence target copies are sanitized again at the
builder boundary. No migration can recover values deliberately omitted.
Header names remain; credential and unrecognized header values become
`[REDACTED]`. Redirects retain a separately resolved, redacted destination.
Pattern-based path and free-text scrubbing can reduce diagnostic precision.

Assessment 0.2.0 adds `counts.inconclusive`, an INCONCLUSIVE status description,
and incomplete outcomes. Known incomplete capture downgrades would-be PASS
checks and a missing main-document header check to INCONCLUSIVE with low
confidence. Observed REVIEW/FAIL findings remain, so overall status may still
be FAIL or REVIEW. Missing capture does not erase a positive observation.
Reports list these findings; counts must include the inconclusive bucket.
Legacy raw documents without observation metadata retain baseline assessment
behaviour for programmatic compatibility. They cannot prove historical
resolution. NOT_TESTED is reserved for comparison inputs; current rules emit
INCONCLUSIVE for known gaps.

`validateScan` validates supported contract names/versions, required collection
structure, unique IDs, assessment linkage, supported statuses, evidence
references and declared truncation before CLI persistence. It is a focused
structural validator, not a general-purpose JSON Schema engine or proof that
browser observations are true. Do not load untrusted scan documents as code.

Historical diff 1.0.0 accepts equal supported evidence and assessment versions,
matching redacted final targets and rule sets. Cross-version comparisons are
refused until an explicit migration is designed. Finding IDs and semantic
referenced metadata are compared; per-scan request IDs do not imply identity.
Missing findings or incomplete checks are inconclusive. A previously adverse
finding can be resolved only when both scans explicitly declare completeness.
New findings describe newly observed signals without escalating severity.
Differences include new, unchanged, changed, resolved and inconclusive buckets,
with before/after references and scan IDs. Saved-scan comparison reads inputs through the strict verifier (`verify.js`): manifests and scan documents are rejected on symlinks, hard links, duplicate keys, unsafe names and malformed structure. Hash mismatches are rejected. Output must not be a symbolic link or sit inside an input scan, and existing artifacts are never overwritten. Missing legacy manifests are explicitly reported as not-provided, with links and devices still refused. Timestamps are excluded from diff
output so identical inputs produce identical results.

Manifest 1.0.0 entries may carry an optional integer `size`. Manifests written
from Mission 027B onward include it. Readers that predate it ignore unknown
fields, and historical manifests without `size` remain valid. Strict verification
(`verify`, `recovery-verify`) rejects any entry key other than `file`, `sha256`
and `size`. Entries with unknown keys are therefore a migration concern for
external writers. Verification semantics are documented in the README.

Manifest 1.0.0 contains sorted file basenames, SHA256 hashes and provenance.
It covers each output actually written, including PDF when available; it does
not hash itself or claim authenticity/signature. Keep the manifest together
with the originals. A changed file must be treated as changed evidence, never
silently re-hashed as the original. Source-package manifests can be produced
with `node scripts/source-manifest.js`; publication is a separate maintainer
action. Hashes do not substitute for code review or signed releases.
