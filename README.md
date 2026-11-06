# Darja Rihla Web Evidence Inspector

Evidence-first website review tooling. It observes one page load of a target
website in a controlled browser session and produces three outputs: technical
evidence, a consultant report and a client summary.

This is not a vulnerability scanner. It does not attack, fuzz or authenticate.
It records what a browser actually did during a normal visit, classifies that,
and leaves the judgement to a human.

## What it produces

Per scan, in `out/<scan id>/`:

| File | Purpose |
| --- | --- |
| `evidence.json` | Raw observations. No interpretation. |
| `findings.json` | Findings from the deterministic rule set, with evidence references. |
| | Every finding states `evidenceRefsTotal` and `evidenceRefsTruncated`, so a complete reference list is never confused with a sample. |
| `report.md` | Consultant report: verdict, findings, evidence tables, limitations. |
| `client-summary.html` | Client summary as HTML. |
| `client-summary.pdf` | Client summary as PDF, Dutch by default. |

## Language contract

```text
evidence.json        language neutral, observations only
findings.json        machine fields plus finding text in the chosen language
report.md            chosen language
client-summary.*     chosen language
```

`--lang nl` (the default) or `--lang en` applies to all three rendered outputs.
Rule logic never changes with the language: only the wording does.

## Assessment model

| Status | Meaning |
| --- | --- |
| PASS | No relevant finding was observed within the checks performed. It does not mean the website is secure. |
| REVIEW | Something was observed that a consultant has to judge in context. |
| FAIL | Something was observed that is wrong in almost any context. |

Every finding carries a finding ID, category, check, observed result, evidence
reference, severity, confidence, explanation and recommended action.

## Privacy

Privacy is a product principle, not a setting. The tool never collects:

- request bodies and response bodies
- Authorization and other credential header values
- cookie values
- localStorage and sessionStorage values
- query parameter values
- page content and form input

It does collect URLs without query values, query parameter names, storage key
names with value lengths, cookie metadata with value lengths, and console text
that is scrubbed for emails, tokens and query values before it is stored.

The test suite asserts this: values planted in the controlled test app must not
appear anywhere in the evidence document.

## Install

The tool depends on `playwright-core` and `tldts` and deliberately does not
download a browser. It uses a Chromium based browser that is already on the
machine.

```bash
npm install
node src/cli.js https://example.com
```

Browser resolution order: `--browser-path`, then `DR_BROWSER_PATH`, then
`PLAYWRIGHT_BROWSERS_PATH`, then an installed Chrome, Chromium or Edge.

### Running from an external drive

Install the project on a filesystem that supports Node.js dependencies, such as ext4.

Run npm ci, then npm test, then node src/cli.js with your target URL.

Run the inspector directly with Node.js after installing dependencies.

## Usage

```text
node src/cli.js <url> [options]

--out <dir>          output directory (default: ./out)
--timeout <ms>       navigation timeout (default: 30000)
--settle <ms>        wait after load before collecting state (default: 3000)
--wait <event>       load | domcontentloaded | networkidle (default: load)
--browser-path <p>   path to a Chromium based browser executable
--proxy <server>     route the browser session through a proxy
--rules <file>       tracker rule set (default: rules/trackers.json)
--lang <nl|en>       language of the client summary (default: nl)
--evidence-only      write evidence.json only
--no-pdf             skip the PDF
--headed             run with a visible browser window
--quiet              print written paths only
```

## Tests

```bash
npm test
```

The suite starts a controlled test application with known conditions: a two hop
redirect chain, a sensitive looking storage key, a cookie without Secure, a
console error and no security headers. Detectors are asserted against that
known case, and the privacy guarantees are asserted against planted values.

## Structure

```text
src/cli.js               command line entry point
src/capture/browser.js   browser resolution, no download
src/capture/session.js   controlled session, raw observation
src/redact.js            the privacy layer, single place of enforcement
src/evidence.js          evidence document builder
src/classify/domains.js  first-party and third-party by registrable domain
src/classify/headers.js  security header observation
src/classify/trackers.js rule driven tracker matching
src/rules/index.js       assessment rules, logic only
src/rules/messages.js    wording of findings, English and Dutch
src/assess.js            findings and overall status
src/output/report-md.js  consultant report
src/output/client-summary.js  client summary in HTML and PDF
rules/trackers.json      tracker rule set
tests/                   detector and privacy tests
```

## Known limitations

- One page load of one URL. Nothing behind navigation, login or interaction.
- One viewport and one user agent.
- Consent banners are not accepted, so post-consent trackers are not observed.
- Tracker detection is limited to the bundled rule set of 25 entries.
- Security headers are read from the main document response only.
- The consultant report is English only. The client summary is Dutch or English.
