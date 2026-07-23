#!/usr/bin/env node
/**
 * Guardrail: refuse to publish an @bendyline/gilde tarball that has grown
 * past sane bounds (fat model blobs or an accidentally-included community
 * per-item tree would land here first).
 *
 * Usage:
 *   node tools/check-package-size.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TARBALL_BYTES = 60 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: process.env,
});

if (result.status !== 0) {
  console.error((result.stderr ?? '').trim() || 'npm pack --dry-run failed.');
  process.exit(1);
}

let report;
try {
  const parsed = JSON.parse(result.stdout);
  report = Array.isArray(parsed) ? parsed[0] : parsed;
} catch {
  console.error(`Could not parse npm pack output: ${String(result.stdout).slice(0, 200)}`);
  process.exit(1);
}

const tarball = Number(report?.size);
const unpacked = Number(report?.unpackedSize);
if (!Number.isFinite(tarball) || !Number.isFinite(unpacked)) {
  console.error('npm pack report is missing size/unpackedSize.');
  process.exit(1);
}

const mb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MiB';
console.log(`tarball:  ${mb(tarball)} (limit ${mb(MAX_TARBALL_BYTES)})`);
console.log(`unpacked: ${mb(unpacked)} (limit ${mb(MAX_UNPACKED_BYTES)})`);
console.log(`files:    ${report.entryCount ?? 'unknown'}`);

let failed = false;
if (tarball > MAX_TARBALL_BYTES) {
  console.error('FAIL: tarball exceeds the 60 MB limit.');
  failed = true;
}
if (unpacked > MAX_UNPACKED_BYTES) {
  console.error('FAIL: unpacked size exceeds the 200 MB limit.');
  failed = true;
}
process.exit(failed ? 1 : 0);
