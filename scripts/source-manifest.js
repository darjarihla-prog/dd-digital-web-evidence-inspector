/** Hash a reviewable source tree. Generated output stays outside tracked sources. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] || 'out/source-manifest.json');
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const manifest = {
  schema: { name: 'darja-rihla-source-manifest', version: '1.0.0' },
  baseline: '9c9c67a86498469ccfbcb824f58c7d026b9d00f1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).length > 0,
  algorithm: 'SHA256',
  files: files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }))
};
if (files.some(file => resolve(file) === output)) throw new Error('Manifest cannot overwrite a tracked source file');
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(output);
