/**
 * Security header observation on the main document response.
 *
 * This module only records what was observed. It does not judge the site.
 * Grading happens in PASS 002.
 */

export const SECURITY_HEADERS = [
  { name: 'strict-transport-security', label: 'HSTS', httpsOnly: true },
  { name: 'content-security-policy', label: 'Content Security Policy' },
  { name: 'x-content-type-options', label: 'X-Content-Type-Options' },
  { name: 'x-frame-options', label: 'X-Frame-Options', alternative: 'content-security-policy:frame-ancestors' },
  { name: 'referrer-policy', label: 'Referrer-Policy' },
  { name: 'permissions-policy', label: 'Permissions-Policy' },
  { name: 'cross-origin-opener-policy', label: 'Cross-Origin-Opener-Policy' },
  { name: 'cross-origin-resource-policy', label: 'Cross-Origin-Resource-Policy' }
];

export const INFORMATIONAL_HEADERS = ['server', 'x-powered-by', 'content-type', 'via', 'x-generator'];

export function observeSecurityHeaders(responseHeaders = {}, { isHttps = true } = {}) {
  const present = [];
  const missing = [];
  const csp = responseHeaders['content-security-policy'] || '';
  for (const spec of SECURITY_HEADERS) {
    const value = responseHeaders[spec.name];
    if (value !== undefined) {
      present.push({ header: spec.name, label: spec.label, value });
      continue;
    }
    if (spec.name === 'x-frame-options' && /frame-ancestors/i.test(csp)) {
      present.push({
        header: spec.name,
        label: spec.label,
        value: null,
        coveredBy: 'content-security-policy: frame-ancestors'
      });
      continue;
    }
    if (spec.httpsOnly && !isHttps) {
      missing.push({ header: spec.name, label: spec.label, note: 'not applicable over plain http' });
      continue;
    }
    missing.push({ header: spec.name, label: spec.label });
  }
  const informational = {};
  for (const name of INFORMATIONAL_HEADERS) {
    if (responseHeaders[name] !== undefined) informational[name] = responseHeaders[name];
  }
  return { present, missing, informational };
}
