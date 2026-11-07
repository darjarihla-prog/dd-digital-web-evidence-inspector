# Bounded multi-page inspection design 1.0.0 — incomplete production feature

Issue #8 is a design and controlled-fixture deliverable in this milestone.
The CLI continues to capture exactly one page by default. There is no crawl
flag. `src/plans.js:planPages` validates an explicit list, not discovered links.
Its output is an in-memory execution plan and contains raw authorized URLs;
it must not be persisted as evidence without URL redaction.

The proposed executor must restrict every main-document navigation, including
redirects, to the exact scheme/host/port of the authorized starting origin.
A same-site registrable-domain match is insufficient. A cross-origin redirect
must be blocked before its request is sent and recorded as a scope exclusion.
An explicit resource-origin policy must separately bound subresources; the
existing single-page observer intentionally observes third-party resources.

Hard bounds: one to five explicit unique pages; at most 30 seconds navigation
per page and 150 seconds total navigation budget, with a separate hard wall
clock deadline for the entire executor. Also bound startup, settling, metadata
draining, storage enumeration, bytes and events. Capture request/message caps
already exist; byte and complete executor wall-clock enforcement remain open.
No link discovery, form submission, button clicking, authentication or login
attempts. No retries that expand scope. Reject invalid URLs, credentials,
duplicate pages and unbounded numeric options.

Each page should use a fresh context and a page-specific scan ID, target,
completeness record and original artifact directory. Aggregation should cite
`pageScanId + evidenceRef`; never concatenate request IDs without namespacing.
An aggregate manifest should hash per-page manifests, describe blocked pages
and preserve partial results. Original observations and aggregate
interpretations must remain separate.

The controlled localhost fixture has /page and /second plus a form that must
never be submitted. Tests validate planning boundaries and independently
capture both pages, checking separate targets and no form request. They do
not prove production redirect enforcement or aggregate reporting.

Remaining gates: executor-wide timeout/resource limits, redirect enforcement,
subresource policy, aggregation/provenance schema, CLI parsing, blocked-route
regressions, partial-run recovery and full end-to-end tests. Do not present
this design API as a production multi-page mode or close #8 on that basis.
