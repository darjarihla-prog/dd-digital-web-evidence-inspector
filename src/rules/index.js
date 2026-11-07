/**
 * Deterministic assessment rules.
 *
 * A rule decides a status from the evidence and returns the facts it used.
 * It contains no display text: wording lives in messages.js so the same
 * finding can be rendered in more than one language without changing logic.
 *
 * Meaning of the statuses:
 *   PASS   no relevant finding was observed within this check. It does not
 *          mean the website is secure.
 *   REVIEW something was observed that a consultant has to judge in context.
 *   FAIL   something was observed that is wrong in almost any context.
 */

export const STATUS = { INCONCLUSIVE: 'INCONCLUSIVE', PASS: 'PASS', REVIEW: 'REVIEW', FAIL: 'FAIL' };
export const SEVERITY = { INFO: 'info', LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };
export const CONFIDENCE = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Evidence references for a finding.
 *
 * A finding that states a count must be traceable to that many references.
 * Above the cap the list is truncated, and the truncation is stated rather
 * than hidden, so a reader can always tell a complete list from a sample.
 */
const MAX_REFS = 25;
function refs(ids) {
  const all = ids.filter(Boolean);
  return {
    evidenceRefs: all.slice(0, MAX_REFS),
    evidenceRefsTotal: all.length,
    evidenceRefsTruncated: all.length > MAX_REFS
  };
}
const MEDIUM_WEIGHT_HEADERS = ['content-security-policy', 'strict-transport-security', 'x-frame-options'];

export const RULES = [
  {
    id: 'DR-TRANSPORT-001',
    category: 'transport',
    messageId: 'transport.https',
    evaluate(e) {
      const finalUrl = e.evidence.target.finalUrl || '';
      const isHttps = finalUrl.startsWith('https://');
      if (isHttps) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: ['evidence.target.finalUrl'], outcome: 'https', data: {} };
      }
      return {
        status: STATUS.FAIL,
        severity: SEVERITY.HIGH,
        confidence: CONFIDENCE.HIGH,
        evidenceRefs: ['evidence.target.finalUrl'],
        outcome: 'insecure',
        data: { scheme: finalUrl.split(':')[0] || 'unknown' }
      };
    }
  },
  {
    id: 'DR-TRANSPORT-002',
    category: 'transport',
    messageId: 'transport.mixedContent',
    evaluate(e) {
      const finalUrl = e.evidence.target.finalUrl || '';
      if (!finalUrl.startsWith('https://')) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [], outcome: 'notApplicable', data: {} };
      }
      const insecure = e.evidence.requests.filter(
        (r) => r.scheme === 'http:' && r.hostname && r.hostname !== '127.0.0.1' && r.hostname !== 'localhost'
      );
      if (!insecure.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.MEDIUM, evidenceRefs: [], outcome: 'clean', data: {} };
      }
      return {
        status: STATUS.FAIL,
        severity: SEVERITY.HIGH,
        confidence: CONFIDENCE.HIGH,
        ...refs(insecure.map((r) => r.id)),
        outcome: 'mixed',
        data: { count: insecure.length }
      };
    }
  },
  {
    id: 'DR-HEADERS-001',
    category: 'security-headers',
    messageId: 'headers.main',
    evaluate(e) {
      const ref = e.evidence.securityHeaders.evidenceRef;
      if (!ref) {
        return { status: STATUS.REVIEW, severity: SEVERITY.INFO, confidence: CONFIDENCE.LOW, evidenceRefs: [], outcome: 'noDocument', data: {} };
      }
      const missing = e.evidence.securityHeaders.missing.filter((h) => !h.note);
      if (!missing.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [ref], outcome: 'complete', data: {} };
      }
      const names = missing.map((h) => h.header);
      return {
        status: STATUS.REVIEW,
        severity: names.some((n) => MEDIUM_WEIGHT_HEADERS.includes(n)) ? SEVERITY.MEDIUM : SEVERITY.LOW,
        confidence: CONFIDENCE.HIGH,
        evidenceRefs: [ref],
        outcome: 'missing',
        data: { count: names.length, names }
      };
    }
  },
  {
    id: 'DR-THIRDPARTY-001',
    category: 'third-party',
    messageId: 'thirdParty.domains',
    evaluate(e) {
      const domains = e.evidence.thirdPartyDomains;
      if (!domains.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [], outcome: 'none', data: {} };
      }
      return {
        status: STATUS.REVIEW,
        severity: domains.length > 5 ? SEVERITY.MEDIUM : SEVERITY.LOW,
        confidence: CONFIDENCE.HIGH,
        ...refs(domains.flatMap((d) => d.evidenceRefs)),
        outcome: 'present',
        data: { count: domains.length, names: domains.map((d) => d.domain) }
      };
    }
  },
  {
    id: 'DR-THIRDPARTY-002',
    category: 'third-party',
    messageId: 'thirdParty.scripts',
    evaluate(e) {
      const scripts = e.evidence.thirdPartyScripts;
      if (!scripts.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [], outcome: 'none', data: {} };
      }
      const hosts = [...new Set(scripts.map((s) => s.domain))];
      return {
        status: STATUS.REVIEW,
        severity: SEVERITY.MEDIUM,
        confidence: CONFIDENCE.HIGH,
        ...refs(scripts.map((s) => s.evidenceRef)),
        outcome: 'present',
        data: { count: scripts.length, domainCount: hosts.length, names: hosts }
      };
    }
  },
  {
    id: 'DR-PRIVACY-001',
    category: 'privacy',
    messageId: 'privacy.trackers',
    evaluate(e) {
      const trackers = e.evidence.trackers;
      if (!trackers.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.MEDIUM, evidenceRefs: [], outcome: 'none', data: {} };
      }
      const transmitting = trackers.filter((t) => t.transmissions && t.transmissions.count > 0);
      const accepted = transmitting.reduce((total, t) => total + t.transmissions.accepted, 0);
      if (!transmitting.length) {
        return {
          status: STATUS.REVIEW,
          severity: SEVERITY.MEDIUM,
          confidence: CONFIDENCE.HIGH,
          ...refs(trackers.flatMap((t) => t.evidenceRefs)),
          outcome: 'loaded',
          data: { count: trackers.length, names: trackers.map((t) => t.name) }
        };
      }
      return {
        status: STATUS.REVIEW,
        severity: SEVERITY.HIGH,
        confidence: CONFIDENCE.HIGH,
        ...refs(transmitting.flatMap((t) => t.transmissions.evidenceRefs)),
        outcome: 'transmitting',
        data: {
          count: trackers.length,
          names: trackers.map((t) => t.name),
          transmittingNames: transmitting.map((t) => t.name),
          transmissions: transmitting.reduce((total, t) => total + t.transmissions.count, 0),
          accepted
        }
      };
    }
  },
  {
    id: 'DR-PRIVACY-002',
    category: 'privacy',
    messageId: 'privacy.trackingCookies',
    evaluate(e) {
      const tracking = e.evidence.cookies.filter((c) => c.tracker);
      if (!tracking.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.MEDIUM, evidenceRefs: [], outcome: 'none', data: {} };
      }
      return {
        status: STATUS.REVIEW,
        severity: SEVERITY.MEDIUM,
        confidence: CONFIDENCE.HIGH,
        ...refs(tracking.map((c) => c.id)),
        outcome: 'present',
        data: { count: tracking.length, names: tracking.map((c) => c.name) }
      };
    }
  },
  {
    id: 'DR-COOKIES-001',
    category: 'cookies',
    messageId: 'cookies.attributes',
    evaluate(e) {
      const isHttps = (e.evidence.target.finalUrl || '').startsWith('https://');
      if (!e.evidence.cookies.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [], outcome: 'none', data: {} };
      }
      const weak = e.evidence.cookies.filter((c) => (isHttps && !c.secure) || (c.sameSite === 'None' && !c.secure));
      const longLived = e.evidence.cookies.filter((c) => c.expiresIso && new Date(c.expiresIso) - Date.now() > YEAR_MS);
      if (!weak.length && !longLived.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.MEDIUM, evidenceRefs: [], outcome: 'clean', data: { count: e.evidence.cookies.length } };
      }
      return {
        status: STATUS.REVIEW,
        severity: weak.length ? SEVERITY.MEDIUM : SEVERITY.LOW,
        confidence: CONFIDENCE.HIGH,
        ...refs([...new Set([...weak, ...longLived])].map((c) => c.id)),
        outcome: 'weak',
        data: { weak: weak.length, longLived: longLived.length }
      };
    }
  },
  {
    id: 'DR-STORAGE-001',
    category: 'browser-storage',
    messageId: 'storage.sensitiveKeys',
    evaluate(e) {
      const indicators = e.evidence.storage.sensitiveIndicators;
      const total = e.evidence.storage.localStorage.length + e.evidence.storage.sessionStorage.length;
      if (!indicators.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.MEDIUM, evidenceRefs: [], outcome: 'none', data: { total } };
      }
      return {
        status: STATUS.REVIEW,
        severity: SEVERITY.HIGH,
        confidence: CONFIDENCE.MEDIUM,
        ...refs(indicators.map((s) => s.id)),
        outcome: 'present',
        data: { count: indicators.length, names: indicators.map((s) => s.key) }
      };
    }
  },
  {
    id: 'DR-REDIRECT-001',
    category: 'redirects',
    messageId: 'redirects.chain',
    evaluate(e) {
      const r = e.evidence.redirects;
      if (!r.observed) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [], outcome: 'none', data: {} };
      }
      const chainRefs = r.chain.map((c) => c.evidenceRef);
      if (r.leavesFirstParty) {
        return { status: STATUS.REVIEW, severity: SEVERITY.MEDIUM, confidence: CONFIDENCE.HIGH, ...refs(chainRefs), outcome: 'external', data: { hops: r.hops } };
      }
      if (r.hops > 2) {
        return { status: STATUS.REVIEW, severity: SEVERITY.LOW, confidence: CONFIDENCE.HIGH, ...refs(chainRefs), outcome: 'long', data: { hops: r.hops } };
      }
      return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, ...refs(chainRefs), outcome: 'internal', data: { hops: r.hops } };
    }
  },
  {
    id: 'DR-QUALITY-001',
    category: 'quality',
    messageId: 'quality.consoleErrors',
    evaluate(e) {
      // Browser/runtime-origin messages (WebGL, GPU, driver noise) are never
      // attributable to the site under review, so they carry no finding
      // weight here even though they remain fully visible in evidence.json
      // (PASS 006 exit criterion 1). Unclassified messages are kept in the
      // finding: an unresolved origin stays a REVIEW signal, not a discard.
      const errorMessages = e.evidence.console.findingRelevant.filter((m) => m.type === 'error');
      const pageErrors = e.evidence.console.pageErrorsFindingRelevant;
      const count = errorMessages.length + pageErrors.length;
      const browserOriginExcluded = e.evidence.console.relevant.filter((m) => m.type === 'error' && m.origin === 'browser').length
        + e.evidence.console.pageErrors.filter((err) => err.origin === 'browser').length;
      if (!count) {
        return {
          status: STATUS.PASS,
          severity: SEVERITY.INFO,
          confidence: CONFIDENCE.HIGH,
          evidenceRefs: [],
          outcome: browserOriginExcluded ? 'onlyBrowserOrigin' : 'none',
          data: { browserOriginExcluded }
        };
      }
      return {
        status: STATUS.REVIEW,
        severity: count > 5 ? SEVERITY.MEDIUM : SEVERITY.LOW,
        confidence: CONFIDENCE.HIGH,
        ...refs([...errorMessages, ...pageErrors].map((m) => m.id)),
        outcome: 'present',
        data: { count, browserOriginExcluded }
      };
    }
  },
  {
    id: 'DR-QUALITY-002',
    category: 'quality',
    messageId: 'quality.failedRequests',
    evaluate(e) {
      const failed = e.evidence.failedRequests;
      if (!failed.length) {
        return { status: STATUS.PASS, severity: SEVERITY.INFO, confidence: CONFIDENCE.HIGH, evidenceRefs: [], outcome: 'none', data: {} };
      }
      return {
        status: STATUS.REVIEW,
        severity: SEVERITY.LOW,
        confidence: CONFIDENCE.HIGH,
        ...refs(failed.map((f) => f.evidenceRef)),
        outcome: 'present',
        data: { count: failed.length }
      };
    }
  }
];

export function worstStatus(statuses) {
  if (statuses.includes(STATUS.FAIL)) return STATUS.FAIL;
  if (statuses.includes(STATUS.REVIEW)) return STATUS.REVIEW;
  if (statuses.includes(STATUS.INCONCLUSIVE)) return STATUS.INCONCLUSIVE;
  return STATUS.PASS;
}
