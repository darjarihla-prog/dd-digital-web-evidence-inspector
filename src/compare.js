/** Deterministic historical comparison. Inputs remain unmodified. */
import { lstatSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { validateScan, writeManifest } from './integrity.js';
import { loadVerifiedPackage, loadUnverifiedPackage, manifestPresent, parseStrictJson, PackageIntegrityError } from './verify.js';

const adverse = f => ['REVIEW', 'FAIL'].includes(f.status);
const complete = e => e.scan.observation?.complete === true && !e.scan.navigationError && !e.evidence.storage.collectionError;
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};
function metadata(evidence, finding) {
  const all = [evidence.evidence.requests, evidence.evidence.cookies, evidence.evidence.storage.localStorage, evidence.evidence.storage.sessionStorage, evidence.evidence.console.all, evidence.evidence.console.pageErrors].flat();
  return finding.evidenceRefs.map(ref => {
    const record = all.find(item => item.id === ref);
    if (!record) return { path: ref, value: ref.split('.').reduce((v, key) => v?.[key], evidence) };
    // Request IDs are local to each scan, so compare semantic metadata instead.
    const { id, redirectedFrom, ...rest } = record;
    return rest;
  }).map(item => JSON.stringify(canonical(item))).sort();
}
export function compareScans(before, after) {
  validateScan(before.evidence, before.assessment);
  validateScan(after.evidence, after.assessment);
  if (before.evidence.schema.version !== after.evidence.schema.version || before.assessment.schema.version !== after.assessment.schema.version) throw new Error('Schema versions differ; explicit migration required');
  if (before.evidence.scan.target.finalUrl !== after.evidence.scan.target.finalUrl) throw new Error('Targets differ; comparison refused');
  if (JSON.stringify(canonical(before.evidence.scan.rules)) !== JSON.stringify(canonical(after.evidence.scan.rules)) || JSON.stringify(before.assessment.ruleSet) !== JSON.stringify(after.assessment.ruleSet)) throw new Error('Rule sets differ; comparison refused');
  const result = { schema: { name: 'darja-rihla-scan-diff', version: '1.0.0' }, beforeScanId: before.evidence.scan.scanId, afterScanId: after.evidence.scan.scanId, complete: complete(before.evidence) && complete(after.evidence), new: [], unchanged: [], changed: [], resolved: [], inconclusive: [] };
  const old = new Map(before.assessment.findings.map(f => [f.findingId, f]));
  const next = new Map(after.assessment.findings.map(f => [f.findingId, f]));
  for (const id of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const a = old.get(id), b = next.get(id);
    const entry = { findingId: id, beforeStatus: a?.status ?? null, afterStatus: b?.status ?? null, beforeEvidenceRefs: a?.evidenceRefs ?? [], afterEvidenceRefs: b?.evidenceRefs ?? [] };
    if (!a || !b || ['INCONCLUSIVE', 'NOT_TESTED'].includes(a.status) || ['INCONCLUSIVE', 'NOT_TESTED'].includes(b.status)) { result.inconclusive.push(entry); continue; }
    if (adverse(a) && !adverse(b)) result[result.complete ? 'resolved' : 'inconclusive'].push(entry);
    else if (!adverse(a) && adverse(b)) result.new.push(entry);
    else if (JSON.stringify([a.status, a.severity, a.outcome, metadata(before.evidence, a)]) === JSON.stringify([b.status, b.severity, b.outcome, metadata(after.evidence, b)])) result.unchanged.push(entry);
    else result.changed.push(entry);
  }
  result.limitations = ['Comparison covers saved redacted metadata only. Matching redacted URLs do not establish identical query values.', 'New and resolved describe observed findings, not a legal or security verdict. Legacy scans without completeness metadata cannot prove resolution.'];
  return result;
}
export function renderComparison(diff) {
  return [`# Historical scan comparison`, ``, `${diff.beforeScanId} → ${diff.afterScanId}`, ``, `Complete observations: ${diff.complete}`, ``, ...['new', 'unchanged', 'changed', 'resolved', 'inconclusive'].map(key => `${key}: ${diff[key].length} (${diff[key].map(f => f.findingId).join(', ') || 'none'})`), '', ...diff.limitations].join('\n') + '\n';
}
const OUTPUT_NAMES = ['manifest.json', 'evidence.json', 'findings.json', 'diff.json', 'comparison.md'];
const SCAN_FILES = ['evidence.json', 'findings.json'];
// Scan documents are deeper than manifests; the bound still rejects pathological nesting.
const SCAN_JSON_OPTIONS = { label: 'document', maxDepth: 64, asciiKeys: false };

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

/** Real location of an input, or null when it cannot be resolved (the loader reports it). */
function realOrNull(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * Resolves the output directory to a real path before any write.
 *
 * The output itself must not be a symbolic link or a non-directory. Symbolic
 * links in ancestor components are followed, because the user chose that path
 * and refusing them would break common locations such as macOS /tmp. The
 * resolved path is what every later check and write uses, so containment is
 * decided on the real location. A dangling link in the path is refused with a
 * fixed message, because realpath would otherwise print the path.
 */
function resolveOutput(outDir) {
  const absolute = resolve(outDir);
  const stat = lstatOrNull(absolute);
  if (stat?.isSymbolicLink()) throw new Error('Comparison output must not be a symbolic link');
  if (stat && !stat.isDirectory()) throw new Error('Comparison output is not a directory');
  const missing = [];
  let current = absolute;
  while (!lstatOrNull(current)) {
    missing.unshift(basename(current));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  try {
    return join(realpathSync(current), ...missing);
  } catch {
    throw new Error('Comparison output path could not be resolved');
  }
}

/** Parses a scan document from digest-checked or legacy bytes. Errors carry codes only. */
function parseDocument(bytes) {
  try {
    return parseStrictJson(bytes, SCAN_JSON_OPTIONS);
  } catch (error) {
    // Same fixed-code error shape as the loaders, so CLI output never carries parser text.
    throw new PackageIntegrityError([error.code ?? 'DOCUMENT_UNREADABLE']);
  }
}

/**
 * Loads one saved scan. With a manifest present, the strict verifier runs and only
 * digest-checked bytes are parsed. Without one, the legacy read still happens, but
 * only through the no-link file checks.
 */
function loadScan(dir) {
  const loaded = manifestPresent(dir)
    ? { ...loadVerifiedPackage(dir, SCAN_FILES), integrity: 'verified' }
    : { ...loadUnverifiedPackage(dir, SCAN_FILES), integrity: 'not-provided' };
  return {
    integrity: loaded.integrity,
    evidence: parseDocument(loaded.files['evidence.json']),
    assessment: parseDocument(loaded.files['findings.json'])
  };
}

export function compareSavedScans(beforeDir, afterDir, outDir) {
  const destination = resolveOutput(outDir);
  // Containment uses the real input location, so an alias or symlinked parent of an input is caught too.
  for (const input of [beforeDir, afterDir]) {
    const real = realOrNull(input);
    if (real && (destination === real || destination.startsWith(real + sep))) throw new Error('Comparison output must be separate from original scans');
  }
  for (const name of OUTPUT_NAMES) {
    if (lstatOrNull(join(destination, name))) throw new Error('Comparison output already contains artifacts');
  }
  const before = loadScan(beforeDir);
  const after = loadScan(afterDir);
  const diff = compareScans({ evidence: before.evidence, assessment: before.assessment }, { evidence: after.evidence, assessment: after.assessment });
  diff.integrity = { before: before.integrity, after: after.integrity };
  mkdirSync(destination, { recursive: true });
  const files = [join(destination, 'diff.json'), join(destination, 'comparison.md')];
  // 'wx' refuses any existing name, including a dangling symlink that would otherwise be followed.
  writeFileSync(files[0], `${JSON.stringify(diff, null, 2)}\n`, { flag: 'wx' });
  writeFileSync(files[1], renderComparison(diff), { flag: 'wx' });
  writeManifest(destination, files, { beforeScanId: diff.beforeScanId, afterScanId: diff.afterScanId }, { exclusive: true });
  return diff;
}
