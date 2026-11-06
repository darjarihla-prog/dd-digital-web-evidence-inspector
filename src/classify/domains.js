/**
 * First-party / third-party classification.
 *
 * Deterministic: the registrable domain (eTLD+1) of the target is compared to
 * the registrable domain of each observed request. No heuristics beyond that.
 */
import { parse } from 'tldts';

export function registrableDomain(hostnameOrUrl) {
  if (!hostnameOrUrl) return null;
  const result = parse(hostnameOrUrl, { allowPrivateDomains: false });
  return result.domain || result.hostname || null;
}

export function createPartyClassifier(targetUrl) {
  const targetDomain = registrableDomain(targetUrl);
  return {
    targetDomain,
    /** Returns 'first-party', 'third-party' or 'unknown'. */
    classify(hostname) {
      if (!hostname) return 'unknown';
      const domain = registrableDomain(hostname);
      if (!domain || !targetDomain) return 'unknown';
      return domain === targetDomain ? 'first-party' : 'third-party';
    },
    domainOf: registrableDomain
  };
}
