import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { launchBrowser } from '../src/capture/browser.js';
import { captureSession } from '../src/capture/session.js';
import { buildEvidence } from '../src/evidence.js';
import { assess } from '../src/assess.js';
import { validateScan } from '../src/integrity.js';
import { redactUrl, redactHeaders, scrubText } from '../src/redact.js';
import { compareScans, compareSavedScans, renderComparison } from '../src/compare.js';
import { planPages, planConsent } from '../src/plans.js';
import { startHardeningApp, MARKER } from './fixtures/hardening-app.js';
const exec = promisify(execFile);
let app, raw, evidence, assessment, root, scanDir;
before(async () => {
  app = await startHardeningApp();
  root = mkdtempSync(join(tmpdir(), 'wei-m025-'));
  raw = await captureSession(`${app.url}/redirect?input=${MARKER}#${MARKER}`, { settleMs: 350 });
  evidence = buildEvidence(raw, { scanId: 'hardening' });
  assessment = assess(evidence);
  await exec(process.execPath, ['src/cli.js', `${app.url}/redirect?input=${MARKER}#${MARKER}`, '--settle', '350', '--out', root, '--lang', 'en'], { timeout: 30000 });
  scanDir = join(root, readdirSync(root)[0]);
});
after(async () => { await app?.close(); if (root) rmSync(root, { recursive: true, force: true }); });

test('query marker is absent from raw capture and both evidence targets', () => {
  assert.equal(JSON.stringify(raw).includes(MARKER), false);
  assert.equal(JSON.stringify(evidence).includes(MARKER), false);
  assert.deepEqual(raw.target.inputQueryKeys.map(q => q.key), ['input']);
});
test('all persisted JSON, Markdown, HTML and extracted PDF omit the marker', async () => {
  for (const file of ['evidence.json', 'findings.json', 'report.md', 'client-summary.html', 'manifest.json']) assert.equal(readFileSync(join(scanDir, file), 'utf8').includes(MARKER), false, file);
  const pdf = join(scanDir, 'client-summary.pdf');
  assert.ok(readFileSync(pdf).length > 100);
  const { stdout } = await exec('pdftotext', [pdf, '-']);
  assert.equal(stdout.includes(MARKER), false);
  assert.match(stdout, /Website review/);
});
test('artifact manifest hashes match every persisted output', () => {
  const manifest = JSON.parse(readFileSync(join(scanDir, 'manifest.json')));
  assert.equal(manifest.files.length, 5);
  for (const entry of manifest.files) assert.equal(entry.sha256, createHash('sha256').update(readFileSync(join(scanDir, entry.file))).digest('hex'));
});
test('credentials, fragments, sensitive paths, relative redirect and unknown headers are redacted', () => {
  for (const url of [`https://u:${MARKER}@example.test/token/${MARKER}?x=${MARKER}#${MARKER}`, `https://example.test/users/${MARKER}`]) assert.equal(JSON.stringify(redactUrl(url)).includes(MARKER), false);
  const safe = redactHeaders({ location: `/page?token=${MARKER}#${MARKER}`, 'x-surprise': MARKER, authorization: MARKER });
  assert.equal(JSON.stringify(safe).includes(MARKER), false);
  assert.ok(safe.redactedNames.includes('x-surprise'));
  assert.equal(scrubText(`Failed https://u:${MARKER}@example.test/path?x=${MARKER}#${MARKER}`).text.includes(MARKER), false);
});
test('sandbox remains enabled on every launch attempt, including fallback candidates', async () => {
  const original = chromium.launch;
  const seen = [];
  chromium.launch = async options => { seen.push(options); throw new Error('synthetic launch failure'); };
  try { await assert.rejects(launchBrowser({ browserPath: '/synthetic/browser' }), /No usable/); }
  finally { chromium.launch = original; }
  assert.ok(seen.length > 2);
  for (const options of seen) { assert.equal(options.chromiumSandbox, true); assert.equal(options.args.includes('--no-sandbox'), false); }
});
test('delayed response, redirect chain and request failure have valid metadata and references', () => {
  assert.equal(raw.requests.find(r => r.path === '/slow').response.status, 204);
  assert.ok(raw.requests.find(r => r.path === '/abort').failure);
  assert.deepEqual(raw.navigationChain.map(r => r.status), [302, 200]);
  assert.equal(raw.session.observation.pendingResponseTasks, 0);
  assert.equal(raw.session.observation.complete, true);
  assert.equal(validateScan(evidence, assessment), true);
});
test('navigation timeout is incomplete and cannot produce unsupported PASS findings', async () => {
  const failed = buildEvidence(await captureSession(`${app.url}/hang?x=${MARKER}`, { timeout: 250, settleMs: 0 }), { scanId: 'timeout' });
  const findings = assess(failed);
  assert.equal(failed.scan.observation.complete, false);
  assert.equal(findings.counts.pass, 0);
  assert.ok(findings.counts.inconclusive > 0);
  assert.equal(JSON.stringify(failed).includes(MARKER), false);
  validateScan(failed, findings);
});
test('requests active at context shutdown are explicitly incomplete', async () => {
  const cut = await captureSession(`${app.url}/inflight`, { timeout: 1000, waitUntil: 'domcontentloaded', settleMs: 0 });
  assert.equal(cut.session.observation.complete, false);
  assert.ok(cut.session.observation.unfinishedRequests.length);
  const synthetic = structuredClone(evidence);
  synthetic.scan.observation = { complete: false, incompleteReasons: ['response metadata drain timed out'], pendingResponseTasks: 1 };
  assert.equal(assess(synthetic).counts.pass, 0);
});
test('schema validation rejects dangling references and malformed truncation', () => {
  const broken = structuredClone(assessment); broken.findings[0].evidenceRefs = ['req-missing'];
  assert.throws(() => validateScan(evidence, broken), /reference/);
  const duplicate = structuredClone(evidence); duplicate.evidence.requests.push(duplicate.evidence.requests[0]);
  assert.throws(() => validateScan(duplicate), /duplicate/);
});
function scans() {
  const before = { evidence: structuredClone(evidence), assessment: structuredClone(assessment) };
  const after = structuredClone(before); after.evidence.scan.scanId = 'after'; after.assessment.scanId = 'after';
  return { before, after };
}
test('historical diff is deterministic and distinguishes new, changed and resolved', () => {
  const { before, after } = scans();
  before.assessment.findings[0].status = 'PASS'; after.assessment.findings[0].status = 'REVIEW';
  before.assessment.findings[1].status = 'REVIEW'; after.assessment.findings[1].status = 'PASS';
  const diff = compareScans(before, after);
  assert.equal(diff.new.length, 1); assert.equal(diff.resolved.length, 1);
  assert.deepEqual(diff, compareScans(before, after));
  assert.match(renderComparison(diff), /resolved: 1/);
});
test('historical comparison refuses incompatible schemas and conservative resolution', () => {
  const { before, after } = scans();
  before.assessment.findings[0].status = 'REVIEW'; after.assessment.findings[0].status = 'PASS';
  after.evidence.scan.observation.complete = false;
  assert.equal(compareScans(before, after).resolved.length, 0);
  assert.ok(compareScans(before, after).inconclusive.length);
  after.evidence.schema.version = '0.1.0';
  assert.throws(() => compareScans(before, after), /Schema versions differ/);
});
test('comparison of saved scan directories writes a machine and human diff', () => {
  const diff = compareSavedScans(scanDir, scanDir, join(root, 'comparison'));
  assert.equal(diff.changed.length, 0);
  assert.ok(readFileSync(join(root, 'comparison', 'diff.json')).length);
});
test('bounded page design rejects cross-origin, duplicates, excessive counts and timeouts', () => {
  assert.equal(planPages(app.url, ['/page', '/second']).pages.length, 2);
  for (const paths of [['https://example.test/'], Array(6).fill('/'), ['/page', '/page']]) assert.throws(() => planPages(app.url, paths));
  assert.throws(() => planPages(app.url, ['/page'], { timeout: Infinity }));
});
test('controlled multi-page fixture has separate page evidence without form submission', async () => {
  const plan = planPages(app.url, ['/page', '/second']);
  const pages = [];
  for (const url of plan.pages) pages.push(await captureSession(url, { settleMs: 200, timeout: 1000 }));
  assert.deepEqual(pages.map(p => new URL(p.target.finalUrl).pathname), ['/page', '/second']);
  assert.equal(pages.some(p => p.requests.some(r => r.path === '/never-submit')), false);
});
test('controlled consent design uses three fresh contexts and verified controls', async () => {
  const plan = planConsent(`${app.url}/consent`, { verifiedOrigin: app.url, reject: '#reject', accept: '#accept' });
  assert.throws(() => planConsent(app.url, { verifiedOrigin: 'https://example.test' }));
  const { browser } = await launchBrowser();
  const traffic = {};
  try {
    for (const scenario of plan.scenarios) {
      const context = await browser.newContext();
      try {
        await context.route('**/*', route => new URL(route.request().url()).origin === app.url ? route.continue() : route.abort());
        const page = await context.newPage(); traffic[scenario.id] = [];
        page.on('request', r => traffic[scenario.id].push(new URL(r.url()).pathname));
        await page.goto(`${app.url}/consent`);
        assert.equal(await page.evaluate(() => window.fresh), true);
        if (scenario.selector) {
          const button = page.locator(scenario.selector); assert.equal(await button.count(), 1);
          await Promise.all([page.waitForResponse(r => ['/accepted', '/rejected'].includes(new URL(r.url()).pathname)), button.click()]);
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  assert.equal(traffic['no-interaction'].includes('/accepted'), false);
  assert.ok(traffic.accept.includes('/accepted'));
  assert.ok(traffic.reject.includes('/rejected'));
  assert.equal(traffic.reject.includes('/accepted'), false);
});

test('comparison CLI works and refuses overwriting original evidence', async () => {
  const destination = join(root, 'cli-diff');
  await exec(process.execPath, ['src/cli.js', 'compare', scanDir, scanDir, '--out', destination]);
  assert.equal(JSON.parse(readFileSync(join(destination, 'diff.json'))).integrity.before, 'verified');
  assert.throws(() => compareSavedScans(scanDir, scanDir, scanDir), /separate/);
});
test('saved comparison rejects evidence modified after its manifest was written', () => {
  const altered = join(root, 'altered'); cpSync(scanDir, altered, { recursive: true });
  writeFileSync(join(altered, 'evidence.json'), readFileSync(join(altered, 'evidence.json'), 'utf8') + ' ');
  assert.throws(() => compareSavedScans(scanDir, altered, join(root, 'rejected')), /hash mismatch/);
});
test('single-page evidence-only CLI preserves redaction and omits assessment outputs', async () => {
  const parent = join(root, 'evidence-only');
  await exec(process.execPath, ['src/cli.js', `${app.url}/page?input=${MARKER}`, '--out', parent, '--evidence-only', '--settle', '250']);
  const dir = join(parent, readdirSync(parent)[0]);
  assert.deepEqual(readdirSync(dir).sort(), ['evidence.json', 'manifest.json']);
  assert.equal(readFileSync(join(dir, 'evidence.json'), 'utf8').includes(MARKER), false);
});
