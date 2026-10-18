#!/usr/bin/env node
/**
 * Writes `keywords.json` beside each knowledge catalog's identity manifest:
 * the phrases a person might type that the catalog covers, so Gezel can
 * suggest a catalog that is not installed yet. Shape:
 * schemas/knowledge-catalog-keywords.schema.json (gezel core's
 * KnowledgeCatalogKeywordsSchema).
 *
 * Two sources:
 *   articles  titles and aliases from the catalog's Parquet companion on
 *             Hugging Face (the version manifest's `parquet`), read column
 *             by column through DuckDB, so no article text is downloaded;
 *   terms     hand-written phrases in authoring/knowledge-keywords/rules.json,
 *             the only source for catalogs without a Parquet companion.
 *
 * An everyday word is one the catalogs' own article summaries (Wikidata
 * descriptions, written in sentence case) use in lowercase: often, and at
 * least once in EVERYDAY_LOWERCASE_SHARE uses ("water", "mobile", "frozen",
 * "bend"), or a few times when the dictionary also lists it ("nice", "joy",
 * "turkey"). A name stays capitalized there: Manchester 1 lowercase use in
 * 1,314, York 5 in 9,729, Sony 2 in 226.
 *
 * Catalogs about named things (places, films, teams; `commonWords:
 * "matchCase"`) keep a short name made only of everyday words but match it
 * only with its capitalization: "Bend", "Frozen", "The Office". Catalogs about
 * concepts (`commonWords: "drop"`) keep everyday words, since "asthma" and
 * "gout" are the point, except a single word that also appears in
 * COMMON_TITLE_COUNT or more article titles of OTHER catalogs: heart, water,
 * fever and pain name too much to mean medicine.
 *
 * Usage:
 *   node tools/build-knowledge-keywords.mjs [--catalog=<id>]... [--cache=<dir>]
 *     [--duckdb=<path>] [--dictionary=<path>] [--dry-run]
 *
 *   --cache       keep the fetched Parquet columns here between runs
 *   --duckdb      DuckDB CLI (default: $DUCKDB, else `duckdb` on PATH)
 *   --dictionary  word list (default: /usr/share/dict/words; macOS ships
 *                 Webster's Second, which the committed files were built with)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { snapshotItem } from './lib/file-index.mjs';
import { listItems } from './lib/walk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const DATA_ROOT = join(REPO_ROOT, 'data');
const RULES_PATH = join(REPO_ROOT, 'authoring', 'knowledge-keywords', 'rules.json');

const COMMON_TITLE_COUNT = 250;
const EVERYDAY_LOWERCASE_USES = 10;
const EVERYDAY_LOWERCASE_SHARE = 20;
const DICTIONARY_LOWERCASE_USES = 6;
/** A name with more ordinary content words than this reads as a name, not as speech. */
const MAX_EVERYDAY_NAME_WORDS = 2;
const NAME_GLUE = new Set(['the', 'a', 'an', 'of', 'on', 'in', 'and', 'to', 'for', 'at', 'by', 'with', 'from']);
const MIN_PHRASE_LENGTH = 4;
const MAX_PHRASE_LENGTH = 80;
/** validate.mjs refuses data files over 1 MB. */
const MAX_FILE_BYTES = 900 * 1024;
const SEPARATOR = ' | ';
/** Candidates fetched per article kept: room for the title filters below. */
const CANDIDATE_FACTOR = 3;

const SKIP_PREFIX =
  /^(?:lists? of|index of|outline of|timeline of|glossary of|history of|bibliography of|comparison of|chronology of|cultural impact of|death of|management of|health effects of|legal issues in|concerns and controversies|results of|records of)\b/i;
const SKIP_WORD = /\b(?:discography|filmography|bibliography|season|seasons|episodes|disambiguation)\b/i;
/** Dated titles are events, seasons and editions, not things a person names. */
const YEAR = /\b(?:1[0-9]|20)\d{2}\b/;
const QUALIFIER = /\s+\([^()]*\)$/;
const UNUSABLE_ALIAS = /[:/@#]|https?|\.[a-z]{2,3}$|\bU\+[0-9A-F]{4,6}\b/i;

/** "PTA", "UW", "LOBSTER": an alias with no lowercase letter is an abbreviation or a shout. */
function allCaps(alias) {
  return !/\p{Ll}/u.test(alias) && (alias.match(/\p{L}/gu)?.length ?? 0) >= 2;
}

function parseArgs(argv) {
  const out = { catalogs: [], cache: null, duckdb: process.env.DUCKDB || 'duckdb', dictionary: '/usr/share/dict/words', dryRun: false };
  for (const raw of argv) {
    if (raw === '--dry-run') out.dryRun = true;
    else if (raw.startsWith('--catalog=')) out.catalogs.push(raw.slice('--catalog='.length));
    else if (raw.startsWith('--cache=')) out.cache = resolve(raw.slice('--cache='.length));
    else if (raw.startsWith('--duckdb=')) out.duckdb = raw.slice('--duckdb='.length);
    else if (raw.startsWith('--dictionary=')) out.dictionary = resolve(raw.slice('--dictionary='.length));
    else throw new Error(`unknown arg: ${raw}`);
  }
  return out;
}

/** Mirrors gezel core's normalizePhraseText, so lengths and dedupe agree with the matcher. */
function normalize(text) {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function words(phrase) {
  return phrase.toLowerCase().match(/\p{L}+/gu) ?? [];
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runDuckdb(binary, sql) {
  const result = spawnSync(binary, ['-batch', ':memory:'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`could not run DuckDB (${binary}): ${result.error.message}`);
  if (result.status !== 0) throw new Error(`DuckDB failed: ${(result.stderr || result.stdout).trim()}`);
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function rulesFor(rules, id) {
  const family = Object.entries(rules.families).find(([prefix]) => id.startsWith(prefix))?.[1] ?? {};
  return { ...rules.defaults, ...family, ...(rules.catalogs[id] ?? {}) };
}

function parquetSource(parquet) {
  return `hf://datasets/${parquet.repo}@${parquet.revision}/${parquet.dir}/documents-*.parquet`;
}

/** Fetch the columns this needs once per catalog version; later runs reuse the file. */
function fetchColumns(args, workDir, catalog) {
  const file = join(workDir, `${catalog.id}@${catalog.version}.columns.parquet`);
  if (existsSync(file)) return file;
  console.log(`[keywords] fetching ${catalog.id}@${catalog.version} titles`);
  runDuckdb(
    args.duckdb,
    `COPY (SELECT id, title, aliases, topic_path, chunk_count, summary FROM read_parquet(${sqlString(parquetSource(catalog.parquet))}))
       TO ${sqlString(file)} (FORMAT parquet);`,
  );
  return file;
}

function topicFilter(rule) {
  const clauses = [];
  if (rule.geographyOnly) clauses.push(`len(list_filter(topic_path, lambda p: p LIKE '%-geography')) > 0`);
  if (rule.excludeTopics.length) clauses.push(`NOT list_has_any(topic_path, [${rule.excludeTopics.map(sqlString).join(', ')}])`);
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

/** One DuckDB pass: word counts across every catalog, then each selected catalog's candidates. */
function queryCatalogs(args, workDir, withParquet, selected, rules) {
  const files = new Map(withParquet.map((c) => [c.id, fetchColumns(args, workDir, c)]));
  const out = join(workDir, `run-${process.pid}`);
  mkdirSync(out, { recursive: true });
  const titles = withParquet
    .map((c) => `SELECT ${sqlString(c.id)} AS catalog, title, summary FROM read_parquet(${sqlString(files.get(c.id))})`)
    .join('\nUNION ALL\n');
  const statements = [
    `CREATE TABLE titles AS ${titles};`,
    `CREATE TABLE summary_words AS SELECT unnest(regexp_extract_all(summary, '\\p{L}+')) AS w FROM titles;`,
    `COPY (SELECT lower(w) AS w, count(*) FILTER (WHERE w = lower(w)) AS lc, count(*) FILTER (WHERE w <> lower(w)) AS uc
       FROM summary_words GROUP BY 1 HAVING count(*) FILTER (WHERE w = lower(w)) >= ${DICTIONARY_LOWERCASE_USES} ORDER BY 1)
       TO ${sqlString(join(out, 'casing.json'))} (FORMAT json);`,
    `CREATE TABLE title_words AS SELECT DISTINCT catalog, title, lower(w) AS w FROM (SELECT catalog, title, unnest(regexp_extract_all(title, '\\p{L}+')) AS w FROM titles);`,
    `CREATE TABLE word_catalog AS SELECT w, catalog, count(*) AS n FROM title_words GROUP BY ALL;`,
    `CREATE TABLE word_total AS SELECT w, sum(n) AS total FROM word_catalog GROUP BY w HAVING sum(n) >= ${COMMON_TITLE_COUNT};`,
    `COPY (SELECT w, total FROM word_total ORDER BY w) TO ${sqlString(join(out, 'totals.json'))} (FORMAT json);`,
    `COPY (SELECT w, catalog, n FROM word_catalog WHERE w IN (SELECT w FROM word_total) ORDER BY w, catalog) TO ${sqlString(join(out, 'inside.json'))} (FORMAT json);`,
  ];
  for (const catalog of selected.filter((c) => c.parquet)) {
    const rule = rulesFor(rules, catalog.id);
    const file = sqlString(files.get(catalog.id));
    statements.push(
      `COPY (SELECT title, aliases FROM read_parquet(${file}) ${topicFilter(rule)}
         ORDER BY ln(1 + chunk_count) * (1 + len(aliases)) DESC, title, id
         LIMIT ${rule.maxArticles * CANDIDATE_FACTOR}) TO ${sqlString(join(out, `${catalog.id}.candidates.json`))} (FORMAT json);`,
    );
    if (rule.terms.length) {
      statements.push(
        `COPY (SELECT title, aliases FROM read_parquet(${file})) TO ${sqlString(join(out, `${catalog.id}.all.json`))} (FORMAT json);`,
      );
    }
  }
  runDuckdb(args.duckdb, statements.join('\n'));
  const totals = new Map(readJsonLines(join(out, 'totals.json')).map((r) => [r.w, r.total]));
  const inside = new Map(readJsonLines(join(out, 'inside.json')).map((r) => [`${r.catalog}\u0000${r.w}`, r.n]));
  const casing = new Map(readJsonLines(join(out, 'casing.json')).map((r) => [r.w, r]));
  return { out, totals, inside, casing };
}

/** Whether the matcher would already find `needle` inside `haystack` (both normalized). */
function containsPhrase(haystack, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u').test(haystack);
}

/** Lowercase entries only: a capitalized entry is a name. An absent dictionary leaves casing alone to decide. */
function loadDictionary(path) {
  const entries = new Set();
  if (!existsSync(path)) {
    console.warn(`[keywords] no dictionary at ${path}; deciding everyday words from casing alone`);
    return entries;
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const word = line.trim();
    if (word && word === word.toLowerCase()) entries.add(word);
  }
  return entries;
}

export function everydayWord(dictionary, casing) {
  const listed = (w) =>
    dictionary.has(w) ||
    (w.endsWith('s') && dictionary.has(w.slice(0, -1))) ||
    (w.endsWith('ies') && dictionary.has(`${w.slice(0, -3)}y`));
  return (w) => {
    const use = casing.get(w);
    if (!use) return false;
    if (use.lc >= EVERYDAY_LOWERCASE_USES && use.lc * EVERYDAY_LOWERCASE_SHARE >= use.uc) return true;
    return use.lc >= DICTIONARY_LOWERCASE_USES && listed(w);
  };
}

/** Builds one catalog's article lines from its ranked candidates. */
export function buildArticles(rows, rule, isEveryday, isBroad) {
  const exclude = new Set(rule.exclude.map(normalize));
  const blocked = new Set(rule.blockedWords.map((w) => w.toLowerCase()));
  const blockedRoots = rule.blockedRoots.map((w) => w.toLowerCase());
  const verdict = (phrase) => {
    const norm = normalize(phrase);
    if (norm.length < MIN_PHRASE_LENGTH || phrase.length > MAX_PHRASE_LENGTH || exclude.has(norm)) return 'drop';
    const ws = words(phrase);
    if (ws.length === 0 || ws.some((w) => blocked.has(w) || blockedRoots.some((root) => w.includes(root)))) return 'drop';
    if (rule.commonWords === 'drop') {
      return ws.length === 1 && isEveryday(ws[0]) && isBroad(ws[0]) ? 'drop' : 'keep';
    }
    const content = ws.filter((w) => !NAME_GLUE.has(w));
    return content.length > 0 && content.length <= MAX_EVERYDAY_NAME_WORDS && content.every(isEveryday) ? 'matchCase' : 'keep';
  };
  const lines = [];
  const matchCase = new Set();
  const seenTitles = new Set();
  let bytes = 0;
  for (const row of rows) {
    if (lines.length >= rule.maxArticles) break;
    const title = String(row.title ?? '').trim();
    const base = title.replace(QUALIFIER, '');
    if (!base || seenTitles.has(normalize(title))) continue;
    if (SKIP_PREFIX.test(base) || SKIP_WORD.test(base) || YEAR.test(base)) continue;
    // The title leads the line for display; with a qualifier it is never typed, so `base` decides.
    const lead = verdict(base);
    if (lead === 'drop') continue;
    const phrases = [title];
    const kept = new Set([normalize(title)]);
    const add = (phrase, v) => {
      const norm = normalize(phrase);
      if (kept.has(norm)) return;
      kept.add(norm);
      phrases.push(phrase);
      if (v === 'matchCase') matchCase.add(phrase);
    };
    if (base !== title) add(base, lead);
    else if (lead === 'matchCase') matchCase.add(title);
    if (rule.placeNames && base.includes(', ')) {
      const place = base.slice(0, base.indexOf(', '));
      const v = verdict(place);
      if (v !== 'drop') add(place, v);
    }
    let aliases = 0;
    for (const raw of Array.isArray(row.aliases) ? row.aliases : []) {
      if (aliases >= rule.maxAliases) break;
      const alias = String(raw).replace(/\s+/g, ' ').trim();
      if (!alias || alias.includes('|') || UNUSABLE_ALIAS.test(alias) || allCaps(alias)) continue;
      const norm = normalize(alias);
      if (kept.has(norm) || [...kept].some((k) => containsPhrase(norm, k))) continue;
      const v = verdict(alias);
      if (v === 'drop') continue;
      add(alias, v);
      aliases++;
    }
    const line = phrases.join(SEPARATOR);
    if (line.includes('\n') || phrases.some((p) => p !== p.trim() || p.includes('|'))) continue;
    bytes += Buffer.byteLength(JSON.stringify(line)) + 6;
    if (bytes > MAX_FILE_BYTES) break;
    seenTitles.add(normalize(title));
    lines.push(line);
  }
  lines.sort((a, b) => {
    const na = normalize(a);
    const nb = normalize(b);
    return na < nb ? -1 : na > nb ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });
  const used = new Set(lines.flatMap((line) => line.split(SEPARATOR)));
  return { lines, matchCase: [...matchCase].filter((p) => used.has(p)) };
}

/**
 * Hand-written terms no title or alias in the catalog mentions: a claim of
 * coverage worth a second look. A regional catalog holds places within a
 * state, not the state's own article, so "Oregon" counts when "Portland,
 * Oregon" is there.
 */
export function unmatchedTerms(terms, allRows) {
  const names = [];
  for (const row of allRows) {
    names.push(normalize(String(row.title ?? '')));
    for (const alias of Array.isArray(row.aliases) ? row.aliases : []) names.push(normalize(String(alias)));
  }
  return terms.filter((term) => {
    const needle = normalize(term);
    return !names.some((name) => name.includes(needle) && containsPhrase(name, needle));
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
  const catalogs = listItems(DATA_ROOT, 'knowledge-catalog')
    .map((item) => {
      const snapshot = snapshotItem(item.itemDir, 'knowledge-catalog', item.id);
      return snapshot?.latest
        ? { id: item.id, itemDir: item.itemDir, version: snapshot.latest.version, parquet: snapshot.latest.payload.parquet ?? null }
        : null;
    })
    .filter(Boolean);
  const unknown = args.catalogs.filter((id) => !catalogs.some((c) => c.id === id));
  if (unknown.length) throw new Error(`no knowledge catalog: ${unknown.join(', ')}`);
  const stray = Object.keys(rules.catalogs).filter((id) => !catalogs.some((c) => c.id === id));
  if (stray.length) console.warn(`[keywords] rules name catalogs that do not exist: ${stray.join(', ')}`);
  const selected = args.catalogs.length ? catalogs.filter((c) => args.catalogs.includes(c.id)) : catalogs;

  const dictionary = loadDictionary(args.dictionary);
  const workDir = args.cache ?? mkdtempSync(join(tmpdir(), 'gilde-keywords-'));
  mkdirSync(workDir, { recursive: true });
  try {
    const withParquet = catalogs.filter((c) => c.parquet);
    const query = selected.some((c) => c.parquet) ? queryCatalogs(args, workDir, withParquet, selected, rules) : null;
    let written = 0;
    for (const catalog of selected) {
      const rule = rulesFor(rules, catalog.id);
      let articles = { lines: [], matchCase: [] };
      if (catalog.parquet && query) {
        const isBroad = (w) => {
          const total = query.totals.get(w);
          return total !== undefined && total - (query.inside.get(`${catalog.id}\u0000${w}`) ?? 0) >= COMMON_TITLE_COUNT;
        };
        const isEveryday = everydayWord(dictionary, query.casing);
        articles = buildArticles(readJsonLines(join(query.out, `${catalog.id}.candidates.json`)), rule, isEveryday, isBroad);
        if (rule.terms.length) {
          const missing = unmatchedTerms(rule.terms, readJsonLines(join(query.out, `${catalog.id}.all.json`)));
          if (missing.length) console.warn(`[keywords] ${catalog.id}: no article named ${missing.map((t) => `"${t}"`).join(', ')}`);
        }
      }
      if (!rule.terms.length && !articles.lines.length) {
        console.warn(`[keywords] ${catalog.id}: nothing to write (no Parquet companion and no terms in rules.json)`);
        continue;
      }
      const matchCase = [...new Set([...articles.matchCase, ...rule.matchCase])].sort();
      const doc = {
        schemaVersion: 1,
        catalogId: catalog.id,
        ...(articles.lines.length ? { sourceVersion: catalog.version } : {}),
        terms: rule.terms,
        articles: articles.lines,
        matchCase,
      };
      const text = `${JSON.stringify(doc, null, 2)}\n`;
      console.log(
        `[keywords] ${catalog.id}: ${rule.terms.length} terms, ${articles.lines.length} articles, ${matchCase.length} case-sensitive, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`,
      );
      if (!args.dryRun) writeFileSync(join(catalog.itemDir, 'keywords.json'), text);
      written++;
    }
    console.log(`[keywords] ${args.dryRun ? 'would write' : 'wrote'} ${written} files`);
    if (query) rmSync(query.out, { recursive: true, force: true });
  } finally {
    if (!args.cache) rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
