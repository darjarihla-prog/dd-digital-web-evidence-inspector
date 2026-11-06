/**
 * Classifies where a console message or page error originated: the page's
 * own (first-party) code, a third-party script, the browser/GPU runtime
 * itself, or unclassifiable from the evidence available.
 *
 * This is a deterministic, evidence-based classification, not a filter.
 * A 'browser' classification is never discarded: it stays in evidence.json
 * and is only excluded from the console-quality *finding*, because it is not
 * attributable to the website under review (PASS 006 exit criterion 1).
 *
 * The browser-signature list is a documented, MVP-scope set of known
 * Chromium/ANGLE/WebGL/GPU/driver runtime log lines actually seen in real
 * scans. It is deliberately not exhaustive: an unmatched, unattributable
 * message stays 'unclassified' (REVIEW) rather than being guessed at.
 */

export const ORIGIN = {
  APPLICATION: 'application',
  THIRD_PARTY: 'third-party',
  BROWSER: 'browser',
  UNCLASSIFIED: 'unclassified'
};

// Known browser/GPU/driver runtime signatures. These are emitted by the
// browser engine itself (often in headless/software-rendering mode), never
// by page or third-party script code, so they are never attributable to the
// site being reviewed.
const BROWSER_SIGNATURES = [
  /\bGPU stall due to ReadPixels\b/i,
  /\bAutomatic fallback to software WebGL\b/i,
  /^\[\.[\w-]+-0x[0-9a-f]+\]/i, // Chromium's "[.Context-0xHEX]" GL/WebGL logging prefix
  /\bANGLE Display::initialize\b/i,
  /\bFailed to create (a )?GL context\b/i,
  /\bSwiftShader\b/i,
  /\bGroupMarkerNotSet\(crBeginGroup\)\b/i,
  /\bContextResult::kFatalFailure\b/i,
  /\bFailed to create shared context for virtualization\b/i,
  /\bVaapi(VideoDecoder|Wrapper)\b/i,
  /\bGL_INVALID_(ENUM|OPERATION|VALUE)\b[^\n]*\bANGLE\b/i,
  /\bWebGL(-0x[0-9a-f]+)?\]?: (INVALID_|GL_)/i
];

export function isBrowserSignature(text) {
  return typeof text === 'string' && BROWSER_SIGNATURES.some((pattern) => pattern.test(text));
}

/**
 * @param {{ text: string, source?: string|null }} message
 * @param {{ classify(hostname: string): 'first-party'|'third-party'|'unknown' }} party
 * @returns {'application'|'third-party'|'browser'|'unclassified'}
 */
export function classifyOrigin(message, party) {
  if (isBrowserSignature(message.text)) {
    return ORIGIN.BROWSER;
  }
  if (message.source) {
    let hostname = null;
    try {
      hostname = new URL(message.source).hostname;
    } catch {
      hostname = null;
    }
    if (hostname) {
      const partyKind = party.classify(hostname);
      if (partyKind === 'third-party') return ORIGIN.THIRD_PARTY;
      if (partyKind === 'first-party') return ORIGIN.APPLICATION;
    }
  }
  return ORIGIN.UNCLASSIFIED;
}
