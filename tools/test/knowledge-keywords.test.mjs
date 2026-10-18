import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArticles, everydayWord, rulesFor, unmatchedTerms } from '../build-knowledge-keywords.mjs';

const RULES = {
  schemaVersion: 1,
  defaults: {
    maxArticles: 100,
    maxAliases: 3,
    commonWords: 'matchCase',
    excludeTopics: [],
    geographyOnly: false,
    placeNames: false,
    terms: [],
    matchCase: [],
    exclude: [],
    blockedWords: ['slut'],
    blockedRoots: ['fuck'],
  },
  families: { 'regional-': { placeNames: true, geographyOnly: true } },
  catalogs: { 'wikipedia-medicine': { commonWords: 'drop' } },
};

// Lowercase / capitalized uses in the catalogs' summaries.
const CASING = new Map(
  Object.entries({
    bend: { lc: 10, uc: 126 },
    nice: { lc: 7, uc: 85 },
    water: { lc: 2349, uc: 510 },
    heart: { lc: 325, uc: 221 },
    asthma: { lc: 14, uc: 1 },
    office: { lc: 2133, uc: 848 },
    star: { lc: 3253, uc: 1826 },
    wars: { lc: 341, uc: 930 },
    manchester: { lc: 1, uc: 1313 },
    seattle: { lc: 6, uc: 897 },
  }).map(([w, use]) => [w, { w, ...use }]),
);
const DICTIONARY = new Set(['bend', 'nice', 'water', 'heart', 'asthma', 'office', 'star', 'war', 'manchester']);
const isEveryday = everydayWord(DICTIONARY, CASING);
const neverBroad = () => false;

test('everyday words come from lowercase use, names stay names', () => {
  assert.equal(isEveryday('water'), true);
  assert.equal(isEveryday('bend'), true);
  assert.equal(isEveryday('nice'), true, 'rare in summaries, but the dictionary lists it');
  assert.equal(isEveryday('manchester'), false, 'listed as a fabric, used as a city');
  assert.equal(isEveryday('seattle'), false);
  assert.equal(isEveryday('wars'), true, 'plural of a listed word');
  assert.equal(isEveryday('angioplasty'), false, 'no lowercase use recorded');
});

test('named catalogs keep everyday names but match their capitalization', () => {
  const rule = rulesFor(RULES, 'regional-pacific-northwest');
  const { lines, matchCase } = buildArticles(
    [
      { title: 'Bend, Oregon', aliases: [] },
      { title: 'Seattle', aliases: ['Seattle, WA', 'Emerald City', 'SEA'] },
      { title: 'The Office', aliases: [] },
      { title: 'Star Wars (film)', aliases: [] },
    ],
    rule,
    isEveryday,
    neverBroad,
  );
  assert.deepEqual(lines, [
    'Bend, Oregon | Bend',
    'Seattle | Emerald City',
    'Star Wars (film) | Star Wars',
    'The Office',
  ]);
  assert.deepEqual(matchCase.sort(), ['Bend', 'Star Wars', 'The Office']);
});

test('concept catalogs drop broad everyday words and keep specific ones', () => {
  const rule = rulesFor(RULES, 'wikipedia-medicine');
  const broad = (w) => w === 'heart' || w === 'water';
  const { lines, matchCase } = buildArticles(
    [
      { title: 'Heart', aliases: ['cardiac organ'] },
      { title: 'Asthma', aliases: ['asthma attack', 'bronchial asthma'] },
      { title: 'Angioplasty', aliases: ['PTA', 'balloon angioplasty'] },
    ],
    rule,
    isEveryday,
    broad,
  );
  assert.deepEqual(lines, ['Angioplasty', 'Asthma']);
  assert.deepEqual(matchCase, []);
});

test('lists, dated titles, short names and blocked words never become keywords', () => {
  const rule = rulesFor(RULES, 'wikipedia-film-tv');
  const { lines } = buildArticles(
    [
      { title: 'List of Seattle parks', aliases: [] },
      { title: '2015 Seattle Seahawks season', aliases: [] },
      { title: 'U2', aliases: [] },
      { title: 'Slut (film)', aliases: [] },
      { title: 'Motherfucker Jones', aliases: [] },
      { title: 'Frozen (2013 film)', aliases: ['Frozen U+2744'] },
    ],
    rule,
    isEveryday,
    neverBroad,
  );
  assert.deepEqual(lines, ['Frozen (2013 film) | Frozen']);
});

test('maxArticles keeps the best-ranked rows, then sorts', () => {
  const rule = { ...rulesFor(RULES, 'wikipedia-film-tv'), maxArticles: 2 };
  const { lines } = buildArticles(
    [{ title: 'Zulu Dawn' }, { title: 'Aardman Animations' }, { title: 'Middlemarch' }],
    rule,
    isEveryday,
    neverBroad,
  );
  assert.deepEqual(lines, ['Aardman Animations', 'Zulu Dawn']);
});

test('a hand-written term counts as covered when any title mentions it', () => {
  const rows = [{ title: 'Portland, Oregon', aliases: ['Rose City'] }, { title: 'Seattle' }];
  assert.deepEqual(unmatchedTerms(['Oregon', 'Rose City', 'Cascadia', 'Seattle'], rows), ['Cascadia']);
});
