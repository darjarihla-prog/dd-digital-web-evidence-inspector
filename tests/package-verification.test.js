/**
 * Offline package verification (Mission 027B).
 *
 * Packages here are synthetic and built in temporary directories, so these
 * tests need no browser. They cover positive verification, every negative
 * class named in the mission, the read-only guarantee and the CLI exit codes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync, symlinkSync, lstatSync, statSync, linkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeManifest } from '../src/integrity.js';
import { verifyPackage, verifyRecovery, EXIT_CODES, VERIFY_LIMITS } from '../src/verify.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'src', 'cli.js');

let root;
before(() => { root = mkdtempSync(join(tmpdir(), 'wei-m027b-')); });
after(() => { if (root) rmSync(root, { recursive: true, force: true }); });

const sha = data => createHash('sha256').update(data).digest('hex');
const jsonOf = (name, extra = {}) => JSON.stringify({ schema: { name, version: '0.2.0' }, ...extra }, null, 2) + '\n';

let counter = 0;
function freshDir(label) {
  counter += 1;
  const dir = join(root, `${label}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Full assessment package in the shape the CLI writes (5 files, PDF optional). */
function assessmentPackage(label, { pdf = true } = {}) {
  const dir = freshDir(label);
  const files = {
    'evidence.json': jsonOf('darja-rihla-web-evidence', { scan: { scanId: label } }),
    'findings.json': jsonOf('darja-rihla-assessment', { findings: [] }),
    'report.md': '# Report\n\nObservations only.\n',
    'client-summary.html': '<!doctype html><title>Summary</title>\n'
  };
  if (pdf) files['client-summary.pdf'] = '%PDF-1.4 synthetic\n';
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  writeManifest(dir, Object.keys(files).map(name => join(dir, name)), { scanId: label });
  return dir;
}

function evidenceOnlyPackage(label) {
  const dir = freshDir(label);
  writeFileSync(join(dir, 'evidence.json'), jsonOf('darja-rihla-web-evidence', { scan: { scanId: label } }));
  writeManifest(dir, [join(dir, 'evidence.json')], { scanId: label });
  return dir;
}

function manifestOf(dir) {
  return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
}

function writeManifestRaw(dir, body) {
  writeFileSync(join(dir, 'manifest.json'), body);
}

function codes(result) {
  return result.issues.map(i => i.code);
}

function flipFirstByte(path) {
  const buffer = readFileSync(path);
  buffer[0] ^= 0x01;
  writeFileSync(path, buffer);
}

function runCli(args) {
  return new Promise(resolve => {
    execFile(process.execPath, [CLI, ...args], { cwd: ROOT }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

/** Recursive, deterministic snapshot of names, sizes, times, inodes and content hashes. */
function snapshot(dir) {
  const out = {};
  const walk = rel => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const path = join(rel, entry.name);
      const stat = lstatSync(join(dir, path));
      out[path] = { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino, sha: entry.isFile() ? sha(readFileSync(join(dir, path))) : null };
      if (entry.isDirectory()) walk(path);
    }
  };
  walk('');
  return out;
}

// ---------- positive ----------

test('a generated assessment package verifies and records no provenance claim', () => {
  const dir = assessmentPackage('ok');
  const result = verifyPackage(dir);
  assert.equal(result.status, 'verified');
  assert.equal(result.exitCode, EXIT_CODES.verified);
  assert.equal(result.profile, 'assessment');
  assert.equal(result.trustedReference.provided, false);
  assert.equal(result.trustedReference.matched, null);
  assert.equal(result.provenance.authenticityEstablished, false);
  assert.deepEqual(result.issues, []);
  assert.equal(result.files.length, 5);
});

test('a matching independent manifest digest verifies, and a mismatch fails', () => {
  const dir = assessmentPackage('reference');
  const digest = sha(readFileSync(join(dir, 'manifest.json')));
  assert.equal(verifyPackage(dir, { expectedManifestSha256: digest }).status, 'verified');
  const wrong = verifyPackage(dir, { expectedManifestSha256: '0'.repeat(64) });
  assert.equal(wrong.status, 'failed');
  assert.equal(wrong.trustedReference.matched, false);
  assert.deepEqual(codes(wrong), ['TRUSTED_REFERENCE_MISMATCH']);
});

test('an evidence-only package verifies with its own profile', () => {
  const result = verifyPackage(evidenceOnlyPackage('evidence-only'));
  assert.equal(result.status, 'verified');
  assert.equal(result.profile, 'evidence-only');
  assert.equal(result.files.length, 1);
});

test('the optional PDF may be absent or present without failing verification', () => {
  assert.equal(verifyPackage(assessmentPackage('no-pdf', { pdf: false })).status, 'verified');
  assert.equal(verifyPackage(assessmentPackage('with-pdf', { pdf: true })).status, 'verified');
});

test('new manifests record a size for every file and historical 1.0.0 manifests still verify', () => {
  const dir = assessmentPackage('sizes');
  for (const entry of manifestOf(dir).files) assert.equal(entry.size, statSync(join(dir, entry.file)).size);
  const legacy = freshDir('legacy');
  const body = 'legacy evidence\n';
  writeFileSync(join(legacy, 'evidence.json'), body);
  writeManifestRaw(legacy, JSON.stringify({ schema: { name: 'darja-rihla-manifest', version: '1.0.0' }, algorithm: 'SHA256', provenance: {}, files: [{ file: 'evidence.json', sha256: sha(body) }] }, null, 2));
  const result = verifyPackage(legacy);
  assert.equal(result.status, 'verified');
  assert.equal(result.files[0].declaredSize, null);
});

test('a restored byte-identical copy matches its original', () => {
  const original = assessmentPackage('restore-src');
  const restored = join(root, 'restore-copy');
  cpSync(original, restored, { recursive: true });
  const digest = sha(readFileSync(join(original, 'manifest.json')));
  const result = verifyRecovery(original, restored, { expectedManifestSha256: digest });
  assert.equal(result.status, 'match');
  assert.equal(result.exitCode, EXIT_CODES.verified);
  assert.deepEqual(result.differences, []);
  assert.equal(result.trustedReference.provided, true);
});

// ---------- negative: content ----------

test('byte tampering with a size change is detected as a hash mismatch and a size mismatch', () => {
  const dir = assessmentPackage('tamper-size');
  writeFileSync(join(dir, 'report.md'), readFileSync(join(dir, 'report.md'), 'utf8') + 'altered\n');
  const result = verifyPackage(dir);
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, EXIT_CODES.failed);
  assert.deepEqual(codes(result), ['HASH_MISMATCH', 'SIZE_MISMATCH']);
  assert.equal(result.files.find(f => f.file === 'report.md').status, 'modified');
});

test('same-size tampering is detected by SHA256 alone', () => {
  const dir = assessmentPackage('tamper-same');
  flipFirstByte(join(dir, 'evidence.json'));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'failed');
  assert.deepEqual(codes(result), ['HASH_MISMATCH']);
});

test('a missing listed file fails verification', () => {
  const dir = assessmentPackage('missing');
  rmSync(join(dir, 'findings.json'));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'failed');
  assert.deepEqual(codes(result), ['MISSING_FILE']);
});

test('an extra unlisted file fails verification and its contents are not claimed as verified', () => {
  const dir = assessmentPackage('extra');
  writeFileSync(join(dir, 'notes.txt'), 'unlisted\n');
  const result = verifyPackage(dir);
  assert.equal(result.status, 'failed');
  assert.deepEqual(codes(result), ['EXTRA_FILE']);
  assert.deepEqual(result.extraFiles, [{ file: 'notes.txt', kind: 'file', code: 'EXTRA_FILE' }]);
});

test('a subdirectory is reported as extra and is never entered', () => {
  const dir = assessmentPackage('subdir');
  mkdirSync(join(dir, 'hidden'));
  writeFileSync(join(dir, 'hidden', 'evidence.json'), 'not listed\n');
  const result = verifyPackage(dir);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.extraFiles, [{ file: 'hidden', kind: 'directory', code: 'EXTRA_FILE' }]);
  assert.equal(result.files.some(f => f.file.includes('hidden')), false);
});

test('a declared size that disagrees with the file is reported without a hash mismatch', () => {
  const dir = assessmentPackage('size-only');
  const manifest = manifestOf(dir);
  manifest.files.find(f => f.file === 'report.md').size += 1;
  writeManifestRaw(dir, JSON.stringify(manifest, null, 2));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'failed');
  assert.deepEqual(codes(result), ['SIZE_MISMATCH']);
});

// ---------- negative: manifest ----------

test('manifest tampering with recomputed hashes passes internal checks but fails the independent reference', () => {
  const original = assessmentPackage('forged-src');
  const digest = sha(readFileSync(join(original, 'manifest.json')));
  const forged = join(root, 'forged');
  cpSync(original, forged, { recursive: true });
  writeFileSync(join(forged, 'evidence.json'), jsonOf('darja-rihla-web-evidence', { scan: { scanId: 'forged' } }));
  writeManifest(forged, ['evidence.json', 'findings.json', 'report.md', 'client-summary.html', 'client-summary.pdf'].map(n => join(forged, n)), { scanId: 'forged' });
  // An attacker who rewrites files and the manifest is consistent in-package.
  assert.equal(verifyPackage(forged).status, 'verified');
  // Only the independently held digest of the original manifest exposes it.
  const result = verifyPackage(forged, { expectedManifestSha256: digest });
  assert.equal(result.status, 'failed');
  assert.ok(codes(result).includes('TRUSTED_REFERENCE_MISMATCH'));
});

test('a manifest byte change with the same JSON content is caught only by the independent reference', () => {
  const dir = assessmentPackage('manifest-bytes');
  const digest = sha(readFileSync(join(dir, 'manifest.json')));
  writeManifestRaw(dir, readFileSync(join(dir, 'manifest.json'), 'utf8').replace('"files"', '"files" '));
  assert.equal(verifyPackage(dir).status, 'verified');
  assert.deepEqual(codes(verifyPackage(dir, { expectedManifestSha256: digest })), ['TRUSTED_REFERENCE_MISMATCH']);
});

test('a manifest that does not list evidence.json is rejected', () => {
  const dir = assessmentPackage('no-evidence');
  const manifest = manifestOf(dir);
  manifest.files = manifest.files.filter(f => f.file !== 'evidence.json');
  writeManifestRaw(dir, JSON.stringify(manifest));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.equal(result.exitCode, EXIT_CODES.rejected);
  assert.deepEqual(codes(result), ['REQUIRED_FILE_NOT_LISTED']);
});

test('a comparison-style package without evidence.json is rejected rather than guessed at', () => {
  const dir = freshDir('comparison-like');
  writeFileSync(join(dir, 'diff.json'), '{}\n');
  writeManifest(dir, [join(dir, 'diff.json')], {});
  assert.equal(verifyPackage(dir).status, 'rejected');
});

test('an evidence-only package that lists assessment files is rejected', () => {
  const dir = evidenceOnlyPackage('evidence-plus');
  writeFileSync(join(dir, 'report.md'), '# report\n');
  writeManifest(dir, [join(dir, 'evidence.json'), join(dir, 'report.md')], {});
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(codes(result), ['UNSUPPORTED_FILE_IN_PROFILE']);
});

// ---------- negative: malicious and malformed manifests ----------

test('malicious filenames are rejected before any file is opened', () => {
  const maliciousNames = ['../evidence.json', '/evidence.json', 'sub/evidence.json', 'sub\\evidence.json', '.evidence.json', 'evidence..json', 'manifest.json', 'evidence.json\u0000', 'x'.repeat(129) + '.json', ''];
  for (const name of maliciousNames) {
    const dir = evidenceOnlyPackage('malicious');
    const manifest = manifestOf(dir);
    manifest.files.push({ file: name, sha256: '0'.repeat(64) });
    writeManifestRaw(dir, JSON.stringify(manifest));
    const result = verifyPackage(dir);
    assert.equal(result.status, 'rejected', JSON.stringify(name));
    assert.ok(['UNSAFE_FILENAME', 'MANIFEST_INVALID_ENTRY'].includes(codes(result)[0]), JSON.stringify(name));
  }
});

test('an entry name that resolves outside the package is never read', () => {
  const dir = evidenceOnlyPackage('traversal');
  const outside = join(root, 'outside-secret.json');
  writeFileSync(outside, 'outside\n');
  const manifest = manifestOf(dir);
  manifest.files.push({ file: '../outside-secret.json', sha256: sha('outside\n') });
  writeManifestRaw(dir, JSON.stringify(manifest));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.equal(result.files.length, 0);
});

test('duplicate entries are rejected, including case-only duplicates', () => {
  for (const second of ['evidence.json', 'Evidence.json']) {
    const dir = evidenceOnlyPackage('duplicate');
    const manifest = manifestOf(dir);
    manifest.files.push({ ...manifest.files[0], file: second });
    writeManifestRaw(dir, JSON.stringify(manifest));
    const result = verifyPackage(dir);
    assert.equal(result.status, 'rejected');
    assert.deepEqual(codes(result), ['DUPLICATE_ENTRY']);
  }
});

test('malformed JSON and unsupported manifest structure are rejected with stable codes', () => {
  const cases = [
    ['{"files": [', 'MANIFEST_MALFORMED_JSON'],
    ['[]', 'MANIFEST_MALFORMED_JSON'],
    ['null', 'MANIFEST_MALFORMED_JSON'],
    [JSON.stringify({ schema: { name: 'other', version: '1.0.0' }, algorithm: 'SHA256', files: [] }), 'MANIFEST_UNSUPPORTED'],
    [JSON.stringify({ schema: { name: 'darja-rihla-manifest', version: '2.0.0' }, algorithm: 'SHA256', files: [] }), 'MANIFEST_UNSUPPORTED'],
    [JSON.stringify({ schema: { name: 'darja-rihla-manifest', version: '1.0.0' }, algorithm: 'MD5', files: [] }), 'MANIFEST_UNSUPPORTED']
  ];
  for (const [body, code] of cases) {
    const dir = evidenceOnlyPackage('malformed');
    writeManifestRaw(dir, body);
    const result = verifyPackage(dir);
    assert.equal(result.status, 'rejected', body);
    assert.deepEqual(codes(result), [code], body);
  }
});

test('malformed entries are rejected: extra keys, bad digests, invalid sizes', () => {
  const base = { file: 'evidence.json', sha256: sha('x') };
  const cases = [
    { ...base, extra: true },
    { ...base, sha256: 'ABC' },
    { ...base, size: -1 },
    { ...base, size: '12' },
    { ...base, size: 1.5 },
    { file: 'evidence.json' }
  ];
  for (const entry of cases) {
    const dir = evidenceOnlyPackage('bad-entry');
    const manifest = manifestOf(dir);
    manifest.files = [entry];
    writeManifestRaw(dir, JSON.stringify(manifest));
    const result = verifyPackage(dir);
    assert.equal(result.status, 'rejected', JSON.stringify(entry));
    assert.deepEqual(codes(result), ['MANIFEST_INVALID_ENTRY'], JSON.stringify(entry));
  }
});

test('an oversized manifest is refused before parsing', () => {
  const dir = evidenceOnlyPackage('oversized');
  writeManifestRaw(dir, ' '.repeat(VERIFY_LIMITS.manifestBytes) + '{}');
  assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_TOO_LARGE']);
});

test('more entries than the bound are refused', () => {
  const dir = evidenceOnlyPackage('too-many');
  const manifest = manifestOf(dir);
  manifest.files = Array.from({ length: VERIFY_LIMITS.entries + 1 }, (_, i) => ({ file: `f${i}.json`, sha256: sha(String(i)) }));
  writeManifestRaw(dir, JSON.stringify(manifest));
  assert.deepEqual(codes(verifyPackage(dir)), ['TOO_MANY_ENTRIES']);
});

test('a missing manifest, a missing directory and a file used as a directory are rejected', () => {
  const empty = freshDir('no-manifest');
  assert.deepEqual(codes(verifyPackage(empty)), ['MANIFEST_MISSING']);
  assert.deepEqual(codes(verifyPackage(join(root, 'does-not-exist'))), ['INPUT_NOT_FOUND']);
  const file = join(evidenceOnlyPackage('as-file'), 'evidence.json');
  assert.deepEqual(codes(verifyPackage(file)), ['INPUT_NOT_DIRECTORY']);
});

// ---------- negative: symlinks ----------

test('a listed file that is a symbolic link is rejected and its target is never hashed', () => {
  const dir = assessmentPackage('symlink-listed');
  const target = join(root, 'symlink-target.json');
  writeFileSync(target, readFileSync(join(dir, 'findings.json')));
  rmSync(join(dir, 'findings.json'));
  symlinkSync(target, join(dir, 'findings.json'));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(codes(result), ['SYMLINK_REJECTED']);
  assert.equal(result.files.length, 0);
});

test('a symbolic link in the package directory rejects the package', () => {
  const dir = evidenceOnlyPackage('symlink-extra');
  symlinkSync(join(dir, 'evidence.json'), join(dir, 'alias.json'));
  assert.deepEqual(codes(verifyPackage(dir)), ['SYMLINK_REJECTED']);
});

test('a symbolic link as manifest.json or as the package directory is rejected', () => {
  const dir = evidenceOnlyPackage('symlink-manifest');
  const real = join(dir, 'manifest.json');
  const moved = join(root, 'moved-manifest.json');
  cpSync(real, moved);
  rmSync(real);
  symlinkSync(moved, real);
  assert.deepEqual(codes(verifyPackage(dir)), ['SYMLINK_REJECTED']);

  const linkDir = join(root, 'package-link');
  symlinkSync(evidenceOnlyPackage('real-package'), linkDir);
  assert.deepEqual(codes(verifyPackage(linkDir)), ['SYMLINK_REJECTED']);
});

// ---------- recovery comparison ----------

test('recovery comparison detects a corrupted restored copy', () => {
  const original = assessmentPackage('corrupt-src');
  const restored = join(root, 'corrupt-restored');
  cpSync(original, restored, { recursive: true });
  flipFirstByte(join(restored, 'findings.json'));
  const result = verifyRecovery(original, restored);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.exitCode, EXIT_CODES.failed);
  assert.equal(result.restored.status, 'failed');
  assert.equal(result.original.status, 'verified');
  assert.deepEqual(result.differences.map(d => [d.code, d.file]), [['CONTENT_DIFFERS', 'findings.json']]);
});

test('recovery comparison reports a missing optional report in the restored copy', () => {
  const original = assessmentPackage('pdf-src', { pdf: true });
  const restored = join(root, 'pdf-missing');
  cpSync(original, restored, { recursive: true });
  rmSync(join(restored, 'client-summary.pdf'));
  const result = verifyRecovery(original, restored);
  assert.equal(result.status, 'mismatch');
  assert.ok(result.differences.some(d => d.code === 'MISSING_IN_RESTORED' && d.file === 'client-summary.pdf'));
});

test('recovery comparison reports an extra file added during restore', () => {
  const original = assessmentPackage('extra-src');
  const restored = join(root, 'extra-restored');
  cpSync(original, restored, { recursive: true });
  writeFileSync(join(restored, 'restore.log'), 'restored\n');
  const result = verifyRecovery(original, restored);
  assert.equal(result.status, 'mismatch');
  assert.ok(result.differences.some(d => d.code === 'EXTRA_IN_RESTORED' && d.file === 'restore.log'));
});

test('recovery comparison is rejected when either package cannot be verified structurally', () => {
  const original = assessmentPackage('rej-src');
  const restored = join(root, 'rej-restored');
  cpSync(original, restored, { recursive: true });
  rmSync(join(restored, 'manifest.json'));
  const result = verifyRecovery(original, restored);
  assert.equal(result.status, 'rejected');
  assert.equal(result.exitCode, EXIT_CODES.rejected);
  assert.deepEqual(result.restored.issues.map(i => i.code), ['MANIFEST_MISSING']);
});

test('recovery comparison with an altered manifest and a matching reference reports the reference mismatch', () => {
  const original = assessmentPackage('ref-src');
  const digest = sha(readFileSync(join(original, 'manifest.json')));
  const restored = join(root, 'ref-restored');
  cpSync(original, restored, { recursive: true });
  writeFileSync(join(restored, 'report.md'), 'changed\n');
  writeManifest(restored, ['evidence.json', 'findings.json', 'report.md', 'client-summary.html', 'client-summary.pdf'].map(n => join(restored, n)), {});
  const result = verifyRecovery(original, restored, { expectedManifestSha256: digest });
  assert.equal(result.status, 'mismatch');
  assert.ok(result.differences.some(d => d.code === 'MANIFEST_DIFFERS'));
  assert.ok(result.restored.issues.some(i => i.code === 'TRUSTED_REFERENCE_MISMATCH'));
});

test('verification and recovery never modify either directory', () => {
  const original = assessmentPackage('readonly-src');
  const restored = join(root, 'readonly-restored');
  cpSync(original, restored, { recursive: true });
  flipFirstByte(join(restored, 'report.md'));
  const before = [snapshot(original), snapshot(restored)];
  verifyPackage(original);
  verifyPackage(restored);
  verifyRecovery(original, restored, { expectedManifestSha256: '1'.repeat(64) });
  assert.deepEqual([snapshot(original), snapshot(restored)], before);
});

// ---------- CLI ----------

test('verify CLI prints stable JSON, exits 0 when verified and is deterministic', async () => {
  const dir = assessmentPackage('cli-ok');
  const first = await runCli(['verify', dir]);
  const second = await runCli(['verify', dir]);
  assert.equal(first.code, 0);
  assert.equal(first.stderr, '');
  assert.equal(first.stdout, second.stdout);
  assert.equal(JSON.parse(first.stdout).status, 'verified');
});

test('verify CLI exits 1 on integrity failure and 4 on rejected packages', async () => {
  const dir = assessmentPackage('cli-fail');
  flipFirstByte(join(dir, 'evidence.json'));
  const failed = await runCli(['verify', dir]);
  assert.equal(failed.code, EXIT_CODES.failed);
  assert.equal(JSON.parse(failed.stdout).status, 'failed');

  const rejected = await runCli(['verify', join(root, 'absent-package')]);
  assert.equal(rejected.code, EXIT_CODES.rejected);
  assert.equal(JSON.parse(rejected.stdout).issues[0].code, 'INPUT_NOT_FOUND');
});

test('verify CLI accepts the expected digest in any letter case and exits 1 on a wrong one', async () => {
  const dir = assessmentPackage('cli-digest');
  const digest = sha(readFileSync(join(dir, 'manifest.json')));
  assert.equal((await runCli(['verify', dir, '--expected-manifest-sha256', digest.toUpperCase()])).code, 0);
  assert.equal((await runCli(['verify', dir, '--expected-manifest-sha256', '0'.repeat(64)])).code, EXIT_CODES.failed);
});

test('invalid CLI arguments produce machine-readable usage errors with exit 2', async () => {
  const dir = assessmentPackage('cli-usage');
  const cases = [
    ['verify'],
    ['verify', dir, 'extra'],
    ['verify', dir, '--expected-manifest-sha256', 'not-hex'],
    ['verify', dir, '--expected-manifest-sha256'],
    ['verify', dir, '--unknown'],
    ['recovery-verify', dir],
    ['recovery-verify', dir, dir, '--expected-manifest-sha256', '0'.repeat(63)]
  ];
  for (const args of cases) {
    const result = await runCli(args);
    assert.equal(result.code, EXIT_CODES.usage, args.join(' '));
    assert.equal(result.stderr, '', args.join(' '));
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'usage-error');
    assert.equal(parsed.issues[0].code, 'USAGE_ERROR');
  }
});

test('recovery-verify CLI exits 0 for a faithful restore and 1 for a corrupted one', async () => {
  const original = assessmentPackage('cli-recover-src');
  const restored = join(root, 'cli-recover-copy');
  cpSync(original, restored, { recursive: true });
  const match = await runCli(['recovery-verify', original, restored]);
  assert.equal(match.code, 0);
  assert.equal(JSON.parse(match.stdout).status, 'match');
  flipFirstByte(join(restored, 'report.md'));
  const mismatch = await runCli(['recovery-verify', original, restored]);
  assert.equal(mismatch.code, EXIT_CODES.failed);
  assert.equal(JSON.parse(mismatch.stdout).status, 'mismatch');
});

// ---------- adversarial review (Mission 027C) ----------

const MANIFEST_OK = (name = 'evidence.json', extra = '') => `{"schema":{"name":"darja-rihla-manifest","version":"1.0.0"},${extra}"algorithm":"SHA256","files":[{"file":"${name}","sha256":"${sha('{"a":1}\n')}"}]}`;

function packageWithText(label, text) {
  const dir = freshDir(label);
  writeFileSync(join(dir, 'evidence.json'), '{"a":1}\n');
  writeManifestRaw(dir, text);
  return dir;
}

test('H1: a duplicate top-level key is rejected, not resolved last-wins', () => {
  const dir = packageWithText('dup-top', MANIFEST_OK('evidence.json', '"algorithm":"MD5",'));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(codes(result), ['MANIFEST_AMBIGUOUS']);
});

test('H1: a duplicate key inside a manifest entry is rejected', () => {
  const dir = packageWithText('dup-entry', `{"schema":{"name":"darja-rihla-manifest","version":"1.0.0"},"algorithm":"SHA256","files":[{"file":"evidence.json","file":"other.json","sha256":"${sha('{"a":1}\n')}"}]}`);
  assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_AMBIGUOUS']);
});

test('H1: a key spelled with a unicode escape duplicates the decoded key and is rejected', () => {
  const dir = packageWithText('dup-escaped', MANIFEST_OK('evidence.json').replace('"algorithm"', '"algo\\u0072ithm":"SHA256","algorithm"'));
  assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_AMBIGUOUS']);
});

test('H1: a duplicate key nested in provenance is rejected at any depth', () => {
  const dir = packageWithText('dup-nested', MANIFEST_OK('evidence.json', '"provenance":{"scanId":"a","scanId":"b"},'));
  assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_AMBIGUOUS']);
});

test('H1: the same key in sibling objects is not a duplicate and still verifies', () => {
  // Repeated keys in different objects are legitimate; the scanner must not over-reject.
  const body = `{"schema":{"name":"darja-rihla-manifest","version":"1.0.0"},"algorithm":"SHA256","files":[{"file":"evidence.json","sha256":"${sha('{"a":1}\n')}"}],"provenance":{"x":{"file":"a"},"y":{"file":"b"}}}`;
  const dir = packageWithText('siblings', body);
  const result = verifyPackage(dir);
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.issues, []);
});

test('H1: non-ASCII object keys are rejected, including escaped non-ASCII', () => {
  for (const key of ['"filé"', '"fil\\u00e9"']) {
    const dir = packageWithText('nonascii-key', MANIFEST_OK('evidence.json', `${key}:"x",`));
    assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_AMBIGUOUS'], key);
  }
});

test('H2: names differing only by unicode normalization or non-ASCII letters are rejected', () => {
  for (const name of ['évidence.json', 'évidence.json']) {
    const dir = packageWithText('unicode-name', MANIFEST_OK(name));
    assert.deepEqual(codes(verifyPackage(dir)), ['UNSAFE_FILENAME'], name);
  }
});

test('H2: nesting beyond the bound is rejected before any file is considered', () => {
  const deep = '['.repeat(200) + ']'.repeat(200);
  const dir = packageWithText('deep', MANIFEST_OK('evidence.json', `"provenance":${deep},`));
  assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_TOO_DEEP']);
});

test('H2: invalid UTF-8 in the manifest is rejected rather than silently replaced', () => {
  const dir = freshDir('bad-utf8');
  writeFileSync(join(dir, 'evidence.json'), '{"a":1}\n');
  const text = MANIFEST_OK('evidence.json', '"provenance":{"note":"');
  const bytes = Buffer.concat([Buffer.from(text), Buffer.from([0xff, 0xfe]), Buffer.from('"}}')]);
  writeFileSync(join(dir, 'manifest.json'), bytes);
  assert.deepEqual(codes(verifyPackage(dir)), ['MANIFEST_MALFORMED_JSON']);
});

test('H2: Windows-reserved device names and trailing-dot names are rejected', () => {
  for (const name of ['CON.txt', 'nul', 'com1.log', 'LPT9', 'evidence.json.']) {
    const dir = packageWithText('windows-name', MANIFEST_OK(name));
    assert.equal(verifyPackage(dir).status, 'rejected', name);
    assert.deepEqual(codes(verifyPackage(dir)), ['UNSAFE_FILENAME'], name);
  }
});

test('H3: a listed file that is a hard link to an outside file is rejected', () => {
  const dir = freshDir('hardlink-file');
  const outside = join(root, 'hardlink-outside.json');
  writeFileSync(outside, '{"a":1}\n');
  writeManifestRaw(dir, MANIFEST_OK());
  linkSync(outside, join(dir, 'evidence.json'));
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(codes(result), ['HARDLINK_REJECTED']);
});

test('H3: a manifest that is a hard link is rejected', () => {
  const dir = freshDir('hardlink-manifest');
  writeFileSync(join(dir, 'evidence.json'), '{"a":1}\n');
  const outside = join(root, 'hardlink-manifest-outside.json');
  writeFileSync(outside, MANIFEST_OK());
  linkSync(outside, join(dir, 'manifest.json'));
  assert.deepEqual(codes(verifyPackage(dir)), ['HARDLINK_REJECTED']);
});

test('H4: a FIFO listed as a file is rejected without blocking the verifier', () => {
  const dir = freshDir('fifo-listed');
  writeManifestRaw(dir, MANIFEST_OK());
  execFileSync('mkfifo', [join(dir, 'evidence.json')]);
  const result = verifyPackage(dir);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(codes(result), ['NOT_REGULAR_FILE']);
});

test('H4: a FIFO present but unlisted is rejected as an unsupported entry', () => {
  const dir = evidenceOnlyPackage('fifo-extra');
  execFileSync('mkfifo', [join(dir, 'pipe')]);
  assert.deepEqual(codes(verifyPackage(dir)), ['NOT_REGULAR_FILE']);
});

test('H5: the total package size is bounded and enforced before hashing', () => {
  const dir = evidenceOnlyPackage('total-size');
  const size = statSync(join(dir, 'evidence.json')).size;
  assert.deepEqual(codes(verifyPackage(dir, { maxPackageBytes: size - 1 })), ['PACKAGE_TOO_LARGE']);
  assert.equal(verifyPackage(dir, { maxPackageBytes: size }).status, 'verified');
});

test('H6: an unreadable manifest yields a fixed rejection without the local path', { skip: process.getuid?.() === 0 }, () => {
  const dir = evidenceOnlyPackage('unreadable');
  chmodSync(join(dir, 'manifest.json'), 0o000);
  try {
    const result = verifyPackage(dir);
    assert.equal(result.status, 'rejected');
    assert.deepEqual(codes(result), ['UNREADABLE_PACKAGE']);
    assert.equal(JSON.stringify(result).includes(root), false);
  } finally {
    chmodSync(join(dir, 'manifest.json'), 0o600);
  }
});

test('H6: CLI output never echoes a path or argument value on any error path', async () => {
  const secretDir = join(root, 'SECRETDIR-7f3a');
  const missing = await runCli(['verify', secretDir]);
  assert.equal(missing.code, EXIT_CODES.rejected);
  assert.equal(missing.stdout.includes('SECRETDIR-7f3a'), false);
  const badDigest = await runCli(['verify', evidenceOnlyPackage('secret-arg'), '--expected-manifest-sha256', 'SECRETDIGEST']);
  assert.equal(badDigest.code, EXIT_CODES.usage);
  assert.equal(badDigest.stdout.includes('SECRETDIGEST'), false);
  const unknown = await runCli(['verify', evidenceOnlyPackage('secret-flag'), '--SECRETFLAG']);
  assert.equal(unknown.stdout.includes('SECRETFLAG'), false);
});

test('H7: the verifier source imports no network or process-spawning module', () => {
  const source = readFileSync(join(ROOT, 'src', 'verify.js'), 'utf8');
  const modules = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(modules.sort(), ['node:crypto', 'node:fs', 'node:path']);
});

test('H8: verification is deterministic across repeated in-process runs', () => {
  const dir = assessmentPackage('determinism');
  assert.deepEqual(verifyPackage(dir), verifyPackage(dir));
});
