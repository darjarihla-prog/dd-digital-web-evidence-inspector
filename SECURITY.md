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

Package verification (`verify`, `recovery-verify`) is offline and read-only.
It writes nothing, never follows symbolic links (a symlink in the package
rejects it), rejects hard links (their content can change outside the
package), never recurses into subdirectories and never reads outside the
package directory. It does not open FIFOs or devices. Manifest parsing is
bounded and strict: repeated object keys at any depth are rejected rather than
resolved last-wins, so two JSON readers cannot disagree about one manifest.
Entry names must be plain ASCII filenames. Unlisted files fail verification.
Error output uses fixed messages and never echoes paths, arguments or stack
traces.

Verification is a review aid, not a security boundary. Known limits: there is
no protection against a concurrent writer after verification completes; access
times may change. `compare` uses the same strict reader for manifests and scan
documents: symlinks, hard links, duplicate keys and unsafe paths are rejected
there too. A legacy scan without a manifest is still read, because it cannot be
checked, but symlinks, hard links and devices are refused and the result is
reported as `not-provided`; that residual trust is documented, not hidden.

Compare output: writes are exclusive (`wx`), refuse any existing name including
dangling symlinks, and never delete or overwrite. Output may not be a symbolic
link, may not be or lie inside an input scan (checked on real paths, so aliases
and symlinked parents are caught), and must be a directory. Symbolic links in
ancestor components of the output path are followed, because the chosen path is
trusted to the user; refusing them would break common locations such as macOS
`/tmp`. Residual risks: a local process that can rename directories on the output
path between the check and the write could redirect new files (Node offers no
`openat`), so compare output should go to a directory only the user can write.
Legacy scans without a manifest are not authenticated. Hashes detect change relative to
manifest.json; anyone who can rewrite the package can also rewrite its
manifest. Only a digest of manifest.json obtained independently and through a
channel you trust (`--expected-manifest-sha256`) detects that. Results never
claim provenance or authenticity. Verification does not sign, encrypt or
authenticate artifacts.

Package 0.1.0 is the published baseline. Branch changes are unreleased until
reviewed and published by a maintainer. No separate supported-version promise
or response-time SLA is established by this document.
