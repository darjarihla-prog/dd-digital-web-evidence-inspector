/**
 * Transmission detection.
 *
 * A tracker script that was loaded and a tracker that actually sent data are
 * different findings. These tests pin that distinction, because a consultant
 * reading only the report must see the stronger fact when it exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence } from '../src/evidence.js';
import { assess } from '../src/assess.js';
import { renderConsultantReport } from '../src/output/report-md.js';

function rawSession(extraRequests = []) {
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
      },
      {
        id: 'req-0002',
        method: 'GET',
        resourceType: 'script',
        url: 'https://www.clarity.ms/tag/abc',
        hostname: 'www.clarity.ms',
        path: '/tag/abc',
        scheme: 'https:',
        queryKeys: [],
        isNavigation: false,
        frame: 'main',
        redirectedFrom: null,
        response: { status: 200, headers: {}, headerNames: [], redactedHeaderValues: [], location: null },
        failure: null
      },
      ...extraRequests
    ],
    navigationChain: [{ step: 1, evidenceRef: 'req-0001', url: 'https://example.com/', hostname: 'example.com', status: 200, location: null }],
    consoleMessages: [],
    pageErrors: [],
    dialogs: [],
    storage: { localStorage: [], sessionStorage: [], indexedDatabases: [], collectionError: null },
    cookies: []
  };
}

const COLLECT_POST = {
  id: 'req-0003',
  method: 'POST',
  resourceType: 'xhr',
  url: 'https://y.clarity.ms/collect',
  hostname: 'y.clarity.ms',
  path: '/collect',
  scheme: 'https:',
  queryKeys: [],
  isNavigation: false,
  frame: 'main',
  redirectedFrom: null,
  response: { status: 204, headers: {}, headerNames: [], redactedHeaderValues: [], location: null },
  failure: null
};

test('a tracker script without transmissions is reported as loaded only', () => {
  const evidence = buildEvidence(rawSession(), { scanId: 'unit' });
  assert.equal(evidence.summary.trackerTransmissions, 0);
  const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-PRIVACY-001');
  assert.equal(finding.outcome, 'loaded');
  assert.equal(finding.severity, 'medium');
  assert.match(finding.observedResult, /No data transmission was observed/);
});

test('a POST to a tracker endpoint is reported as a transmission and raises severity', () => {
  const evidence = buildEvidence(rawSession([COLLECT_POST]), { scanId: 'unit' });
  assert.equal(evidence.summary.trackerTransmissions, 1);
  const tracker = evidence.evidence.trackers.find((t) => t.trackerId === 'microsoft-clarity');
  assert.equal(tracker.transmissions.count, 1);
  assert.equal(tracker.transmissions.accepted, 1, '204 counts as accepted');
  assert.deepEqual(tracker.transmissions.evidenceRefs, ['req-0003']);

  const finding = assess(evidence).findings.find((f) => f.findingId === 'DR-PRIVACY-001');
  assert.equal(finding.outcome, 'transmitting');
  assert.equal(finding.severity, 'high');
  assert.match(finding.observedResult, /1 data transmission/);
  assert.deepEqual(finding.evidenceRefs, ['req-0003']);
});

test('the consultant report surfaces the transmission, not only the tracker name', () => {
  const evidence = buildEvidence(rawSession([COLLECT_POST]), { scanId: 'unit' });
  const report = renderConsultantReport(evidence, assess(evidence));
  assert.match(report, /### Trackers/);
  assert.match(report, /Microsoft Clarity \| session-recording \| 2 \| 1 \| 1/);
  assert.match(report, /req-0003/);
});

test('the Dutch wording distinguishes transmission from loading', () => {
  const evidence = buildEvidence(rawSession([COLLECT_POST]), { scanId: 'unit' });
  const dutch = assess(evidence, { lang: 'nl' }).findings.find((f) => f.findingId === 'DR-PRIVACY-001');
  assert.match(dutch.observedResult, /dataverzending/);
  assert.match(dutch.explanation, /actief data/);
});
