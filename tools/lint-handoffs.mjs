#!/usr/bin/env node
/**
 * Craftbook handoff lint, with a ratchet.
 *
 * A stepwise task runs every step in a fresh session that knows only what
 * its prompt tells it to open, so a file an earlier step wrote but a later
 * step does not `consume` does not exist for that later step. Generalist
 * mode hides the gap, because one owner remembers - which is why the paired
 * runs favored it. invoice-run's collect step was asked to "name any client
 * skipped" while consuming only billables.json, and three small-model runs
 * wrote "No clients were skipped" (gezel, 2026-09-20). gezel now infers the
 * worst of these at runtime (core/tasks/inferred-step-inputs.ts), but only
 * for a step's advanceWhen file; the book is still where the contract lives.
 *
 * Rules (latest version of each book):
 *   unconsumed-handoff   a later step, under a different role, names an
 *                        earlier step's file in its prompt without consuming it
 *   orphan-scope-file    the entry step writes a scope/plan/brief file that
 *                        no later step consumes or names
 *   routing-in-prose     a step whose default edge loops back asks the model
 *                        to pass `next: "<forward step>"` instead of gating on
 *                        a written verdict; gemma-12b omitted `next` in 7 of 8
 *                        advances and cycled for an hour (gezel, 2026-09-20)
 *   output-without-writer
 *                        a step's prompt tells it to write a named file while
 *                        its toolPolicy denies that drawer's writer; reviewer-
 *                        loop, freeze-scope and automation-recipe stalled on
 *                        exactly this and the model said so every turn (gezel
 *                        coverage run, 2026-10-10)
 *
 * Ratchet: tools/lint-handoffs-allowlist.json lists known "<bookId>:<rule>"
 * findings. New findings fail; stale entries fail so the list only shrinks.
 * Generate the first list with --write-allowlist. --data <dir> lints another
 * content root, such as an installed @bendyline/gilde package's data/.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { safeCompare } from './lib/semver.mjs';
import { listItems } from './lib/walk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(HERE, '..', 'data');
const ALLOWLIST_PATH = join(HERE, 'lint-handoffs-allowlist.json');

const SCOPE_FILE_RE = /(?:^|[-_/])(?:scope|plan|brief|outline|criteria|requirements|spec)[-_.]/i;

function fileName(path) {
  return basename(path.replace(/\{\{[^}]+\}\}\/?/g, ''));
}

/** True when `text` names `token` as a whole path token, not inside a longer name. */
function namesToken(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w./-])${escaped}(?![\\w-])`).test(text);
}

function mentionsFile(text, path) {
  if (namesToken(text, path)) return true;
  const base = fileName(path);
  if (base === path || !/\.[A-Za-z0-9]{1,8}$/.test(base) || base.length < 5) return false;
  return namesToken(text, base);
}

// Mirrors gezel core/craftbook-output-media.ts PROSE_FILE_OUTPUT: a write verb
// followed by a file path (backticked, or bare with a directory) is the step's
// own output. The task folder and accessory prefixes live in the artifacts drawer.
const PROSE_FILE_OUTPUT =
  /\b(?:write|writes|writing|save|saves|saving|create|creates|creating|produce|produces|generate|generates|emit|emits|draft|drafts)\b([^.!?\n`]{0,80}?)(?:`((?:\{\{[\w.]+\}\}\/)?[\w.<>{}\/-]*\.(?:md|json|html?|csv|tsv|txt|ya?ml|xml|js|mjs|ts|py|sh|svg))`|((?:\{\{[\w.]+\}\}\/|[\w.<>{}-]+\/)[\w.<>{}\/-]*\.(?:md|json|html?|csv|tsv|txt|ya?ml|xml|js|mjs|ts|py|sh|svg))\b)/gi;
const INPUT_PATH_LEAD = /\b(?:from|following|per|against|using|read|reading|open|opening|check|checking|cite|citing|based on)\b/i;
const ARTIFACT_PATH = /^(?:\{\{(?:workPath|task\.dir)\}\}|tasks\/|notes\/|reviews\/|reports\/)/;

/** Files the step's prompt tells it to write that no writer it keeps can produce. */
function unwritableOutputs(step) {
  const denied = new Set(step.toolPolicy?.disallowBuiltinToolsets ?? []);
  const media = new Set([step.toolPolicy?.outputMedium, ...(step.toolPolicy?.additionalOutputMedia ?? [])]);
  const canArtifact = !denied.has('artifacts') && (media.has('artifact') || !step.toolPolicy?.outputMedium);
  const canWorkspace = !denied.has('workspace-fs-write');
  const out = [];
  for (const m of (step.prompt ?? '').matchAll(PROSE_FILE_OUTPUT)) {
    const path = m[2] ?? m[3];
    if (INPUT_PATH_LEAD.test(m[1] ?? '')) continue;
    const ok = ARTIFACT_PATH.test(path) ? canArtifact : canWorkspace || canArtifact;
    if (!ok && !out.includes(path)) out.push(path);
  }
  return out;
}

function procedureText(step) {
  return `${step.prompt ?? ''}\n${step.description ?? ''}`;
}

/** Files a step writes: its advanceWhen file and the files its own gate checks. */
function stepProducts(step) {
  const out = [];
  const add = (file) => {
    if (typeof file === 'string' && file.trim() && !out.includes(file)) out.push(file);
  };
  add(step.advanceWhen?.file);
  for (const check of step.gate?.checks ?? []) add(check.file);
  return out;
}

function consumesFile(step, path) {
  const base = fileName(path);
  return (step.consumes ?? []).some(
    (input) => input?.file === path || fileName(input?.file ?? '') === base,
  );
}

export function lintCraftbookHandoffs(book) {
  const bookId = book.id ?? '(unknown id)';
  const steps = Array.isArray(book.steps) ? book.steps : [];
  const findings = [];
  const index = new Map(steps.map((step, i) => [step.id, i]));

  const producedBy = new Map();
  steps.forEach((step, i) => {
    for (const file of stepProducts(step)) {
      if (!producedBy.has(file)) producedBy.set(file, { step, i });
    }
  });

  steps.forEach((step, j) => {
    const procedure = procedureText(step);
    for (const [file, { step: producer, i }] of producedBy) {
      if (i >= j || producer.suggestedRole === step.suggestedRole) continue;
      if (stepProducts(step).includes(file) || consumesFile(step, file)) continue;
      if (!mentionsFile(procedure, file)) continue;
      findings.push({
        bookId,
        rule: 'unconsumed-handoff',
        detail: `step "${step.id}" names ${file} (written by "${producer.id}") but does not consume it`,
      });
    }
  });

  const entryId = book.entryStepId ?? steps[0]?.id;
  const entryIndex = index.get(entryId) ?? 0;
  const entry = steps[entryIndex];
  if (entry) {
    for (const file of stepProducts(entry)) {
      if (!SCOPE_FILE_RE.test(fileName(file))) continue;
      const used = steps.some(
        (step, j) =>
          j !== entryIndex && (consumesFile(step, file) || mentionsFile(procedureText(step), file)),
      );
      if (!used) {
        findings.push({
          bookId,
          rule: 'orphan-scope-file',
          detail: `entry step "${entry.id}" writes ${file}; no later step consumes or names it`,
        });
      }
    }
  }

  steps.forEach((step, i) => {
    const target = index.get(step.next);
    if (target === undefined || target >= i || step.gate?.onReject) return;
    const forward = [...(step.prompt ?? '').matchAll(/next:\s*"([\w-]+)"/g)]
      .map((m) => m[1])
      .filter((id) => id !== step.next && (index.get(id) ?? -1) > i);
    if (forward.length === 0) return;
    findings.push({
      bookId,
      rule: 'routing-in-prose',
      detail: `step "${step.id}" defaults to "${step.next}" and asks for next: "${forward[0]}" in prose; gate on a verdict and make the forward edge the default`,
    });
  });

  for (const step of steps) {
    const blocked = unwritableOutputs(step);
    if (blocked.length === 0) continue;
    findings.push({
      bookId,
      rule: 'output-without-writer',
      detail: `step "${step.id}" is told to write ${blocked.join(', ')} but its toolPolicy keeps no writer for it`,
    });
  }

  return findings;
}

function latestCraftbook(item) {
  const versions = [...item.versions].sort(safeCompare);
  for (const version of versions.reverse()) {
    const file = join(item.itemDir, 'versions', version, 'craftbook.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  }
  return null;
}

export function lintAllCraftbookHandoffs(dataRoot = DATA_ROOT) {
  const findings = [];
  let bookCount = 0;
  for (const item of listItems(dataRoot, 'craftbook-template')) {
    const book = latestCraftbook(item);
    if (!book) continue;
    bookCount++;
    findings.push(...lintCraftbookHandoffs({ id: item.id, ...book }));
  }
  return { bookCount, findings };
}

function main() {
  const writeAllowlist = process.argv.includes('--write-allowlist');
  const dataIndex = process.argv.indexOf('--data');
  const report = lintAllCraftbookHandoffs(
    dataIndex >= 0 ? resolve(process.argv[dataIndex + 1]) : DATA_ROOT,
  );
  const keys = [...new Set(report.findings.map((f) => `${f.bookId}:${f.rule}`))].sort();

  if (writeAllowlist) {
    writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(keys, null, 2)}\n`);
    process.stdout.write(`wrote ${keys.length} entries to ${ALLOWLIST_PATH}\n`);
    return;
  }

  let allowlist = [];
  if (existsSync(ALLOWLIST_PATH)) {
    allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    if (!Array.isArray(allowlist) || allowlist.some((e) => typeof e !== 'string')) {
      console.error('lint-handoffs: allowlist must be a JSON array of "<bookId>:<rule>" strings');
      process.exit(2);
    }
  }
  const allowSet = new Set(allowlist);
  const firedSet = new Set(keys);
  const fresh = report.findings.filter((f) => !allowSet.has(`${f.bookId}:${f.rule}`));
  const stale = allowlist.filter((entry) => !firedSet.has(entry));

  process.stdout.write(`linted ${report.bookCount} craftbooks\n\n`);
  for (const f of fresh) {
    process.stdout.write(`ERROR  ${f.bookId.padEnd(32)} ${f.rule}: ${f.detail}\n`);
  }
  for (const entry of stale) {
    process.stdout.write(
      `ERROR  ${entry.padEnd(32)} stale-allowlist: no longer fires - remove it from tools/lint-handoffs-allowlist.json\n`,
    );
  }
  const byRule = new Map();
  for (const f of report.findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  process.stdout.write(
    `\n${fresh.length} new finding(s), ${stale.length} stale allowlist entr(ies), ` +
      `${report.findings.length - fresh.length} allowlisted` +
      ` (${[...byRule].map(([r, n]) => `${r}=${n}`).join(', ') || 'none'})\n`,
  );
  process.exit(fresh.length > 0 || stale.length > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
