# Third-party notices

The project remains Apache-2.0. No tracker database or external third-party
implementation was imported in Mission 025. Bundled tracker rules remain the
repository's existing rules/trackers.json.

Locked runtime dependencies:

| Package | Version | License |
| --- | --- | --- |
| playwright-core | 1.65.0 | Apache-2.0 |
| tldts | 6.1.86 | MIT |
| tldts-core | 6.1.86 | MIT |

Retain each installed package's LICENSE/NOTICE files when redistributing it.
The package lock retains upstream integrity hashes and license declarations.
No dependency upgrade was needed for this milestone.

Development/CI tools (not vendored): Google Chrome/Chromium subject to their
upstream distributions; Poppler pdftotext (GPL-family upstream distribution),
Gitleaks 8.30.1 (MIT), actionlint 1.7.7 (MIT), actions/checkout and
actions/setup-node (MIT). These are executed as separate tools, not copied
into the application. Their own license terms apply to redistribution.
