/**
 * Controlled browser session.
 *
 * Observes one page load in a fresh, isolated browser context and returns raw
 * observations. It performs no interpretation: classification happens in the
 * evidence builder and, from PASS 002 onward, in the rules layer.
 */
import { launchBrowser } from './browser.js';
import { redactUrl, redactHeaders, scrubText, matchSensitiveKey } from '../redact.js';

const pad = (n, width = 4) => String(n).padStart(width, '0');

export async function captureSession(targetUrl, options = {}) {
  const {
    timeout = 30000,
    settleMs = 3000,
    viewport = { width: 1366, height: 768 },
    headless = true,
    browserPath = null,
    proxy = null,
    waitUntil = 'load'
  } = options;

  const startedAt = new Date();
  const { browser, launchedVia } = await launchBrowser({ browserPath, headless, timeout, proxy });

  const context = await browser.newContext({
    viewport,
    acceptDownloads: false,
    serviceWorkers: 'allow'
  });

  const requests = [];
  const requestIndex = new Map();
  const consoleMessages = [];
  const pageErrors = [];
  const navigationChain = [];
  const dialogs = [];
  let requestCounter = 0;

  const page = await context.newPage();
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null);

  page.on('request', (request) => {
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

  page.on('response', async (response) => {
    const record = requestIndex.get(response.request());
    if (!record) return;
    let headers = {};
    try {
      headers = await response.allHeaders();
    } catch {
      headers = response.headers();
    }
    const { headers: safeHeaders, redactedNames } = redactHeaders(headers);
    record.response = {
      status: response.status(),
      statusText: response.statusText(),
      fromServiceWorker: response.fromServiceWorker(),
      headerNames: Object.keys(safeHeaders),
      headers: safeHeaders,
      redactedHeaderValues: redactedNames,
      location: safeHeaders.location ? redactUrl(new URL(safeHeaders.location, response.url()).toString()).url : null
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
  });

  page.on('requestfailed', (request) => {
    const record = requestIndex.get(request);
    if (!record) return;
    const failure = request.failure();
    record.failure = failure ? scrubText(failure.errorText, 120).text : 'unknown';
  });

  page.on('console', (message) => {
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
  const title = await page.title().catch(() => null);

  const storage = await collectStorage(page);
  const cookies = await collectCookies(context);

  const endedAt = new Date();
  await context.close().catch(() => {});
  await browser.close().catch(() => {});

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
      navigationError
    },
    target: {
      inputUrl: targetUrl,
      finalUrl: finalUrl.url,
      finalHostname: finalUrl.hostname,
      title: title ? scrubText(title, 200).text : null,
      mainResponseStatus
    },
    requests,
    navigationChain,
    consoleMessages,
    pageErrors,
    dialogs,
    storage,
    cookies
  };
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
          return out;
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
          key: entry.key,
          valueLength: entry.valueLength,
          sensitiveKeyMatches: matches,
          sensitiveIndicator: matches.length > 0
        };
      });
    let indexedDatabases = [];
    try {
      indexedDatabases = await page.evaluate(async () => {
        if (!window.indexedDB || !indexedDB.databases) return [];
        const dbs = await indexedDB.databases();
        return dbs.map((d) => ({ name: d.name || null, version: d.version || null }));
      });
    } catch {
      indexedDatabases = [];
    }
    return {
      localStorage: decorate(raw.localStorage, 'ls'),
      sessionStorage: decorate(raw.sessionStorage, 'ss'),
      indexedDatabases,
      collectionError: null
    };
  } catch (error) {
    return { ...empty, collectionError: scrubText(error.message, 200).text };
  }
}

/**
 * Collects cookie metadata. Cookie values are never read into the evidence.
 */
async function collectCookies(context) {
  try {
    const cookies = await context.cookies();
    return cookies.map((cookie, i) => ({
      id: `ck-${pad(i + 1, 3)}`,
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      valueLength: typeof cookie.value === 'string' ? cookie.value.length : 0,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      session: cookie.expires === -1,
      expiresIso: cookie.expires && cookie.expires > 0 ? new Date(cookie.expires * 1000).toISOString() : null,
      sensitiveKeyMatches: matchSensitiveKey(cookie.name)
    }));
  } catch {
    return [];
  }
}
