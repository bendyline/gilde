#!/usr/bin/env node
/**
 * Give a craftbook its contract: the result the person asked for, stated so
 * any task strategy can be held to it (gezel docs/task-strategies.md).
 *
 * Contracts are authored one book per file in `tools/contracts/<id>.json`
 * as `{ "id": "<book id>", "contract": { ... } }`. For each, this writes a
 * NEW patch version of the book (released dirs are immutable) that is the
 * latest version plus `contract`, raises `minGezelVersion` to the first gezel
 * build that reads contracts, and copies test.json and every other file as it
 * is. A book whose latest version already carries the same contract is left
 * alone, so the tool is safe to re-run.
 *
 * Every contract is linted first. A contract judges the RESULT: each check may
 * read only a file the contract declares (a deliverable, its text source, an
 * input, a grounding source, or a path under one of those). A check on
 * `outline.md` or `verdict.md` would grade the recipe's process and fail any
 * strategy that skips it.
 *
 * Usage:
 *   node tools/add-contract.mjs                  # dry-run report
 *   node tools/add-contract.mjs --write
 *   node tools/add-contract.mjs --only research-report,powerpoint-deck
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'data', 'craftbook-templates');
const CONTRACTS = join(import.meta.dirname, 'contracts');
const FLOOR = '1.26295';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;

const semverCmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const gezelVersionCmp = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
};

const normalize = (p) => p.trim().replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();

/** Mirrors gezel's `contractLintProblems` (core/src/craftbook-contract-lint.ts). */
function lintContract(contract) {
  const problems = [];
  const declared = new Set();
  const add = (p) => p && declared.add(normalize(p));
  for (const d of contract.deliverables ?? []) {
    add(d.path);
    add(d.textSource?.path);
  }
  for (const i of contract.inputs ?? []) add(i.path);
  for (const s of contract.grounding?.sources ?? []) add(s);
  const isDeclared = (file) =>
    declared.has(normalize(file)) || [...declared].some((d) => normalize(file).startsWith(`${d}/`));
  if (!(contract.deliverables ?? []).some((d) => (d.role ?? 'primary') === 'primary')) {
    problems.push('no primary deliverable');
  }
  const ids = new Set();
  for (const c of contract.criteria ?? []) {
    if (ids.has(c.id)) problems.push(`duplicate criterion id "${c.id}"`);
    ids.add(c.id);
    if ((c.enforce ?? 'gate') === 'gate' && !(c.checks ?? []).length) {
      problems.push(`criterion "${c.id}" is enforced as a gate but has no checks`);
    }
    for (const check of c.checks ?? []) {
      const files = [
        ...(typeof check.file === 'string' ? [check.file] : []),
        ...(Array.isArray(check.files) ? check.files : []),
      ];
      for (const file of files) {
        if (!isDeclared(file)) {
          problems.push(
            `criterion "${c.id}" checks ${file}, which the contract does not declare as a deliverable, text source, input or grounding source`,
          );
        }
      }
    }
  }
  if (typeof contract.goal !== 'string' || !contract.goal.trim() || contract.goal.length > 400) {
    problems.push('goal must be 1-400 characters');
  }
  return problems;
}

function findBook(id) {
  for (const shard of readdirSync(ROOT).filter((d) => !d.includes('.'))) {
    const dir = join(ROOT, shard, id);
    if (existsSync(join(dir, 'manifest.json'))) return dir;
  }
  return null;
}

/** Insert `contract` right before `steps`, keeping the rest of the key order. */
function withContract(book, contract) {
  const out = {};
  for (const [key, value] of Object.entries(book)) {
    if (key === 'contract') continue;
    if (key === 'steps') out.contract = contract;
    out[key] = value;
  }
  if (!('contract' in out)) out.contract = contract;
  return out;
}

const report = { written: [], unchanged: [], refused: [] };
const releasedAt = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;

for (const file of readdirSync(CONTRACTS).filter((f) => f.endsWith('.json')).sort()) {
  const { id, contract } = JSON.parse(readFileSync(join(CONTRACTS, file), 'utf8'));
  if (ONLY && !ONLY.has(id)) continue;
  const problems = lintContract(contract);
  if (problems.length) {
    report.refused.push({ id, problems });
    continue;
  }
  const itemDir = findBook(id);
  if (!itemDir) {
    report.refused.push({ id, problems: ['no such book'] });
    continue;
  }
  const manifest = JSON.parse(readFileSync(join(itemDir, 'manifest.json'), 'utf8'));
  const yanked = new Set(manifest.yankedVersions ?? []);
  const versions = readdirSync(join(itemDir, 'versions'))
    .filter((v) => !yanked.has(v) && existsSync(join(itemDir, 'versions', v, 'craftbook.json')))
    .sort(semverCmp);
  const latest = versions.at(-1);
  const versionDir = join(itemDir, 'versions', latest);
  const book = JSON.parse(readFileSync(join(versionDir, 'craftbook.json'), 'utf8'));
  if (JSON.stringify(book.contract) === JSON.stringify(contract)) {
    report.unchanged.push({ id, version: latest });
    continue;
  }
  const [maj, min, pat] = latest.split('.').map(Number);
  let next = pat + 1;
  while (existsSync(join(itemDir, 'versions', `${maj}.${min}.${next}`))) next += 1;
  const newVersion = `${maj}.${min}.${next}`;
  const updated = { ...withContract(book, contract), version: newVersion, releasedAt };
  if (!updated.minGezelVersion || gezelVersionCmp(updated.minGezelVersion, FLOOR) < 0) {
    updated.minGezelVersion = FLOOR;
  }
  report.written.push({ id, from: latest, to: newVersion });
  if (!WRITE) continue;
  const newDir = join(itemDir, 'versions', newVersion);
  mkdirSync(newDir, { recursive: true });
  writeFileSync(join(newDir, 'craftbook.json'), `${JSON.stringify(updated, null, 2)}\n`);
  for (const extra of readdirSync(versionDir)) {
    if (extra === 'craftbook.json') continue;
    cpSync(join(versionDir, extra), join(newDir, extra), { recursive: true });
  }
}

console.log(
  JSON.stringify(
    {
      mode: WRITE ? 'WRITE' : 'dry-run',
      written: report.written,
      unchanged: report.unchanged.length,
      refused: report.refused,
    },
    null,
    2,
  ),
);
if (report.refused.length) process.exitCode = 1;
