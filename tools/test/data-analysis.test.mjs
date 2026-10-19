import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../data/project-types/da/data-analysis/versions/1.0.0/pages/datasets.js', import.meta.url), 'utf8');
function scanner() {
  const window = {};
  runInNewContext(script, { window });
  return window.dataAnalysisFiles;
}
const file = (name, size = 10) => ({ name, kind: 'file', size, mtime: 123 });
const dir = (name) => ({ name, kind: 'dir', size: 0, mtime: 123 });
const paths = (result) => Array.from(result.files, (entry) => entry.path);

const queryScript = readFileSync(new URL('../../data/project-types/da/data-analysis/versions/1.0.0/pages/analytics.js', import.meta.url), 'utf8');
function queries() {
  const window = {};
  runInNewContext(queryScript, { window });
  return window.dataAnalysisQueries;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const columns = [{ name: 'region', type: 'VARCHAR', role: 'dimension' }, { name: 'amount', type: 'DOUBLE', role: 'measure' }, { name: 'id', type: 'BIGINT', role: 'identifier' }];

test('summaries keep missing values separate from zero and do not average identifiers', () => {
  const plan = queries().summary('table', columns);
  const result = plain(plan.sample([{ amount: 0, id: 1 }, { amount: null, id: 2 }, { amount: -6, id: 3 }]));
  assert.deepEqual(result, [{ row_count: 3, count_0: 2, min_0: -6, max_0: 0, avg_0: -3 }]);
  assert.doesNotMatch(plan.sql, /avg\("id"\)/);
  assert.deepEqual(plain(plan.sample([])), [{ row_count: 0, count_0: 0, min_0: null, max_0: null, avg_0: null }]);
});

test('charts count records or average present measures and never sum by default', () => {
  const q = queries();
  const rows = [{ region: 'N', amount: 0 }, { region: 'N', amount: null }, { region: 'S', amount: -6 }, { region: null, amount: 99 }];
  assert.deepEqual(plain(q.chart('table', columns[0]).sample(rows)), [{ label: 'N', value: 2 }, { label: 'S', value: 1 }]);
  assert.deepEqual(plain(q.chart('table', columns[0], columns[1]).sample(rows)), [{ label: 'N', value: 0 }, { label: 'S', value: -6 }]);
  assert.doesNotMatch(q.chart('table', columns[0], columns[1]).sql, /sum\(/);
  const bars = q.bars([{ value: -6 }, { value: 3 }]);
  assert.ok(bars.rows[0].left < bars.zero);
  assert.equal(bars.rows[1].left, bars.zero);
  assert.equal(bars.rows[0].width, 2 * bars.rows[1].width);
});

test('quotes identifiers and groups dates by calendar month, bounded to twelve months', () => {
  const q = queries();
  assert.equal(q.quote('a"; DROP TABLE x; --'), '"a""; DROP TABLE x; --"');
  const plan = q.chart('table', { name: 'day', type: 'DATE' });
  assert.deepEqual(plain(plan.sample([{ day: '2026-01-01' }, { day: '2026-01-25' }, { day: '2026-02-01' }])), [{ label: '2026-02-01 00:00:00', value: 1 }, { label: '2026-01-01 00:00:00', value: 2 }]);
  assert.equal(plan.sample(Array.from({ length: 15 }, (_, i) => ({ day: `${2025 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01` }))).length, 12);
});

test('discovers data and reports recursively without reading dataset contents', async () => {
  const { scan, data } = scanner();
  const calls = [];
  const folders = {
    '.': [file('SALES.CSV'), file('budget.xlsx', 12_000_000), file('notes.pdf'), file('photo.png'), dir('survey')],
    survey: [file('responses.tsv'), file('sample.parquet'), file('events.jsonl'), file('notes.md')],
  };
  const result = await scan(async (path) => { calls.push(path); return folders[path]; });
  assert.deepEqual(paths(result), ['SALES.CSV', 'budget.xlsx', 'notes.pdf', 'survey/responses.tsv', 'survey/sample.parquet', 'survey/events.jsonl', 'survey/notes.md']);
  assert.deepEqual(calls, ['.', 'survey']);
  assert.equal(result.files.find((entry) => entry.path === 'budget.xlsx').size, 12_000_000);
  assert.equal(result.limited, false);
  for (const ext of ['csv', 'tsv', 'xlsx', 'xls', 'ods', 'json', 'sqlite', 'parquet']) assert.ok(data.has(ext));
});

test('ignores hidden, dependency, office lock, and companion files; preserves unusual names', async () => {
  const { scan } = scanner();
  const result = await scan(async (path) => {
    assert.equal(path, '.');
    return [dir('.gezel'), dir('node_modules'), dir('report_files'), file('~$book.xlsx'), file('.private.csv'), file('../bad.csv'), file('C:\\bad.csv'), file('Q1 #2 & <sales>.csv')];
  });
  assert.deepEqual(paths(result), ['Q1 #2 & <sales>.csv']);
});

test('a fresh scan reflects added, renamed, and removed datasets', async () => {
  const { scan } = scanner();
  let listing = [file('old.csv')];
  const list = async () => listing;
  assert.deepEqual(paths(await scan(list)), ['old.csv']);
  listing = [file('renamed.csv'), file('new.xlsx')];
  assert.deepEqual(paths(await scan(list)), ['renamed.csv', 'new.xlsx']);
  listing = [];
  assert.deepEqual(paths(await scan(list)), []);
});

test('root failures fail loudly and unreadable subfolders report a partial scan', async () => {
  const { scan } = scanner();
  await assert.rejects(scan(async () => { throw new Error('folder unavailable'); }), /unavailable/);
  const result = await scan(async (path) => {
    if (path !== '.') throw new Error('denied');
    return [file('sales.csv'), dir('restricted')];
  });
  assert.deepEqual(paths(result), ['sales.csv']);
  assert.equal(result.skipped, 1);
  assert.ok(result.folders.includes('restricted'));
});

test('bounds wide and deep folders and reports truncation', async () => {
  const { scan } = scanner();
  let calls = 0;
  const deep = await scan(async () => { calls++; return [dir('next'), file('data.csv')]; }, { maxFolders: 3 });
  assert.equal(calls, 3);
  assert.equal(deep.limited, true);
  const wide = await scan(async () => [file('1.csv'), file('2.csv'), file('3.csv')], { maxFiles: 2 });
  assert.deepEqual(paths(wide), ['1.csv', '2.csv']);
  assert.equal(wide.limited, true);
});
