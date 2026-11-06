# Consent comparison design 1.0.0 — incomplete production feature

Issue #9 is delivered as a versioned contract, a working controlled fixture
and an isolation/traffic regression test. The production CLI performs no
consent interaction. There is no general automated consent feature.

States are no interaction, explicit rejection and explicit acceptance.
`planConsent` requires a verified exact origin and distinct site-specific
selectors. This validation cannot establish authorization or verify a real
banner; the maintainer must independently record permission and inspect the
controls for the particular site/version before executing any action.
Selectors are a local execution plan, not persisted browser evidence.

Every scenario starts a fresh browser context with empty cookies and storage.
Do not reuse sessions, import a user's profile, log in, submit forms or guess
controls from text. For a future executor, require exactly one visible button
at the verified selector, record the verified origin and a scrubbed action ID,
assert the expected post-click state, and mark ambiguous/disappearing controls
INCONCLUSIVE. A click alone does not prove the site's consent state.

The localhost /consent fixture provides #reject and #accept buttons. Rejection
records /rejected traffic; acceptance records /accepted traffic. The test opens
three fresh contexts, verifies fresh storage, invokes the known control only
in the corresponding scenario, waits for its specific response and compares
observed paths. External routes are blocked. No-interaction produces neither
endpoint. These are synthetic local traffic signals, not tracker database
entries or legal determinations.

A future comparison must retain per-scenario evidence/assessment/manifests,
record action time and outcome, and link traffic differences to scenario IDs
and request references. Include timeouts, failed actions, blocked requests,
tracker rule version and completeness. Never interpret an absent match as
absence of tracking; never issue a GDPR compliance verdict.

Remaining gates: verified production-target authorization representation,
action provenance, banner-state assertions, redirect guards, execution bounds,
reproducibility, aggregation schema and reporting. Leave #9 open and describe
this fixture as controlled validation only.
