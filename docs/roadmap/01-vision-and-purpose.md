# 01 · Vision and purpose

Status: verified against README, CONTRIBUTING and SECURITY on `main` (2026-11-07).

## Purpose

The Web Evidence Inspector is a local, consent-bounded command-line tool for
**evidence-first review of one publicly reachable web page**. A fresh headless browser
context loads the page once, without forms, login or consent interaction. The tool
records what it observed, classifies those observations, applies a fixed rule set, and
writes reports that keep the three layers apart:

1. **Observation**: what the browser saw (requests, response metadata, cookie names, storage key names, console messages).
2. **Finding**: a deterministic rule outcome (PASS, REVIEW, FAIL or INCONCLUSIVE) that cites observation IDs.
3. **Recommendation**: advice for a human consultant. It is not evidence.

Package integrity is a fourth, separate concern. The `manifest.json` produced with each
scan, and the offline `verify` and `recovery-verify` commands, answer only the question
*"do these files still match what the tool wrote?"*.

## What it deliberately is not

From README, SECURITY and the project notes:

- Not an offensive scanner. It does not attack, fuzz, authenticate, or crawl.
- Not a legal compliance verifier. It issues no GDPR or other legal verdict.
- Not proof that a site is secure. PASS means "no relevant finding within the checks performed".
- Not a telemetry or upload service. Captures are not sent anywhere.
- Not a WordPress tool. No WordPress-specific logic exists in `src/`, `rules/` or `tests/` (verified by search, 2026-11-07).
- Not a backup or restore tool. Recovery verification compares two existing package directories; it does not restore anything.

## Problem it addresses

Website reviews often mix what was seen with what was concluded, and produce reports
that cannot be reproduced. Consultants also need to show that a backup or restored copy
of evidence has not changed, without over-claiming what that check proves. The tool
tries to make each claim traceable to a concrete, re-runnable check and to state its
limits in the output itself.

## Guiding phrase in the project notes

The Dutch project notes state the central distinction directly: *observatie*, *bevinding*,
*aanbeveling*, *bestandsintegriteit* and *authenticiteit* must not be confused with one
another. This documentation set follows the same distinction (see [05](05-security-and-integrity-principles.md)).

## Intended users

- **Maintainer (Darja Rihla)**: a repeatable technical base for DD Digital consultancy work.
- **DD Digital clients**: receive the client summary, not raw captures.
- **Open-source users and students**: a small, readable codebase with synthetic fixtures and explicit limitations.

Target audience details are discussed in [06](06-expected-value.md).
