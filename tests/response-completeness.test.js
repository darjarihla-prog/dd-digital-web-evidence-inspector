import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright-core';
import { captureSession } from '../src/capture/session.js';

async function fakeCapture({ headers, finish = true, emitRequest = true, closeError = false, contextError = false, maxRequests = 5000 }) {
  const original = chromium.launch;
  const frame = {};
  const page = Object.assign(new EventEmitter(), {
    mainFrame: () => frame,
    evaluate: async fn => String(fn).includes('navigator.userAgent') ? 'synthetic-browser' : String(fn).includes('indexedDB') ? [] : { localStorage: [], sessionStorage: [] },
    title: async () => 'Synthetic', url: () => 'http://127.0.0.1/',
    waitForTimeout: async () => {},
    close: async () => { if (closeError) throw new Error('synthetic'); }
  });
  const request = { url: () => 'http://127.0.0.1/', method: () => 'GET', resourceType: () => 'document', isNavigationRequest: () => true, frame: () => frame, redirectedFrom: () => null };
  const response = { request: () => request, allHeaders: headers, headers: () => ({}), status: () => 200, statusText: () => 'OK', fromServiceWorker: () => false, url: request.url };
  page.goto = async () => { if (emitRequest) page.emit('request', request); page.emit('response', response); if (finish) page.emit('requestfinished', request); return response; };
  let closed = false;
  chromium.launch = async () => ({ newContext: async () => { if (contextError) throw new Error('context failed'); return { route: async () => {}, newPage: async () => page, cookies: async () => [], close: async () => {} }; }, version: () => 'synthetic', close: async () => { closed = true; } });
  try {
    if (contextError) { await assert.rejects(captureSession('http://127.0.0.1/'), /context failed/); assert.equal(closed, true); return; }
    return await captureSession('http://127.0.0.1/', { settleMs: 0, responseDrainMs: 40, maxRequests });
  } finally { chromium.launch = original; }
}
test('shutdown drains response headers that resolve after page.close', async () => {
  const raw = await fakeCapture({ headers: () => new Promise(resolve => setTimeout(() => resolve({ 'content-type': 'text/html' }), 15)) });
  assert.equal(raw.requests[0].response.status, 200);
  assert.equal(raw.session.observation.complete, true);
});
test('hung response metadata is bounded, declared incomplete and cannot mutate returned evidence', async () => {
  let resolveHeaders;
  const raw = await fakeCapture({ headers: () => new Promise(resolve => { resolveHeaders = resolve; }) });
  assert.equal(raw.session.observation.complete, false);
  assert.equal(raw.session.observation.pendingResponseTasks, 1);
  assert.deepEqual(raw.session.observation.missingResponses, ['req-0001']);
  const snapshot = JSON.stringify(raw);
  resolveHeaders({ server: 'late' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(raw), snapshot);
});
test('header fallback preserves partial evidence and declares incomplete observation', async () => {
  const raw = await fakeCapture({ headers: async () => { throw new Error('synthetic metadata failure'); } });
  assert.equal(raw.requests[0].response.status, 200);
  assert.ok(raw.session.observation.incompleteReasons.includes('full response headers unavailable'));
});
test('response without a request record is declared incomplete', async () => {
  const raw = await fakeCapture({ headers: async () => ({}), emitRequest: false });
  assert.ok(raw.session.observation.incompleteReasons.includes('response without request record'));
});
test('capture limits declare truncation and shutdown failures stay incomplete', async () => {
  const raw = await fakeCapture({ headers: async () => ({}), maxRequests: 0, closeError: true });
  assert.ok(raw.session.observation.incompleteReasons.includes('request limit reached'));
  assert.ok(raw.session.observation.incompleteReasons.includes('page shutdown failed'));
});
test('browser is closed if browser context creation fails', async () => { await fakeCapture({ contextError: true }); });
