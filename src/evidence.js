/**
 * Evidence builder.
 *
 * Turns raw session observations into the technical evidence document.
 * It classifies (first/third party, tracker match, header presence) but does
 * not grade. PASS / REVIEW / FAIL is the responsibility of the rules layer.
 */
import { createPartyClassifier } from './classify/domains.js';
import { createTrackerMatcher, loadTrackerRules } from './classify/trackers.js';
import { observeSecurityHeaders } from './classify/headers.js';
import { classifyOrigin, ORIGIN } from './classify/console-origin.js';

export const EVIDENCE_SCHEMA_VERSION = '0.1.0';
export const TOOL_NAME = 'Darja Rihla Web Evidence Inspector';
export const TOOL_VERSION = '0.1.0';

export const PRIVACY_POLICY = {
  neverCollected: [
    'request bodies',
    'response bodies',
    'Authorization and other credential header values',
    'cookie values',
    'localStorage and sessionStorage values',
    'query parameter values',
    'page content and form input'
  ],
  collectedWithRedaction: [
    'URLs without query values',
    'query parameter names',
    'storage key names with value length',
    'cookie metadata with value length',
    'console text with pattern-based scrubbing'
  ]
};

export function buildEvidence(raw, { rulesPath, scanId } = {}) {
  const rules = loadTrackerRules(rulesPath || undefined);
  const trackerMatcher = createTrackerMatcher(rules);
  const party = createPartyClassifier(raw.target.finalUrl || raw.target.inputUrl);

  const requests = raw.requests.map((request) => {
    const partyLabel = party.classify(request.hostname);
    const tracker = trackerMatcher.matchRequest(request.hostname, request.path);
    return {
      ...request,
      registrableDomain: party.domainOf(request.hostname),
      party: partyLabel,
      tracker: tracker || null
    };
  });

  const domainMap = new Map();
  for (const request of requests) {
    if (!request.registrableDomain) continue;
    const existing = domainMap.get(request.registrableDomain) || {
      domain: request.registrableDomain,
      party: request.party,
      requestCount: 0,
      hostnames: new Set(),
      resourceTypes: new Set(),
      evidenceRefs: [],
      tracker: null
    };
    existing.requestCount += 1;
    existing.hostnames.add(request.hostname);
    existing.resourceTypes.add(request.resourceType);
    if (existing.evidenceRefs.length < 10) existing.evidenceRefs.push(request.id);
    if (request.tracker && !existing.tracker) existing.tracker = request.tracker;
    domainMap.set(request.registrableDomain, existing);
  }
  const domains = [...domainMap.values()]
    .map((entry) => ({
      domain: entry.domain,
      party: entry.party,
      requestCount: entry.requestCount,
      hostnames: [...entry.hostnames],
      resourceTypes: [...entry.resourceTypes],
      tracker: entry.tracker,
      evidenceRefs: entry.evidenceRefs
    }))
    .sort((a, b) => b.requestCount - a.requestCount);

  const thirdPartyDomains = domains.filter((d) => d.party === 'third-party');

  const TRANSMISSION_TYPES = new Set(['xhr', 'fetch', 'ping', 'beacon']);
  const isTransmission = (request) => request.method === 'POST' || TRANSMISSION_TYPES.has(request.resourceType);

  const trackersDetected = [];
  for (const request of requests) {
    if (!request.tracker) continue;
    let entry = trackersDetected.find((t) => t.trackerId === request.tracker.trackerId);
    if (!entry) {
      entry = {
        ...request.tracker,
        detectedVia: 'request',
        requestCount: 0,
        evidenceRefs: [],
        transmissions: { count: 0, accepted: 0, evidenceRefs: [] }
      };
      trackersDetected.push(entry);
    }
    entry.requestCount += 1;
    if (entry.evidenceRefs.length < 5) entry.evidenceRefs.push(request.id);
    if (isTransmission(request)) {
      entry.transmissions.count += 1;
      if (request.response && request.response.status >= 200 && request.response.status < 300) {
        entry.transmissions.accepted += 1;
      }
      entry.transmissions.evidenceRefs.push(request.id);
    }
  }
  const cookies = raw.cookies.map((cookie) => {
    const tracker = trackerMatcher.matchCookieName(cookie.name);
    if (tracker) {
      let entry = trackersDetected.find((t) => t.trackerId === tracker.trackerId);
      if (!entry) {
        entry = { ...tracker, detectedVia: 'cookie', requestCount: 0, evidenceRefs: [], transmissions: { count: 0, accepted: 0, evidenceRefs: [] } };
        trackersDetected.push(entry);
      }
      if (entry.evidenceRefs.length < 5) entry.evidenceRefs.push(cookie.id);
    }
    return { ...cookie, party: party.classify(cookie.domain.replace(/^\./, '')), tracker: tracker || null };
  });

  const mainNavigation = raw.navigationChain;
  const finalHost = raw.target.finalHostname;
  const redirects = {
    observed: mainNavigation.length > 1,
    hops: Math.max(mainNavigation.length - 1, 0),
    chain: mainNavigation,
    leavesFirstParty: mainNavigation.some(
      (step) => step.hostname && party.classify(step.hostname) === 'third-party'
    ),
    schemeUpgrade: mainNavigation.length > 1 &&
      mainNavigation[0].url &&
      mainNavigation[0].url.startsWith('http://') &&
      Boolean(raw.target.finalUrl && raw.target.finalUrl.startsWith('https://'))
  };

  const documentResponse = requests.find(
    (r) => r.frame === 'main' && r.isNavigation && r.response && r.response.status < 300
  ) || requests.find((r) => r.frame === 'main' && r.isNavigation && r.response);
  const isHttps = Boolean(raw.target.finalUrl && raw.target.finalUrl.startsWith('https://'));
  const securityHeaders = documentResponse
    ? { evidenceRef: documentResponse.id, ...observeSecurityHeaders(documentResponse.response.headers, { isHttps }) }
    : { evidenceRef: null, present: [], missing: [], informational: {}, note: 'no main document response observed' };

  const thirdPartyScripts = requests
    .filter((r) => r.resourceType === 'script' && r.party === 'third-party')
    .map((r) => ({ evidenceRef: r.id, url: r.url, hostname: r.hostname, domain: r.registrableDomain, tracker: r.tracker }));

  const consoleMessages = raw.consoleMessages.map((m) => ({ ...m, origin: classifyOrigin(m, party) }));
  const pageErrorsClassified = raw.pageErrors.map((e) => ({ ...e, origin: classifyOrigin(e, party) }));

  const consoleRelevant = consoleMessages.filter((m) => m.type === 'error' || m.type === 'warning');
  const consoleFindingRelevant = consoleRelevant.filter((m) => m.origin !== ORIGIN.BROWSER);
  const pageErrorsFindingRelevant = pageErrorsClassified.filter((e) => e.origin !== ORIGIN.BROWSER);

  const sensitiveStorage = [...raw.storage.localStorage, ...raw.storage.sessionStorage].filter(
    (entry) => entry.sensitiveIndicator
  );

  const failedRequests = requests.filter((r) => r.failure).map((r) => ({ evidenceRef: r.id, url: r.url, failure: r.failure }));

  return {
    schema: {
      name: 'darja-rihla-web-evidence',
      version: EVIDENCE_SCHEMA_VERSION,
      note: 'Evidence document. Observations only. Interpretation and grading are produced separately.'
    },
    scan: {
      scanId: scanId || `scan-${Date.now()}`,
      tool: { name: TOOL_NAME, version: TOOL_VERSION },
      rules: { trackerRuleSet: trackerMatcher.ruleSetId, trackerRuleSetVersion: trackerMatcher.ruleSetVersion },
      ...raw.session,
      target: raw.target,
      privacy: PRIVACY_POLICY
    },
    summary: {
      requestsObserved: requests.length,
      distinctDomains: domains.length,
      thirdPartyDomains: thirdPartyDomains.length,
      trackersDetected: trackersDetected.length,
      trackerTransmissions: trackersDetected.reduce((total, t) => total + t.transmissions.count, 0),
      redirectHops: redirects.hops,
      externalRedirectsObserved: redirects.leavesFirstParty,
      browserStorageKeys: raw.storage.localStorage.length + raw.storage.sessionStorage.length,
      sensitiveStorageIndicators: sensitiveStorage.length,
      cookies: cookies.length,
      consoleErrors: consoleRelevant.filter((m) => m.type === 'error').length + pageErrorsClassified.length,
      consoleErrorsAttributable: consoleFindingRelevant.filter((m) => m.type === 'error').length + pageErrorsFindingRelevant.length,
      consoleWarnings: consoleRelevant.filter((m) => m.type === 'warning').length,
      consoleByOrigin: {
        application: consoleRelevant.filter((m) => m.origin === ORIGIN.APPLICATION).length
          + pageErrorsClassified.filter((e) => e.origin === ORIGIN.APPLICATION).length,
        thirdParty: consoleRelevant.filter((m) => m.origin === ORIGIN.THIRD_PARTY).length
          + pageErrorsClassified.filter((e) => e.origin === ORIGIN.THIRD_PARTY).length,
        browser: consoleRelevant.filter((m) => m.origin === ORIGIN.BROWSER).length
          + pageErrorsClassified.filter((e) => e.origin === ORIGIN.BROWSER).length,
        unclassified: consoleRelevant.filter((m) => m.origin === ORIGIN.UNCLASSIFIED).length
          + pageErrorsClassified.filter((e) => e.origin === ORIGIN.UNCLASSIFIED).length
      },
      securityHeadersPresent: securityHeaders.present.length,
      securityHeadersMissing: securityHeaders.missing.length,
      thirdPartyScripts: thirdPartyScripts.length,
      failedRequests: failedRequests.length
    },
    evidence: {
      target: raw.target,
      redirects,
      domains,
      thirdPartyDomains,
      trackers: trackersDetected,
      securityHeaders,
      thirdPartyScripts,
      storage: {
        localStorage: raw.storage.localStorage,
        sessionStorage: raw.storage.sessionStorage,
        indexedDatabases: raw.storage.indexedDatabases,
        sensitiveIndicators: sensitiveStorage,
        collectionError: raw.storage.collectionError
      },
      cookies,
      console: {
        relevant: consoleRelevant,
        findingRelevant: consoleFindingRelevant,
        all: consoleMessages,
        pageErrors: pageErrorsClassified,
        pageErrorsFindingRelevant
      },
      failedRequests,
      dialogs: raw.dialogs,
      requests
    },
    limitations: [
      { id: 'singlePage', text: 'Single page load of one URL. Pages behind navigation, login or interaction were not observed.' },
      { id: 'singleViewport', text: 'One viewport and one user agent. Responsive or device-specific behaviour may differ.' },
      { id: 'noConsent', text: 'No consent interaction was performed. Nothing was accepted or refused in a consent banner, so trackers that load only after consent may be absent from this evidence.' },
      { id: 'ruleSet', text: 'Tracker detection is limited to the bundled rule set. Absence of a match is not evidence that no tracking occurs.' },
      { id: 'headersMainOnly', text: 'Security headers are observed on the main document response only.' },
      { id: 'noBodies', text: 'No request or response bodies were inspected, by design.' },
      { id: 'consoleOrigin', text: 'Console messages and page errors are classified as application, third-party, browser or unclassified origin using a documented, non-exhaustive signature list for known browser/GPU/driver runtime noise. Browser-origin messages remain in this evidence document but carry no weight in the console-quality finding, because they are not attributable to the site.' }
    ]
  };
}
