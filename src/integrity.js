/** Structural and reference validation for the supported evidence contracts. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export function validateScan(evidence, assessment = null) {
  const versions = new Set(['0.1.0', '0.2.0']);
  if (evidence?.schema?.name !== 'darja-rihla-web-evidence' || !versions.has(evidence.schema.version)) throw new Error('Unsupported evidence schema');
  if (!evidence.scan?.scanId || !evidence.scan.target || !evidence.evidence || !Array.isArray(evidence.evidence.requests)) throw new Error('Invalid evidence structure');
  const ids = new Set();
  const collections = [evidence.evidence.requests, evidence.evidence.cookies, evidence.evidence.storage?.localStorage, evidence.evidence.storage?.sessionStorage, evidence.evidence.console?.all, evidence.evidence.console?.pageErrors];
  for (const entries of collections) {
    if (!Array.isArray(entries)) throw new Error('Missing evidence collection');
    for (const entry of entries) {
      if (typeof entry.id !== 'string' || ids.has(entry.id)) throw new Error('Missing or duplicate evidence ID');
      ids.add(entry.id);
    }
  }
  const resolves = ref => typeof ref === 'string' && (ids.has(ref) || (ref.includes('.') && ref.split('.').reduce((node, key) => node && Object.hasOwn(node, key) ? node[key] : undefined, evidence) !== undefined));
  function checkRefs(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (['evidenceRef', 'redirectedFrom'].includes(key) && value !== null && !resolves(value)) throw new Error(`Unresolved evidence reference: ${value}`);
      if (key === 'evidenceRefs') {
        if (!Array.isArray(value) || value.some(ref => !resolves(ref))) throw new Error('Unresolved evidence references');
        if ('evidenceRefsTotal' in node && (node.evidenceRefsTotal < value.length || node.evidenceRefsTruncated !== (node.evidenceRefsTotal > value.length))) throw new Error('Invalid reference truncation metadata');
      }
      checkRefs(value);
    }
  }
  checkRefs(evidence.evidence);
  if (assessment) {
    if (assessment.schema?.name !== 'darja-rihla-assessment' || !versions.has(assessment.schema.version) || assessment.scanId !== evidence.scan.scanId || !Array.isArray(assessment.findings)) throw new Error('Incompatible assessment');
    const findings = new Set();
    for (const f of assessment.findings) {
      if (typeof f.findingId !== 'string' || findings.has(f.findingId) || !['PASS', 'REVIEW', 'FAIL', 'INCONCLUSIVE', 'NOT_TESTED'].includes(f.status)) throw new Error('Invalid finding');
      findings.add(f.findingId);
    }
    checkRefs(assessment.findings);
  }
  return true;
}

/**
 * Writes a 1.0.0 manifest. Each file's size is recorded; readers that predate the
 * field ignore it. `exclusive` refuses to write over any existing name, including a
 * dangling symlink, so output cannot be redirected through a planted link.
 *
 * The former verifyManifest reader was removed. Reading manifests now goes through
 * verify.js (loadVerifiedPackage / loadUnverifiedPackage) so there is one strict path.
 */
export function writeManifest(directory, files, provenance, { exclusive = false } = {}) {
  const entries = files.map(file => {
    const data = readFileSync(file);
    return { file: basename(file), sha256: createHash('sha256').update(data).digest('hex'), size: data.length };
  }).sort((a, b) => a.file.localeCompare(b.file));
  const path = join(directory, 'manifest.json');
  writeFileSync(path, `${JSON.stringify({ schema: { name: 'darja-rihla-manifest', version: '1.0.0' }, algorithm: 'SHA256', provenance, files: entries }, null, 2)}\n`, { flag: exclusive ? 'wx' : 'w' });
  return path;
}
