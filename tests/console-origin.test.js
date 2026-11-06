/**
 * Console/page-error origin classification (PASS 006 exit criterion 1).
 *
 * A console message from the browser's own GPU/WebGL/driver runtime is not
 * evidence about the website. These tests pin the five required cases from
 * the PASS 006 exit criteria, and that browser-origin noise stays visible in
 * evidence.json while carrying no weight in the console-quality finding.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOrigin, isBrowserSignature, ORIGIN } from '../src/classify/console-origin.js';
import { createPartyClassifier } from '../src/classify/domains.js';
import { buildEvidence } from '../src/evidence.js';
import { assess } from '../src/assess.js';
import { renderConsultantReport } from '../src/output/report-md.js';
import { renderClientHtml } from '../src/output/client-summary.js';

const party = createPartyClassifier('https://example.com/');

function rawSession({ consoleMessages = [], pageErrors = [] } = {}) {
  return {
    session: {
      startedAt: '2026-09-13T00:00:00.000Z',
      endedAt: '2026-09-13T00:00:05.000Z',
      durationMs: 5000,
      launchedVia: 'test',
      browserName: 'chromium',
      browserVersion: 'test',
      userAgent: 'test',
      viewport: { width: 1366, height: 768 },
      headless: true,
      waitUntil: 'load',
      settleMs: 0,
      timeout: 1000,
      navigationError: null
    },
    target: {
      inputUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      finalHostname: 'example.com',
      title: 'test',
      mainResponseStatus: 200
    },
    requests: [
      {
        id: 'req-0001',
        method: 'GET',
        resourceType: 'document',
        url: 'https://example.com/',
        hostname: 'example.com',
        path: '/',
        scheme: 'https:',
        queryKeys: [],
        isNavigation: true,
        frame: 'main',
        redirectedFrom: null,
        response: { status: 200, headers: {}, headerNames: [], redactedHeaderValues: [], location: null },
        failure: null
      }
    ],
    navigationChain: [{ step: 1, evidenceRef: 'req-0001', url: 'https://example.com/', hostname: 'example.com', status: 200, location: null }],
    consoleMessages,
    pageErrors,
    dialogs: [],
    storage: { localStorage: [], sessionStorage: [], indexedDatabases: [], collectionError: null },
    cookies: []
  };
}

// --- Unit tests: the five required classification cases -------------------

test('a WebGL/GPU warning classifies as browser-origin', () => {
  const message = { text: 'GPU stall due to ReadPixels', type: 'warning', source: null };
  assert.equal(classifyOrigin(message, party), ORIGIN.BROWSER);
  assert.ok(isBrowserSignature(message.text));
});

test('a Chromium driver warning classifies as browser-origin', () => {
  const message = { text: '[.WebGL-0x7f8a4c00e600]GL_INVALID_OPERATION: glDrawElements: attempt to access out of range vertices in ANGLE', type: 'error', source: null };
  assert.equal(classifyOrigin(message, party), ORIGIN.BROWSER);
});

test('a first-party uncaught TypeError classifies as application-origin', () => {
  const message = { text: 'TypeError: x is not a function', type: 'error', source: 'https://example.com/app.js' };
  assert.equal(classifyOrigin(message, party), ORIGIN.APPLICATION);
});

test('a third-party script exception classifies as third-party-origin', () => {
  const message = { text: 'ReferenceError: dataLayer is not defined', type: 'error', source: 'https://www.googletagmanager.com/gtm.js' };
  assert.equal(classifyOrigin(message, party), ORIGIN.THIRD_PARTY);
});

test('an unknown console error with no source and no browser signature is unclassified', () => {
  const message = { text: 'Something went wrong', type: 'error', source: null };
  assert.equal(classifyOrigin(message, party), ORIGIN.UNCLASSIFIED);
});

// --- Evidence integrity: browser-origin stays in evidence, not in findings -

test('browser-origin console errors remain in evidence.json but do not count as a finding', () => {
  const evidence = buildEvidence(
    rawSession({
      consoleMessages: [
        { id: 'con-001', type: 'error', text: 'GPU stall due to ReadPixels', scrubbedPatterns: [], truncated: false, source: null, line: null }
      ]
    }),
    { scanId: 'unit' }
  );

  // Still fully visible in evidence.
  assert.equal(evidence.evidence.console.all.length, 1);
  assert.equal(evidence.evidence.console.all[0].origin, 'browser');
  assert.equal(evidence.summary.consoleByOrigin.browser, 1);

  // Not counted toward the finding.
  assert.equal(evidence.evidence.console.findingRelevant.length, 0);
  const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-QUALITY-001');
  assert.equal(finding.status, 'PASS');
  assert.equal(finding.outcome, 'onlyBrowserOrigin');
  assert.deepEqual(finding.evidenceRefs, []);
});

test('an application-origin console error counts as a finding and browser-origin noise does not dilute it', () => {
  const evidence = buildEvidence(
    rawSession({
      consoleMessages: [
        { id: 'con-001', type: 'error', text: 'TypeError: x is not a function', scrubbedPatterns: [], truncated: false, source: 'https://example.com/app.js', line: 1 },
        { id: 'con-002', type: 'error', text: 'GPU stall due to ReadPixels', scrubbedPatterns: [], truncated: false, source: null, line: null }
      ]
    }),
    { scanId: 'unit' }
  );

  assert.equal(evidence.summary.consoleByOrigin.application, 1);
  assert.equal(evidence.summary.consoleByOrigin.browser, 1);
  assert.equal(evidence.summary.consoleErrors, 2, 'raw observed total includes browser-origin');
  assert.equal(evidence.summary.consoleErrorsAttributable, 1, 'attributable total excludes browser-origin');

  const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-QUALITY-001');
  assert.equal(finding.status, 'REVIEW');
  assert.deepEqual(finding.evidenceRefs, ['con-001']);
});

test('an unclassified console error keeps REVIEW status, it is never silently discarded', () => {
  const evidence = buildEvidence(
    rawSession({
      consoleMessages: [
        { id: 'con-001', type: 'error', text: 'Something went wrong', scrubbedPatterns: [], truncated: false, source: null, line: null }
      ]
    }),
    { scanId: 'unit' }
  );

  assert.equal(evidence.evidence.console.all[0].origin, 'unclassified');
  const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-QUALITY-001');
  assert.equal(finding.status, 'REVIEW');
  assert.deepEqual(finding.evidenceRefs, ['con-001']);
});

// --- Reporting --------------------------------------------------------------

test('the consultant report shows the origin of every console message, browser-origin included', () => {
  const evidence = buildEvidence(
    rawSession({
      consoleMessages: [
        { id: 'con-001', type: 'error', text: 'GPU stall due to ReadPixels', scrubbedPatterns: [], truncated: false, source: null, line: null }
      ]
    }),
    { scanId: 'unit' }
  );
  const report = renderConsultantReport(evidence, assess(evidence));
  assert.match(report, /con-001/);
  assert.match(report, /browser \(not a site finding\)/);
});

test('the client summary console metric excludes browser-origin noise', () => {
  const evidence = buildEvidence(
    rawSession({
      consoleMessages: [
        { id: 'con-001', type: 'error', text: 'TypeError: x is not a function', scrubbedPatterns: [], truncated: false, source: 'https://example.com/app.js', line: 1 },
        { id: 'con-002', type: 'error', text: 'GPU stall due to ReadPixels', scrubbedPatterns: [], truncated: false, source: null, line: null }
      ]
    }),
    { scanId: 'unit' }
  );
  const assessment = assess(evidence);
  const html = renderClientHtml(evidence, assessment, { lang: 'en' });
  assert.match(html, />1</, 'client tile shows the attributable count of 1, not the raw total of 2');
});

test('a page error whose stack points at a third-party script classifies as third-party-origin', () => {
  const evidence = buildEvidence(
    rawSession({
      pageErrors: [
        { id: 'err-001', text: 'TypeError: bad state', scrubbedPatterns: [], source: 'https://www.googletagmanager.com/gtm.js' }
      ]
    }),
    { scanId: 'unit' }
  );
  assert.equal(evidence.evidence.console.pageErrors[0].origin, 'third-party');
  assert.deepEqual(evidence.evidence.console.pageErrorsFindingRelevant.map((e) => e.id), ['err-001']);
});
