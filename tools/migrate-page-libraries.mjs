#!/usr/bin/env node
/**
 * One-shot sweep: let interactive-page books use page libraries.
 *
 * Gezel serves pinned libraries (three.js, Chart.js, D3, React, Preact, …)
 * to the pages a gezel writes, with no network, and tells the model which
 * ones load on this host (gezel docs/page-libraries.md). Books written
 * before that said "Vanilla JS, no CDN", which now argues with the runtime
 * note and keeps a chart book drawing axes by hand. Each book below gets
 * wording that keeps plain JavaScript the default and allows a listed
 * library where it clearly helps. Chart and graphics books name theirs and
 * declare them on the step (`libraries`), so the task downloads them first
 * and the step names only the ones this host can load.
 *
 * Left alone on purpose: web-component (native custom elements are the
 * subject), feedback-widget (it is embedded in other sites), the decks and
 * the ebook (one portable file), the email digest (mail clients run no
 * script), the marketing and docs sites (the line keeps out CSS frameworks
 * and web fonts no shelf carries), and html-arcade-game (its contract
 * refuses any remote script address).
 *
 * Each migration emits a NEW patch version (released dirs are immutable).
 * `minGezelVersion` is unchanged: an older build drops `libraries` and lists
 * no libraries, so the wording falls back to plain JavaScript.
 *
 * Usage:
 *   node tools/migrate-page-libraries.mjs                 # dry-run report
 *   node tools/migrate-page-libraries.mjs --write
 *   node tools/migrate-page-libraries.mjs --only data-viz-page,chart-pack
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'craftbook-templates');
const RELEASED_AT = '2026-11-21T00:00:00Z';

const PLAIN = 'Plain JavaScript, or a page library your instructions list where it clearly helps; nothing else from the network.';
const PLAIN_ASSETS = 'Plain JavaScript, or a page library your instructions list where it clearly helps; no other external assets.';

/**
 * Per book: exact sentences to replace (each must be found), steps that
 * declare libraries, and edits to the eval prompt where it forbade them.
 */
const BOOKS = {
  'board-game-web': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
  'canvas-generative-art': {
    replace: [
      [
        'Vanilla JS, no CDN, no external assets.',
        'Plain JavaScript on a canvas, or three.js when your instructions list it and the piece is 3D; no other external assets.',
      ],
    ],
    libraries: { build: ['three'] },
  },
  'chart-pack': {
    replace: [
      [
        'Step 1: use inline <canvas>/SVG drawing or a single inlined chart library — no external network asset that could fail offline;',
        'Step 1: draw with Chart.js when your instructions list it, else inline <canvas>/SVG; load nothing else from the network;',
      ],
    ],
    libraries: { build: ['chart.js'] },
    testPrompt: [
      ['and inline data/JS with no external libraries.', 'with the data inline. It must work offline.'],
    ],
  },
  'data-viz-page': {
    replace: [
      [
        '(5) Self-contained — canvas or inline SVG, no chart-library CDN.',
        '(5) Name how it is drawn: Chart.js or D3 when your instructions list them, else canvas or inline SVG; nothing else from the network.',
      ],
      [
        'Make it responsive; vanilla JS, no CDN.',
        'Make it responsive. Draw with Chart.js or D3 when your instructions list them, else canvas or inline SVG; nothing else from the network.',
      ],
    ],
    libraries: { 'chart-design': ['chart.js', 'd3'], build: ['chart.js', 'd3'] },
    testPrompt: [
      ['Include a chart using inline SVG or canvas, a legend', 'Include a chart, a legend'],
      ['Inline CSS/JS only, no external assets.', 'It must work offline.'],
    ],
  },
  'form-wizard': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
  'game-with-screens': { replace: [['Vanilla JS, no CDN, no external assets.', PLAIN_ASSETS]] },
  'html-puzzle-game': { replace: [['Vanilla JS only, no CDN.', PLAIN]] },
  'idle-clicker-game': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
  'interactive-quiz': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
  'kpi-scorecard': {
    replace: [
      [
        'Step 3: draw a tiny inline sparkline (canvas/SVG) of the trend series in each tile — no external chart CDN that could fail offline.',
        'Step 3: draw a small sparkline of the trend series in each tile, with Chart.js when your instructions list it, else canvas or inline SVG; nothing else from the network.',
      ],
    ],
    libraries: { build: ['chart.js'] },
  },
  'micro-game-jam': { replace: [['Vanilla JS, no CDN, no external assets.', PLAIN_ASSETS]] },
  'onboarding-flow': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
  'physics-toy': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
  'spa-dashboard': {
    replace: [
      [
        '(5) Self-contained CSS; charts via canvas or inline SVG (no chart-library CDN unless trivially inlined).',
        '(5) Self-contained CSS; charts with Chart.js when your instructions list it, else canvas or inline SVG.',
      ],
      ['(5) Vanilla JS, no CDN.', `(5) ${PLAIN}`],
    ],
    libraries: { 'layout-design': ['chart.js'], build: ['chart.js'] },
  },
  'web-app-crud': { replace: [['Vanilla JS, no CDN.', PLAIN]] },
};

const args = process.argv.slice(2);
const write = args.includes('--write');
const onlyAt = args.indexOf('--only');
const only = onlyAt === -1 ? null : new Set(args[onlyAt + 1].split(','));

function semver(v) {
  return v.split('.').map(Number);
}
function newest(a, b) {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
}
function findBook(id) {
  for (const shard of readdirSync(ROOT)) {
    const dir = join(ROOT, shard, id);
    if (existsSync(join(dir, 'manifest.json'))) return dir;
  }
  throw new Error(`${id}: no such craftbook`);
}

/** Replace `from` with `to` in every string of a step's prompt or description; count hits. */
function replaceIn(steps, from, to) {
  let hits = 0;
  for (const step of steps) {
    for (const key of ['prompt', 'description']) {
      if (typeof step[key] !== 'string' || !step[key].includes(from)) continue;
      hits += step[key].split(from).length - 1;
      step[key] = step[key].split(from).join(to);
    }
  }
  return hits;
}

let failures = 0;
for (const [id, plan] of Object.entries(BOOKS)) {
  if (only && !only.has(id)) continue;
  try {
    const dir = findBook(id);
    const identity = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const yanked = new Set(identity.yankedVersions ?? []);
    const versions = readdirSync(join(dir, 'versions'))
      .filter((v) => !yanked.has(v) && existsSync(join(dir, 'versions', v, 'craftbook.json')))
      .sort(newest);
    const latest = versions[0];
    const [major, minor, patch] = semver(latest);
    const next = `${major}.${minor}.${patch + 1}`;
    const from = join(dir, 'versions', latest);
    const doc = JSON.parse(readFileSync(join(from, 'craftbook.json'), 'utf8'));
    const notes = [];
    for (const [old, replacement] of plan.replace) {
      const hits = replaceIn(doc.steps, old, replacement);
      if (!hits) throw new Error(`"${old}" not found in ${latest}`);
      notes.push(`${hits}× ${old.slice(0, 48)}…`);
    }
    for (const [stepId, libraries] of Object.entries(plan.libraries ?? {})) {
      const step = doc.steps.find((candidate) => candidate.id === stepId);
      if (!step) throw new Error(`no step "${stepId}"`);
      step.libraries = libraries;
      notes.push(`${stepId} libraries ${libraries.join(', ')}`);
    }
    doc.version = next;
    doc.releasedAt = RELEASED_AT;
    let test = null;
    if (existsSync(join(from, 'test.json'))) {
      test = JSON.parse(readFileSync(join(from, 'test.json'), 'utf8'));
      for (const [old, replacement] of plan.testPrompt ?? []) {
        if (!test.prompt.includes(old)) throw new Error(`test prompt lacks "${old}"`);
        test.prompt = test.prompt.split(old).join(replacement);
        notes.push(`test prompt: ${old.slice(0, 40)}…`);
      }
    }
    console.log(`${write ? 'wrote' : 'would write'} ${id} ${latest} -> ${next}: ${notes.join('; ')}`);
    if (!write) continue;
    const to = join(dir, 'versions', next);
    if (existsSync(to)) throw new Error(`${next} already exists`);
    mkdirSync(to);
    for (const name of readdirSync(from)) {
      if (name !== 'craftbook.json' && name !== 'test.json') cpSync(join(from, name), join(to, name), { recursive: true });
    }
    writeFileSync(join(to, 'craftbook.json'), `${JSON.stringify(doc, null, 2)}\n`);
    if (test) writeFileSync(join(to, 'test.json'), `${JSON.stringify(test, null, 2)}\n`);
  } catch (err) {
    failures += 1;
    console.error(`FAILED ${id}: ${err.message}`);
  }
}
process.exit(failures ? 1 : 0);
