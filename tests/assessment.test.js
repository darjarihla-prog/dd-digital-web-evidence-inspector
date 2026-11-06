/**
 * Assessment tests against the controlled test application.
 *
 * The test app is deliberately plain http, has missing headers, a sensitive
 * looking storage key and a console error, so the expected statuses are known
 * before the scan runs.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './fixtures/test-app.js';
import { captureSession } from '../src/capture/session.js';
import { buildEvidence } from '../src/evidence.js';
import { assess, sortFindings } from '../src/assess.js';
import { renderConsultantReport } from '../src/output/report-md.js';
import { renderClientHtml } from '../src/output/client-summary.js';
import { RULES } from '../src/rules/index.js';
import { MESSAGES } from '../src/rules/messages.js';

let app;
let evidence;
let assessment;

before(async () => {
  app = await startTestApp(0);
  const raw = await captureSession(app.url, { settleMs: 1500, timeout: 30000 });
  evidence = buildEvidence(raw, { scanId: 'test-scan' });
  assessment = assess(evidence, { lang: 'en' });
});

after(() => {
  if (app) app.server.close();
});

test('every rule has a message entry in every supported language', () => {
  for (const rule of RULES) {
    for (const lang of Object.keys(MESSAGES)) {
      assert.ok(MESSAGES[lang][rule.messageId], `${rule.messageId} missing in ${lang}`);
    }
  }
});

test('plain http is graded FAIL', () => {
  const finding = assessment.findings.find((f) => f.findingId === 'DR-TRANSPORT-001');
  assert.equal(finding.status, 'FAIL');
  assert.equal(finding.severity, 'high');
  assert.equal(assessment.overall, 'FAIL');
});

test('missing security headers are graded REVIEW, not FAIL', () => {
  const finding = assessment.findings.find((f) => f.findingId === 'DR-HEADERS-001');
  assert.equal(finding.status, 'REVIEW');
  assert.ok(finding.observedResult.includes('content-security-policy'));
});

test('a sensitive storage key is REVIEW with medium confidence, never proof', () => {
  const finding = assessment.findings.find((f) => f.findingId === 'DR-STORAGE-001');
  assert.equal(finding.status, 'REVIEW');
  assert.equal(finding.confidence, 'medium');
  assert.ok(finding.explanation.includes('not proof'));
  assert.deepEqual(finding.evidenceRefs.length > 0, true);
});

test('no tracker match is PASS with an explicit caveat', () => {
  const finding = assessment.findings.find((f) => f.findingId === 'DR-PRIVACY-001');
  assert.equal(finding.status, 'PASS');
  assert.match(finding.explanation, /not evidence that no tracking occurs/);
});

test('every finding carries the fields a consultant report needs', () => {
  for (const finding of assessment.findings) {
    for (const field of ['findingId', 'category', 'check', 'status', 'severity', 'confidence', 'observedResult']) {
      assert.ok(finding[field], `${finding.findingId} is missing ${field}`);
    }
    assert.ok(Array.isArray(finding.evidenceRefs));
    if (finding.status !== 'PASS') {
      assert.ok(finding.recommendedAction, `${finding.findingId} needs a recommended action`);
    }
  }
});

test('findings are sorted with FAIL and high severity first', () => {
  const sorted = sortFindings(assessment.findings);
  assert.equal(sorted[0].status, 'FAIL');
  const statuses = sorted.map((f) => f.status);
  assert.ok(statuses.lastIndexOf('FAIL') < statuses.indexOf('REVIEW'));
});

test('the consultant report contains the verdict, the findings and the limitations', () => {
  const report = renderConsultantReport(evidence, assessment);
  assert.match(report, /## Verdict: FAIL/);
  assert.match(report, /DR-TRANSPORT-001/);
  assert.match(report, /What this scan did not do/);
  assert.match(report, /It does not mean the website is secure/);
  assert.equal(report.includes('auth_token'), true, 'storage key names belong in the report');
  assert.equal(report.includes('aaaabbbbccccddddeeeeffff00001111'), false, 'storage values must not');
});

test('the Dutch client summary is rendered in Dutch, including finding text', () => {
  const dutch = assess(evidence, { lang: 'nl' });
  const html = renderClientHtml(evidence, dutch, { lang: 'nl' });
  assert.match(html, /Website review: samenvatting/);
  assert.match(html, /via HTTPS aangeboden/);
  assert.match(html, /Het betekent niet dat de website veilig is/);
  assert.equal(html.includes('The page is served over HTTPS'), false, 'no English finding text in the Dutch summary');
});

test('an unknown language falls back to Dutch framing without crashing', () => {
  const html = renderClientHtml(evidence, assessment, { lang: 'de' });
  assert.match(html, /Website review/);
});
