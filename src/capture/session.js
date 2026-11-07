/**
 * Controlled browser session.
 *
 * Observes one page load in a fresh, isolated browser context and returns raw
 * observations. It performs no interpretation: classification happens in the
 * evidence builder and, from PASS 002 onward, in the rules layer.
 */
import { launchBrowser } from './browser.js';
import { redactUrl, redactHeaders, scrubText, matchSensitiveKey, redactPath } from '../redact.js';

const pad = (n, width = 4) => String(n).padStart(width, '0');

export async function captureSession(targetUrl, options = {}) {
  const {
    timeout = 30000,
    launchTimeout = 30000,
    responseDrainMs = 5000,
    maxRequests = 5000,
    maxMessages = 1000,
    settleMs = 3000,
    viewport = { width: 1366, height: 768 },
    headless = true,
    browserPath = null,
    proxy = null,
    waitUntil = 'load'
  } = options;

  const startedAt = new Date();
  const { browser, launchedVia } = await launchBrowser({ browserPath, headless, timeout: launchTimeout, proxy });

  let context;
  try {
    context = await browser.newContext({
      viewport,
      acceptDownloads: false,
      serviceWorkers: process.env.DR_TEST_LOCALHOST_ONLY === '1' ? 'block' : 'allow'
    });

    if (process.env.DR_TEST_LOCALHOST_ONLY === '1') {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient');
      });
    }

    const requests = [];
    const pending = new Set();
    const finishedRequests = new Set();
    const captureErrors = [];
    const captureError = reason => { if (!captureErrors.includes(reason)) captureErrors.push(reason); };
    let frozen = false;
    const requestIndex = new Map();
    const consoleMessages = [];
    const pageErrors = [];
    const navigationChain = [];
    const dialogs = [];
    let requestCounter = 0;

    const page = await context.newPage();
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null);

    page.on('request', (request) => {
      if (requests.length >= maxRequests) { captureError('request limit reached'); return; }
      const parsed = redactUrl(request.url());
      const id = `req-${pad(++requestCounter)}`;
      const record = {
        id,
        method: request.method(),
        resourceType: request.resourceType(),
        url: parsed.url,
        hostname: parsed.hostname,
        path: parsed.path,
        scheme: parsed.scheme || null,
        queryKeys: parsed.queryKeys,
        isNavigation: request.isNavigationRequest(),
        frame: request.frame() === page.mainFrame() ? 'main' : 'sub',
        redirectedFrom: null,
        response: null,
        failure: null
      };
      const from = request.redirectedFrom();
      if (from) {
        const prior = requestIndex.get(from);
        record.redirectedFrom = prior ? prior.id : null;
      }
      requestIndex.set(request, record);
      requests.push(record);
    });

    page.on('response', (response) => {
      const task = captureResponse(response).catch(() => captureError('response metadata unavailable'));
      pending.add(task);
      task.finally(() => pending.delete(task));
    });

    async function captureResponse(response) {
      const record = requestIndex.get(response.request());
      if (!record) { captureError('response without request record'); return; }
      let headers = {};
      try {
        headers = await response.allHeaders();
      } catch {
        captureError('full response headers unavailable');
        headers = response.headers();
      }
      if (frozen) return;
      const location = headers.location ? redactUrl(new URL(headers.location, response.url()).href).url : null;
      const { headers: safeHeaders, redactedNames } = redactHeaders(headers);
      record.response = {
        status: response.status(),
        statusText: scrubText(response.statusText(), 100).text,
        fromServiceWorker: response.fromServiceWorker(),
        headerNames: Object.keys(safeHeaders),
        headers: safeHeaders,
        redactedHeaderValues: redactedNames,
        location
      };
      if (record.frame === 'main' && record.isNavigation) {
        navigationChain.push({
          step: navigationChain.length + 1,
          evidenceRef: record.id,
          url: record.url,
          hostname: record.hostname,
          status: response.status(),
          location: record.response.location
        });
      }
    }

    page.on('requestfinished', request => { if (requestIndex.has(request)) finishedRequests.add(request); });
    page.on('requestfailed', (request) => {
      if (requestIndex.has(request)) finishedRequests.add(request);
      const record = requestIndex.get(request);
      if (!record) return;
      const failure = request.failure();
      record.failure = failure ? scrubText(failure.errorText, 120).text : 'unknown';
    });

    page.on('console', (message) => {
      if (consoleMessages.length >= maxMessages) { captureError('console limit reached'); return; }
      const location = message.location() || {};
      const scrubbed = scrubText(message.text(), 300);
      consoleMessages.push({
        id: `con-${pad(consoleMessages.length + 1, 3)}`,
        type: message.type(),
        text: scrubbed.text,
        scrubbedPatterns: scrubbed.scrubbed,
        truncated: scrubbed.truncated,
        source: location.url ? redactUrl(location.url).url : null,
        line: location.lineNumber ?? null
      });
    });

    page.on('pageerror', (error) => {
      if (pageErrors.length >= maxMessages) { captureError('pageerror limit reached'); return; }
      const scrubbed = scrubText(`${error.name}: ${error.message}`, 300);
      const stackMatch = typeof error.stack === 'string' ? error.stack.match(/https?:\/\/[^\s)]+/) : null;
      pageErrors.push({
        id: `err-${pad(pageErrors.length + 1, 3)}`,
        text: scrubbed.text,
        scrubbedPatterns: scrubbed.scrubbed,
        source: stackMatch ? redactUrl(stackMatch[0]).url : null
      });
    });

    page.on('dialog', async (dialog) => {
      dialogs.push({ type: dialog.type(), observed: true });
      await dialog.dismiss().catch(() => {});
    });

    let navigationError = null;
    let mainResponseStatus = null;
    try {
      const response = await page.goto(targetUrl, { timeout, waitUntil });
      mainResponseStatus = response ? response.status() : null;
    } catch (error) {
      navigationError = scrubText(error.message, 300).text;
    }

    if (!navigationError) {
      await page.waitForTimeout(settleMs);
    }

    const finalUrlRaw = page.url();
    const finalUrl = redactUrl(finalUrlRaw);
    const title = navigationError ? null : await bounded(page.title(), 3000).catch(() => { captureError('title unavailable'); return null; });

    const storage = navigationError
      ? { localStorage: [], sessionStorage: [], indexedDatabases: [], collectionError: 'not collected after navigation failure' }
      : await bounded(collectStorage(page), 3000).catch(() => ({ localStorage: [], sessionStorage: [], indexedDatabases: [], collectionError: 'storage metadata collection timed out' }));
    const cookies = await bounded(collectCookies(context, captureErrors), 3000).catch(() => { captureError('cookie metadata collection timed out'); return []; });
    const unfinishedRequests = [...requestIndex].filter(([request]) => !finishedRequests.has(request)).map(([, record]) => record.id);

    // Stop event production before draining metadata tasks. No response is silently lost.
    await page.close().catch(() => captureError('page shutdown failed'));
    let drainTimer;
    await Promise.race([Promise.allSettled([...pending]), new Promise(resolve => { drainTimer = setTimeout(resolve, Math.max(1, Math.min(responseDrainMs, 5000))); })]);
    clearTimeout(drainTimer);
    frozen = true;
    await context.close().catch(() => captureError('context shutdown failed'));
    await browser.close().catch(() => captureError('browser shutdown failed'));
    if (pending.size) captureError('response metadata drain timed out');
    const missingResponses = requests.filter(r => !r.response && !r.failure).map(r => r.id);
    const incompleteReasons = [...captureErrors];
    if (navigationError) incompleteReasons.push('navigation failed');
    if (mainResponseStatus === null) incompleteReasons.push('main response unavailable');
    if (storage.collectionError) incompleteReasons.push('storage collection failed');
    if (unfinishedRequests.length) incompleteReasons.push('requests unfinished at observation cutoff');
    if (missingResponses.length) incompleteReasons.push('request response metadata missing');
    const endedAt = new Date();
    return {
      session: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt - startedAt,
        launchedVia,
        browserName: 'chromium',
        browserVersion: browser.version ? safeVersion(browser) : null,
        userAgent,
        viewport,
        headless,
        proxy: proxy ? 'configured' : null,
        waitUntil,
        settleMs,
        timeout,
        captureLimits: { maxRequests, maxMessages, responseDrainMs },
        navigationError,
        observation: { complete: incompleteReasons.length === 0, incompleteReasons, missingResponses, unfinishedRequests, pendingResponseTasks: pending.size }
      },
      target: {
        inputUrl: redactUrl(targetUrl).url,
        inputQueryKeys: redactUrl(targetUrl).queryKeys,
        finalUrl: finalUrl.url,
        finalHostname: finalUrl.hostname,
        title: title ? scrubText(title, 200).text : null,
        mainResponseStatus
      },
      requests,
      navigationChain: navigationChain.sort((a, b) => a.evidenceRef.localeCompare(b.evidenceRef)).map((step, i) => ({ ...step, step: i + 1 })),
      consoleMessages,
      pageErrors,
      dialogs,
      storage,
      cookies
    };
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function safeVersion(browser) {
  try {
    return browser.version();
  } catch {
    return null;
  }
}

/**
 * Collects storage KEYS and value lengths. Values never leave the page.
 */
async function collectStorage(page) {
  const empty = { localStorage: [], sessionStorage: [], indexedDatabases: [], collectionError: null };
  try {
    const raw = await page.evaluate(() => {
      const read = (store) => {
        const out = [];
        try {
          for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            const value = store.getItem(key);
            out.push({ key, valueLength: value ? value.length : 0 });
          }
        } catch (e) {
          throw new Error('storage access unavailable');
        }
        return out;
      };
      return {
        localStorage: read(window.localStorage),
        sessionStorage: read(window.sessionStorage)
      };
    });
    const decorate = (entries, prefix) =>
      entries.map((entry, i) => {
        const matches = matchSensitiveKey(entry.key);
        return {
          id: `sto-${prefix}-${pad(i + 1, 3)}`,
          key: scrubText(entry.key, 120).text,
          valueLength: entry.valueLength,
          sensitiveKeyMatches: matches,
          sensitiveIndicator: matches.length > 0
        };
      });
    let indexedDatabases = [];
    try {
      indexedDatabases = await page.evaluate(async () => {
        if (!window.indexedDB || !indexedDB.databases) throw new Error('IndexedDB metadata API unavailable');
        const dbs = await indexedDB.databases();
        return dbs.map((d) => ({ name: d.name || null, version: d.version || null }));
      });
    } catch {
      return { ...empty, localStorage: decorate(raw.localStorage, 'ls'), sessionStorage: decorate(raw.sessionStorage, 'ss'), collectionError: 'IndexedDB metadata unavailable' };
    }
    return {
      localStorage: decorate(raw.localStorage, 'ls'),
      sessionStorage: decorate(raw.sessionStorage, 'ss'),
      indexedDatabases: indexedDatabases.map(db => ({ ...db, name: db.name ? scrubText(db.name, 120).text : null })),
      collectionError: null
    };
  } catch (error) {
    return { ...empty, collectionError: scrubText(error.message, 200).text };
  }
}

/**
 * Collects cookie metadata. Cookie values are never read into the evidence.
 */
async function collectCookies(context, captureErrors) {
  try {
    const cookies = await context.cookies();
    return cookies.map((cookie, i) => ({
      id: `ck-${pad(i + 1, 3)}`,
      name: scrubText(cookie.name, 120).text,
      domain: cookie.domain,
      path: redactPath(cookie.path),
      valueLength: typeof cookie.value === 'string' ? cookie.value.length : 0,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      session: cookie.expires === -1,
      expiresIso: cookie.expires && cookie.expires > 0 ? new Date(cookie.expires * 1000).toISOString() : null,
      sensitiveKeyMatches: matchSensitiveKey(cookie.name)
    }));
  } catch {
    captureErrors.push('cookie collection failed');
    return [];
  }
}

async function bounded(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('metadata collection timed out')), milliseconds); })]);
  } finally { clearTimeout(timer); }
}
