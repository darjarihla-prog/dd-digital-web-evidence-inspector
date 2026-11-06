/** Deterministic historical comparison. Inputs remain unmodified. */
import { readFileSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateScan, writeManifest, verifyManifest } from './integrity.js';

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
export function compareSavedScans(beforeDir, afterDir, outDir) {
  const destination = existsSync(outDir) ? realpathSync(outDir) : resolve(outDir);
  for (const input of [beforeDir, afterDir]) {
    if (destination === realpathSync(input)) throw new Error('Comparison output must be separate from original scans');
  }
  if (['manifest.json', 'evidence.json', 'findings.json', 'diff.json', 'comparison.md'].some(name => existsSync(join(outDir, name)))) throw new Error('Comparison output already contains artifacts');
  const integrity = { before: verifyManifest(beforeDir), after: verifyManifest(afterDir) };
  const read = dir => ({ evidence: JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8')), assessment: JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8')) });
  const diff = compareScans(read(beforeDir), read(afterDir));
  diff.integrity = integrity;
  mkdirSync(outDir, { recursive: true });
  const files = [join(outDir, 'diff.json'), join(outDir, 'comparison.md')];
  writeFileSync(files[0], `${JSON.stringify(diff, null, 2)}\n`);
  writeFileSync(files[1], renderComparison(diff));
  writeManifest(outDir, files, { beforeScanId: diff.beforeScanId, afterScanId: diff.afterScanId });
  return diff;
}
