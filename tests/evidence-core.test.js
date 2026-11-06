/**
 * Detector tests against the controlled test application.
 *
 * These tests assert two things: that detectors produce the result that is
 * known in advance for a controlled case, and that the privacy guarantees hold
 * against values that were deliberately planted in the test app.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './fixtures/test-app.js';
import { captureSession } from '../src/capture/session.js';
import { buildEvidence } from '../src/evidence.js';
import { redactUrl, scrubText, matchSensitiveKey, truncateMiddle } from '../src/redact.js';
import { observeSecurityHeaders } from '../src/classify/headers.js';
import { createPartyClassifier } from '../src/classify/domains.js';
import { createTrackerMatcher } from '../src/classify/trackers.js';

let app;
let evidence;

before(async () => {
  app = await startTestApp(0);
  const raw = await captureSession(app.url, { settleMs: 1500, timeout: 30000 });
  evidence = buildEvidence(raw, { scanId: 'test-scan' });
});

after(async () => {
  if (app) app.server.close();
});

test('redirect chain is detected with the expected number of hops', () => {
  assert.equal(evidence.summary.redirectHops, 2);
  assert.equal(evidence.evidence.redirects.observed, true);
  assert.equal(evidence.evidence.redirects.chain.at(-1).status, 200);
});

test('browser storage keys are collected without values', () => {
  assert.equal(evidence.summary.browserStorageKeys, 4);
  const entry = evidence.evidence.storage.localStorage.find((e) => e.key === 'auth_token');
  assert.ok(entry, 'auth_token key should be present');
  assert.equal(entry.sensitiveIndicator, true);
  assert.equal(entry.valueLength, 32);
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'value'), false);
});

test('cookies are collected as metadata only', () => {
  const cookie = evidence.evidence.cookies.find((c) => c.name === 'dr_session');
  assert.ok(cookie);
  assert.equal(cookie.secure, false);
  assert.equal(Object.prototype.hasOwnProperty.call(cookie, 'value'), false);
  assert.equal(cookie.valueLength, 6);
});

test('console errors are captured', () => {
  assert.ok(evidence.summary.consoleErrors >= 1);
  assert.ok(
    evidence.evidence.console.relevant.some((m) => m.text.includes('deliberate error')),
    'the deliberate console error should be present'
  );
});

test('missing security headers are observed on the main document', () => {
  assert.equal(evidence.evidence.securityHeaders.present.length, 0);
  assert.ok(evidence.evidence.securityHeaders.missing.length >= 7);
  assert.equal(evidence.evidence.securityHeaders.informational.server, 'dr-test-app');
});

test('no planted secret reaches the evidence document', () => {
  const serialised = JSON.stringify(evidence);
  for (const planted of ['someone@example.com', 'secret123', 'aaaabbbbccccddddeeeeffff00001111', 'dr_session=abc123']) {
    assert.equal(serialised.includes(planted), false, `${planted} must not appear in the evidence`);
  }
});

test('query parameter names are kept and values are not', () => {
  const request = evidence.evidence.requests.find((r) => r.path === '/api/profile');
  assert.ok(request);
  assert.match(request.url, /\[QUERY_REDACTED\]$/);
  assert.deepEqual(request.queryKeys.map((q) => q.key).sort(), ['email', 'token']);
});

test('redactUrl removes query values and keeps names', () => {
  const result = redactUrl('https://example.com/a/b?token=abc&x=1#frag');
  assert.equal(result.url, 'https://example.com/a/b?[QUERY_REDACTED]');
  assert.equal(result.fragment, true);
  assert.deepEqual(result.queryKeys.map((q) => q.key), ['token', 'x']);
});

test('scrubText removes emails and long tokens', () => {
  const result = scrubText('contact me at a@b.nl with eyJhbGciOi.eyJzdWIiOi.QWERTYUIOP');
  assert.equal(result.text.includes('a@b.nl'), false);
  assert.equal(result.text.includes('eyJhbGciOi.eyJzdWIiOi.QWERTYUIOP'), false);
});

test('sensitive key matching flags credential-like keys only', () => {
  assert.deepEqual(matchSensitiveKey('dr_theme'), []);
  assert.ok(matchSensitiveKey('access_token').includes('token'));
  assert.ok(matchSensitiveKey('user_email').includes('contact'));
});

test('party classification uses the registrable domain', () => {
  const party = createPartyClassifier('https://www.darjarihla.com/pad');
  assert.equal(party.classify('cdn.darjarihla.com'), 'first-party');
  assert.equal(party.classify('www.google-analytics.com'), 'third-party');
  assert.equal(party.classify(null), 'unknown');
});

test('tracker matching is subdomain aware and rule driven', () => {
  const matcher = createTrackerMatcher();
  assert.equal(matcher.matchRequest('www.google-analytics.com', '/collect').trackerId, 'google-analytics');
  assert.equal(matcher.matchRequest('darjarihla.com', '/'), null);
  assert.equal(matcher.matchCookieName('_ga').trackerId, 'google-analytics');
  assert.equal(matcher.matchCookieName('dr_pref'), null);
});

test('x-frame-options counts as covered when CSP sets frame-ancestors', () => {
  const observed = observeSecurityHeaders({ 'content-security-policy': "frame-ancestors 'self'" });
  const xfo = observed.present.find((h) => h.header === 'x-frame-options');
  assert.ok(xfo);
  assert.equal(xfo.coveredBy, 'content-security-policy: frame-ancestors');
});

test('a data URI in console text is collapsed so the reason survives', () => {
  const message = `Loading the font 'data:font/woff2;base64,${'A'.repeat(500)}' failed: OTS parsing error: invalid sfntVersion`;
  const result = scrubText(message, 300);
  assert.ok(result.scrubbed.includes('data_uri'));
  assert.equal(result.text.includes('AAAA'), false, 'the payload must not be stored');
  assert.match(result.text, /OTS parsing error: invalid sfntVersion$/, 'the reason must survive');
  assert.ok(result.text.length < 200);
});

test('over-long text loses its middle, not its ending', () => {
  const text = `start ${'x'.repeat(400)} the reason at the end`;
  const cut = truncateMiddle(text, 100);
  assert.match(cut, /^start /);
  assert.match(cut, /the reason at the end$/);
  assert.match(cut, /\[MIDDLE_OMITTED\]/);
});
