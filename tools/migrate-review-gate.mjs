#!/usr/bin/env node
/**
 * One-shot sweep: route every review loop on a written verdict.
 *
 * The build-loop template's `evaluate` step defaulted its edge BACK to the
 * work step and asked the reviewer to choose the way forward with
 * `advance_task_step({ next: "finish" })`. Nothing gated it and nothing
 * counted the loops, so a model that forgot `next` (or kept finding one more
 * nit) cycled until the eval clock ran out: craftbook-week-plan spent 90
 * minutes in two review loops on qwen3.8-27b (2026-10-21), and gemma-12b
 * omitted `next` in 7 of 8 advances on invoice-run before its fix
 * (2026-09-20). 241 of 292 current books carried the shape.
 *
 * Each migrated book gets invoice-run's pattern (gezel CLAUDE.md, "A stepwise
 * craftbook step's `consumes` list is the whole of its working memory"):
 *
 *   - evaluate writes `<work>/verdict.md` to the artifacts drawer, one line
 *     per criterion ending in PASS or FAIL; writing it completes the step;
 *   - a completion gate approves only a verdict with a PASS and no FAIL, and
 *     its `onReject` sends the task back to the work step. "PASS/FAIL" (an
 *     echoed header) counts as neither;
 *   - the default edge is the FORWARD one, so a reviewer that never fails a
 *     criterion moves on instead of looping;
 *   - the reviewer writes the failing gaps to the task notes first, because
 *     the work step runs in a fresh session and reads the task notes, not the
 *     reviewer's drawer.
 *
 * evaluate gains the artifacts toolset (it must write the verdict) and keeps
 * task notes as a second output; the work step's tool policy is untouched.
 * Each migration emits a NEW patch version (released dirs are immutable) and
 * raises `minGezelVersion` to the floor below, the first gezel release that
 * reads drawer gate checks; test.json and other files are copied as they are.
 *
 * Usage:
 *   node tools/migrate-review-gate.mjs                 # dry-run report
 *   node tools/migrate-review-gate.mjs --write
 *   node tools/migrate-review-gate.mjs --only build-loop,a11y-audit
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'data', 'craftbook-templates');
const FLOOR = '1.26233';
const REVIEW_STEP = 'evaluate';
const ROUTING_MARKER = 'Then route — this is the whole point of the loop:';
const JUDGMENT_RE =
  /The build phase's completion gate already blocked a grossly-incomplete deliverable; your job is the judgment an automated check cannot make \([^)]*\)\./;
const LOOP_HINT_RE = /loop[- ]back|earlier pass|review of an earlier|critique in task notes/i;

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

function verdictBlock({ verdict, rework, finish, judgment }) {
  return [
    'Then record your verdict — this is the whole point of the loop:',
    '',
    `1. If any criterion fails, first write the specific gaps to the task notes with \`write_task_note\`: which file, which part, and what is missing. The "${rework.name}" step reads them when it fixes the work.`,
    `2. When you have graded every criterion, write \`${verdict}\` with \`write_artifact\`. One line per criterion and no preamble: the criterion, its one-line reason, then PASS or FAIL as the last word on the line. Writing verdict.md completes this step.`,
    '',
    `The runtime routes on the verdict: every line PASS moves the task to "${finish.name}"; any FAIL sends it back to "${rework.name}" to fix those gaps, and a review that keeps failing pauses the task for the user. Mark a criterion PASS only when it is met.${judgment ? ` ${judgment}` : ''}`,
  ].join('\n');
}

/**
 * Hand-written routing paragraphs the template block does not cover. Each
 * maps the exact text to replace; anything after it is kept.
 */
const CUSTOM_ROUTING = {
  'build-loop': {
    start: 'Then route:',
    end: 'After ~3 unproductive loops, stop and report DONE_WITH_CONCERNS so the user can step in.',
  },
  'release-artifact-sanity-check': {
    start: 'Then route explicitly:',
    end: 'After three unproductive loops, stop with DONE_WITH_CONCERNS for user review.',
  },
  'reviewer-loop': {
    start: 'If every criterion passes, call',
    end: 'Never route to publish or finish while a criterion is unmet.',
  },
};

function rewriteReviewPrompt(id, prompt, ctx) {
  const custom = CUSTOM_ROUTING[id];
  let start;
  let end;
  if (custom) {
    start = prompt.indexOf(custom.start);
    const endAt = prompt.indexOf(custom.end);
    end = endAt >= 0 ? endAt + custom.end.length : -1;
  } else {
    start = prompt.indexOf(ROUTING_MARKER);
    const tail = prompt.slice(start);
    const stop = /so the user can step in\./.exec(tail);
    end = start >= 0 && stop ? start + stop.index + stop[0].length : -1;
  }
  if (start < 0 || end < 0) return null;
  const before = prompt
    .slice(0, start)
    .replace(/,? and loop back\./g, '.')
    .replace(/\s+$/, '');
  const judgment = JUDGMENT_RE.exec(prompt.slice(start, end))?.[0];
  const after = prompt.slice(end).replace(/^\s+/, '');
  const block = verdictBlock({ ...ctx, judgment });
  return [before, block, after].filter(Boolean).join('\n\n');
}

/** Keep key order; add the verdict checkpoint and gate just before `next`. */
function rewriteReviewStep(step, { verdict, rework, finish, prompt }) {
  const out = {};
  for (const [key, value] of Object.entries(step)) {
    if (key === 'advanceWhen' || key === 'gate') continue;
    if (key === 'next') {
      out.advanceWhen = { file: verdict, minBytes: 40, sniff: 'nonempty', artifact: true };
      out.gate = {
        at: 'completion',
        checks: [
          {
            kind: 'contains',
            file: verdict,
            pattern: '(?<!/\\s*)\\bPASS\\b(?!\\s*/)',
            label: 'the verdict marks its criteria PASS',
            artifact: true,
          },
          {
            kind: 'notContains',
            file: verdict,
            pattern: '(?<!/\\s*)\\bFAIL\\b(?!\\s*/)',
            label: 'no criterion is marked FAIL',
            artifact: true,
          },
        ],
        onReject: rework.id,
        maxAttempts: 3,
      };
      out.next = finish.id;
      continue;
    }
    if (key === 'toolPolicy') {
      const policy = {};
      for (const [pk, pv] of Object.entries(value ?? {})) {
        if (pk === 'additionalOutputMedia') continue;
        if (pk === 'disallowBuiltinToolsets') {
          policy[pk] = pv.filter((toolset) => toolset !== 'artifacts');
          continue;
        }
        if (pk === 'outputMedium') {
          policy.outputMedium = 'artifact';
          policy.additionalOutputMedia = [
            ...new Set([
              ...(value.additionalOutputMedia ?? []).filter((medium) => medium !== 'artifact'),
              'task-note',
            ]),
          ];
          continue;
        }
        policy[pk] = pv;
      }
      if (!policy.outputMedium) {
        policy.outputMedium = 'artifact';
        policy.additionalOutputMedia = ['task-note'];
      }
      out.toolPolicy = policy;
      continue;
    }
    if (key === 'prompt') {
      out.prompt = prompt;
      continue;
    }
    out[key] = value;
  }
  if (!('toolPolicy' in out)) {
    out.toolPolicy = { outputMedium: 'artifact', additionalOutputMedia: ['task-note'] };
  }
  return out;
}

function reworkPrompt(prompt) {
  if (LOOP_HINT_RE.test(prompt)) return prompt;
  return `${prompt.replace(/\s+$/, '')}\n\nIf the task notes hold a review of an earlier pass, fix exactly the gaps it names and keep everything that already passed.`;
}

const report = { migrated: [], manual: [], none: 0 };
const releasedAt = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;

for (const shard of readdirSync(ROOT).filter((d) => !d.includes('.')).sort()) {
  for (const id of readdirSync(join(ROOT, shard)).sort()) {
    const itemDir = join(ROOT, shard, id);
    if (!existsSync(join(itemDir, 'manifest.json'))) continue;
    if (ONLY && !ONLY.has(id)) continue;
    const manifest = JSON.parse(readFileSync(join(itemDir, 'manifest.json'), 'utf8'));
    const yanked = new Set(manifest.yankedVersions ?? []);
    const versions = readdirSync(join(itemDir, 'versions')).filter(
      (v) =>
        !yanked.has(v) &&
        existsSync(join(itemDir, 'versions', v, 'craftbook.json')) &&
        (!manifest.minSupportedVersion || semverCmp(v, manifest.minSupportedVersion) >= 0),
    );
    if (versions.length === 0) continue;
    const latest = versions.sort(semverCmp).at(-1);
    const versionDir = join(itemDir, 'versions', latest);
    const book = JSON.parse(readFileSync(join(versionDir, 'craftbook.json'), 'utf8'));
    const steps = book.steps ?? [];
    const review = steps.find((step) => step.id === REVIEW_STEP);
    if (!review || review.gate?.onReject || !review.next) {
      report.none += 1;
      continue;
    }
    const rework = steps.find((step) => step.id === review.next);
    const finishes = steps.filter((step) => step.terminal);
    const loops =
      rework &&
      !rework.terminal &&
      (steps.indexOf(rework) < steps.indexOf(review) || rework.next === REVIEW_STEP);
    if (!loops) {
      report.none += 1;
      continue;
    }
    if (finishes.length !== 1) {
      report.manual.push({ id, reason: `${finishes.length} terminal steps` });
      continue;
    }
    const finish = finishes[0];
    const work = book.paramSchema?.properties?.workPath ? '{{workPath}}' : '{{task.dir}}';
    const verdict = `${work}/verdict.md`;
    if (JSON.stringify(book).includes('verdict.md')) {
      report.manual.push({ id, reason: 'already names a verdict.md' });
      continue;
    }
    const prompt = rewriteReviewPrompt(id, review.prompt ?? '', { verdict, rework, finish });
    if (!prompt) {
      report.manual.push({ id, reason: 'routing paragraph not found' });
      continue;
    }

    const [maj, min, pat] = latest.split('.').map(Number);
    let newVersion = `${maj}.${min}.${pat + 1}`;
    while (existsSync(join(itemDir, 'versions', newVersion))) {
      newVersion = `${maj}.${min}.${Number(newVersion.split('.')[2]) + 1}`;
    }
    const migrated = {
      ...book,
      steps: steps.map((step) => {
        if (step.id === review.id) {
          return rewriteReviewStep(step, { verdict, rework, finish, prompt });
        }
        if (step.id === rework.id && typeof step.prompt === 'string') {
          return { ...step, prompt: reworkPrompt(step.prompt) };
        }
        return step;
      }),
      version: newVersion,
      releasedAt,
    };
    if (!migrated.minGezelVersion || gezelVersionCmp(migrated.minGezelVersion, FLOOR) < 0) {
      migrated.minGezelVersion = FLOOR;
    }
    report.migrated.push({ id, from: latest, to: newVersion, rework: rework.id, finish: finish.id });

    if (WRITE) {
      const newDir = join(itemDir, 'versions', newVersion);
      mkdirSync(newDir, { recursive: true });
      writeFileSync(join(newDir, 'craftbook.json'), `${JSON.stringify(migrated, null, 2)}\n`);
      for (const extra of readdirSync(versionDir)) {
        if (extra === 'craftbook.json') continue;
        cpSync(join(versionDir, extra), join(newDir, extra), { recursive: true });
      }
    }
  }
}

console.log(
  JSON.stringify(
    {
      mode: WRITE ? 'WRITE' : 'dry-run',
      migrated: report.migrated.length,
      manual: report.manual.length,
      untouched: report.none,
    },
    null,
    2,
  ),
);
for (const m of report.manual) console.log(JSON.stringify(m));
