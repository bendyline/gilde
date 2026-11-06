#!/usr/bin/env node
/**
 * Draft a craftbook's contract with a model, for a person to review before
 * add-contract.mjs releases it (gezel docs/task-strategies.md).
 *
 * Contracts are static on purpose. Written once by a strong model, linted,
 * reviewed and versioned, they hold every model that runs a book to the same
 * bar, and the smallest model never writes its own.
 *
 * Per book the model sees the latest version with any contract removed, the
 * check vocabulary from schemas/craftbook-doc.schema.json, and up to four
 * released contracts of other books as examples, never the book's own. It
 * never sees test.json: that file grades the eval, and a bar shaped by it
 * would pass the fixture rather than describe the work. Each draft is parsed
 * the way gezel parses it and linted; a draft with problems gets up to two
 * repair turns. Drafts land in tools/contract-drafts/<id>.json (not
 * committed) as `{ id, contract, drafted }`, the shape `add-contract.mjs
 * --from` reads once they are reviewed.
 *
 * Usage:
 *   node tools/draft-contract.mjs --only market-scan,runbook
 *   node tools/draft-contract.mjs --missing --limit 20
 *   node tools/draft-contract.mjs --only runbook --redraft --out /tmp/blind
 *   node tools/draft-contract.mjs --only runbook --print-prompt
 *   node tools/draft-contract.mjs --missing --reapply   # policy changed; no model call
 *
 * A draft ships before review with only its structure and citation checks
 * enforced (`holdUnreviewedChecks`); the model's whole draft is kept as
 * `drafted.full` for the reviewer who promotes the rest. `--enforce all`
 * keeps every check enforced.
 *
 * Flags: --model (claude-opus-5-5), --effort (high), --concurrency (2),
 * --enforce (structure), --force (overwrite an existing draft), --cli (the
 * claude CLI to run).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { contractBookProblems, lintContract } from './lib/contract-lint.mjs';
import { loadSchema, zodParse } from './lib/jsonshape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'data', 'craftbook-templates');
const DEFAULT_OUT = join(HERE, 'contract-drafts');
const MAX_REPAIRS = 2;
const CALL_TIMEOUT_MS = 15 * 60 * 1000;

/** Reviewed contracts shown as examples, in order of preference: one per kind of work. */
const EXAMPLE_IDS = ['research-report', 'bug-fix-tdd', 'invoice-run', 'powerpoint-deck', 'alert-rules'];
const EXAMPLE_COUNT = 4;

/** Book fields that say nothing about the result. */
const OMITTED_BOOK_KEYS = new Set(['contract', 'version', 'releasedAt', 'minGezelVersion', 'triggers']);

/**
 * What each check kind a contract may use is for. Field names come from the
 * schema; a kind missing here is left out of the prompt on purpose: corpus,
 * fanout and outline checks grade a recipe's process, and `judge` belongs in a
 * criterion's `judge` rubric.
 */
const CHECK_GUIDE = {
  minBytes: 'the file exists and holds at least `bytes` bytes',
  totalMinBytes: 'several files together hold at least `bytes` bytes',
  fileCount: 'at least `min` files with one of the extensions `ext` (under `dir`); `verifyImageBytes` demands real raster images',
  contains: 'the file matches the JavaScript regex `pattern` (with `flags`); `label` says what it looks for',
  notContains: 'the file does not match the regex `pattern`',
  sniff: 'a named content test on the file',
  sourceParses: 'a code file (.js, .ts, .mjs, ...) or a YAML file parses',
  jsParses: 'every inline script in an HTML file parses',
  htmlLint: 'an HTML file is well formed: the shell closes, ids are unique, scripts parse',
  esmImports: 'the named node: imports in a module resolve',
  cssMinBytes: 'an HTML page carries at least `bytes` of CSS',
  csvShape: 'a CSV file has the required columns and at least `minRows` rows',
  tableShape: 'the first Markdown table in the file has the required columns and at least `minRows` rows',
  recordSchema: 'a JSON array or CSV of records matches a field list',
  jsonPathEquals: 'the JSON value at `path` equals `value`',
  figures: 'a quote, invoice or schedule adds up: line totals, subtotals, the weekdays of dates',
  listedFiles: 'each value of a frontmatter list in the file has its own file',
  valuesSubsetOf: 'every value `pattern` captures (one group) appears in one of `sourceFiles`: no invented ids or values',
  unsupportedClaims: 'risky claim wording appears only where a source uses the same words',
  citationsResolve: 'the file cites at least `minCitations` sources and every cited file exists',
  claimsGrounded: 'every number, date and quote in a sentence that cites a source appears in that source',
  nodeRuns: 'a dependency-free JavaScript file runs and exits 0',
  commandEvidence: 'a real run of the package script `script` ended as `expect`; set `window` to "task"',
  researchEvidence:
    'the run read `sourcePath`, or completed one of `tools` against an outside source; set `window` to "task"',
};

const RULES = `You write the contract for one Gezel craftbook. A contract states the result the person asked for and the bar it must clear, so the work can be held to it however it is done: by following the book's steps, or by skipping them.

Rules:
1. Judge the result, never the process. A check may read only a file the contract declares: a deliverable, a deliverable's textSource, an input, or a grounding source. Never check a file a step writes for its own use (a scope, plan, outline, source list, notes, review or verdict file). A run that skips that step must still be able to pass.
2. Deliverables are what the person gets at the end, once each: not a copy of it kept somewhere else, and not a file the book makes along the way. Write each path exactly as the book's steps write it, with the same {{param}} and {{task.*}} tokens; use no token the book does not define. Set "artifact": true when the book writes the file into the artifacts drawer (its checks on that file say "artifact": true, or a step writes it with write_artifact), and leave it off for workspace files. A deliverable may be a folder of files, or "./" for changes across the project's code. A binary file (.pptx, .docx, .pdf, .xlsx) gets a textSource naming the Markdown it is built from, when the book writes one.
3. Declare as "inputs" the supplied files a check reads (a data file that values must come from, a brief the facts must come from).
4. Criteria: "acceptance" means the deliverable exists and has the shape asked for; "quality" means it is good. Write as many as the bar needs, usually four to eight.
5. Enforce a criterion as a gate (the default) only with mechanical checks that any good deliverable passes, however it was made. A gate that fails good work is worse than no gate.
   - A size floor only rules out an empty or stub file: half the book's own floor for that file, or 200 bytes for a document when the book sets none.
   - Check that content is present, not what its section is called. Demand a named heading only when the book's own checks demand one, and then accept any heading level, a bold label, and synonyms.
   - Patterns are case-insensitive, match word stems, and accept the variants a writer would use ("Total", "totals", "amount due").
   - Never gate a citation style, a date format or other formatting the person did not ask for.
6. What only a reader can judge (the argument holds, the fix is minimal, the tone fits the audience) gets "enforce": "advisory" and a "judge" rubric: one question a reviewer can answer yes or no. Never use "eval-only".
7. A deliverable that states figures, dates or quotes taken from sources gets "grounding" with citationStyle "any" and a claimsGrounded criterion. That covers research, reports, decks and reviews, and readouts or audits of the person's data files, whose figures cite the data file they come from. When the deliverable reviews or summarizes a supplied file, list that file in claimsGrounded's "sources", so what it quotes from that file needs no citation, and set "maxUncited": 5, since a review or readout states a few facts of its own. Research that finds its own sources also gets citationsResolve, with the book's own minCitations, or 1 when the book sets none. Both checks read only citations to files (a backticked path, a Markdown link to a file, or "(source: path)"): a deliverable that cites works by author and year, or by web address, gets neither. Leave both off creative work, code, plans, and documents made from data rather than reporting on it (an invoice, a schedule).
8. Use an evidence check only when the result cannot show itself, and only as the book's own checks use it: commandEvidence when the deliverable is code whose test suite must pass; researchEvidence when the book's own checks use it, with the same tools, and with "externalOptional": true unless it names a sourcePath, so a device without web access can still pass.
9. The goal is one or two plain sentences, at most 400 characters: the outcome and its bar. The person reads criterion text: write plain American English.
10. Use only the check kinds and fields listed below, spelled exactly.`;

/**
 * What an unreviewed draft may enforce: that a file exists, has substance,
 * parses, passes its tests, and cites what it read. A pattern written without
 * seeing any output misses phrasings models use: on 1,440 saved benchmark
 * trials, drafted gates with every check enforced blocked 37 of 437 results
 * the judge rated 7 or higher; holding the patterns back blocked 19, against
 * 33 for the reviewed contracts (gezel docs/task-strategies.md).
 */
const UNREVIEWED_GATE_KINDS = new Set([
  'minBytes',
  'totalMinBytes',
  'fileCount',
  'sniff',
  'sourceParses',
  'jsParses',
  'htmlLint',
  'esmImports',
  'cssMinBytes',
  'csvShape',
  'tableShape',
  'recordSchema',
  'commandEvidence',
  'claimsGrounded',
  'citationsResolve',
]);

const CITATION_KINDS = new Set(['claimsGrounded', 'citationsResolve']);

/**
 * The citation checks read a file as prose; in an HTML page they took the
 * `<title>` date and CSS values for claims and failed passing work. Gezel's
 * claimsGrounded now reads a page as its visible text (core
 * checks/html-text.ts); lift this hold for claimsGrounded once the contract
 * floor (`minGezelVersion`) is a build that has it. A path that ends in a
 * token is taken as prose.
 */
const readsAsProse = (file) => !/\.[a-z0-9]+$/i.test(file ?? '') || /\.(md|markdown|txt)$/i.test(file);

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { contract: { type: 'object' }, notes: { type: 'string' } },
  required: ['contract', 'notes'],
  additionalProperties: false,
};

const semverCmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/** Every book id with its directory. */
export function listBooks(root = ROOT) {
  const out = [];
  for (const shard of readdirSync(root, { withFileTypes: true })) {
    if (!shard.isDirectory()) continue;
    for (const id of readdirSync(join(root, shard.name))) {
      const dir = join(root, shard.name, id);
      if (existsSync(join(dir, 'manifest.json'))) out.push({ id, dir });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The latest released version of a book. */
export function latestBook(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const yanked = new Set(manifest.yankedVersions ?? []);
  const version = readdirSync(join(dir, 'versions'))
    .filter((v) => !yanked.has(v) && existsSync(join(dir, 'versions', v, 'craftbook.json')))
    .sort(semverCmp)
    .at(-1);
  if (!version) return null;
  return { version, book: JSON.parse(readFileSync(join(dir, 'versions', version, 'craftbook.json'), 'utf8')) };
}

export function bookForDrafting(book) {
  return Object.fromEntries(Object.entries(book).filter(([key]) => !OMITTED_BOOK_KEYS.has(key)));
}

function fieldList(variant) {
  const required = new Set(variant.required ?? []);
  return Object.entries(variant.properties)
    .filter(([name]) => name !== 'kind')
    .map(([name, prop]) => {
      const values = prop.enum ? `: ${prop.enum.join('|')}` : '';
      return `${name}${required.has(name) ? '' : '?'}${values}`;
    })
    .join(', ');
}

/** The check kinds a contract may use, with their fields as the schema has them. */
export function checkVocabulary(schema = loadSchema('craftbook-doc')) {
  const contract = schema.properties.contract;
  const variants = contract.properties.criteria.items.properties.checks.items.oneOf;
  const lines = [];
  for (const variant of variants) {
    const kind = variant.properties.kind.const;
    if (!CHECK_GUIDE[kind]) continue;
    lines.push(`- ${kind} { ${fieldList(variant)} }: ${CHECK_GUIDE[kind]}`);
  }
  const deliverableKinds = contract.properties.deliverables.items.properties.kind.enum;
  return `## Check kinds\n${lines.join('\n')}\n\n## Deliverable kinds\n${deliverableKinds.join(', ')}`;
}

/** The files a book's steps check or wait for, so an example shows where its contract's paths came from. */
function bookOutline(book) {
  const files = (step) => {
    const out = new Set();
    const note = (file, artifact) => file && out.add(artifact ? `${file} (artifacts)` : file);
    const gate = step.gate && !Array.isArray(step.gate) ? step.gate : { checks: step.gate ?? [] };
    for (const check of gate.checks ?? []) {
      note(check.file, check.artifact);
      for (const f of check.files ?? []) note(f, check.artifact);
    }
    if (step.advanceWhen) note(step.advanceWhen.file, step.advanceWhen.artifact);
    return [...out];
  };
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    params: Object.keys(book.paramSchema?.properties ?? {}),
    steps: (book.steps ?? []).map((s) => ({ id: s.id, name: s.name, files: files(s) })),
  };
}

/** Released contracts of other books, most preferred first; never the target's own. */
export function examplesFor(targetId, books = listBooks()) {
  const out = [];
  for (const id of EXAMPLE_IDS) {
    if (id === targetId || out.length >= EXAMPLE_COUNT) continue;
    const entry = books.find((b) => b.id === id);
    const latest = entry ? latestBook(entry.dir) : null;
    if (!latest?.book.contract) continue;
    out.push({ outline: bookOutline(latest.book), contract: latest.book.contract });
  }
  return out;
}

export function buildPrompt(book, examples, vocabulary = checkVocabulary()) {
  const exampleText = examples
    .map(
      (e) =>
        `### ${e.outline.name} (${e.outline.id})\nBook outline:\n${JSON.stringify(e.outline, null, 2)}\nContract:\n${JSON.stringify(e.contract, null, 2)}`,
    )
    .join('\n\n');
  return [
    RULES,
    vocabulary,
    `## Examples: reviewed contracts for other books\n${exampleText}`,
    `## The book\n${JSON.stringify(bookForDrafting(book), null, 2)}`,
    'Return {"contract": {...}, "notes": "..."}. In notes, at most 80 words: what you were unsure of, for the person who reviews the draft.',
  ].join('\n\n');
}

/**
 * The draft as it ships before review: a gated criterion keeps only the checks
 * an unreviewed draft may enforce, and one left with none is shown but not
 * enforced, with its checks kept for the reviewer who promotes it.
 */
export function holdUnreviewedChecks(contract) {
  const out = structuredClone(contract);
  for (const criterion of out.criteria ?? []) {
    if ((criterion.enforce ?? 'gate') !== 'gate') continue;
    const checks = criterion.checks ?? [];
    const kept = checks.filter(
      (check) => UNREVIEWED_GATE_KINDS.has(check.kind) && !(CITATION_KINDS.has(check.kind) && !readsAsProse(check.file)),
    );
    if (kept.length === checks.length) continue;
    if (kept.length) criterion.checks = kept;
    else criterion.enforce = 'advisory';
  }
  return out;
}

const gatedCheckCount = (contract) =>
  (contract.criteria ?? [])
    .filter((c) => (c.enforce ?? 'gate') === 'gate')
    .reduce((n, c) => n + (c.checks?.length ?? 0), 0);

function repairPrompt(prompt, draft, problems) {
  return [
    prompt,
    `## Your previous draft\n${JSON.stringify(draft, null, 2)}`,
    `It has these problems:\n${problems.map((p) => `- ${p}`).join('\n')}`,
    'Return the corrected draft in the same shape.',
  ].join('\n\n');
}

/** Everything wrong with a drafted contract, as the drafting model should hear it. */
export function draftProblems(contract, book, schema = loadSchema('craftbook-doc')) {
  const parsed = zodParse(schema.properties.contract, contract);
  const problems = parsed.ok ? [] : parsed.errors.map((e) => `schema ${e}`);
  if (contract && typeof contract === 'object') {
    problems.push(...lintContract(contract), ...contractBookProblems(contract, book));
    for (const c of contract.criteria ?? []) {
      if (c.enforce === 'eval-only') problems.push(`criterion "${c.id}" is eval-only; use gate or advisory`);
    }
  }
  return [...new Set(problems)];
}

function callModel(prompt, { cli, model, effort }) {
  return new Promise((resolvePromise, reject) => {
    const args = ['-p', prompt, '--model', model, '--effort', effort, '--output-format', 'json'];
    args.push('--json-schema', JSON.stringify(OUTPUT_SCHEMA), '--tools', '');
    const child = spawn(cli, args, { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), CALL_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(String(outer.result).slice(0, 300));
        const out = outer.structured_output ?? JSON.parse(outer.result ?? '');
        resolvePromise({ ...out, costUsd: outer.total_cost_usd ?? 0 });
      } catch (err) {
        reject(new Error(`claude exited ${code}: ${err.message} ${stderr.slice(0, 300)}`));
      }
    });
  });
}

/** Re-derive a draft's shipped contract from its full one after the policy changes; no model call. */
function reapplyPolicy(entry, opts) {
  const file = join(opts.out, `${entry.id}.json`);
  if (!existsSync(file)) return { id: entry.id, status: 'skipped', reason: 'not drafted' };
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const full = record.drafted?.full ?? record.contract;
  const shipped = opts.enforce === 'all' ? full : holdUnreviewedChecks(full);
  const { full: _previous, ...drafted } = record.drafted ?? {};
  const held = JSON.stringify(shipped) !== JSON.stringify(full);
  const updated = { ...record, contract: shipped, drafted: { ...drafted, enforce: opts.enforce, ...(held ? { full } : {}) } };
  const changed = JSON.stringify(updated) !== JSON.stringify(record);
  if (changed) writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
  return { id: entry.id, status: changed ? 'reapplied' : 'unchanged', gatedChecks: gatedCheckCount(shipped) };
}

async function draftBook(entry, opts) {
  const latest = latestBook(entry.dir);
  if (!latest) return { id: entry.id, status: 'skipped', reason: 'no released version' };
  const prompt = buildPrompt(latest.book, examplesFor(entry.id, opts.books));
  if (opts.printPrompt) {
    process.stdout.write(`${prompt}\n`);
    return { id: entry.id, status: 'printed' };
  }
  let current = prompt;
  let costUsd = 0;
  const attempts = [];
  for (let turn = 0; turn <= MAX_REPAIRS; turn += 1) {
    const out = await callModel(current, opts);
    costUsd += out.costUsd;
    const problems = draftProblems(out.contract, latest.book);
    attempts.push(problems);
    if (problems.length === 0 || turn === MAX_REPAIRS) {
      const shipped = opts.enforce === 'all' ? out.contract : holdUnreviewedChecks(out.contract);
      const held = JSON.stringify(shipped) !== JSON.stringify(out.contract);
      const record = {
        id: entry.id,
        contract: shipped,
        drafted: {
          model: opts.model,
          at: new Date().toISOString(),
          fromVersion: latest.version,
          enforce: opts.enforce,
          notes: out.notes,
          repairs: turn,
          ...(problems.length ? { problems } : {}),
          ...(held ? { full: out.contract } : {}),
        },
      };
      writeFileSync(join(opts.out, `${entry.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
      return {
        id: entry.id,
        status: problems.length ? 'needs-work' : 'drafted',
        repairs: turn,
        gatedChecks: gatedCheckCount(shipped),
        costUsd: Number(costUsd.toFixed(4)),
        ...(problems.length ? { problems } : {}),
      };
    }
    current = repairPrompt(prompt, out.contract, problems);
  }
  return { id: entry.id, status: 'failed', attempts };
}

function parseArgs(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  return {
    only: value('only') ? new Set(value('only').split(',')) : null,
    missing: argv.includes('--missing'),
    redraft: argv.includes('--redraft'),
    force: argv.includes('--force'),
    printPrompt: argv.includes('--print-prompt'),
    reapply: argv.includes('--reapply'),
    limit: Number(value('limit', '0')) || Infinity,
    out: resolve(value('out', DEFAULT_OUT)),
    model: value('model', 'claude-opus-5-5'),
    effort: value('effort', 'high'),
    enforce: value('enforce', 'structure') === 'all' ? 'all' : 'structure',
    concurrency: Math.max(1, Number(value('concurrency', '2')) || 1),
    cli: value('cli', 'claude'),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.only && !opts.missing) {
    console.error('Name the books: --only <id,id> or --missing');
    process.exit(2);
  }
  opts.books = listBooks();
  const queue = [];
  const skipped = [];
  for (const entry of opts.books) {
    if (opts.only && !opts.only.has(entry.id)) continue;
    const latest = latestBook(entry.dir);
    if (latest?.book.contract && !opts.redraft) {
      if (opts.only) skipped.push({ id: entry.id, reason: 'has a contract; pass --redraft' });
      continue;
    }
    if (!opts.force && !opts.printPrompt && !opts.reapply && existsSync(join(opts.out, `${entry.id}.json`))) {
      skipped.push({ id: entry.id, reason: 'already drafted; pass --force' });
      continue;
    }
    if (queue.length < opts.limit) queue.push(entry);
  }
  for (const id of opts.only ?? []) {
    if (!opts.books.some((b) => b.id === id)) skipped.push({ id, reason: 'no such book' });
  }
  if (!opts.printPrompt) mkdirSync(opts.out, { recursive: true });
  const results = [];
  const workers = Array.from({ length: opts.printPrompt ? 1 : opts.concurrency }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      try {
        const result = opts.reapply ? reapplyPolicy(entry, opts) : await draftBook(entry, opts);
        results.push(result);
        if (!opts.printPrompt) console.error(`${result.status.padEnd(10)} ${entry.id}`);
      } catch (err) {
        results.push({ id: entry.id, status: 'error', error: err.message });
        console.error(`error      ${entry.id}: ${err.message}`);
      }
    }
  });
  await Promise.all(workers);
  if (opts.printPrompt) return;
  const costUsd = results.reduce((n, r) => n + (r.costUsd ?? 0), 0);
  console.log(JSON.stringify({ out: opts.out, results, skipped, costUsd: Number(costUsd.toFixed(2)) }, null, 2));
  if (results.some((r) => ['needs-work', 'error', 'failed'].includes(r.status))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
