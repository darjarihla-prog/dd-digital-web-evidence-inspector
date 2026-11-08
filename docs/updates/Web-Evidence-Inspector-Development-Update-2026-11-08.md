# Web Evidence Inspector
## Public Development Update | 8 November 2026

### From website observations to verifiable evidence

DD Digital Web Evidence Inspector is an open-source,
local-first research project focused on website
observations, evidence integrity and reproducible
security assessments.

The central question is simple:

How can we demonstrate that a technical conclusion
is actually supported by reliable evidence?

A successful scan alone is not enough.

Evidence must be complete, verifiable and explicit
about its limitations.

### What has been developed

Three pull requests have been merged:

**Mission 025 | Browser Evidence Hardening**

PR #12 introduced improvements to:

- Chromium sandbox configuration
- Browser observation completeness
- Sensitive data redaction
- Evidence integrity
- Regression testing
- Node.js 24 GitHub Actions verification

**Mission 027 | Evidence Verification**

PR #13 improved:

- Evidence package verification
- Recovery evidence comparisons
- Integrity validation
- Conservative assessment outcomes

**Mission 027F | Project Documentation**

PR #14 introduced:

- Project history
- Technical architecture
- Development roadmap
- Capabilities and limitations
- Security principles
- Acceptance criteria

The latest recorded CI execution on the main branch
completed successfully.

### Current research: WordPress Recovery Gate

Mission 028 is under local development.

The objective is to verify WordPress recovery evidence
without executing untrusted backup content.

The current local implementation includes:

- Filesystem manifest verification
- Backup integrity assessment
- Custody and provenance checks
- Static WordPress inspection
- Bounded SQL dump parsing
- PHP serialized-value analysis
- Database and cron evidence assessment
- Explicit inconclusive outcomes

The latest complete local regression run passed
558 tests.

This milestone is not yet merged or released.
Additional security review, mutation testing and
publication checks remain necessary.

### Current limitations

The project does not claim that a backup is safe
merely because its files can be read.

Static analysis cannot replace isolated restoration,
runtime verification or human security review.

Unknown evidence must not silently become PASS.

Production multi-page inspection and consent-aware
execution remain incomplete.

### Open-source contributors wanted

We are inviting independent developers and security
researchers to help with:

1. Chromium sandbox verification
2. Evidence completeness and privacy regression tests
3. Asynchronous browser capture reliability
4. Documentation and CI improvements
5. Bounded multi-page inspection
6. Consent-aware tracker comparisons
7. Historical evidence comparison testing
8. WordPress recovery evidence architecture

Open issues are marked with the GitHub
"help wanted" label.

Please discuss your approach in the relevant issue
before substantial implementation work.

Use synthetic test fixtures and submit focused
pull requests with reproducible tests.

### Development principles

- Local-first operation
- Evidence before conclusions
- No execution of untrusted backup content
- Explicit security boundaries
- Conservative failure semantics
- Reproducible verification
- Transparent limitations
- Human review where required

### Project links

Repository:
https://github.com/darjarihla-prog/dd-digital-web-evidence-inspector

Open issues:
https://github.com/darjarihla-prog/dd-digital-web-evidence-inspector/issues

Pull requests:
https://github.com/darjarihla-prog/dd-digital-web-evidence-inspector/pulls

---

DD Digital | DARJA RIHLA Open Source Research

Public development update, 8 November 2026.
