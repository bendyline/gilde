#!/usr/bin/env node
/**
 * One-shot sweep: move craftbook working files into the per-task artifact
 * folder convention (gezel ADR 0008).
 *
 * Every migrated book gains a `workPath` param whose default is the
 * reserved runtime token `{{task.dir}}` (= `tasks/<num>` in the project's
 * artifacts drawer), and its colliding static working paths become
 * `{{workPath}}/…`. The powerpoint-deck precedent, applied uniformly.
 *
 * What migrates (per path-bearing ref):
 *   - artifact-flagged refs (advanceWhen/consumes/gate checks with
 *     `artifact: true`, `outlineFile` with `outlineArtifact: true`,
 *     `spawn.overFile` with `overArtifact: true`) whose first path segment
 *     is one of the accessory working dirs (notes/, reports/, reviews/,
 *     security/, pr-review/) or which are root-level static files.
 *   - hook inputs (onEnter/onExit `inputs.*`) whose value matches an
 *     accessory working path — stdlib artifact writers like
 *     publishCorpusBatches take artifact-relative paths.
 * Paths under a first segment carrying `{{…}}` (reviews/{{reviewId}}/…),
 * connector corpora (data/…), and the canonical non-task folders
 * (scripts/, tests/, mocks/, drafts/, sessions/, …) never migrate.
 * `notes/` is flattened away (`notes/scope.md` → `{{workPath}}/scope.md`);
 * other accessory dirs keep their grouping (`pr-review/batches.json` →
 * `{{workPath}}/pr-review/batches.json`) so multi-folder books cannot
 * collide after the rewrite.
 *
 * Excluded books:
 *   - code-review: its reviews/<reviewId>/ paths are keyed by gezel's
 *     durable CodeReviewManager records; migrating would orphan them.
 *   - powerpoint-deck: already namespaced; migrated by hand (its workPath
 *     spans both drawers and its prose is dense).
 *
 * Each migration emits a NEW patch version dir (released dirs are
 * immutable) with `minGezelVersion` raised to the --floor value — the
 * first gezel release that ships the `{{task.dir}}` token — and pins
 * `setup.craftbookParams.workPath: "tasks/eval"` in test.json so eval
 * deliverable assertions stay deterministic.
 *
 * Usage:
 *   node tools/migrate-task-dir.mjs                 # dry-run report
 *   node tools/migrate-task-dir.mjs --write --floor 1.26233
 *   node tools/migrate-task-dir.mjs --only pull-request-review
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'data', 'craftbook-templates');
const SKIP_BOOKS = new Set(['code-review', 'powerpoint-deck']);
const ACCESSORY_DIRS = new Set(['notes', 'reports', 'reviews', 'security', 'pr-review']);
const NEVER_MIGRATE_FIRST_SEG = new Set([
  'data', 'scripts', 'tests', 'mocks', 'drafts', 'sessions', 'attachments',
  'generated', 'auto', 'shared', 'shadow', 'tasks',
]);
const EVAL_WORK_PATH = 'tasks/eval';
const WORK_PATH_PARAM = {
  type: 'string',
  title: 'Working folder',
  description:
    "Per-task working folder in the artifacts drawer. Defaults to this task's own folder so runs never collide; override with a stable name when you deliberately want runs to share files.",
  default: '{{task.dir}}',
};

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const floorIdx = args.indexOf('--floor');
const FLOOR = floorIdx >= 0 ? args[floorIdx + 1] : null;
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
if (WRITE && !FLOOR) {
  console.error('--write requires --floor <1.YYDDD> (the first gezel release with {{task.dir}})');
  process.exit(1);
}

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
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-path occurrences only: no [\w/.-] before (blocks pr-review/report.md
// matching a bare report.md rule), no continuation after (blocks
// weekly-report.md, report.md.bak) while allowing sentence punctuation.
// Keys ending in '/' are directory-prefix rules — their whole point is to
// match with a filename continuing after them, so they skip the after-guard.
const pathRe = (p) =>
  p.endsWith('/')
    ? new RegExp(`(?<![\\w/.-])${escapeRe(p)}`, 'g')
    : new RegExp(`(?<![\\w/.-])${escapeRe(p)}(?!\\w|-|\\.\\w)`, 'g');

function firstSegment(p) {
  return p.split('/')[0];
}

function eligiblePath(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  const first = firstSegment(p);
  if (first.includes('{{')) return false;
  if (NEVER_MIGRATE_FIRST_SEG.has(first)) return false;
  if (p.includes('/')) return ACCESSORY_DIRS.has(first);
  // Root-level static files must look like files (carry an extension):
  // a bare word ("renders") would turn the text-rewrite rules loose on
  // ordinary prose.
  return !p.includes('{{') && p.includes('.');
}

function newPathFor(p) {
  const first = firstSegment(p);
  const rest = p.includes('/') ? p.slice(first.length + 1) : p;
  if (first === 'notes' && p.includes('/')) return `{{workPath}}/${rest}`;
  if (p.includes('/')) return `{{workPath}}/${p}`;
  return `{{workPath}}/${p}`;
}

function collectRefs(book) {
  const paths = new Set();
  const consider = (p, artifactFlag) => {
    if (artifactFlag === true && eligiblePath(p)) paths.add(p);
  };
  const considerHookInputs = (hooks) => {
    for (const ref of Array.isArray(hooks) ? hooks : []) {
      for (const v of Object.values(ref?.inputs ?? {})) {
        if (typeof v === 'string' && v.includes('/') && ACCESSORY_DIRS.has(firstSegment(v)) && eligiblePath(v)) {
          paths.add(v);
        }
      }
    }
  };
  const walkStep = (step) => {
    if (!step || typeof step !== 'object') return;
    consider(step.advanceWhen?.file, step.advanceWhen?.artifact);
    for (const input of step.consumes ?? []) consider(input?.file, input?.artifact);
    for (const check of step.gate?.checks ?? []) {
      consider(check?.file, check?.artifact);
      consider(check?.dir, check?.artifact);
      consider(check?.outlineFile, check?.outlineArtifact);
    }
    considerHookInputs(step.onEnter);
    considerHookInputs(step.onExit);
  };
  for (const step of book.steps ?? []) walkStep(step);
  for (const step of book.spawn?.steps ?? []) walkStep(step);
  consider(book.spawn?.overFile, book.spawn?.overArtifact);
  return paths;
}

function buildMapping(paths) {
  const mapping = new Map();
  for (const p of paths) mapping.set(p, newPathFor(p));
  // A flattened notes/ file colliding with another new path keeps its dir.
  const seen = new Map();
  for (const [oldP, newP] of mapping) {
    if (seen.has(newP)) {
      mapping.set(oldP, `{{workPath}}/${oldP}`);
      const other = seen.get(newP);
      mapping.set(other, `{{workPath}}/${other}`);
    } else {
      seen.set(newP, oldP);
    }
  }
  // Bare dir values (fileCount-style `dir:` fields, prose mentions of the
  // folder itself). notes → the workPath root; others keep their name.
  const dirs = new Set([...mapping.keys()].map(firstSegment).filter((d) => ACCESSORY_DIRS.has(d)));
  for (const d of dirs) {
    mapping.set(`${d}/`, d === 'notes' ? '{{workPath}}/' : `{{workPath}}/${d}/`);
  }
  return mapping;
}

/**
 * Prompts pass bare dir names as quoted tool-call arguments —
 * `list_artifacts({ path: "pr-review" })` — which the path rules skip (a
 * bare word without quotes is far too dangerous to rewrite in prose). The
 * surrounding quotes make this form unambiguous.
 */
function quotedDirRules(mapping) {
  const dirs = new Set([...mapping.keys()].map(firstSegment).filter((d) => ACCESSORY_DIRS.has(d)));
  return [...dirs].map((d) => ({
    re: new RegExp(`(["'])${escapeRe(d)}\\1`, 'g'),
    to: d === 'notes' ? '$1{{workPath}}$1' : `$1{{workPath}}/${d}$1`,
  }));
}

function replaceEverywhere(value, rules) {
  if (typeof value === 'string') {
    let out = value;
    for (const { re, to } of rules) out = out.replace(re, to);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => replaceEverywhere(v, rules));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceEverywhere(v, rules)]),
    );
  }
  return value;
}

function leftoverLiterals(value, olds) {
  const text = JSON.stringify(value);
  return olds.filter((p) => pathRe(p).test(text));
}

const report = { A: [], B: [], skipped: [], none: [], manual: [] };
const today = new Date();
const releasedAt = `${today.toISOString().slice(0, 10)}T00:00:00Z`;

for (const shard of readdirSync(ROOT).filter((d) => !d.includes('.')).sort()) {
  for (const id of readdirSync(join(ROOT, shard)).sort()) {
    const itemDir = join(ROOT, shard, id);
    if (!existsSync(join(itemDir, 'manifest.json'))) continue;
    if (ONLY && !ONLY.has(id)) continue;
    if (SKIP_BOOKS.has(id)) {
      report.skipped.push({ id, reason: 'excluded by design (see header)' });
      continue;
    }
    const manifest = JSON.parse(readFileSync(join(itemDir, 'manifest.json'), 'utf8'));
    const yanked = new Set(manifest.yankedVersions ?? []);
    const versions = readdirSync(join(itemDir, 'versions')).filter(
      (v) =>
        !yanked.has(v) &&
        existsSync(join(itemDir, 'versions', v, 'craftbook.json')) &&
        (!manifest.minSupportedVersion || semverCmp(v, manifest.minSupportedVersion) >= 0),
    );
    if (versions.length === 0) {
      report.manual.push({ id, reason: 'no eligible version' });
      continue;
    }
    const latest = versions.sort(semverCmp).at(-1);
    const versionDir = join(itemDir, 'versions', latest);
    const book = JSON.parse(readFileSync(join(versionDir, 'craftbook.json'), 'utf8'));

    if (book.paramSchema?.properties?.workPath) {
      report.manual.push({ id, reason: 'already declares a workPath param' });
      continue;
    }
    const paths = collectRefs(book);
    if (paths.size === 0) {
      report.none.push({ id });
      continue;
    }
    const mapping = buildMapping(paths);
    // Longest-first so notes/scope.md wins over a bare scope.md rule.
    const rules = [
      ...[...mapping.entries()]
        .sort((a, b) => b[0].length - a[0].length)
        .map(([from, to]) => ({ re: pathRe(from), to })),
      ...quotedDirRules(mapping),
    ];

    const migrated = replaceEverywhere(book, rules);
    const filePaths = [...paths];
    const leftovers = leftoverLiterals(migrated, filePaths);
    if (leftovers.length > 0) {
      report.manual.push({ id, reason: `literals survived rewrite: ${leftovers.join(', ')}` });
      continue;
    }

    // New version payload.
    const [maj, min, pat] = latest.split('.').map(Number);
    let newVersion = `${maj}.${min}.${pat + 1}`;
    while (existsSync(join(itemDir, 'versions', newVersion))) {
      newVersion = `${maj}.${min}.${Number(newVersion.split('.')[2]) + 1}`;
    }
    migrated.paramSchema = migrated.paramSchema ?? { type: 'object', properties: {} };
    migrated.paramSchema.properties = {
      workPath: WORK_PATH_PARAM,
      ...migrated.paramSchema.properties,
    };
    migrated.version = newVersion;
    migrated.releasedAt = releasedAt;
    if (FLOOR && (!migrated.minGezelVersion || gezelVersionCmp(migrated.minGezelVersion, FLOOR) < 0)) {
      migrated.minGezelVersion = FLOOR;
    }

    // test.json: pin workPath and rewrite any old literals to the pinned
    // resolved form, so deliverable assertions and eval prompts agree.
    let migratedTest = null;
    const testPath = join(versionDir, 'test.json');
    if (existsSync(testPath)) {
      const test = JSON.parse(readFileSync(testPath, 'utf8'));
      const testRules = [
        ...[...mapping.entries()]
          .sort((a, b) => b[0].length - a[0].length)
          .map(([from, to]) => ({ re: pathRe(from), to: to.replaceAll('{{workPath}}', EVAL_WORK_PATH) })),
        ...quotedDirRules(mapping).map(({ re, to }) => ({ re, to: to.replaceAll('{{workPath}}', EVAL_WORK_PATH) })),
      ];
      migratedTest = replaceEverywhere(test, testRules);
      migratedTest.setup = migratedTest.setup ?? {};
      migratedTest.setup.craftbookParams = {
        ...migratedTest.setup.craftbookParams,
        workPath: EVAL_WORK_PATH,
      };
      const testLeftovers = leftoverLiterals(migratedTest, filePaths);
      if (testLeftovers.length > 0) {
        report.manual.push({ id, reason: `test.json literals survived: ${testLeftovers.join(', ')}` });
        continue;
      }
    }

    const cohort = filePaths.every((p) => /^(?:notes|reports)\//.test(p)) ? 'A' : 'B';
    const manifestMentions = leftoverLiterals(manifest.description ?? '', filePaths);
    report[cohort].push({
      id,
      from: latest,
      to: newVersion,
      mapping: Object.fromEntries([...mapping].filter(([k]) => !k.endsWith('/'))),
      ...(manifestMentions.length > 0 ? { manifestMentions } : {}),
    });

    if (WRITE) {
      const newDir = join(itemDir, 'versions', newVersion);
      mkdirSync(newDir, { recursive: true });
      writeFileSync(join(newDir, 'craftbook.json'), `${JSON.stringify(migrated, null, 2)}\n`);
      if (migratedTest) {
        writeFileSync(join(newDir, 'test.json'), `${JSON.stringify(migratedTest, null, 2)}\n`);
      }
      for (const extra of readdirSync(versionDir)) {
        if (extra === 'craftbook.json' || extra === 'test.json') continue;
        copyFileSync(join(versionDir, extra), join(newDir, extra));
      }
    }
  }
}

const summary = {
  mode: WRITE ? 'WRITE' : 'dry-run',
  floor: FLOOR,
  cohortA: report.A.length,
  cohortB: report.B.length,
  untouchedNoWorkingFiles: report.none.length,
  skipped: report.skipped.length,
  manual: report.manual.length,
};
console.log(JSON.stringify(summary, null, 2));
console.log('\n--- Cohort B (review each path table) ---');
for (const b of report.B) console.log(JSON.stringify(b));
console.log('\n--- Manual queue ---');
for (const m of report.manual) console.log(JSON.stringify(m));
console.log('\n--- Skipped ---');
for (const s of report.skipped) console.log(JSON.stringify(s));
const reportPath = join(import.meta.dirname, 'migrate-task-dir.report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nFull report: ${reportPath}`);
