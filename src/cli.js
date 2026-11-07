#!/usr/bin/env node
/**
 * Darja Rihla Web Evidence Inspector - command line entry point.
 *
 * PASS 001 scope: target URL input, controlled browser session, network
 * observation, first/third party classification, redirect detection,
 * security header capture and a privacy-safe evidence.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateScan, writeManifest } from './integrity.js';
import { compareSavedScans } from './compare.js';
import { verifyPackage, verifyRecovery, parseVerificationArgs, usageError, internalRejection } from './verify.js';
import { redactUrl, scrubText } from './redact.js';
import { captureSession } from './capture/session.js';
import { buildEvidence, TOOL_NAME, TOOL_VERSION } from './evidence.js';
import { assess } from './assess.js';
import { renderConsultantReport } from './output/report-md.js';
import { renderClientHtml, writeClientPdf } from './output/client-summary.js';

const USAGE = `${TOOL_NAME} v${TOOL_VERSION}

Usage:
  node src/cli.js <url> [options]
  node src/cli.js compare <before-dir> <after-dir> --out <diff-dir>
  node src/cli.js verify <dir> [--expected-manifest-sha256 <hex>]
  node src/cli.js recovery-verify <original-dir> <restored-dir> [--expected-manifest-sha256 <hex>]

Verification commands are offline and read-only, print JSON to stdout and exit
0 (verified/match), 1 (failed/mismatch), 2 (usage), 4 (rejected package).

Options:
  --out <dir>          output directory (default: ./out)
  --timeout <ms>       navigation timeout (default: 30000)
  --settle <ms>        wait after load before collecting state (default: 3000)
  --wait <event>       load | domcontentloaded | networkidle (default: load)
  --browser-path <p>   path to a Chromium based browser executable
  --proxy <server>     route the browser session through a proxy
  --headed             run with a visible browser window
  --rules <file>       tracker rule set (default: rules/trackers.json)
  --lang <nl|en>       language of findings.json, report.md and the client
                       summary (default: nl). evidence.json is language neutral.
  --evidence-only      write evidence.json only, no assessment or reports
  --no-pdf             skip the client summary PDF
  --quiet              print the output path only
  --help               show this message

Privacy: request and response bodies, cookie values, storage values, query
parameter values and credential headers are never collected.`;

function parseArgs(argv) {
  const args = { url: null, out: 'out', timeout: 30000, settle: 3000, wait: 'load', browserPath: null, proxy: null, headed: false, rules: null, quiet: false, lang: 'nl', evidenceOnly: false, pdf: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--timeout') args.timeout = Number(argv[++i]);
    else if (arg === '--settle') args.settle = Number(argv[++i]);
    else if (arg === '--wait') args.wait = argv[++i];
    else if (arg === '--browser-path') args.browserPath = argv[++i];
    else if (arg === '--proxy') args.proxy = argv[++i];
    else if (arg === '--lang') args.lang = argv[++i];
    else if (arg === '--evidence-only') args.evidenceOnly = true;
    else if (arg === '--no-pdf') args.pdf = false;
    else if (arg === '--rules') args.rules = argv[++i];
    else if (arg === '--headed') args.headed = true;
    else if (arg === '--quiet') args.quiet = true;
    else if (!arg.startsWith('-') && !args.url) args.url = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function normaliseUrl(input) {
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP(S) required');
  return url.toString();
}

function slug(value) {
  return String(value || 'target').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

const SUMMARY_STRINGS = {
  en: {
    target: 'Target', requests: 'Requests observed', thirdParty: 'Third-party domains', trackers: 'Trackers',
    transmissions: 'Tracker transmissions', redirects: 'Redirect hops', leaves: ' (leaves first party)',
    storage: 'Browser storage keys', sensitive: 'Sensitive storage indicators', cookies: 'Cookies',
    console: 'Console errors', headers: 'Security headers missing', scripts: 'Third-party scripts',
    overall: 'Overall', of: 'of', observing: (url) => `Observing ${url}`, written: 'Written',
    navError: 'Navigation error', pdfFailed: 'PDF generation failed',
    pdfFallback: 'The HTML summary was written and can be printed to PDF from a browser.',
    passNote: ['PASS means no relevant finding was observed within the checks performed.', 'It does not mean the website is secure.'],
    noAssessment: 'Observations only. No assessment was requested.'
  },
  nl: {
    target: 'Doel', requests: 'Verzoeken waargenomen', thirdParty: 'Externe domeinen', trackers: 'Trackers',
    transmissions: 'Trackerverzendingen', redirects: 'Doorverwijzingen', leaves: ' (verlaat eigen domein)',
    storage: 'Sleutels in browseropslag', sensitive: 'Gevoelige opslag, aanwijzingen', cookies: 'Cookies',
    console: 'Consolefouten', headers: 'Beveiligingsheaders ontbreken', scripts: 'Externe scripts',
    overall: 'Totaal', of: 'van', observing: (url) => `Observeert ${url}`, written: 'Geschreven',
    navError: 'Navigatiefout', pdfFailed: 'PDF genereren mislukt',
    pdfFallback: 'De HTML-samenvatting is geschreven en kan vanuit een browser naar PDF worden afgedrukt.',
    passNote: [
      'PASS betekent dat binnen de uitgevoerde controles geen relevante bevinding is waargenomen.',
      'Het betekent niet dat de website veilig is.'
    ],
    noAssessment: 'Alleen waarnemingen. Er is geen beoordeling gevraagd.'
  }
};

const strings = (lang) => SUMMARY_STRINGS[lang] || SUMMARY_STRINGS.en;

function printSummary(evidence, assessment, lang) {
  const t = strings(lang);
  const s = evidence.summary;
  const rows = [
    [t.target, evidence.scan.target.finalUrl || evidence.scan.target.inputUrl],
    [t.requests, s.requestsObserved],
    [t.thirdParty, s.thirdPartyDomains],
    [t.trackers, s.trackersDetected],
    [t.transmissions, s.trackerTransmissions ?? 0],
    [t.redirects, `${s.redirectHops}${s.externalRedirectsObserved ? t.leaves : ''}`],
    [t.storage, s.browserStorageKeys],
    [t.sensitive, s.sensitiveStorageIndicators],
    [t.cookies, s.cookies],
    [t.console, s.consoleErrors],
    [t.headers, `${s.securityHeadersMissing} ${t.of} ${s.securityHeadersMissing + s.securityHeadersPresent}`],
    [t.scripts, s.thirdPartyScripts]
  ];
  const width = Math.max(...rows.map((r) => r[0].length), t.overall.length);
  console.log('');
  for (const [label, value] of rows) console.log(`  ${label.padEnd(width)}  ${value}`);
  if (assessment) {
    console.log(
      `  ${t.overall.padEnd(width)}  ${assessment.overall}  (${assessment.counts.fail} FAIL, ${assessment.counts.review} REVIEW, ${assessment.counts.pass} PASS, ${assessment.counts.inconclusive || 0} INCONCLUSIVE)`
    );
    console.log('');
    for (const line of t.passNote) console.log(`  ${line}`);
  } else {
    console.log('');
    console.log(`  ${t.noAssessment}`);
  }
  console.log('');
}

/** Runs verify or recovery-verify. Always prints one JSON document to stdout and sets the exit code. */
function runVerificationCommand(command, argv) {
  let parsed;
  try {
    parsed = parseVerificationArgs(command, argv);
  } catch (error) {
    // Parse messages are fixed strings that never echo the argument values.
    return emitVerification(usageError(command, error.message));
  }
  let result;
  try {
    const { positional, expectedManifestSha256 } = parsed;
    result = command === 'verify'
      ? verifyPackage(positional[0], { expectedManifestSha256 })
      : verifyRecovery(positional[0], positional[1], { expectedManifestSha256 });
  } catch {
    // Unexpected failures carry no error text: it could contain local paths.
    result = internalRejection(command);
  }
  return emitVerification(result);
}

function emitVerification(result) {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}

async function main() {
  if (process.argv[2] === 'verify' || process.argv[2] === 'recovery-verify') {
    runVerificationCommand(process.argv[2], process.argv.slice(3));
    return;
  }
  if (process.argv[2] === 'compare') {
    const [before, after, flag, out] = process.argv.slice(3);
    if (!before || !after || flag !== '--out' || !out || process.argv.length !== 7) throw new Error('Usage: compare <before-dir> <after-dir> --out <diff-dir>');
    const diff = compareSavedScans(before, after, out);
    console.log(`Comparison written: ${diff.new.length} new, ${diff.resolved.length} resolved, ${diff.inconclusive.length} inconclusive`);
    return;
  }
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(scrubText(error.message).text);
    console.error(USAGE);
    process.exit(2);
  }
  if (args.help || !args.url) {
    console.log(USAGE);
    process.exit(args.url ? 0 : 1);
  }

  if (!Number.isFinite(args.timeout) || args.timeout < 1 || args.timeout > 120000 || !Number.isFinite(args.settle) || args.settle < 0 || args.settle > 30000 || !['load', 'domcontentloaded', 'networkidle'].includes(args.wait) || !['en', 'nl'].includes(args.lang)) throw new Error('Invalid timeout, settle, wait or language option');
  let targetUrl;
  try {
    targetUrl = normaliseUrl(args.url);
  } catch {
    console.error('Not a usable HTTP(S) URL');
    process.exit(2);
  }

  const startedAt = new Date();
  const scanId = `${startedAt.toISOString().replace(/[:.]/g, '-')}_${slug(new URL(targetUrl).hostname)}`;
  if (!args.quiet) console.error(strings(args.lang).observing(redactUrl(targetUrl).url));

  let raw;
  try {
    raw = await captureSession(targetUrl, {
      timeout: args.timeout,
      settleMs: args.settle,
      headless: !args.headed,
      browserPath: args.browserPath,
      proxy: args.proxy,
      waitUntil: args.wait
    });
  } catch (error) {
    console.error(`Capture failed: ${scrubText(error.message).text}`);
    process.exit(3);
  }

  const evidence = buildEvidence(raw, { rulesPath: args.rules, scanId });
  validateScan(evidence);
  const outDir = resolve(args.out, scanId);
  mkdirSync(outDir, { recursive: true });
  const evidencePath = join(outDir, 'evidence.json');
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  const written = [evidencePath];

  let assessment = null;
  if (!args.evidenceOnly) {
    assessment = assess(evidence, { lang: args.lang });
    validateScan(evidence, assessment);
    const findingsPath = join(outDir, 'findings.json');
    writeFileSync(findingsPath, `${JSON.stringify(assessment, null, 2)}\n`, 'utf8');
    written.push(findingsPath);

    const reportPath = join(outDir, 'report.md');
    writeFileSync(reportPath, renderConsultantReport(evidence, assessment, { lang: args.lang }), 'utf8');
    written.push(reportPath);

    const html = renderClientHtml(evidence, assessment, { lang: args.lang });
    const htmlPath = join(outDir, 'client-summary.html');
    writeFileSync(htmlPath, html, 'utf8');
    written.push(htmlPath);

    if (args.pdf) {
      try {
        const pdfPath = join(outDir, 'client-summary.pdf');
        await writeClientPdf(html, pdfPath, { browserPath: args.browserPath });
        written.push(pdfPath);
      } catch (error) {
        console.error(`  ${strings(args.lang).pdfFailed}: ${error.message.split('\n')[0]}`);
        console.error(`  ${strings(args.lang).pdfFallback}`);
      }
    }
  }

  written.push(writeManifest(outDir, written, { scanId, evidenceSchema: evidence.schema, tool: evidence.scan.tool }));

  if (args.quiet) {
    console.log(written.join('\n'));
  } else {
    printSummary(evidence, assessment, args.lang);
    for (const file of written) console.log(`  ${strings(args.lang).written}: ${file}`);
    if (evidence.scan.navigationError) console.log(`  ${strings(args.lang).navError}: ${evidence.scan.navigationError}`);
  }
}

main().catch((error) => {
  console.error(scrubText(error.message).text);
  process.exit(1);
});
