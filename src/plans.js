/** Versioned design contracts; these do not enable crawling or consent automation. */
export const PLAN_VERSION = '1.0.0';
export function planPages(target, paths, { maxPages = 5, timeout = 30000 } = {}) {
  const origin = new URL(target).origin;
  if (!/^https?:/.test(target) || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5 || !Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new Error('Invalid bounded inspection plan');
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > maxPages) throw new Error('Page count exceeds bounds');
  const pages = paths.map(path => new URL(path, target));
  if (pages.some(url => url.origin !== origin || url.username || url.password)) throw new Error('Same-origin pages without credentials required');
  if (new Set(pages.map(url => url.href)).size !== pages.length) throw new Error('Duplicate page');
  return { version: PLAN_VERSION, origin, maxPages, timeout, totalTimeout: timeout * pages.length, pages: pages.map(url => url.href), forms: false, login: false, discovery: false };
}
export function planConsent(target, controls) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || controls?.verifiedOrigin !== url.origin || !controls.reject || !controls.accept || controls.reject === controls.accept) throw new Error('Verified, distinct site-specific controls required');
  return { version: PLAN_VERSION, origin: url.origin, isolatedContexts: true, scenarios: [{ id: 'no-interaction', selector: null }, { id: 'reject', selector: controls.reject }, { id: 'accept', selector: controls.accept }], legalVerdict: false };
}
