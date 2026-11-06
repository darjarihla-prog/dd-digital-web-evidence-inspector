# Security policy

This tool is an observer, not a vulnerability scanner or legal compliance
verifier. Inspect only targets you are authorized to visit. Use synthetic
localhost fixtures for reports and regressions.

As verified on 2026-11-06, GitHub private vulnerability reporting is disabled
for this repository. There is no verified private reporting channel or
maintainer email published here. For a sensitive report, do not post exploit
details, private captures or secrets in a public issue. Ask the maintainer in
a public issue to enable GitHub private vulnerability reporting or establish
a private channel, sharing only a non-sensitive request. Once enabled, use
GitHub's Security → Advisories → Report a vulnerability interface.

For a non-sensitive defect, open a public issue with version, Node/browser/OS,
expected behaviour and a minimal synthetic fixture. Never send real tokens,
URLs containing credentials or captured browser data to an external service.

Chromium sandboxing is mandatory by default. Unsupported kernels, containers,
root execution, AppArmor policies or restricted user namespaces may prevent
launch. Fix the supported host environment or report the limitation; the tool
does not retry with sandboxing disabled.

Redaction is structural for URL query values, credentials and fragments,
credential/unrecognized header values, cookie values and storage values.
Path segments, free text and metadata names use patterns, which are inherently
incomplete. Novel short identifiers, encoded nested data and sensitive text
in allowed diagnostic headers may survive. Review local artifacts before any
sharing. No telemetry or upload mechanism is introduced by this milestone.

Package 0.1.0 is the published baseline. Branch changes are unreleased until
reviewed and published by a maintainer. No separate supported-version promise
or response-time SLA is established by this document.
