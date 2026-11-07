/**
 * Offline, read-only evidence package verification (Mission 027B).
 *
 * A package is a directory holding manifest.json (darja-rihla-manifest 1.0.0)
 * and the files it lists. Verification checks that every listed file matches
 * its SHA256 (and size, when the manifest declares one), that nothing unlisted
 * is present, and that the manifest itself is structurally safe.
 *
 * Trust model: an in-package hash proves consistency with manifest.json only.
 * A caller-supplied SHA256 of manifest.json, obtained through a channel the
 * caller trusts, binds that manifest to the reference. Neither establishes who
 * created the package, so results always report authenticityEstablished: false.
 *
 * Nothing in this module writes, follows symbolic links, recurses into
 * subdirectories or uses the network.
 */
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';

export const VERIFY_SCHEMA = Object.freeze({ name: 'darja-rihla-package-verification', version: '1.0.0' });
export const RECOVERY_SCHEMA = Object.freeze({ name: 'darja-rihla-recovery-verification', version: '1.0.0' });

/** Exit codes for verify and recovery-verify. Documented in README and SECURITY.md. */
export const EXIT_CODES = Object.freeze({ verified: 0, failed: 1, usage: 2, rejected: 4 });

export const VERIFY_LIMITS = Object.freeze({ manifestBytes: 1024 * 1024, entries: 64, packageBytes: 512 * 1024 * 1024, jsonDepth: 16 });

const MANIFEST = 'manifest.json';
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// Windows resolves these device names even with an extension, and strips trailing dots.
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DIGEST_ARGUMENT_PATTERN = /^[a-fA-F0-9]{64}$/;
const ENTRY_KEYS = ['file', 'sha256', 'size'];
const PROFILES = Object.freeze({
  'evidence-only': { required: ['evidence.json'], optional: [] },
  assessment: { required: ['evidence.json', 'findings.json', 'report.md', 'client-summary.html'], optional: ['client-summary.pdf'] }
});

const NOT_ESTABLISHED = 'In-package hashes show consistency with manifest.json only. They do not establish who created the package or that its contents are authentic.';

const ISSUE_TEXT = Object.freeze({
  MISSING_FILE: 'Listed file is missing.',
  HASH_MISMATCH: 'File content does not match the SHA256 in the manifest.',
  SIZE_MISMATCH: 'File size does not match the size in the manifest.',
  EXTRA_FILE: 'File is present but not listed in the manifest.',
  TRUSTED_REFERENCE_MISMATCH: 'manifest.json SHA256 does not match the independently supplied reference.',
  MANIFEST_DIFFERS: 'manifest.json bytes differ between original and restored packages.',
  PROFILE_DIFFERS: 'Package profile differs between original and restored packages.',
  MISSING_IN_RESTORED: 'Present in the original but absent from the restored package.',
  MISSING_IN_ORIGINAL: 'Listed in the manifest but absent from the original package.',
  EXTRA_IN_RESTORED: 'Present in the restored package but absent from the original.',
  CONTENT_DIFFERS: 'File content or size differs between original and restored packages.'
});

const LIMITATIONS = Object.freeze([
  'Verification is offline and read-only: no network access, no writes, no symbolic link following and no recursion into subdirectories.',
  'Without --expected-manifest-sha256 the result shows internal consistency only. Anyone able to rewrite files can also rewrite manifest.json and its hashes.',
  'A matching reference binds manifest.json to the digest you supplied. Obtain that digest through a channel you trust; it does not prove authorship, timing or the accuracy of observations.',
  'Legacy 1.0.0 manifests without sizes are checked by SHA256 only.',
  'The strict JSON reader rejects repeated object keys at any depth, but it is not a general JSON Schema validator. Entry shapes are checked explicitly, nothing else.',
  'Symbolic links are rejected by lstat checks and O_NOFOLLOW where the platform provides it. Without O_NOFOLLOW, the lstat check is the only protection.',
  'Any file in the package directory that the manifest does not list is reported as extra and fails verification.',
  'Hard links are rejected as a policy: their content can change through a name outside the package. Restored copies made with cp -l will be rejected; use a real copy.',
  'Symbolic links in the parent path you pass are followed, because you chose that path. Only the package directory and its entries are checked.',
  'Reads may update access times on the filesystem. No write, rename or deletion occurs.',
  'Verification describes the moment it ran. A file changed later is not detected unless verification runs again; a change during hashing is detected and rejected.',
  'Non-ASCII object keys, duplicate keys and nesting beyond 16 levels are rejected as ambiguous or unsafe, not repaired.'
]);

class Rejection extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const reject = (code, message) => {
  throw new Rejection(code, message);
};

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byFile = (a, b) => byText(a.file, b.file) || byText(a.code ?? '', b.code ?? '');
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

/**
 * Opens a regular file without following a final symlink, without blocking on
 * FIFOs swapped in after lstat, and with the same identity as lstat. Hard links
 * are rejected: their content can change through a name outside the package.
 * Returns null when the file is absent.
 */
function openRegular(path, name) {
  const before = lstatOrNull(path);
  if (!before) return null;
  if (before.isSymbolicLink()) reject('SYMLINK_REJECTED', `${name} is a symbolic link`);
  if (!before.isFile()) reject('NOT_REGULAR_FILE', `${name} is not a regular file`);
  if (before.nlink !== 1) reject('HARDLINK_REJECTED', `${name} is hard-linked; its content could change outside the package`);
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if (error.code === 'ELOOP') reject('SYMLINK_REJECTED', `${name} is a symbolic link`);
    throw error;
  }
  const after = fstatSync(fd);
  if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) {
    closeSync(fd);
    reject('NOT_REGULAR_FILE', `${name} changed type or identity while being opened`);
  }
  if (after.nlink !== 1) {
    closeSync(fd);
    reject('HARDLINK_REJECTED', `${name} is hard-linked; its content could change outside the package`);
  }
  return { fd, stat: after };
}

/**
 * Strict reader for JSON documents whose bytes are trusted only after a manifest
 * check (or, for legacy packages, whatever they contain). Decodes UTF-8 fatally,
 * parses with JSON.parse, then rejects ambiguous input that JSON.parse would
 * silently accept: a key repeated in one object (at any depth, compared after
 * escape decoding), optionally a non-ASCII key, and nesting beyond maxDepth.
 * Two readers that keep different duplicates could otherwise reach different
 * verdicts from the same bytes.
 *
 * label 'manifest' or 'document' selects the error codes (MANIFEST_* / DOCUMENT_*).
 */
export function parseStrictJson(input, { label = 'document', maxDepth = VERIFY_LIMITS.jsonDepth, asciiKeys = true } = {}) {
  const prefix = label === 'manifest' ? 'MANIFEST' : 'DOCUMENT';
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(input);
  } catch {
    reject(`${prefix}_MALFORMED_JSON`, `${label} is not valid UTF-8`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    reject(`${prefix}_MALFORMED_JSON`, `${label} is not valid JSON`);
  }
  assertUnambiguousText(text, { prefix, label, maxDepth, asciiKeys });
  return value;
}

function assertUnambiguousText(text, { prefix, label, maxDepth, asciiKeys }) {
  const frames = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      if (end >= text.length) reject(`${prefix}_MALFORMED_JSON`, `${label} is not valid JSON`);
      const top = frames[frames.length - 1];
      if (top?.type === 'object' && top.expectKey) {
        const key = JSON.parse(text.slice(i, end + 1));
        if (asciiKeys && /[^\x00-\x7f]/.test(key)) reject(`${prefix}_AMBIGUOUS`, `${label} contains a non-ASCII object key`);
        if (top.keys.has(key)) reject(`${prefix}_AMBIGUOUS`, `${label} contains a duplicate object key`);
        top.keys.add(key);
        top.expectKey = false;
      }
      i = end + 1;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (frames.length >= maxDepth) reject(`${prefix}_TOO_DEEP`, `${label} nesting exceeds ${maxDepth}`);
      frames.push(ch === '{' ? { type: 'object', keys: new Set(), expectKey: true } : { type: 'array' });
    } else if (ch === '}' || ch === ']') {
      frames.pop();
    } else if (ch === ',' && frames.length && frames[frames.length - 1].type === 'object') {
      frames[frames.length - 1].expectKey = true;
    }
    i += 1;
  }
}

/** Streams a file through SHA256 in fixed-size chunks. */
function digestOf(fd) {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(1 << 16);
  let position = 0;
  let read;
  while ((read = readSync(fd, buffer, 0, buffer.length, position)) > 0) {
    hash.update(buffer.subarray(0, read));
    position += read;
  }
  return { sha256: hash.digest('hex'), size: position };
}

/** Reads at most limit bytes; anything beyond is rejected before parsing. */
function readBounded(fd, limit) {
  const buffer = Buffer.alloc(limit + 1);
  let total = 0;
  let read;
  while (total < buffer.length && (read = readSync(fd, buffer, total, buffer.length - total, total)) > 0) total += read;
  if (total > limit) reject('MANIFEST_TOO_LARGE', `manifest.json exceeds ${limit} bytes`);
  return buffer.subarray(0, total);
}

function parseManifest(dir) {
  const opened = openRegular(join(dir, MANIFEST), MANIFEST);
  if (!opened) reject('MANIFEST_MISSING', 'manifest.json is missing');
  let bytes;
  try {
    bytes = readBounded(opened.fd, VERIFY_LIMITS.manifestBytes);
  } finally {
    closeSync(opened.fd);
  }
  const manifest = parseStrictJson(bytes, { label: 'manifest', maxDepth: VERIFY_LIMITS.jsonDepth, asciiKeys: true });
  if (!isPlainObject(manifest)) reject('MANIFEST_MALFORMED_JSON', 'manifest.json must be a JSON object');
  if (manifest.schema?.name !== 'darja-rihla-manifest' || manifest.schema.version !== '1.0.0' || manifest.algorithm !== 'SHA256' || !Array.isArray(manifest.files)) {
    reject('MANIFEST_UNSUPPORTED', 'manifest schema, version or algorithm is not supported');
  }
  return { manifest, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Structural validation of every entry. Names are plain filenames only. */
function validateEntries(files) {
  if (files.length > VERIFY_LIMITS.entries) reject('TOO_MANY_ENTRIES', `manifest lists more than ${VERIFY_LIMITS.entries} files`);
  const seen = new Set();
  const entries = [];
  for (const raw of files) {
    if (!isPlainObject(raw) || Object.keys(raw).some(key => !ENTRY_KEYS.includes(key)) || typeof raw.file !== 'string' || typeof raw.sha256 !== 'string') {
      reject('MANIFEST_INVALID_ENTRY', 'manifest entry has an unexpected shape');
    }
    const name = raw.file;
    if (name === MANIFEST || name.includes('..') || !NAME_PATTERN.test(name) || name.endsWith('.') || WINDOWS_RESERVED_NAME.test(name)) {
      reject('UNSAFE_FILENAME', 'manifest entry is not a permitted plain filename');
    }
    const key = name.toLowerCase();
    if (seen.has(key)) reject('DUPLICATE_ENTRY', `${name} is listed more than once`);
    seen.add(key);
    if (!SHA256_PATTERN.test(raw.sha256)) reject('MANIFEST_INVALID_ENTRY', 'sha256 must be 64 lowercase hexadecimal characters');
    if ('size' in raw && (!Number.isSafeInteger(raw.size) || raw.size < 0)) reject('MANIFEST_INVALID_ENTRY', 'size must be a non-negative safe integer');
    entries.push({ file: name, sha256: raw.sha256, size: 'size' in raw ? raw.size : null });
  }
  return entries.sort(byFile);
}

/** Chooses the package profile from the listed names and rejects anything outside it. */
function profileFor(entries) {
  const names = new Set(entries.map(entry => entry.file));
  if (!names.has('evidence.json')) reject('REQUIRED_FILE_NOT_LISTED', 'manifest does not list evidence.json');
  const profile = names.has('findings.json') ? 'assessment' : 'evidence-only';
  const spec = PROFILES[profile];
  for (const name of names) {
    if (!spec.required.includes(name) && !spec.optional.includes(name)) reject('UNSUPPORTED_FILE_IN_PROFILE', `${name} is not permitted in an ${profile} package`);
  }
  for (const name of spec.required) {
    if (!names.has(name)) reject('REQUIRED_FILE_NOT_LISTED', `${name} is required in an ${profile} package`);
  }
  return profile;
}

/** Reads all bytes of an open file, bounded by the size observed at open. */
function readAll(fd, size) {
  const buffer = Buffer.alloc(size);
  let total = 0;
  let read;
  while (total < size && (read = readSync(fd, buffer, total, size - total, total)) > 0) total += read;
  return buffer.subarray(0, total);
}

/** A manifest path that exists as anything, including a dangling symlink, counts as present. */
export function manifestPresent(dir) {
  return lstatOrNull(join(dir, MANIFEST)) !== null;
}

/** Raised when a package cannot be trusted for loading. Carries codes only, never paths. */
export class PackageIntegrityError extends Error {
  constructor(codes) {
    const labels = [...new Set(codes.map(code => code.toLowerCase().replace(/_/g, ' ')))];
    super(`Input integrity check failed: ${labels.join(', ')}`);
    this.name = 'PackageIntegrityError';
    this.codes = [...new Set(codes)];
  }
}

/**
 * Verifies a manifest-bearing package with the full strict rules, then returns the
 * bytes of the named files. Each file is read once and hashed again; bytes whose
 * digest differs from the manifest are refused, so a file swapped after
 * verification is never parsed.
 */
/**
 * Maps any failure inside a loader to a fixed code. Node's own error text names
 * absolute paths (EACCES, ENOENT ...), so it is never passed through.
 */
function toIntegrityError(error) {
  if (error instanceof PackageIntegrityError) return error;
  if (error instanceof Rejection) return new PackageIntegrityError([error.code]);
  return new PackageIntegrityError(['UNREADABLE_PACKAGE']);
}

export function loadVerifiedPackage(dir, names, { maxPackageBytes = VERIFY_LIMITS.packageBytes } = {}) {
  let verification;
  try {
    verification = verifyPackage(dir, { maxPackageBytes });
  } catch (error) {
    throw toIntegrityError(error);
  }
  if (verification.status !== 'verified') throw new PackageIntegrityError(verification.issues.map(issue => issue.code));
  const files = {};
  for (const name of names) {
    const entry = verification.files.find(file => file.file === name);
    if (!entry) throw new PackageIntegrityError(['REQUIRED_FILE_NOT_LISTED']);
    let bytes;
    try {
      const opened = openRegular(join(dir, name), name);
      if (!opened) throw new PackageIntegrityError(['MISSING_FILE']);
      try {
        bytes = readAll(opened.fd, opened.stat.size);
      } finally {
        closeSync(opened.fd);
      }
    } catch (error) {
      throw toIntegrityError(error);
    }
    if (createHash('sha256').update(bytes).digest('hex') !== entry.declaredSha256) throw new PackageIntegrityError(['HASH_MISMATCH']);
    files[name] = bytes;
  }
  return { verification, files };
}

/**
 * Legacy packages without a manifest keep their historical reading behaviour: no
 * digest can be checked. The named files must still be plain regular files, so a
 * symbolic link, hard link or device cannot redirect the read outside the package.
 */
export function loadUnverifiedPackage(dir, names, { maxPackageBytes = VERIFY_LIMITS.packageBytes } = {}) {
  const files = {};
  let total = 0;
  try {
    assertPackageDirectory(dir);
    for (const name of names) {
      const opened = openRegular(join(dir, name), name);
      if (!opened) throw new PackageIntegrityError(['MISSING_FILE']);
      try {
        total += opened.stat.size;
        if (total > maxPackageBytes) throw new PackageIntegrityError(['PACKAGE_TOO_LARGE']);
        files[name] = readAll(opened.fd, opened.stat.size);
      } finally {
        closeSync(opened.fd);
      }
    }
  } catch (error) {
    throw toIntegrityError(error);
  }
  return { files };
}

function assertPackageDirectory(dir) {
  const root = lstatOrNull(dir);
  if (!root) reject('INPUT_NOT_FOUND', 'package directory does not exist');
  if (root.isSymbolicLink()) reject('SYMLINK_REJECTED', 'package directory is a symbolic link');
  if (!root.isDirectory()) reject('INPUT_NOT_DIRECTORY', 'package path is not a directory');
}

/** Lists the top level only. Symlinks reject the package; subdirectories are reported, never entered. */
function scanDirectory(dir, listed) {
  const extra = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) reject('SYMLINK_REJECTED', `${entry.name} is a symbolic link`);
    if (entry.name === MANIFEST || listed.has(entry.name)) continue;
    if (entry.isDirectory()) extra.push({ file: entry.name, kind: 'directory', code: 'EXTRA_FILE' });
    else if (entry.isFile()) extra.push({ file: entry.name, kind: 'file', code: 'EXTRA_FILE' });
    else reject('NOT_REGULAR_FILE', `${entry.name} is not a regular file or directory`);
  }
  return extra.sort(byFile);
}

function verifyListed(dir, entries, maxPackageBytes) {
  let total = 0;
  return entries.map(entry => {
    const opened = openRegular(join(dir, entry.file), entry.file);
    if (!opened) {
      return { file: entry.file, status: 'missing', declaredSha256: entry.sha256, declaredSize: entry.size, actualSha256: null, actualSize: null, issueCodes: ['MISSING_FILE'] };
    }
    let actual;
    try {
      total += opened.stat.size;
      if (total > maxPackageBytes) reject('PACKAGE_TOO_LARGE', `package files exceed ${maxPackageBytes} bytes`);
      actual = digestOf(opened.fd);
      // A file that changed while it was hashed has no reliable digest.
      const after = fstatSync(opened.fd);
      if (after.size !== opened.stat.size || after.ino !== opened.stat.ino || after.mtimeMs !== opened.stat.mtimeMs || after.ctimeMs !== opened.stat.ctimeMs) {
        reject('FILE_CHANGED_DURING_VERIFICATION', `${entry.file} changed while it was being verified`);
      }
    } finally {
      closeSync(opened.fd);
    }
    const issueCodes = [];
    if (actual.sha256 !== entry.sha256) issueCodes.push('HASH_MISMATCH');
    if (entry.size !== null && actual.size !== entry.size) issueCodes.push('SIZE_MISMATCH');
    return {
      file: entry.file,
      status: issueCodes.length ? 'modified' : 'ok',
      declaredSha256: entry.sha256,
      declaredSize: entry.size,
      actualSha256: actual.sha256,
      actualSize: actual.size,
      issueCodes
    };
  });
}

function trustedReferenceBlock(expected) {
  return { provided: expected !== null, matched: null, algorithm: 'SHA256', subject: MANIFEST };
}

function exitCodeFor(status) {
  return { verified: EXIT_CODES.verified, match: EXIT_CODES.verified, failed: EXIT_CODES.failed, mismatch: EXIT_CODES.failed, rejected: EXIT_CODES.rejected, 'usage-error': EXIT_CODES.usage }[status];
}

function issue(code, file = null, message = ISSUE_TEXT[code]) {
  return { code, file, message };
}

/**
 * Verifies one package directory. Never throws for package problems: every
 * outcome is returned as status verified | failed | rejected with stable codes.
 */
export function verifyPackage(dir, { expectedManifestSha256 = null, maxPackageBytes = VERIFY_LIMITS.packageBytes } = {}) {
  const result = {
    schema: VERIFY_SCHEMA,
    command: 'verify',
    status: null,
    exitCode: null,
    profile: null,
    manifest: null,
    trustedReference: trustedReferenceBlock(expectedManifestSha256),
    provenance: { authenticityEstablished: false, note: NOT_ESTABLISHED },
    files: [],
    extraFiles: [],
    issues: [],
    limitations: [...LIMITATIONS]
  };
  try {
    assertPackageDirectory(dir);
    const parsed = parseManifest(dir);
    result.manifest = { schema: 'darja-rihla-manifest 1.0.0', algorithm: 'SHA256', sha256: parsed.sha256, bytes: parsed.bytes.length, entries: parsed.manifest.files.length };
    if (expectedManifestSha256 !== null) result.trustedReference.matched = parsed.sha256 === expectedManifestSha256;
    const entries = validateEntries(parsed.manifest.files);
    result.profile = profileFor(entries);
    result.extraFiles = scanDirectory(dir, new Set(entries.map(entry => entry.file)));
    result.files = verifyListed(dir, entries, maxPackageBytes);
  } catch (error) {
    if (error instanceof Rejection) {
      result.issues = [issue(error.code, null, error.message)];
    } else {
      result.issues = [issue('UNREADABLE_PACKAGE', null, 'The package could not be read.')];
    }
    result.status = 'rejected';
    result.exitCode = exitCodeFor('rejected');
    return result;
  }
  const issues = [];
  if (result.trustedReference.matched === false) issues.push(issue('TRUSTED_REFERENCE_MISMATCH', MANIFEST));
  for (const file of result.files) for (const code of file.issueCodes) issues.push(issue(code, file.file));
  for (const extra of result.extraFiles) issues.push(issue('EXTRA_FILE', extra.file, `${extra.kind === 'directory' ? 'Directory' : 'File'} is present but not listed in the manifest. Its contents were not inspected.`));
  issues.sort((a, b) => byText(a.code, b.code) || byText(a.file ?? '', b.file ?? ''));
  result.issues = issues;
  result.status = issues.length ? 'failed' : 'verified';
  result.exitCode = exitCodeFor(result.status);
  return result;
}

/** Per-package detail embedded in a recovery result. Schema, provenance and limitations appear once at the top. */
function summary(result) {
  return {
    status: result.status,
    profile: result.profile,
    manifest: result.manifest,
    trustedReference: result.trustedReference,
    files: result.files,
    extraFiles: result.extraFiles,
    issues: result.issues
  };
}

/**
 * Read-only recovery comparison. Both packages are verified independently; a
 * match requires both to verify and to be identical in manifest bytes, profile,
 * file set, sizes and content hashes.
 */
export function verifyRecovery(originalDir, restoredDir, { expectedManifestSha256 = null, maxPackageBytes = VERIFY_LIMITS.packageBytes } = {}) {
  const original = verifyPackage(originalDir, { expectedManifestSha256, maxPackageBytes });
  const restored = verifyPackage(restoredDir, { expectedManifestSha256, maxPackageBytes });
  const differences = [];
  let status;
  if (original.status === 'rejected' || restored.status === 'rejected') {
    status = 'rejected';
  } else {
    if (original.manifest.sha256 !== restored.manifest.sha256) differences.push(issue('MANIFEST_DIFFERS', MANIFEST));
    if (original.profile !== restored.profile) differences.push(issue('PROFILE_DIFFERS'));
    // A listed file absent from disk has status 'missing'; an unlisted file has no status.
    const index = pkg => new Map([...pkg.files, ...pkg.extraFiles].map(entry => [entry.file, entry]));
    const before = index(original);
    const after = index(restored);
    const present = entry => entry !== undefined && entry.status !== 'missing';
    for (const name of [...new Set([...before.keys(), ...after.keys()])].sort(byText)) {
      const a = before.get(name);
      const b = after.get(name);
      if (present(a) && !present(b)) differences.push(issue('MISSING_IN_RESTORED', name));
      else if (!present(a) && present(b)) differences.push(issue(a?.status === 'missing' ? 'MISSING_IN_ORIGINAL' : 'EXTRA_IN_RESTORED', name));
      else if (a?.status !== undefined && b?.status !== undefined && (a.actualSha256 !== b.actualSha256 || a.actualSize !== b.actualSize)) {
        differences.push(issue('CONTENT_DIFFERS', name));
      }
    }
    differences.sort((a, b) => byText(a.code, b.code) || byText(a.file ?? '', b.file ?? ''));
    status = original.status === 'verified' && restored.status === 'verified' && differences.length === 0 ? 'match' : 'mismatch';
  }
  return {
    schema: RECOVERY_SCHEMA,
    command: 'recovery-verify',
    status,
    exitCode: exitCodeFor(status),
    trustedReference: trustedReferenceBlock(expectedManifestSha256),
    provenance: { authenticityEstablished: false, note: NOT_ESTABLISHED },
    original: summary(original),
    restored: summary(restored),
    differences,
    limitations: [...LIMITATIONS, 'Recovery comparison compares the two packages with each other and with the optional reference. It does not show which copy is the true original.']
  };
}

/**
 * Result for an unexpected internal failure. The message is fixed, so no error
 * text, path or stack reaches the output.
 */
export function internalRejection(command) {
  return {
    schema: command === 'verify' ? VERIFY_SCHEMA : RECOVERY_SCHEMA,
    command,
    status: 'rejected',
    exitCode: EXIT_CODES.rejected,
    issues: [issue('INTERNAL_ERROR', null, 'Verification could not complete. No details are shown to avoid leaking local paths.')]
  };
}

/** Usage errors are machine-readable too: JSON on stdout, exit 2, no paths echoed. */
export function usageError(command, message) {
  return {
    schema: command === 'verify' ? VERIFY_SCHEMA : RECOVERY_SCHEMA,
    command,
    status: 'usage-error',
    exitCode: EXIT_CODES.usage,
    issues: [issue('USAGE_ERROR', null, message)]
  };
}

/** Parses verify / recovery-verify arguments. Returns { positional, expectedManifestSha256 } or throws a message. */
export function parseVerificationArgs(command, argv) {
  const positional = [];
  let expectedManifestSha256 = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--expected-manifest-sha256') {
      if (expectedManifestSha256 !== null || i + 1 >= argv.length) throw new Error('--expected-manifest-sha256 requires exactly one value');
      const value = argv[++i];
      if (!DIGEST_ARGUMENT_PATTERN.test(value)) throw new Error('--expected-manifest-sha256 must be 64 hexadecimal characters');
      expectedManifestSha256 = value.toLowerCase();
    } else if (arg.startsWith('-')) {
      throw new Error('Unknown option for ' + command);
    } else {
      positional.push(arg);
    }
  }
  const required = command === 'verify' ? 1 : 2;
  if (positional.length !== required) {
    throw new Error(command === 'verify' ? 'Usage: verify <dir> [--expected-manifest-sha256 <hex>]' : 'Usage: recovery-verify <original-dir> <restored-dir> [--expected-manifest-sha256 <hex>]');
  }
  return { positional, expectedManifestSha256 };
}
