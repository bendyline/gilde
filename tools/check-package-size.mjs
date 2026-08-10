#!/usr/bin/env node
/**
 * Guardrail: refuse to publish an @bendyline/gilde tarball that has grown
 * past sane bounds (fat model blobs or an accidentally-included community
 * per-item tree would land here first), that has picked up build-time tooling
 * the package is not meant to carry, or that is missing the authoring sources
 * downstream regeneration checks resolve from the installed package.
 *
 * Usage:
 *   node tools/check-package-size.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TARBALL_BYTES = 60 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
// authoring/ is ~0.9 MiB (one family). Headroom for a couple more, low enough
// that a bulk import trips it before it reaches consumers.
const MAX_AUTHORING_BYTES = 4 * 1024 * 1024;

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
const packaged = Array.isArray(report.files)
  ? report.files.map((entry) => ({ path: String(entry.path), size: Number(entry.size) || 0 }))
  : [];
const packagedPaths = new Set(packaged.map((entry) => entry.path));

// `authoring/` ships on purpose: Gezel's regen fidelity suite resolves these
// inputs from the installed package and silently skips without them. Keep the
// exact-pinned anchors present...
for (const required of [
  'authoring/gstack/README.md',
  'authoring/gstack/LICENSE.gstack',
  'authoring/gstack/wave.json',
  'authoring/gstack/snapshots/spec/SKILL.md',
  'authoring/gstack/overlays/spec.json',
  'authoring/gstack/evals/spec.json',
]) {
  if (!packagedPaths.has(required)) {
    console.error(`FAIL: required exact-pinned authoring source is missing: ${required}`);
    failed = true;
  }
}

// ...but `files: ["authoring"]` is a whole-directory grant, so a new family
// would ship with no packaging decision at the door. This budget is the door:
// raise it deliberately when a family genuinely belongs in consumers' installs.
const authoringBytes = packaged
  .filter((entry) => entry.path.startsWith('authoring/'))
  .reduce((total, entry) => total + entry.size, 0);
console.log(`authoring: ${mb(authoringBytes)} (limit ${mb(MAX_AUTHORING_BYTES)})`);
if (authoringBytes > MAX_AUTHORING_BYTES) {
  console.error(
    'FAIL: authoring/ exceeds its package budget. Confirm the new source tree must ship ' +
      'to consumers, then raise MAX_AUTHORING_BYTES in this file.',
  );
  failed = true;
}

// Build machinery never ships, whatever `files` grows to say.
for (const forbidden of ['tools/', 'docs/', 'reports/', '.github/']) {
  const leaked = packaged.filter((entry) => entry.path.startsWith(forbidden));
  if (leaked.length > 0) {
    console.error(
      `FAIL: build-time tooling must not be published: ${leaked.length} file(s) under ${forbidden} (e.g. ${leaked[0].path})`,
    );
    failed = true;
  }
}
if (tarball > MAX_TARBALL_BYTES) {
  console.error('FAIL: tarball exceeds the 60 MB limit.');
  failed = true;
}
if (unpacked > MAX_UNPACKED_BYTES) {
  console.error('FAIL: unpacked size exceeds the 200 MB limit.');
  failed = true;
}
process.exit(failed ? 1 : 0);
