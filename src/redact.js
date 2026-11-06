/**
 * Privacy layer.
 *
 * Product principle: the inspector never stores request bodies, response bodies,
 * cookie values, Authorization header values, storage values or query parameter
 * values. This module is the single place where that is enforced.
 */

export const SENSITIVE_KEY_PATTERNS = [
  { id: 'auth', re: /(^|[_\-.])(auth|authorization|bearer|oauth)([_\-.]|$)/i },
  { id: 'token', re: /token|jwt|id_token|access_token|refresh_token/i },
  { id: 'session', re: /session|sid|sess_id|phpsessid/i },
  { id: 'secret', re: /secret|passwd|password|passphrase|private_key|apikey|api_key/i },
  { id: 'identifier', re: /(^|[_\-.])(uid|userid|user_id|customerid|account(_)?id)([_\-.]|$)/i },
  { id: 'contact', re: /email|e-mail|phone|telefoon|mobile|address|adres|postcode|zipcode/i },
  { id: 'payment', re: /iban|creditcard|card_number|cvv|bic|payment/i },
  { id: 'national_id', re: /bsn|ssn|passport|paspoort/i }
];

const HEADER_VALUE_DENYLIST = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token'
]);

/** Returns the sensitive-key pattern ids a key matches. Empty array means no match. */
export function matchSensitiveKey(key) {
  if (typeof key !== 'string') return [];
  return SENSITIVE_KEY_PATTERNS.filter((p) => p.re.test(key)).map((p) => p.id);
}

/**
 * Splits a URL into a storable form: origin + path are kept, query parameter
 * NAMES are kept, query parameter VALUES are never kept.
 */
export function redactUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return { url: null, origin: null, hostname: null, path: null, queryKeys: [], fragment: false, parseError: true };
  }
  if (rawUrl.startsWith('data:')) {
    const mime = rawUrl.slice(5).split(/[;,]/)[0] || 'unknown';
    return { url: `data:${mime},[REDACTED]`, origin: 'data:', hostname: null, path: null, queryKeys: [], fragment: false, scheme: 'data:' };
  }
  if (/^(about|blob|chrome|chrome-extension|javascript):/i.test(rawUrl)) {
    const scheme = rawUrl.split(':')[0].toLowerCase();
    return { url: rawUrl.startsWith('about:') ? rawUrl : `${scheme}:[REDACTED]`, origin: null, hostname: null, path: null, queryKeys: [], fragment: false, scheme: `${scheme}:` };
  }
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { url: '[UNPARSEABLE_URL]', origin: null, hostname: null, path: null, queryKeys: [], fragment: false, parseError: true };
  }
  const queryKeys = [];
  for (const [k] of u.searchParams) {
    if (!queryKeys.some((q) => q.key === k)) {
      queryKeys.push({ key: k, sensitiveMatches: matchSensitiveKey(k) });
    }
  }
  const fragment = Boolean(u.hash && u.hash.length > 1);
  const safe = `${u.origin}${u.pathname}${queryKeys.length ? '?[QUERY_REDACTED]' : ''}`;
  return {
    url: safe,
    origin: u.origin,
    hostname: u.hostname,
    path: u.pathname,
    scheme: u.protocol,
    queryKeys,
    fragment
  };
}

/**
 * Keeps only header names that are safe to store with their values.
 * Denylisted headers are recorded as present, with the value replaced.
 */
export function redactHeaders(headers = {}) {
  const out = {};
  const redactedNames = [];
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (HEADER_VALUE_DENYLIST.has(lower)) {
      out[lower] = '[REDACTED]';
      redactedNames.push(lower);
      continue;
    }
    out[lower] = truncate(String(value), 512);
  }
  return { headers: out, redactedNames };
}

const SCRUB_RULES = [
  // Collapse embedded payloads first. A data URI carries no information a
  // consultant needs, and left in place it swallows the part of the message
  // that does: the reason the browser gave.
  { id: 'data_uri', re: /(data:[\w.+-]+\/[\w.+-]+(?:;[\w-]+)*(?:;base64)?,)[^\s'")]{16,}/gi, replacement: '$1[PAYLOAD_OMITTED]' },
  { id: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '[EMAIL_REDACTED]' },
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, replacement: '[JWT_REDACTED]' },
  { id: 'bearer', re: /(bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, replacement: '$1[TOKEN_REDACTED]' },
  { id: 'long_token', re: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: '[LONG_TOKEN_REDACTED]' },
  { id: 'query_value', re: /([?&][A-Za-z0-9_\-.]+=)[^&\s"']+/g, replacement: '$1[REDACTED]' }
];

/**
 * Free text such as console output can contain secrets. It is scrubbed with
 * deterministic patterns and truncated before it is stored.
 */
export function scrubText(text, maxLength = 300) {
  if (typeof text !== 'string') return { text: '', scrubbed: [], truncated: false };
  let out = text;
  const scrubbed = [];
  for (const rule of SCRUB_RULES) {
    if (rule.re.test(out)) {
      scrubbed.push(rule.id);
      out = out.replace(new RegExp(rule.re.source, rule.re.flags), rule.replacement);
    }
    rule.re.lastIndex = 0;
  }
  const truncated = out.length > maxLength;
  return { text: truncateMiddle(out, maxLength), scrubbed, truncated };
}

/**
 * Console messages put the reason at the end: "Loading the font X failed: OTS
 * parsing error". Cutting only the tail throws away the only useful part, so
 * the middle is removed instead of the end.
 */
export function truncateMiddle(value, maxLength) {
  if (typeof value !== 'string' || value.length <= maxLength) return value;
  const head = Math.max(Math.floor(maxLength * 0.6), 1);
  const tail = Math.max(maxLength - head, 1);
  return `${value.slice(0, head)}...[MIDDLE_OMITTED]...${value.slice(-tail)}`;
}

export function truncate(value, maxLength) {
  if (typeof value !== 'string') return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[TRUNCATED]` : value;
}
