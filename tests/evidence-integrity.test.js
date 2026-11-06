/**
 * Evidence integrity.
 *
 * The product promise is that every conclusion is traceable to evidence. These
 * tests enforce that mechanically: a reference in a finding must resolve to an
 * identifier that exists in the evidence document, and a finding that states a
 * count of transmissions must link that many references or declare that the
 * list was truncated.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './fixtures/test-app.js';
import { captureSession } from '../src/capture/session.js';
import { buildEvidence } from '../src/evidence.js';
import { assess } from '../src/assess.js';
import { renderConsultantReport } from '../src/output/report-md.js';

/** Every identifier the evidence document actually defines. */
function evidenceIds(evidence) {
  const ids = new Set();
  for (const request of evidence.evidence.requests) ids.add(request.id);
  for (const cookie of evidence.evidence.cookies) ids.add(cookie.id);
  for (const entry of evidence.evidence.storage.localStorage) ids.add(entry.id);
  for (const entry of evidence.evidence.storage.sessionStorage) ids.add(entry.id);
  for (const message of evidence.evidence.console.all) ids.add(message.id);
  for (const error of evidence.evidence.console.pageErrors) ids.add(error.id);
  return ids;
}

/** Dotted paths are allowed as references to a named field in the evidence. */
function resolvesPath(evidence, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), { evidence: evidence.evidence, scan: evidence.scan }) !== undefined;
}

function assertRefsResolve(evidence, assessment) {
  const ids = evidenceIds(evidence);
  for (const finding of assessment.findings) {
    for (const ref of finding.evidenceRefs) {
      const ok = ids.has(ref) || (ref.includes('.') && resolvesPath(evidence, ref));
      assert.ok(ok, `${finding.findingId} references ${ref}, which does not exist in the evidence`);
    }
    assert.ok(finding.evidenceRefsTotal >= finding.evidenceRefs.length);
    assert.equal(finding.evidenceRefsTruncated, finding.evidenceRefsTotal > finding.evidenceRefs.length);
  }
}

function synthetic(transmissionCount) {
  const requests = [
    {
      id: 'req-0001', method: 'GET', resourceType: 'document', url: 'https://example.com/', hostname: 'example.com',
      path: '/', scheme: 'https:', queryKeys: [], isNavigation: true, frame: 'main', redirectedFrom: null,
      response: { status: 200, headers: {}, headerNames: [], redactedHeaderValues: [], location: null }, failure: null
    }
  ];
  for (let i = 0; i < transmissionCount; i += 1) {
    requests.push({
      id: `req-${String(i + 2).padStart(4, '0')}`, method: 'POST', resourceType: 'xhr',
      url: 'https://y.clarity.ms/collect', hostname: 'y.clarity.ms', path: '/collect', scheme: 'https:',
      queryKeys: [], isNavigation: false, frame: 'main', redirectedFrom: null,
      response: { status: 204, headers: {}, headerNames: [], redactedHeaderValues: [], location: null }, failure: null
    });
  }
  return buildEvidence(
    {
      session: {
        startedAt: '2026-09-13T00:00:00.000Z', endedAt: '2026-09-13T00:00:05.000Z', durationMs: 5000,
        launchedVia: 'test', browserName: 'chromium', browserVersion: 'test', userAgent: 'test',
        viewport: { width: 1366, height: 768 }, headless: true, waitUntil: 'load', settleMs: 0, timeout: 1000,
        navigationError: null
      },
      target: { inputUrl: 'https://example.com/', finalUrl: 'https://example.com/', finalHostname: 'example.com', title: 'test', mainResponseStatus: 200 },
      requests,
      navigationChain: [{ step: 1, evidenceRef: 'req-0001', url: 'https://example.com/', hostname: 'example.com', status: 200, location: null }],
      consoleMessages: [], pageErrors: [], dialogs: [],
      storage: { localStorage: [], sessionStorage: [], indexedDatabases: [], collectionError: null },
      cookies: []
    },
    { scanId: 'unit' }
  );
}

let app;
let liveEvidence;

before(async () => {
  app = await startTestApp(0);
  const raw = await captureSession(app.url, { settleMs: 1500, timeout: 30000 });
  liveEvidence = buildEvidence(raw, { scanId: 'integrity' });
});

after(() => {
  if (app) app.server.close();
});

test('every evidence reference in every finding exists in the evidence document', () => {
  assertRefsResolve(liveEvidence, assess(liveEvidence));
  assertRefsResolve(liveEvidence, assess(liveEvidence, { lang: 'nl' }));
});

test('a stated transmission count is matched by that many evidence references', () => {
  for (const count of [1, 4, 5, 12]) {
    const evidence = synthetic(count);
    const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-PRIVACY-001');
    assert.equal(evidence.summary.trackerTransmissions, count);
    assert.equal(finding.evidenceRefsTotal, count, `${count} transmissions must link ${count} references`);
    assert.equal(finding.evidenceRefs.length, count);
    assert.equal(finding.evidenceRefsTruncated, false);
    assertRefsResolve(evidence, assess(evidence));
  }
});

test('above the reference cap the truncation is declared, never silent', () => {
  const evidence = synthetic(30);
  const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-PRIVACY-001');
  assert.equal(finding.evidenceRefsTotal, 30);
  assert.equal(finding.evidenceRefs.length, 25);
  assert.equal(finding.evidenceRefsTruncated, true);
  const report = renderConsultantReport(evidence, assess(evidence));
  assert.match(report, /25 of 30 shown/);
});

test('the language contract applies to findings and report together', () => {
  const dutch = assess(liveEvidence, { lang: 'nl' });
  assert.equal(dutch.language, 'nl');
  const report = renderConsultantReport(liveEvidence, dutch, { lang: 'nl' });
  assert.match(report, /## Oordeel:/);
  assert.match(report, /Bevindingen die aandacht vragen/);
  assert.match(report, /Wat deze scan niet heeft gedaan/);
  assert.equal(report.includes('Findings that need attention'), false);

  const english = assess(liveEvidence, { lang: 'en' });
  const englishReport = renderConsultantReport(liveEvidence, english, { lang: 'en' });
  assert.match(englishReport, /## Verdict:/);
  assert.equal(englishReport.includes('Bevindingen'), false);
});

test('rule logic does not change with the language', () => {
  const en = assess(liveEvidence, { lang: 'en' });
  const nl = assess(liveEvidence, { lang: 'nl' });
  assert.equal(en.overall, nl.overall);
  assert.deepEqual(
    en.findings.map((f) => [f.findingId, f.status, f.severity, f.outcome, f.evidenceRefs.join(',')]),
    nl.findings.map((f) => [f.findingId, f.status, f.severity, f.outcome, f.evidenceRefs.join(',')])
  );
});

test('no finding claims consent was withheld, only that no consent interaction occurred', () => {
  for (const lang of ['en', 'nl']) {
    const assessment = assess(synthetic(3), { lang });
    const text = assessment.findings.map((f) => `${f.observedResult} ${f.explanation || ''}`).join(' ');
    assert.equal(/no consent was given|geen toestemming is gegeven/i.test(text), false, `${lang} still overstates consent`);
    assert.match(text, /consent interaction|toestemmingshandeling/i);
  }
});
