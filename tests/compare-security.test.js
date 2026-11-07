/**
 * Compare security alignment (Mission 027C.1).
 *
 * Saved-scan comparison reads manifests and documents through the same strict
 * rules as `verify`. These tests reproduce the confirmed exploits (symlinked
 * evidence, duplicate manifest keys), the output-path defects (dangling links,
 * output inside an input scan) and check that valid historical comparisons still
 * produce identical results.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync, symlinkSync, lstatSync, existsSync, linkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startTestApp } from './fixtures/test-app.js';
import { compareSavedScans } from '../src/compare.js';
import { writeManifest } from '../src/integrity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'src', 'cli.js');
const sha = data => createHash('sha256').update(data).digest('hex');

let root;
let app;
let scan;
let counter = 0;

function runCli(args) {
  return new Promise(resolve => {
    execFile(process.execPath, [CLI, ...args], { cwd: ROOT, env: { ...process.env, DR_TEST_LOCALHOST_ONLY: '1' } }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'wei-m027c1-'));
  app = await startTestApp(0);
  const out = join(root, 'source');
  const result = await runCli([`${app.url}/page`, '--out', out, '--settle', '300', '--quiet', '--no-pdf', '--lang', 'en']);
  assert.equal(result.code, 0, result.stderr);
  scan = join(out, readdirSync(out)[0]);
});

after(() => {
  app?.server.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

/** A fresh, writable copy of the real scan so each test can break it in its own way. */
function copyScan(label) {
  counter += 1;
  const dir = join(root, `${label}-${counter}`);
  cpSync(scan, dir, { recursive: true });
  return dir;
}

function freshOutput(label) {
  counter += 1;
  return join(root, `${label}-out-${counter}`);
}

/** Reads a document and rewrites its manifest so the manifest itself is consistent. */
function rehash(dir, names = ['evidence.json', 'findings.json', 'report.md', 'client-summary.html']) {
  writeManifest(dir, names.map(name => join(dir, name)), { scanId: 'rewritten' });
}

function removeManifest(dir) {
  rmSync(join(dir, 'manifest.json'));
}

/** Deterministic snapshot of names, sizes, times, inodes and contents. */
function snapshot(dir) {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const stat = lstatSync(join(dir, name));
    out[name] = { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino, sha: stat.isFile() ? sha(readFileSync(join(dir, name))) : null };
  }
  return out;
}

function expectRejected(fn, pattern) {
  assert.throws(fn, error => {
    assert.match(error.message, pattern);
    return true;
  });
}

// ---------- valid historical comparison ----------

test('a valid manifest-bearing comparison still succeeds with verified integrity and stable output', () => {
  const first = freshOutput('valid-a');
  const second = freshOutput('valid-b');
  const a = compareSavedScans(scan, scan, first);
  const b = compareSavedScans(scan, scan, second);
  assert.deepEqual(a.integrity, { before: 'verified', after: 'verified' });
  assert.equal(a.changed.length, 0);
  assert.equal(a.new.length, 0);
  for (const name of ['diff.json', 'comparison.md']) assert.equal(readFileSync(join(first, name), 'utf8'), readFileSync(join(second, name), 'utf8'), name);
  const manifest = JSON.parse(readFileSync(join(first, 'manifest.json'), 'utf8'));
  for (const entry of manifest.files) assert.equal(typeof entry.size, 'number');
});

test('a legacy scan without a manifest produces the same comparison as its verified original', () => {
  const legacy = copyScan('legacy-same');
  removeManifest(legacy);
  const verified = compareSavedScans(scan, scan, freshOutput('verified-ref'));
  const legacyDiff = compareSavedScans(legacy, legacy, freshOutput('legacy-ref'));
  assert.deepEqual(legacyDiff.integrity, { before: 'not-provided', after: 'not-provided' });
  const strip = ({ integrity, ...rest }) => rest;
  assert.deepEqual(strip(legacyDiff), strip(verified));
});

test('a historical 1.0.0 manifest without per-file sizes still verifies', () => {
  const dir = copyScan('no-size');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  for (const entry of manifest.files) delete entry.size;
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  assert.deepEqual(compareSavedScans(dir, dir, freshOutput('no-size-out')).integrity, { before: 'verified', after: 'verified' });
});

// ---------- confirmed exploits (previously accepted) ----------

test('E1: a symlinked evidence.json is rejected even when its target has identical content', () => {
  const dir = copyScan('symlink-evidence');
  const target = join(root, 'symlink-target-evidence.json');
  cpSync(join(dir, 'evidence.json'), target);
  rmSync(join(dir, 'evidence.json'));
  symlinkSync(target, join(dir, 'evidence.json'));
  expectRejected(() => compareSavedScans(dir, scan, freshOutput('e1')), /symlink rejected/);
});

test('E2: a manifest with a duplicate key is rejected rather than read last-wins', () => {
  const dir = copyScan('dup-manifest');
  const text = readFileSync(join(dir, 'manifest.json'), 'utf8').replace('"algorithm": "SHA256",', '"algorithm": "MD5",\n  "algorithm": "SHA256",');
  writeFileSync(join(dir, 'manifest.json'), text);
  expectRejected(() => compareSavedScans(dir, scan, freshOutput('e2')), /manifest ambiguous/);
});

test('E3: a duplicate key inside evidence.json is rejected even when the manifest is consistently rewritten', () => {
  const dir = copyScan('dup-document');
  const evidence = readFileSync(join(dir, 'evidence.json'), 'utf8');
  writeFileSync(join(dir, 'evidence.json'), evidence.replace('{\n', '{\n  "schema": {"name": "x", "name": "y"},\n'));
  rehash(dir);
  assert.throws(() => compareSavedScans(dir, scan, freshOutput('e3')), /document ambiguous/);
});

test('E4: a legacy findings.json with a duplicate key is rejected', () => {
  const dir = copyScan('dup-legacy');
  removeManifest(dir);
  const findings = readFileSync(join(dir, 'findings.json'), 'utf8');
  writeFileSync(join(dir, 'findings.json'), findings.replace('{\n', '{\n  "overall": "PASS",\n'));
  expectRejected(() => compareSavedScans(dir, scan, freshOutput('e4')), /document ambiguous/);
});

test('E5: a legacy scan whose evidence.json is a symlink cannot redirect the read', () => {
  const dir = copyScan('legacy-symlink');
  removeManifest(dir);
  const target = join(root, 'legacy-symlink-target.json');
  cpSync(join(dir, 'evidence.json'), target);
  rmSync(join(dir, 'evidence.json'));
  symlinkSync(target, join(dir, 'evidence.json'));
  expectRejected(() => compareSavedScans(dir, scan, freshOutput('e5')), /symlink rejected/);
});

test('E6: hard-linked scan files are rejected with and without a manifest', () => {
  const withManifest = copyScan('hardlink-verified');
  const outside = join(root, 'hardlink-outside.json');
  cpSync(join(withManifest, 'report.md'), outside);
  rmSync(join(withManifest, 'report.md'));
  linkSync(outside, join(withManifest, 'report.md'));
  expectRejected(() => compareSavedScans(withManifest, scan, freshOutput('e6a')), /hardlink rejected/);

  const legacy = copyScan('hardlink-legacy');
  removeManifest(legacy);
  const outsideEvidence = join(root, 'hardlink-legacy-evidence.json');
  cpSync(join(legacy, 'evidence.json'), outsideEvidence);
  rmSync(join(legacy, 'evidence.json'));
  linkSync(outsideEvidence, join(legacy, 'evidence.json'));
  expectRejected(() => compareSavedScans(legacy, scan, freshOutput('e6b')), /hardlink rejected/);
});

test('E7: a symlinked scan directory is rejected, matching verify', () => {
  const link = join(root, 'scan-link');
  symlinkSync(scan, link);
  expectRejected(() => compareSavedScans(link, scan, freshOutput('e7')), /symlink rejected/);
});

test('E8: an extra file in a scan directory is rejected (behaviour change, documented)', () => {
  const dir = copyScan('extra-file');
  writeFileSync(join(dir, 'notes.txt'), 'unlisted\n');
  expectRejected(() => compareSavedScans(dir, scan, freshOutput('e8')), /extra file/);
});

test('E9: a missing input directory fails with a fixed integrity message', () => {
  expectRejected(() => compareSavedScans(join(root, 'absent-scan'), scan, freshOutput('e9')), /integrity check failed: input not found/);
});

// ---------- output path defects ----------

test('O1: a dangling symlink at an output name is refused and never followed', () => {
  const outDir = freshOutput('dangling');
  mkdirSync(outDir);
  const victim = join(root, 'victim-created-by-compare.json');
  symlinkSync(victim, join(outDir, 'diff.json'));
  expectRejected(() => compareSavedScans(scan, scan, outDir), /already contains artifacts/);
  assert.equal(existsSync(victim), false);
  assert.equal(lstatSync(join(outDir, 'diff.json')).isSymbolicLink(), true);
});

test('O2: an output directory inside an input scan is refused and the scan stays unchanged', () => {
  const dir = copyScan('nested-output');
  const before = snapshot(dir);
  expectRejected(() => compareSavedScans(dir, scan, join(dir, 'nested-out')), /separate from original scans/);
  assert.equal(existsSync(join(dir, 'nested-out')), false);
  assert.deepEqual(snapshot(dir), before);
});

test('O3: the output directory itself may not be a symbolic link', () => {
  const target = freshOutput('link-target');
  mkdirSync(target);
  const link = join(root, 'output-link');
  symlinkSync(target, link);
  expectRejected(() => compareSavedScans(scan, scan, link), /must not be a symbolic link/);
  assert.deepEqual(readdirSync(target), []);
});

test('O4: an output path that is a file is refused', () => {
  const file = join(root, 'output-is-file');
  writeFileSync(file, 'x');
  expectRejected(() => compareSavedScans(scan, scan, file), /not a directory/);
});

test('O5: an existing manifest.json in the output directory is refused, not overwritten', () => {
  const outDir = freshOutput('existing-manifest');
  mkdirSync(outDir);
  writeFileSync(join(outDir, 'manifest.json'), '{"keep":true}\n');
  expectRejected(() => compareSavedScans(scan, scan, outDir), /already contains artifacts/);
  assert.equal(readFileSync(join(outDir, 'manifest.json'), 'utf8'), '{"keep":true}\n');
});

test('O6: outputs are written only inside the resolved destination, and inputs are not modified by a successful run', () => {
  const dir = copyScan('readonly-success');
  const before = snapshot(dir);
  const out = freshOutput('readonly-success-out');
  compareSavedScans(dir, dir, out);
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(readdirSync(out).sort(), ['comparison.md', 'diff.json', 'manifest.json']);
});

// ---------- CLI error output ----------

test('CLI compare reports a rejected input with exit 1 and no local path', async () => {
  const dir = copyScan('cli-symlink');
  const target = join(root, 'cli-symlink-target.json');
  cpSync(join(dir, 'evidence.json'), target);
  rmSync(join(dir, 'evidence.json'));
  symlinkSync(target, join(dir, 'evidence.json'));
  const result = await runCli(['compare', dir, scan, '--out', freshOutput('cli')]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /symlink rejected/);
  assert.equal(result.stderr.includes(root), false);
  assert.equal(result.stdout.includes(root), false);
});

test('a legitimate CLI comparison still succeeds', async () => {
  const out = freshOutput('cli-ok');
  const result = await runCli(['compare', scan, scan, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(join(out, 'diff.json'), 'utf8')).integrity.before, 'verified');
});

test('an unreadable scan file yields a fixed code, never Node error text with a path', { skip: process.getuid?.() === 0 }, () => {
  const dir = copyScan('unreadable');
  removeManifest(dir);
  chmodSync(join(dir, 'evidence.json'), 0o000);
  try {
    let message = '';
    try {
      compareSavedScans(dir, scan, freshOutput('unreadable-out'));
    } catch (error) {
      message = error.message;
    }
    assert.match(message, /integrity check failed: unreadable package/);
    assert.equal(message.includes(root), false);
  } finally {
    chmodSync(join(dir, 'evidence.json'), 0o600);
  }
});

// ---------- 027C.1 output and alias hardening ----------

test('O2 alias: an output reached through a symlinked parent that resolves inside an input is refused', () => {
  const dir = copyScan('alias-parent');
  const before = snapshot(dir);
  const parentLink = join(root, 'alias-parent-link');
  symlinkSync(dir, parentLink);
  expectRejected(() => compareSavedScans(dir, scan, join(parentLink, 'nested')), /separate from original scans/);
  assert.equal(existsSync(join(dir, 'nested')), false);
  assert.deepEqual(snapshot(dir), before);
});

test('O2 alias: an input given through a symlink alias is still treated as the input for containment', () => {
  const dir = copyScan('alias-input');
  const alias = join(root, 'alias-input-link');
  symlinkSync(dir, alias);
  expectRejected(() => compareSavedScans(alias, scan, join(dir, 'sub-output')), /separate from original scans/);
  expectRejected(() => compareSavedScans(scan, alias, dir), /separate from original scans/);
  assert.equal(existsSync(join(dir, 'sub-output')), false);
});

test('O2 equal: an output equal to an input directory is refused and the input stays unchanged', () => {
  const dir = copyScan('equal-output');
  const before = snapshot(dir);
  expectRejected(() => compareSavedScans(scan, dir, dir), /separate from original scans/);
  assert.deepEqual(snapshot(dir), before);
});

test('O2 symlink output: an output path that is a symlink to an input is refused as a symlink', () => {
  const link = join(root, 'output-link-to-input');
  symlinkSync(scan, link);
  expectRejected(() => compareSavedScans(scan, scan, link), /must not be a symbolic link/);
});

test('O1 dangling ancestor: a dangling symlink in the output path is refused with a fixed message and creates nothing', () => {
  const target = join(root, 'dangling-ancestor-target');
  const link = join(root, 'dangling-ancestor-link');
  symlinkSync(target, link);
  expectRejected(() => compareSavedScans(scan, scan, join(link, 'out')), /could not be resolved/);
  assert.equal(existsSync(target), false);
});

test('O1 dangling input: a dangling symlink as an input is rejected before any output is created', () => {
  const link = join(root, 'dangling-input-link');
  symlinkSync(join(root, 'dangling-input-target'), link);
  const out = freshOutput('dangling-input');
  expectRejected(() => compareSavedScans(link, scan, out), /symlink rejected/);
  assert.equal(existsSync(out), false);
});

test('O1 dangling comparison.md: a dangling link at the second output name is refused and not followed', () => {
  const outDir = freshOutput('dangling-md');
  mkdirSync(outDir);
  const victim = join(root, 'victim-comparison-md.txt');
  symlinkSync(victim, join(outDir, 'comparison.md'));
  expectRejected(() => compareSavedScans(scan, scan, outDir), /already contains artifacts/);
  assert.equal(existsSync(victim), false);
  assert.equal(existsSync(join(outDir, 'diff.json')), false);
});

test('non-destructive: unrelated files already in the output directory are kept', () => {
  const outDir = freshOutput('keep-unrelated');
  mkdirSync(outDir);
  writeFileSync(join(outDir, 'notes.txt'), 'keep me\n');
  compareSavedScans(scan, scan, outDir);
  assert.equal(readFileSync(join(outDir, 'notes.txt'), 'utf8'), 'keep me\n');
  assert.deepEqual(readdirSync(outDir).sort(), ['comparison.md', 'diff.json', 'manifest.json', 'notes.txt']);
});
