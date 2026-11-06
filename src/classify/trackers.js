/**
 * Tracker detection.
 *
 * Rule-driven and deterministic: a request matches a tracker only when its
 * hostname equals a listed domain, is a subdomain of it, or when the listed
 * entry contains a path prefix that the request path starts with.
 *
 * A match is an observation, not a verdict. Absence of a match is explicitly
 * not evidence that no tracking occurs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_PATH = join(here, '..', '..', 'rules', 'trackers.json');

export function loadTrackerRules(path = DEFAULT_RULES_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function entryMatches(hostname, pathname, domainRule) {
  const [ruleHost, ...ruleParts] = domainRule.split('/');
  const rulePath = ruleParts.length ? `/${ruleParts.join('/')}` : null;
  const hostOk = hostname === ruleHost || hostname.endsWith(`.${ruleHost}`);
  if (!hostOk) return false;
  if (!rulePath) return true;
  return typeof pathname === 'string' && pathname.startsWith(rulePath);
}

export function createTrackerMatcher(rules = loadTrackerRules()) {
  return {
    ruleSetId: rules.ruleSetId,
    ruleSetVersion: rules.version,
    /** Returns the matching tracker rule or null. */
    matchRequest(hostname, pathname) {
      if (!hostname) return null;
      for (const tracker of rules.trackers) {
        for (const domainRule of tracker.domains) {
          if (entryMatches(hostname, pathname, domainRule)) {
            return {
              trackerId: tracker.id,
              name: tracker.name,
              category: tracker.category,
              vendor: tracker.vendor,
              confidence: tracker.confidence,
              matchedRule: domainRule
            };
          }
        }
      }
      return null;
    },
    /** Returns the matching tracker rule for a cookie name or null. */
    matchCookieName(cookieName) {
      if (!cookieName) return null;
      for (const rule of rules.cookieNames) {
        for (const name of rule.names) {
          if (cookieName === name || cookieName.startsWith(`${name}_`)) {
            const tracker = rules.trackers.find((t) => t.id === rule.id);
            return {
              trackerId: rule.id,
              name: tracker ? tracker.name : rule.id,
              category: tracker ? tracker.category : 'unknown',
              confidence: rule.confidence,
              matchedRule: `cookie:${name}`
            };
          }
        }
      }
      return null;
    }
  };
}
